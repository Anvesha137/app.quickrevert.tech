# QuickRevert System Audit & Architectural Deep-Dive

This document serves as a comprehensive guide, audit, and troubleshooting manual for the QuickRevert automation engine. It documents the "tribal knowledge," known issues, and critical infrastructure decisions made to ensure the system's stability.

---

## 1. Core Architecture Overview

QuickRevert is a high-performance automation platform bridging Meta's APIs with n8n via Supabase.

### 1.1 The Stack
- **Dashboard**: React/Vite with a professional dark/glassmorphic design.
- **Backend & Logic**: Supabase (Auth, Postgres, Edge Functions).
- **Automation Workflows**: n8n (External instance).
- **Edge Performance**: Cloudflare Workers + KV Storage (The "Bouncer").

### 1.2 The Webhook Bridge Concept
**Crucial Developer Note**: Meta doesn't support dynamic webhook paths for every individual workflow.
- **The Solution**: We implemented a **Static Bridge Webhook** in Supabase (`webhook-meta`). 
- **The Flow**: Meta sends all events to this one static URL. Our logic then "routes" the data to the correct n8n workflow path dynamically based on the account and post IDs.

---

## 2. Invocation Audit & Cost Strategy

To manage infrastructure costs, we use a tiered filtering system.

### 2.1 The "100k Benchmark" (Monthly Audit)
Based on a user with **20 automations** across **50 posts**, each receiving **5,000 comments**:
- **Total Incoming Traffic**: 250,000 comments.
- **Cloudflare Filtering**: Drops 150,000 comments from non-automated posts at the edge ($0 cost).
- **Supabase Invocations**: **~100,060/month**.
- **Savings**: By using the Cloudflare Bouncer, we reduce Supabase billing by **60%**.

---

## 3. Meta & Instagram Integration: The "Hard Truths"

Integrating with Meta requires adhering to strict, often undocumented, platform constraints.

### 3.1 Account Health & Bans
- **Age Requirement**: Meta typically requires a developer-linked Instagram account to be **at least 6-8 months old** and active. 
- **Bans**: New accounts are frequently restricted or blocked repeatedly during initial setup. This is a Meta policy, not a code bug.

### 3.2 Permissions Library
| Permission | Why it's needed |
| :--- | :--- |
| `instagram_basic` | Core account connection. |
| `manage_comments` | Required to read/reply to comments. |
| `manage_messages` | Required for DMs and Story reactions. |
| `instagram_creator_marketplace_discovery` | Needed to fetch advanced details/discover profiles beyond basic 1D info. |

### 3.3 The 401 Unauthorized "Death Loop"
If you encounter repeated 401 errors during Instagram connection:
1.  **Check Callback URLs**: Ensure the Meta App Dashboard has the exact Supabase project URL as the callback.
2.  **Verify Deauth/Delete**: The Deauthorization and Deletion callback functions must be deployed and returning 200 OK.
3.  **Clean Slate**: Deauthorize the app from the Instagram account, delete the account from our DB, and re-run the OAuth flow.

---

## 4. Carousel Engine & Templates

The platform supports **Instagram Carousels** in two distinct ways:

### 4.1 Carousel DM Messages
Users can build "Carousel Engines" as DM actions.
- **Technical Implementation**: These are sent as Meta `generic` templates with multiple `elements`. 
- **Validation**: Each card must have a title and at least one button. The system supports horizontal scrolling in the Instagram DM interface.
- **N8N Logic**: The `create-workflow` function maps `carouselCards` from the frontend into the nested array structure required by the `https://graph.instagram.com/v24.0/me/messages` endpoint.

### 4.2 Carousel Media Triggers
Tracking a specific **Carousel Post** (multiple images) works via the same `media_id` logic as single images. 
- **ID Resolution**: Meta sends the parent Post ID for any comment on any slide of the carousel.
- **Thumbnail Capture**: The system captures the `thumbnail_url` of the first slide to represent the carousel in the dashboard.

---

## 5. Troubleshooting & "Battle-Tested" Fixes

These are the documented fixes for historical logic errors encountered during development.

### 5.1 Loop & Recursion Protection
- **Comment Recursion**: Added a check to see if the commenter's username matches the bot's username. If they match, execution stops to prevent the bot from infinite-replying to itself.
- **Reply in DM Loop**: Implemented loop protection to distinguish between user messages and bot echoes.

