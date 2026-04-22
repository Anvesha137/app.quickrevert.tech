# QuickRevert — Full Architecture & Risk Analysis at 1,000 Users

---

## 🏗️ PART 1: THE ARCHITECTURE (Plain English)

Think of QuickRevert as a **fully automated Instagram DM factory**. Here's how every layer fits together.

---

### Layer 1: The Storefront (Frontend — React/Vite App)
**File:** `src/App.tsx`, `src/components/`, `src/contexts/`

This is what users see. It's a **single-page React app** with two "skins" (UI styles) — "Gen Z" and "Millennial" — the user can toggle.

The Provider hierarchy in `App.tsx` is:
```
AuthProvider
  └── SubscriptionProvider
        └── ThemeProvider
              └── UIStyleProvider
                    └── UpgradeModalProvider
                          └── BrowserRouter → Routes
```
Every context layer wraps the entire app, so every component can ask "Am I logged in?", "What's my plan?", or "Is dark mode on?" at any time.

---

### Layer 2: The Security Guard (Auth)
**File:** `src/contexts/AuthContext.tsx`, `supabase/functions/auth-google-*`

- **Email + Password** and **Google OAuth** (two methods).
- After login, Supabase issues a **JWT token** that expires every hour (`jwt_expiry = 3600`).
- Special logic for **Gifted Premium Users**: They have a special password stored in a Neon DB, and every login is cross-verified against it. If the admin updates their password, their session gets invalidated on the next sync.

---

### Layer 3: The Gatekeeper (Subscription System)
**File:** `src/contexts/SubscriptionContext.tsx`

This is the **brains for billing and limits**. Every time a user loads the app, it fires **5 parallel database queries**:
1. `subscriptions` table → what plan are they on?
2. `automation_activities` table → how many DMs have they sent?
3. `contacts` table → how many contacts do they have?
4. `automations` table → how many active automations?
5. `instagram_accounts` table → are they connected?

Results are **cached in `localStorage`** for 1 hour. The context also pings the `sync-user-neon` Edge Function to get gifted user status from the external Neon database.

**Feature flags derived from this context:**
- `isPremium`, `isGifted`, `isGiftedActive`
- `canUseCarousel`, `canUseLeadManager`, `canUseAskToFollow`, `canUseMenuFlow`
- `dmLimit`, `automationLimit`, `accountLimit`

---

### Layer 4: The Brains (40 Edge Functions)
**Directory:** `supabase/functions/`

These are Deno-based serverless functions hosted on Supabase. They are the **only things allowed to talk to the database using the Service Role key** (bypassing Row Level Security). Key functions:

| Function | What it does |
|---|---|
| `webhook-meta` | Receives all Instagram events (DMs, comments). **The hottest path in the entire system.** |
| `create-workflow` | Builds and deploys n8n workflows (162,000 bytes!). The most complex file in the codebase. |
| `activate-workflow` / `deactivate-workflow` | Toggles automations in n8n |
| `sync-user-neon` | Syncs gifted user data from the external Neon DB into Supabase |
| `verify-razorpay-payment-new` | Handles payment verification |
| `cloudflare-bouncer.js` | Cloudflare Worker that filters junk webhooks before they reach Supabase |

---

### Layer 5: The Factory (n8n Automation Engine)
**Referenced in:** `create-workflow/index.ts`, `webhook-meta/index.ts`

n8n is where the automation **actually runs**. It's a self-hosted workflow tool. When Instagram sends a DM, the flow is:

```
Instagram → Cloudflare Bouncer → webhook-meta (Supabase) → n8n Workflow → Instagram Graph API (reply)
```

Each automation in QuickRevert creates its own **unique n8n workflow** with a unique webhook path (`instagram-webhook-{userId}-{automationId}`). This is the fundamental design choice that drives most of the scaling risks.

---

### Layer 6: The Filing Cabinet (Databases)
**Two separate databases are in use:**
1. **Supabase Postgres** — Main database. Stores users, automations, contacts, activities, subscriptions.
2. **Neon (external Postgres)** — Stores gifted user configurations, passwords, and feature overrides.

