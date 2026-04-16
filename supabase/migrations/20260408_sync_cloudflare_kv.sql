-- Enable vaulted secrets (Requires Supabase Vault)
-- Ensure extension is installed
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Create the sync function
CREATE OR REPLACE FUNCTION public.sync_active_status_to_cloudflare()
RETURNS TRIGGER AS $$
DECLARE
    cf_account_id text;
    cf_namespace_id text;
    cf_api_token text;
    has_automation boolean;
    cf_url text;
    req_id bigint;
BEGIN
    -- Only sync if active_automations_count has changed or it's a new record
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.active_automations_count IS DISTINCT FROM OLD.active_automations_count) THEN
        
        -- Determine flag (true if > 0, false if 0)
        has_automation := (NEW.active_automations_count > 0);

        -- We only care about syncing the instagram_business_id
        -- since that's what webhooks send in entry.id
        IF NEW.instagram_business_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Get secrets from vault (Fail safe if secrets not setup yet)
        BEGIN
            SELECT secret INTO cf_account_id FROM vault.decrypted_secrets WHERE name = 'CLOUDFLARE_ACCOUNT_ID';
            SELECT secret INTO cf_namespace_id FROM vault.decrypted_secrets WHERE name = 'CLOUDFLARE_KV_NAMESPACE_ID';
            SELECT secret INTO cf_api_token FROM vault.decrypted_secrets WHERE name = 'CLOUDFLARE_API_TOKEN';
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Cloudflare secrets not configured in Vault. Skipping KV sync.';
            RETURN NEW;
        END;

        IF cf_account_id IS NULL OR cf_namespace_id IS NULL OR cf_api_token IS NULL THEN
            RAISE WARNING 'Cloudflare secrets missing from Vault. Skipping KV sync.';
            RETURN NEW;
        END IF;

        -- Construct URL for the Edge Function
        cf_url := 'https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/sync-cloudflare-kv';

        -- Use pg_net to make the async HTTP POST request to our proxy function
        select net.http_post(
            url := cf_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'accountId', NEW.instagram_business_id,
                'hasAutomation', has_automation,
                'cfAccountId', cf_account_id,
                'cfNamespaceId', cf_namespace_id,
                'cfApiToken', cf_api_token
            )
        ) into req_id;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_sync_cf_kv_automations ON public.instagram_accounts;

CREATE TRIGGER trigger_sync_cf_kv_automations
AFTER INSERT OR UPDATE OF active_automations_count
ON public.instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_active_status_to_cloudflare();