### 5.2 Handling Postbacks vs. QuickReplies
- **The Issue**: "Ask to follow" triggers weren't working because QuickReplies were being sent instead of Postbacks.
- **The Fix**: These are different event types in Meta. We separated the processing paths. Postback data is handled as different content types (no `pages_message` permission was required once routed correctly).

### 5.3 Double Message Filtering
- **Post ID Filtering**: To prevent sending two DMs when two different automations were active on the same account (but different posts), we added a mandatory **Post ID check** in the n8n "Teaser DM" and "Ask to Follow" nodes.
- **Story Reaction Fix**: Added **Story ID** selection in the n8n switch nodes to prevent double-replies on shared story reactions.

### 5.4 Identity Resolution (ID vs. Username)
- **Problem**: Meta often sends the long numeric ID instead of the username in DM events.
- **Fix**: Created an n8n node that specifically fetches the handle from the ID using a specialized JSON mapping before displaying it in the "Contacts" tab.

### 5.5 n8n Credential Sync: The PUT vs PATCH Bug (April 2026)
- **Symptom**: After a user disconnects/reconnects their Instagram account or refreshes their token, older n8n workflows continue showing **"Error validating access token: The session has been invalidated"** even though the token in our database is valid.
- **Root Cause**: The n8n REST API **does NOT support `PUT`** for updating credentials — it returns `405 Method Not Allowed`. The correct method is **`PATCH`**. Our `syncN8nCredential` utility was using `PUT`, so every credential update was silently rejected by n8n while returning no obvious error to our logs.
- **Diagnostic Proof**:
  - `PUT /api/v1/credentials/{id}` → `405 "PUT method not allowed"` ❌
  - `PATCH /api/v1/credentials/{id}` → `200 OK, credential updated` ✅
- **Fix Applied**: Changed HTTP method from `PUT` to `PATCH` in `supabase/functions/_shared/n8n.ts`.
- **Additional Discovery**: The n8n credentials list API has a **max limit of 250** per page and requires cursor-based pagination. Some "ghost" credentials (used by older workflows) were invisible in the first page of results.
- **Architecture**: The sync utility (`_shared/n8n.ts`) now uses a two-phase discovery approach:
  1. **Workflow Crawl**: Scans actual n8n workflow JSON to extract credential IDs being used by active nodes.
  2. **Credential List Scan**: Paginated search through the credentials API as a safety net.
  3. **Parallel PATCH**: Updates all discovered credentials simultaneously.
- **Affected Functions**: `instagram-oauth-callback`, `instagram-refresh-token`, `create-workflow`.

### 5.6 Lead Manager & Atomic Reactivation (April 2026)
- **Standardized Mapping**: Aligned Lead Manager nodes (Ask Name, Confirm Email, etc.) with dashboard UI fields.
- **Atomic Reactivation**: Overhauled `activate-workflow` to use the `register_automation` RPC for consistent state restoration.
- **Force Refresh**: Added a `force` parameter to Meta webhook subscriptions to clear "ghost" connection issues.

### 5.7 Hybrid Automation Validation (April 2026)
- **Post Comment Constraints**: Implemented frontend validation to restrict unsupported hybrid combinations.
- **Incompatibility Guards**:
    - **Ask to Follow + Lead Manager**: Mutually exclusive to prevent logic conflicts in lead collection.
    - **Lead Manager + Menu Flow**: Restricted Lead Manager to Simple DMs and Carousels to ensure high conversion rates.
- **User Feedback**: Added real-time toast notifications for blocked combinations to guide users toward supported workflows.

### 5.8 Robust File Handling & Image Stability (April 2026)
- **Problem**: Users were experiencing "Failed to read file" errors when saving automations, primarily due to stale blob URLs in restored drafts (e.g., after a page refresh).
- **The Fix**: Implemented a multi-layered defense:
    - **Proactive Cleanup**: `AutomationCreate` components now scan for stale `blob:` URLs on mount. If the underlying `File` is no longer in browser memory, the reference is cleared to prevent saving broken links.
    - **Selection Validation**: `MediaUpload.tsx` now performs an immediate 100-byte "test read" on selection to catch OS-locked or inaccessible files (common with cloud-storage syncs like OneDrive) before the user even starts configuring.
    - **Graceful Compression**: Overhauled the `compressImage` utility in `storage.ts` with descriptive error messages (e.g., "Image no longer available, please select it again") to guide the user instead of showing cryptic generic errors.
    - **Save Guarantees**: The `processActions` loop now throws explicit errors if a file is missing, preventing valid-looking but broken automations from being synced to n8n.