Key tables:
- `automation_activities` — Every DM event logged here. **Grows unboundedly.**
- `processed_events` — Idempotency table. Ensures duplicate webhooks are ignored.
- `contacts` — All Instagram users who have ever messaged.
- `automation_routes` — Maps `account_id` → `n8n_workflow_id` for routing.
- `user_limits` — Synced from Neon, stores per-user DM/automation limits.

---

## 🚨 PART 2: RISKS AT 1,000 USERS — INVOCATION SUMMARY

Think of it like a **court case**. For each risk, I'll tell you:
- **What the risk is** (the charge)
- **Evidence from the code** (the exhibit)
- **What can go wrong** (the verdict)
- **The solution** (the sentence)

---

### 🔴 RISK 1: The `automation_activities` Table Will Become a Black Hole
**Severity: CRITICAL**

**The Charge:** There is no cleanup or archiving of the `automation_activities` table.

**The Exhibit:** In `SubscriptionContext.tsx`, every page load counts DMs with:
```ts
supabase.from('automation_activities')
  .select('id', { count: 'exact', head: true })
  .in('activity_type', DM_ACTIVITY_TYPES)
```
In `webhook-meta`, every DM, echo, comment, and interaction is logged as a new row. At 1,000 users, each sending ~500 DMs/month, that's **500,000 new rows per month** — with no deletion or partitioning strategy.

**The Verdict:** Full table scans on `COUNT(*)` on a 50M+ row table will cause **dashboards to freeze** and subscription checks to time out.

**The Solution:**
- Add a PostgreSQL index: `CREATE INDEX ON automation_activities(user_id, activity_type, created_at DESC);`
- Add a scheduled cleanup job (Supabase pg_cron) to delete rows older than 90 days.
- Optionally: partition the table by month.

---

### 🔴 RISK 2: n8n Will Collapse Under 1,000 Concurrent Workflows
**Severity: CRITICAL**

**The Charge:** The architecture creates a **1-to-1 relationship between automations and n8n workflows**. Every user's every automation is a separate n8n workflow.

**The Exhibit:** In `create-workflow/index.ts`:
```ts
const webhookPath = existingVibePath || `instagram-webhook-${userId}-${automationId || Date.now()}`;
```
If 1,000 users each have 5 automations, that's **5,000 active n8n workflows** registered simultaneously. n8n was not designed to be a multi-tenant hosting platform for thousands of independent workflows on a single instance.

**The Verdict:** n8n becomes sluggish, workflows take 30-60s to trigger (already reported!), memory spikes, and the instance crashes.

**The Solution:**
- Consolidate to a **single "Master Router" workflow per Instagram account** instead of one per automation. The router reads the keyword rules from your database and decides the action dynamically.
- Alternatively, **upgrade to n8n Cloud** (which is multi-tenant by design) or **add a second n8n instance** and load-balance.

---

### 🟠 RISK 3: The `processed_events` Table Has No TTL (Time-to-Live)
**Severity: HIGH**

**The Charge:** The idempotency table grows forever.

**The Exhibit:** In `webhook-meta`:
```ts
supabase.from('processed_events')
  .insert({ event_id: eventId, account_id: accountId })
```
Every unique event gets a row. Rows are **never deleted**. At 1,000 users, this table will have millions of rows, and the duplicate check (which runs on every single webhook) will slow down.

**The Verdict:** Webhook processing slows down; duplicate events may start slipping through if the insert times out.

**The Solution:**
- Add `created_at` column with an index and a pg_cron job that deletes rows older than 7 days.
- A webhook event older than 7 days is never a real duplicate anyway.

---

### 🟠 RISK 4: The Self-Healing Lookup Fires External API Calls for Every Unrecognized Account
**Severity: HIGH**

**The Charge:** When an Instagram account ID isn't found in the database, the system races up to **20 parallel Instagram Graph API calls** to find it.

