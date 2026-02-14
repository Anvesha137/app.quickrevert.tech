# Webhook Trigger Diagnostic Test

## Quick Diagnostic Check

Run this command to get a comprehensive diagnostic report:

```powershell
# Replace <YOUR_ACCESS_TOKEN> with your Supabase access token from the dashboard
curl -X POST https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/diagnose-webhook \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json"
```

This will check:
- ✅ Instagram accounts connected
- ✅ N8N workflows active
- ✅ Automation routes configured
- ✅ Recent webhook reception
- ✅ Recent automation activities

## Manual Test Steps

### Step 1: Send a Test DM

1. From a different Instagram account, send a DM to your connected Instagram account
2. Message content: "test webhook trigger"

### Step 2: Check if Webhook Was Received

Run this SQL query to check recent webhooks:

```sql
SELECT 
    created_at,
    event_id,
    error_message,
    payload->'entry'->0->>'id' as instagram_account_id,
    payload->'entry'->0->'messaging'->0->'message'->>'text' as message_text
FROM failed_events
WHERE error_message LIKE '%DEBUG: Meta Webhook Received%'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result:** You should see your test message logged here.

**If NOT found:** Webhooks are not reaching your Supabase function. Check:
- Meta App Dashboard webhook subscription status
- Callback URL is correct: `https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/webhook-meta`

### Step 3: Check if Account Was Found

Look at the same `failed_events` entry and check the full payload:

```sql
SELECT 
    payload
FROM failed_events
WHERE error_message LIKE '%DEBUG: Meta Webhook Received%'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

Then check if your Instagram account was found:

```sql
SELECT 
    id,
    username,
    instagram_user_id,
    instagram_business_id,
    status
FROM instagram_accounts
WHERE instagram_business_id = '<ID_FROM_WEBHOOK_PAYLOAD>';
```

**Expected Result:** Should return your Instagram account.

**If NOT found:** The `instagram_business_id` in the database doesn't match what Instagram is sending in webhooks.

### Step 4: Check if Routes Exist

```sql
SELECT 
    ar.id,
    ar.event_type,
    ar.sub_type,
    ar.is_active,
    nw.name as workflow_name,
    nw.webhook_path
FROM automation_routes ar
JOIN instagram_accounts ia ON ar.account_id = ia.id
JOIN n8n_workflows nw ON ar.n8n_workflow_id = nw.n8n_workflow_id
WHERE ia.username = '<YOUR_INSTAGRAM_USERNAME>'
  AND ar.is_active = true;
```

**Expected Result:** Should show at least one route with `event_type = 'messaging'`.

**If NOT found:** Routes were not created when you activated the workflow. This is the most likely issue!

### Step 5: Check if N8N Was Triggered

```sql
SELECT 
    created_at,
    event_id,
    error_message,
    payload->>'account_id' as account_id
FROM failed_events
WHERE error_message LIKE '%DEBUG: N8n%'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

**Expected Result:** Should show attempts to trigger n8n and the response status.

**If NOT found:** The routing logic didn't find any matching routes.

## Common Issues and Fixes

### Issue 1: No Automation Routes

**Symptom:** Step 4 returns no results.

**Fix:** Routes should be created automatically when you activate a workflow. Check the `activate-workflow` function to ensure it's creating routes in the `automation_routes` table.

### Issue 2: Instagram Business ID Mismatch

**Symptom:** Step 3 shows webhook received but account not found.

**Fix:** The `instagram_business_id` in your database doesn't match what Instagram sends. The `webhook-meta` function has auto-update logic (lines 144-164) that should fix this automatically on the next webhook.

### Issue 3: N8N Workflow Not Triggered

**Symptom:** Steps 1-4 pass, but Step 5 shows no n8n trigger attempts.

**Fix:** Check the `webhook_path` in the `n8n_workflows` table. It should match the webhook path in your n8n workflow.

## Next Steps

Based on which step fails, we can pinpoint the exact issue and implement the appropriate fix.