### 5.9 UI Default Experience (April 2026)
- **Constraint**: Users requested more control over the default "automated" appearance of new automations.
- **Change**: Set the default state of **"Reply to the comment"** to **OFF** for all creation wizards. This ensures users only trigger public replies when they explicitly intend to, reducing "bot-like" behavior on high-engagement posts unless configured otherwise.

### 5.10 n8n Execution Stability & Activation Sync (April 2026)
- **Problem 1 (Execution Hangs)**: Workflows were getting stuck in a "Running" state for hours.
    - **Cause**: n8n HTTP Request nodes have no default timeout. If Meta rate-limits or the API hangs, the execution waits indefinitely.
    - **Fix**: Added `EXECUTIONS_TIMEOUT=300` and `EXECUTIONS_TIMEOUT_MAX=600` to the n8n environment. This kills any execution exceeding 5-10 minutes.
- **Problem 2 (Activation Desync)**: Toggling an automation to "Active" in the dashboard would sometimes fail to activate it in n8n, leading to 404 Webhook errors.
    - **Root Cause**: The dashboard updated the database status *before* verifying the n8n API call succeeded.
    - **Fix**: Implemented an **Atomic Sync Pattern** in `activate-workflow` and `deactivate-workflow`.
        - The Edge Function now handles both n8n API calls and database updates.
        - The frontend waits for the function result and rolls back the local UI state if synchronization fails.
        - Added `Content-Type: application/json` to all n8n API calls to ensure compatibility.
- **Cleanup**: After applying timeouts, use the "Stop all" button in n8n to clear the backlog of "Running" executions.

### 5.11 Cloudinary Migration (May 2026)
- **Problem**: Storing user-uploaded contact form images directly in Supabase was consuming high storage and slowing down database backups.
- **The Fix**: Integrated **Cloudinary** for image delivery. 
    - Frontend components (`ContactForm.tsx`) now upload images to Cloudinary via signed/unsigned presets.
    - Supabase only stores the resulting `secure_url`.
    - **Benefit**: Reduced database bloat by 90% for form submissions and improved image delivery speed.

### 5.12 Gifted Premium Sync Resilience (May 2026)
- **Problem**: The `sync-user-neon` function frequently crashed because the Supabase Auth UUID didn't exist in the Neon `users` table at the time of sync. It also referenced non-existent columns (`package`, `payment_status`).
- **The Fix**: 
    - Migrated to **Email-based Lookup**: The function now searches Neon for the user's email if the ID lookup fails.
    - **Schema Alignment**: Updated the SQL upsert to use actual Neon columns (`plan_name`, `plan_status`).
    - **Gifted Source of Truth**: The function now explicitly pulls from the `gifted_premium` table in Neon to override "Basic" plan states in Supabase.

### 5.13 Automated Maintenance & pg_cron (May 2026)
- **Problem**: Manual maintenance of Instagram tokens and event logs was error-prone, leading to "ghost" automation failures.
- **The Fix**: Implemented a suite of `pg_cron` jobs in Supabase:
    - `refresh-instagram-tokens`: Daily refresh of all 60-day tokens.
    - `cleanup-processed-events`: Deletes deduplication records older than 24 hours.
    - `purge_automation_activities_90d`: Keeps activity logs within storage quotas.
- **Stability**: This ensures the system stays "self-healing" without admin intervention.

---

## 6. Infrastructure & Performance (EasyPanel)

The system is hosted via EasyPanel (Hostinger) with a **6GB RAM limit**.

- **Memory Management**: Keep total memory usage **< 4GB** for smooth operation. 
- **Performance Fix (Feb 2026)**: Supabase and a Live Chat service (consuming ~3GB) were removed/migrated to prevent overloading EasyPanel, significantly improving dashboard speed.
- **RLS Policies**: Sometimes values don't show in the DB even if the function runs. This is usually due to **Row Level Security (RLS)**. We resolved this by minimizing/optimizing policies for high-speed write operations.

---