**The Exhibit:** In `webhook-meta/index.ts`:
```ts
const results = await Promise.all(candidates.map(async (candidate) => {
    const graphUrl = `https://graph.instagram.com/${account_id}?...`;
    // ...races 20 tokens
}));
```

**The Verdict:** If 1,000 users all have slightly mismatched account IDs (a common bug), every single webhook triggers 20 external HTTP calls. That's **20,000 API calls** just for routing, before any automation runs. Instagram will rate-limit you at the App level, blocking all users.

**The Solution:**
- Fix account ID mismatches proactively during onboarding using `fix-ig-id`.
- Add a **dead-letter queue** for unrecognized accounts instead of self-healing inline.
- Cache the "account not found" result to prevent repeated healing attempts for the same ID.

---

### 🟠 RISK 5: `sync-user-neon` is Called on Every Single Page Load
**Severity: HIGH**

**The Charge:** Every time a user opens the app or switches tabs (after 5 minutes), it calls the `sync-user-neon` Edge Function — for every user, every time.

**The Exhibit:** In `SubscriptionContext.tsx`:
```ts
const { data: syncData } = await supabase.functions.invoke('sync-user-neon', {...});
// ... called in fetchSubscriptionData, which runs every 15 min AND on tab focus
```

**The Verdict:** At 1,000 concurrent users, this is **1,000 function invocations per 15 minutes** just for syncing gift status. Each invocation connects to the external Neon database. Neon's free/starter tiers have connection limits; this will hit them fast.

**The Solution:**
- Sync gift status to a `user_flags` table in **Supabase itself**. Only call Neon when data actually changes (e.g., from an admin webhook).
- Alternatively, cache the Neon response in a Supabase `user_limits` table and only re-sync every 6 hours.

---

### 🟡 RISK 6: The `create-workflow` Function is 162,000 Bytes of Raw JSON Template
**Severity: MEDIUM**

**The Charge:** This function is **2,927 lines** of code that builds n8n workflow JSON by concatenating raw strings. There is no abstraction, no template engine, and no unit tests.

**The Exhibit:** Lines like:
```ts
"jsonBody": "={\\n  \\\"recipient\\\": { \\\"id\\\": \\\"{{ $json.senderId }}\\\" },..." 
```
...go on for thousands of lines.

**The Verdict:** Any changes to n8n's API version (e.g., upgrading from `v24.0` to `v25.0`) will require manually updating hundreds of raw strings scattered across this file. One mistake and all automations for all users break.

**The Solution:**
- Extract workflow templates into **versioned JSON files** (e.g., `templates/dm_flow_v1.json`).
- Use a simple `replaceAll` or handlebars-style system to inject variables.
- This also makes it easy to A/B test different workflow architectures.

---

### 🟡 RISK 7: Client-Side Plan Enforcement is Bypassable
**Severity: MEDIUM**

**The Charge:** Feature gates like `canUseCarousel`, `canUseLeadManager` etc. are checked **only on the frontend**. A technically savvy user can open DevTools and force their plan.

**The Exhibit:** In `SubscriptionContext.tsx`, all flags are computed client-side:
```ts
const canUseCarousel = isGiftedActive ? giftedSettings?.carousel_enabled ?? true : hasAdvancedFeatures;
```
The `create-workflow` Edge Function **does** have server-side limit enforcement for automation counts, but **not for feature flags** (carousel, lead manager, etc.).

**The Verdict:** A determined free-tier user could trigger a carousel workflow. Not a critical data breach, but a revenue leakage issue.

**The Solution:**
- Add feature flag validation to `create-workflow`: check `user_limits.carousel_enabled` before building carousel workflows.
- The `user_limits` table already exists and is synced from Neon — just enforce it server-side.

---

### 🟡 RISK 8: Instagram Token Expiry Can Silently Kill All Automations
**Severity: MEDIUM**

**The Charge:** Instagram long-lived tokens expire after **60 days**. There's a `instagram-refresh-token` function, but no evidence of a scheduled job calling it reliably.

**The Exhibit:** `token_expires_at` column exists in `instagram_accounts`. The `instagram-refresh-token` function exists. But there's no cron job or webhook scheduler that auto-refreshes tokens before they expire.

**The Verdict:** A user's token expires silently. Their automations stop responding. They think the product is broken. Churn increases.

**The Solution:**
- Add a **daily Supabase pg_cron job** that queries all accounts where `token_expires_at < NOW() + INTERVAL '7 days'` and calls the refresh function.
- Show a **warning banner in the dashboard** when a token is within 7 days of expiry.

---

### 🟢 RISK 9: The 1-Hour `localStorage` Cache Can Show Stale Data
**Severity: LOW-MEDIUM**

**The Charge:** Subscription data is cached in localStorage for 1 hour. If a user pays and upgrades their plan, they might still see "Free Plan" for up to an hour.

**The Exhibit:** In `SubscriptionContext.tsx`:
```ts
if (Date.now() - parsed.timestamp > 3600_000) return null; // 1 hour cache
```

**The Verdict:** A user pays ₹399, the payment goes through, but the dashboard still shows the banner saying "Upgrade to Premium." This looks like a scam. High support ticket risk.

**The Solution:**
- After successful payment (in `verify-razorpay-payment-new`), **invalidate the cache** by deleting `localStorage.getItem('quickrevert_subscription_cache')` and calling `refresh()` from the subscription context.
- This is a one-line fix on the payment success callback.

---

### 🟢 RISK 10: Debug Functions are Publicly Accessible in Production
**Severity: LOW (but IMPORTANT)**

**The Charge:** Functions like `debug-db`, `debug-n8n`, `debug-neon-gifted`, `debug-workflows` all have `verify_jwt = false` in `config.toml`.

**The Exhibit:**
```toml
[functions."debug-db"]
verify_jwt = false

