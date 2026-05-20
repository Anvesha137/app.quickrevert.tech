# 📊 QuickRevert | Resource & Performance Audit (v1.0)

This audit provides a precise, technical-to-human mapping of every resource-consuming action within the platform. Use this to monitor your Supabase usage and scaling costs.

---

### 🛡️ Resource Consumption Matrix

| User Action / Event | Resource Type | Invocation Count | DB Call Count | Plain English Explanation (Non-Tech) |
| :--- | :--- | :---: | :---: | :--- |
| **🏠 Dashboard Load** | Database | 0 | **5** | Reads your bots, latest stats, charts, and contacts to show you the overview. |
| **🤖 Viewing Bot List** | Database | 0 | **3** | Fetches the full list of your automations and their background connections. |
| **🔄 Turning Bot ON/OFF** | Mixed | **1** | **2** | Tells n8n to start/stop working (1) and updates the status in our storage (2). |
| **🔗 Linking Instagram** | Mixed | **1** | **3** | Securely initiates the Facebook login (1), then saves the account and profile info (3). |
| **✨ Picking a Specific Post** | Edge Function | **1** | 0 | Requests a fresh, high-quality thumbnail from Instagram's servers for your post. |
| **🚀 Launching Automation** | Mixed | **1** | **2** | Builds the complex "brain" logic in n8n (1) and saves the new bot details (2). |
| **💬 Customer Comments on IG** | Edge Function | **1** | 0 | This is an "inbound" call. The system wakes up to check if it should reply. |
| **✅ A Bot Replies (Success)** | Database | 0 | **1** | Records the win in your log so you can track how many people you've reached. |
| **👤 New Contact Found** | Database | 0 | **1** | When a new person interacts, their info is saved to your "Contacts" tab automatically. |
| **💳 Upgrading Plan** | Edge Function | **1** | 0 | Securely creates a payment intent with Razorpay. |
| **🎫 Applying Discount Code** | Edge Function | **1** | **1** | Validates the coupon with our core logic (1) and reads the discount value (1). |
| **🗑️ Deleting a Bot** | Mixed | **1** | **2** | Destroys the brain in n8n (1) and removes the bot/workflow from your account (2). |
| **🕵️ Account Cleanup** | Edge Function | **1** | **All** | Wipes your entire database and account history permanently. |

---

### 📈 Scaling & Frequency Analysis

| Action Category | Frequency | Impact Level | Strategy for Growth |
| :--- | :--- | :--- | :--- |
| **Background Traffic** | High (Per IG Event) | **CRITICAL** | High-traffic accounts will see the most Invocations here. |
| **User Navigation** | Medium (Per Session) | Low | Standard usage. Impact is minimal unless refreshing constantly. |
| **Bot Management** | Low (Per Edit) | Moderate | One-off costs when you set up your system. |

---

### 💡 Understanding the Numbers
*   **Invocations:** These are "Mini-Server" rentals. You get a set number per month on Supabase Free/Pro.
*   **DB Calls:** These are "Memory" requests. They are very fast and high-capacity, but we track them to keep your dashboard snappy.
*   **n8n Webhooks:** These happen automatically during background traffic and are already accounted for in the "Bot Replies" section above.

> [!IMPORTANT]
> This audit is based on Source Code Version 4.2 (March 2026). As we optimize the app with browser-side caching, the "DB Call Count" per page load will decrease further.

---

### 🚨 Troubleshooting: Unconstrained `select('*')` Queries

Using `select('*')` instead of explicitly naming columns (`select('id, name')`) forces the database to return every column in a row. When combined with tables that hold large JSON objects (like `metadata`, `execution_data`, or `payloads`), this causes **massive Egress inflation** and slows down query execution. 

Below is the active audit of `select('*')` usage in the codebase that needs to be refactored to specific columns:

#### Frontend Components (High Priority for Refactoring)
*   **`src/components/Automations.tsx` (Line 178)**: Fetching all automations. Should be restricted to `id, name, is_active, trigger_type, instagram_account_id`.
*   **`src/components/AutomationCreate.tsx` / `AutomationCreate_millennial.tsx`**: Fetching accounts/workflows. 
*   **`src/components/LeadManager.tsx`**: Fetching leads/contacts. (Note: Line 310 was successfully optimized, but lines 297 & 333 still use `select('*')`).
*   **`src/components/InstagramConnectionStatus.tsx`**: Should only fetch `status, username, profile_pic`.
*   **`src/components/Settings.tsx` & `PromoCodeGenerator.tsx`**: Fetching user profiles/promos.

#### Edge Functions (Medium Priority)
*   **`create-workflow` & `create-analytics-workflow`**: Fetching `instagram_accounts`. Only `id, access_token, user_id` are usually needed.
*   **`instagram-refresh-token` & `instagram-oauth-callback`**: OAuth flow queries.
*   **`fetch-instagram-profile` & `fetch-instagram-media`**: Diagnostic/Fetch queries.

> [!TIP]
> **Exception to the Rule:** `select('*', { count: 'exact', head: true })` (used in `webhook-meta` and `sync-user-neon`) is **safe**. The `{ head: true }` parameter tells Supabase to only return the count header and skip the body payload entirely. This costs zero Egress.