## 7. n8n Management
- **Secrets**: N8N API keys and base URLs must be stored in Supabase Secrets.
- **Deployment**: Any update to the backend templates requires an Edge Function re-deployment to take effect.
- **Versioning**: If a user has an "Unpublished" automation, it remains on the old template. New templates only apply to automations created/published *after* the update.

---
**This audit serves as the engineering manual for QuickRevert. Maintain it as the system evolves.**

---

## 8. Automation Lifecycle: Bug Fixes & Architecture (April 2026)

This section documents all bugs found and fixed in the full automation lifecycle — **Create → Activate → Execute → Deactivate → Reactivate → Delete** — as part of an intensive debugging session.

---

### 8.1 Root Cause: `automation_routes.account_id` Type Mismatch (The Silent Killer)

> [!CAUTION]
> This was the **single biggest bug** causing 100% of execution failures for newly created automations.

**Schema Definition** (`20260124150000_recreate_automation_routes_v2.sql`):
```sql
account_id TEXT NOT NULL, -- Meta ID (Instagram Business Account ID)
```

**What was happening in `create-workflow`:**
```ts
// ❌ WRONG — was inserting the internal Supabase UUID
const userAccounts = [{ id: instagramAccountId }]; // UUID like "a1b2c3d4-..."
globalRoutes.push({ account_id: account.id, ... });
```

**What `webhook-meta` receives from Meta:**
```
entry.id = "17841447024312179"  // Meta's numeric Instagram Business ID (TEXT)
```

**The query that always returned 0 results:**
```sql
SELECT * FROM automation_routes WHERE account_id = '17841447024312179'
-- But we stored 'a1b2c3d4-...' (UUID) → 0 rows forever
```

**The Fix:**
```ts
// ✅ CORRECT — use instagram_business_id (the Meta numeric ID)
const metaAccountId = String(instagramAccount.instagram_business_id);
globalRoutes.push({ account_id: metaAccountId, ... }); 
```

**Key Rule**: `automation_routes.account_id` **must always be the Meta Instagram Business ID** (the number Meta sends in `entry.id`). Never the internal Supabase UUID.

---

### 8.2 Root Cause: RPC `register_automation` Overload Conflict (PGRST203)

**Symptom in Supabase logs:**
```
[BACKGROUND] RPC Registration Failed: { code: "PGRST203", hint: "Try renaming the parameters 
or the function itself so function overloading can be resolved" }
```

**Cause**: During earlier development, the `register_automation` function was modified multiple times (adding/removing `p_is_active` parameter). This left **two conflicting versions** of the function in the database. PostgREST couldn't determine which overload to call, so it crashed every single time.

**Additional SQL Bug** in the original RPC:
```sql
-- ❌ WRONG — account_id is TEXT, not UUID
CAST(v_route->>'account_id' AS UUID)

-- ✅ CORRECT — insert as TEXT directly
v_route->>'account_id'
```

**The Fix**: Completely removed the RPC call from `create-workflow`. Replaced with direct `supabase.from(...).upsert()` and `.insert()` calls which are more transparent, debuggable, and require no database migration to maintain.

**New Registration Flow in `create-workflow`:**
1. `supabase.from('n8n_workflows').upsert(...)` — creates or updates the workflow record
2. `supabase.from('automation_routes').delete().eq('n8n_workflow_id', ...)` — clears old routes
3. `supabase.from('automation_routes').insert(routesToInsert)` — inserts fresh routes with correct Meta ID
4. `supabase.from('tracked_posts').insert(trackedPostsToInsert)` — inserts specific post filters (if applicable)

---

### 8.3 Execute / Trigger Flow: How a Comment Reaches n8n

```
Instagram User Comments on a Post
         ↓
Meta sends webhook → Cloudflare Bouncer (drops receipts/echoes)
         ↓
webhook-meta Edge Function receives POST
         ↓
Signature verified (HMAC SHA-256)
         ↓
processEvent() → loops through entries
         ↓
Account lookup: instagram_accounts WHERE instagram_business_id = entry.id
         ↓
resolveRoutes(internalAccountId, event_type, sub_type, mediaId)
  ├─ [Specific Post] tracked_posts WHERE media_id = X → returns ONLY that workflow
  └─ [All Posts]     automation_routes WHERE account_id = metaId AND is_active = true
         ↓
triggerWorkflows() → for each matched workflow:
  - Fetch webhook_path from n8n_workflows
  - POST to https://n8n.quickrevert.tech/webhook/{webhook_path}
         ↓
n8n workflow executes → DM/reply sent
```