[functions."debug-n8n"]
verify_jwt = false
```
Anyone who knows the Supabase URL can call these endpoints without authentication.

**The Verdict:** At worst, these functions could leak internal database state, n8n credentials, or configuration details to a curious attacker. At best, they waste compute.

**The Solution:**
- Either **delete** these functions from production or add a hardcoded `INTERNAL_SECRET` check at the top of each one.
- Or change to `verify_jwt = true` and call them only from the admin dashboard with a valid session.

---

## 📊 PART 3: INVOCATION SUMMARY TABLE

| # | Risk | Severity | Files Involved | Effort to Fix |
|---|---|---|---|---|
| 1 | `automation_activities` table unbounded growth | 🔴 CRITICAL | `SubscriptionContext.tsx`, DB | Low (add index + cron) |
| 2 | n8n overloaded by too many workflows | 🔴 CRITICAL | `create-workflow/index.ts` | High (architectural change) |
| 3 | `processed_events` table has no TTL | 🟠 HIGH | `webhook-meta/index.ts` | Low (add cron) |
| 4 | Self-healing fires 20 API calls per unknown account | 🟠 HIGH | `webhook-meta/index.ts` | Medium |
| 5 | `sync-user-neon` called on every page load | 🟠 HIGH | `SubscriptionContext.tsx` | Medium |
| 6 | `create-workflow` is 162KB of raw JSON strings | 🟡 MEDIUM | `create-workflow/index.ts` | High |
| 7 | Feature gates only enforced client-side | 🟡 MEDIUM | `create-workflow`, `SubscriptionContext` | Medium |
| 8 | Instagram token expiry not auto-managed | 🟡 MEDIUM | `instagram-refresh-token` | Low (add cron) |
| 9 | 1-hour cache shows stale plan after payment | 🟢 LOW-MED | `SubscriptionContext.tsx` | Very Low (1-liner) |
| 10 | Debug functions publicly accessible | 🟢 LOW | `supabase/config.toml` | Very Low |

---

## ✅ THINGS DONE REALLY WELL

1. **Cloudflare Bouncer**: Dropping delivery receipts before they hit Supabase is smart and saves significant compute.
2. **Idempotency Check**: The `processed_events` table prevents duplicate automation triggers — a very mature design.
3. **DM Limit Enforcement**: Checked server-side inside `webhook-meta` *and* `create-workflow` — double protection.
4. **Ownership Verification**: `create-workflow` verifies `data.user_id !== user.id` before accessing any Instagram account — prevents cross-user data access.
5. **localStorage Caching**: Prevents 5 DB queries on every React re-render — good UX optimization.
6. **HMAC Signature Verification**: Every webhook is verified against Meta's `x-hub-signature-256` before processing — critical security.
7. **Row Level Security (RLS)**: All major tables have RLS policies ensuring users can only see their own data.

---

> **Priority Recommendation**: Fix Risks 1, 3, and 9 this week (low effort, high impact). Plan Risk 2 as a Q2 architectural project before you hit 500 active users.
