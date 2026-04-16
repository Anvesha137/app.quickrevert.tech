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