**Critical Notes:**
- `internalAccountId` (UUID) is used **only** to query `automation_routes` (the route lookup)
- `instagram_business_id` (Meta's numeric ID as TEXT) is what's stored in `automation_routes.account_id`
- If no route is found, `resolveRoutes` returns empty → `webhook-meta` logs `[EARLY EXIT]` and stops

---

### 8.4 Activation Flow (Dashboard Toggle ON)

**Function**: `activate-workflow` Edge Function  
**Called by**: `n8nService.ts → activateWorkflow(workflowId)`

**Execution Steps:**
1. Validate user owns the workflow
2. Read automation's `trigger_type` and `trigger_config` from `automations` table
3. Read `instagram_business_id` from `instagram_accounts` table (needed to build correct routes)
4. **Try to update existing routes** → `automation_routes SET is_active = true WHERE n8n_workflow_id = X`
5. **If 0 routes found** (routes were never created due to old RPC bug) → **rebuild routes from scratch** with correct Meta account ID
6. Call `POST /api/v1/workflows/{id}/activate` on n8n
7. Update `n8n_workflows SET is_active = true`
8. Update `automations SET status = 'active'`

> [!IMPORTANT]
> Step 5 is the key resilience fix. Old automations created during the RPC bug era had zero routes in the database. Without the rebuild, re-activation appeared to succeed (n8n got activated) but webhook-meta would still receive 0 routes and never trigger the workflow.

---

### 8.5 Deactivation Flow (Dashboard Toggle OFF)

**Function**: `deactivate-workflow` Edge Function  
**Called by**: `n8nService.ts → deactivateWorkflow(workflowId)`

**Execution Steps:**
1. Validate user owns the workflow
2. Call `POST /api/v1/workflows/{id}/deactivate` on n8n — **hard stop**
3. Update `automation_routes SET is_active = false WHERE n8n_workflow_id = X` — **stops routing**
4. Update `n8n_workflows SET is_active = false`
5. Update `automations SET status = 'inactive'`

> [!NOTE]
> Deactivating routes at step 3 is the **primary** protection. Even if n8n somehow keeps running, webhook-meta checks `is_active = true` before forwarding, so no executions will happen.

**Bug Fixed**: Previously, the deactivation function was doing a `GET` + `PUT` to visually flip the toggle in n8n's UI. This caused a **400 error** because n8n rejects `PUT` on an active workflow without calling `/deactivate` first. Fixed by calling `/deactivate` endpoint first, then syncing DB.

---

### 8.6 Deletion Flow (Dashboard Delete Button)

**Function**: `delete-workflow` Edge Function  
**Called by**: `n8nService.ts → deleteWorkflow(workflowId)`

**Bug Fixed (Critical)**: The original implementation ran the n8n DELETE inside a fire-and-forget IIFE:
```ts
// ❌ OLD — background task gets killed when response is sent
const task = (async () => {
  await fetch(`${n8nBaseUrl}/api/v1/workflows/${id}`, { method: 'DELETE' });
})();
// Response sent here → Supabase kills the process → n8n DELETE never ran
return new Response(JSON.stringify({ success: true }));
```

**The Fix**: Made all operations synchronous before returning the response:
```ts
// ✅ NEW — everything awaited before returning
await fetch(`${n8nBaseUrl}/api/v1/workflows/${id}`, { method: 'DELETE' });
await supabase.from('automation_routes').delete().eq('n8n_workflow_id', id);
await supabase.from('tracked_posts').delete().eq('workflow_id', id);
await supabase.from('n8n_workflows').delete().eq('n8n_workflow_id', id);
await supabase.from('automations').update({ status: 'inactive' }).eq('id', automationId);
return new Response(JSON.stringify({ success: true }));
```

> [!CAUTION]
> **Supabase Edge Functions kill all background/async tasks the moment a Response is returned.** Never use fire-and-forget patterns for critical operations like n8n API calls, DB deletes, or route cleanup. Always `await` everything before returning.

---

### 8.7 Specific Post Routing (Tracked Posts System)

For **Post Comment** automations with "Specific Posts" mode selected, the system uses a separate `tracked_posts` table instead of generic `automation_routes`.

**Table Schema (`tracked_posts`)**:
```sql
workflow_id       TEXT     -- n8n workflow ID this post belongs to
platform          TEXT     -- 'instagram'
media_id          TEXT     -- Meta's media/post ID (numeric string)
instagram_username TEXT    -- human-readable: which account
automation_name   TEXT     -- human-readable: which automation
webhook_path      TEXT     -- direct webhook path to call in n8n
created_at        TIMESTAMPTZ
```

**How routing works for specific posts:**
```
Comment arrives on mediaId = "17665..."
         ↓
resolveRoutes() checks:
  SELECT workflow_id FROM tracked_posts WHERE media_id = '17665...'
         ↓
  [FOUND]  → routes = [{ n8n_workflow_id: specificWorkflowId }]
             ONLY that webhook fires. Global routes are NOT checked.
  [NOT FOUND] → falls back to automation_routes (all-posts automations)
```

**Key property**: If a `media_id` is in `tracked_posts`, no other automation will fire for that comment, even if the same Instagram account has other active automations. This is exact-post-to-automation pinning.

---

### 8.8 Execution Visibility in n8n (saveDataSuccessExecution)

**Problem**: Automations were executing (DMs were being sent) but the n8n dashboard showed no execution history, making debugging impossible.

**Cause**: A previous performance optimization had disabled execution saving:
```json
{ "saveDataSuccessExecution": "none" }
```

**Fix**: Re-enabled in all workflow builds:
```json
{
  "saveDataSuccessExecution": "all",
  "saveDataErrorExecution": "all",
  "saveManualExecutions": true,
  "saveExecutionProgress": true,
  "executionTimeout": 300
}
```

> [!TIP]
> If n8n performance degrades (slower dashboard, large DB), you can switch `saveDataSuccessExecution` back to `"none"` — but keep `saveDataErrorExecution: "all"` so errors are always visible.

---

### 8.9 Key Architecture Rules (Do Not Break)

| Rule | Why |
|---|---|
| `automation_routes.account_id` = Meta Business ID (TEXT) | `webhook-meta` queries with `entry.id` from Meta, which is always the numeric string |
| Never use Supabase UUID in `automation_routes.account_id` | UUIDs will never match Meta's numeric IDs → 0 routes → 0 executions |
| All n8n API calls must be awaited before returning | Supabase kills background tasks on response |
| Always call `/deactivate` before updating workflow via `PUT` | n8n rejects `PUT` on active workflows |
| Route `is_active` = false stops execution even if n8n is active | `webhook-meta` is the gatekeeper, not n8n |
| `tracked_posts` entries override `automation_routes` | Specific-post routing takes priority over generic account routing |



## invoations 
# [Audit] Periodic Invocation Analysis: User X (Viral Reels)

This document provides a technical breakdown of infrastructure costs and invocation counts based on the **Current Codebase** at `cloudflare-bouncer.js`.

---

## 1. Scenario: Viral Growth Case Study
- **User X Followers**: 15,000
- **Automated Reels**: 20
- **Comments per Reel**: 20,000 / month
- **Total Comments**: **400,000 / month**

---

## 2. Infrastructure Flow Analysis

### Phase A: Cloudflare Worker (The Bouncer)
Cloudflare receives **every single event** from Meta.

| Event Type | Logic in Bouncer | Result | Cloudflare Requests |
| :--- | :--- | :--- | :--- |
| **New Comments** | `messaging` is `undefined`. Skips filter. | **Forwarded** | 400,000 |
| **Bot DM Replies** | `is_echo` is true, but NOT `delivery/read`. | **Forwarded** | 400,000 |
| **Read Receipts** | `messaging.read` matches filter. | **Dropped** | 400,000 |
| **Delivery Receipts**| `messaging.delivery` matches filter. | **Dropped** | 400,000 |
| **TOTAL** | | | **~1,600,000** |

> [!NOTE] 
> **Cloudflare Status**: **PASSED**. 1.6M requests/month fits easily within the Cloudflare Free Tier (100k/day = 3M/month).

---

### Phase B: Supabase Edge Functions
Supabase is billed for every request forwarded by the Bouncer.

| Event Type | Logic in `webhook-meta` | Result | Supabase Invocations |
| :--- | :--- | :--- | :--- |
| **New Comments** | Forwarded by Cloudflare. Hits Edge Function. | **Logged & Processed** | 400,000 |
| **Bot Echoes** | Forwarded by Cloudflare. Hits Edge Function. | **Logged & Ignored** | 400,000 |
| **TOTAL** | | | **800,000** |

| **TOTAL** | | | **400,000** |

> [!TIP]
> **Supabase Status**: **PASSED**. 
> After implementing the **Echo Filter**, the monthly count dropped from 800k to **400k**.
> This is safely within the Supabase Free Tier limit of **500,000** invocations/month.

---

## 3. The "Silent Bill Killer": The Echo Loop
The biggest leak in your current setup is the **Echo Webhook**. 
For every **1 comment** your bot replies to, Meta sends **1 Echo** back to you. 

- **Incoming Comment**: 1 Invocation
- **Bot Reply (Echo)**: 1 Invocation
- **Total Cost per comment**: **2 Invocations**

Because your Cloudflare Bouncer does NOT filter `is_echo` (it only filters delivery/read), you are being charged double for every interaction.

---

## 4. Final Count Recommendations

### Current Result:
- **Cloudflare Requests**: 1,600,000 (Safe)
- **Supabase Invocations**: **800,000** (Danger Zone)

### The "Missing" Optimization:
To bring your Supabase invocations down from **800k** to **400k** (saving 50%), you must optimize the bouncer to drop echoes at the edge:

```javascript
// This is NOT in your current code, which is why your count is high:
if (messaging?.message?.is_echo) {
    return new Response('EVENT_RECEIVED', { status: 200 }); // Drops the 400k echo events
}
```

---

## 6. Targeted Notification System (May 2026)

### 6.1 The ID Mismatch Problem
The dashboard popup was failing for targeted users because the **Supabase Auth UUID** often differs from the **Neon Database User ID**. 
- **The Solution**: Migrated to **Email-based targeting**. Since email is the primary identifier for both auth and database records, it acts as a stable bridge.

### 6.2 The "Smarter Backend" Auto-Resolver
To prevent manual data entry errors, the `admin-notifications.cjs` backend now includes an **Automatic Email Resolver**. If an admin selects a user by ID but misses the email, the server automatically looks up the email in the `users` table before saving the notification.

### 6.3 UX: Refresh-Persistence
User feedback indicated that notifications should only show up on **manual page refreshes (F5)** to avoid annoying users during internal navigation.
- **Implementation**: Removed `localStorage` persistence. The notification state is held in React memory, which is wiped on refresh but preserved during client-side routing.

---

## 7. Exclusive Automation Routing & Tracking

### 7.1 Tracked Payloads & Posts
To ensure that a specific button click or post comment triggers **only one** specific workflow, we implemented `tracked_payloads` and `tracked_posts` tables.
- **The Bug (May 2026)**: Buttons weren't being saved because the `postbackMap` in `create-workflow` was declared in the wrong scope.
- **The Fix**: Moved the "Postback Collector" to a higher scope in the Edge Function, ensuring every button created in the builder is registered in the database for targeted routing.

### 7.2 Webhook Routing Logic
The `webhook-meta` function uses the following priority for routing:
1.  **Tracked Posts**: If a comment arrives on a `media_id` registered in `tracked_posts`, it triggers that specific workflow exclusively.
2.  **Tracked Payloads**: If a postback payload matches an entry in `tracked_payloads` for that `account_id`, it triggers only that workflow.
3.  **Global Fallback**: Global routes are only used if the event doesn't match any specific tracking entry, preventing duplicate triggers for targeted posts.

### 7.3 Auto-Discovery for New Accounts
To eliminate the need for manual "Syncing" from the admin panel, the `create-workflow` function now includes an **Auto-Discovery** block.
- **How it works**: When an automation is saved, the function checks if the `instagram_business_id` is null. If it is, it performs an immediate Graph API call to `/me` using the account's access token to resolve the correct ID before registering payloads.
- **Benefit**: This ensures that all `tracked_payloads` are saved with the correct Meta ID from the very first save, allowing buttons to work instantly for newly connected accounts.

### 7.4 Exclusive Message Routing (tracked_messages)
For automations triggered by plain-text DM keywords, we implemented the `tracked_messages` table (May 2026).
- **Mechanism**: Similar to `tracked_payloads`, it maps case-insensitive keywords to specific `n8n_workflow_ids` and `webhook_paths`.
- **Priority**: In `webhook-meta`, `tracked_messages` is checked immediately after `tracked_payloads`. This ensures that if a user sends a message that matches a specific keyword, only the intended workflow triggers, bypassing global fallback routes.

### 7.5 Plan Limit Enforcement (May 2026)
- **Mechanism**: The `webhook-meta` function now performs a pre-flight check using the `checkUserDmLimit` utility.
- **Local Cache**: Plan flags (dm_limit, is_gifted, etc.) are synced from Neon to a local Supabase table `user_limits`.
- **Enforcement**: If the user's DM count in `automation_activities` exceeds their assigned limit, `webhook-meta` blocks the n8n trigger and logs a `limit_exceeded` activity. This prevents users from exceeding their tier quotas without requiring a cross-database call on every webhook.

---

## 9. Troubleshooting: Unconstrained `select('*')` Queries

Using `select('*')` instead of explicitly naming columns (`select('id, name')`) forces the database to return every column in a row. When combined with tables that hold large JSON objects (like `metadata`, `execution_data`, or `payloads`), this causes **massive Egress inflation** and slows down query execution. 

Below is the active audit of `select('*')` usage in the codebase that needs to be refactored to specific columns:

### 9.1 Frontend Components (High Priority for Refactoring)
*   **`src/components/Automations.tsx` (Line 178)**: Fetching all automations. Should be restricted to `id, name, is_active, trigger_type, instagram_account_id`.
*   **`src/components/AutomationCreate.tsx` / `AutomationCreate_millennial.tsx`**: Fetching accounts/workflows. 
*   **`src/components/LeadManager.tsx`**: Fetching leads/contacts. (Note: Line 310 was successfully optimized, but lines 297 & 333 still use `select('*')`).
*   **`src/components/InstagramConnectionStatus.tsx`**: Should only fetch `status, username, profile_pic`.
*   **`src/components/Settings.tsx` & `PromoCodeGenerator.tsx`**: Fetching user profiles/promos.

### 9.2 Edge Functions (Medium Priority)
*   **`create-workflow` & `create-analytics-workflow`**: Fetching `instagram_accounts`. Only `id, access_token, user_id` are usually needed.
*   **`instagram-refresh-token` & `instagram-oauth-callback`**: OAuth flow queries.
*   **`fetch-instagram-profile` & `fetch-instagram-media`**: Diagnostic/Fetch queries.

> [!TIP]
> **Exception to the Rule:** `select('*', { count: 'exact', head: true })` (used in `webhook-meta` and `sync-user-neon`) is **safe**. The `{ head: true }` parameter tells Supabase to only return the count header and skip the body payload entirely. This costs zero Egress.

---

## 10. The "Manual Sync" Bug Fix (May 2026)

### 10.1 The Problem
When a user created an automation, they noticed it **wouldn't actually work** (DMs wouldn't trigger) unless an admin went into the internal dashboard and clicked a "Sync" button. 

**Why was this happening?**
1. When creating a *new* automation, the backend edge function (`create-workflow`) creates a fresh n8n workflow from scratch. 
2. However, during this *first* creation pass, some data (like the correct Meta Instagram Business ID) might not be fully ready or linked yet, causing the webhook routes to be saved with missing or incorrect IDs. 
3. When the admin clicked "Sync", it called the *same* edge function again. But because the workflow already existed, it took an **"Update" (PUT)** path. This path was heavily optimized to cleanly wipe out old broken routes and rebuild them with the correct IDs.

### 10.2 The Simple Fix
Instead of forcing the admin to click Sync, we made the frontend application do it automatically in the blink of an eye.

**How the fix works:**
In `AutomationCreate.tsx`, right after the user clicks "Save" and the automation is created (Pass 1), the code now **immediately calls the creation function a second time** (Pass 2).

- **Pass 1:** Creates the n8n workflow and saves its ID to our database.
- **Pass 2 (Auto-Sync):** Sees that the workflow ID already exists, so it updates the workflow and rigorously rebuilds all the database routes (`automation_routes`, `tracked_posts`, `tracked_payloads`).

This replicates exactly what the admin "Sync" button was doing, ensuring the automation works 100% of the time right after creation without any manual intervention!
