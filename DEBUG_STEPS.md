# Webhook Trigger Debugging - Simple Steps

## The Problem

Instagram DMs are not triggering n8n workflows. The flow should be:
```
Instagram DM → webhook-meta → Find Route → Trigger n8n Webhook
```

## What I Need From You

Run these 3 SQL queries in Supabase SQL Editor and share the output:

### Query 1: Check if webhooks are being received
```sql
SELECT created_at, error_message
FROM failed_events
WHERE created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 10;
```

### Query 2: Check your configuration
```sql
-- Accounts
SELECT id, username, instagram_business_id 
FROM instagram_accounts 
WHERE status = 'active';

-- Workflows
SELECT id, name, n8n_workflow_id, webhook_path, webhook_url, is_active 
FROM n8n_workflows;

-- Routes
SELECT ar.id, ar.event_type, ar.sub_type, ar.is_active,
       ia.username, nw.name as workflow_name, nw.webhook_path
FROM automation_routes ar
JOIN instagram_accounts ia ON ar.account_id = ia.id
LEFT JOIN n8n_workflows nw ON ar.n8n_workflow_id = nw.n8n_workflow_id;
```

### Query 3: Check recent n8n trigger attempts
```sql
SELECT created_at, error_message
FROM failed_events
WHERE error_message LIKE '%N8n%'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;
```

## What These Will Tell Us

- **Query 1**: Are webhooks reaching your server?
- **Query 2**: Is everything configured correctly?
- **Query 3**: Is n8n being triggered?

## Quick Fix to Try

If Query 2 shows no routes, run this to create them manually:

```sql
-- Get your account and workflow IDs first
SELECT 'Account:', id, username FROM instagram_accounts WHERE status = 'active';
SELECT 'Workflow:', id, n8n_workflow_id, name FROM n8n_workflows WHERE is_active = true;

-- Then create route (replace the UUIDs with your actual IDs)
INSERT INTO automation_routes (account_id, user_id, n8n_workflow_id, event_type, sub_type, is_active)
SELECT 
    ia.id as account_id,
    ia.user_id,
    nw.n8n_workflow_id,
    'messaging' as event_type,
    'message' as sub_type,
    true as is_active
FROM instagram_accounts ia
CROSS JOIN n8n_workflows nw
WHERE ia.status = 'active' AND nw.is_active = true;
```

After creating routes, send a test DM and it should work.
