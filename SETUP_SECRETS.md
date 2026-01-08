# Configure Supabase Edge Function Secrets

Your edge functions need these environment variables configured in Supabase.

## Required Secrets

Run these commands to set up your edge function secrets:

```bash
# Set Instagram OAuth credentials
supabase secrets set INSTAGRAM_CLIENT_ID=1487967782460775
supabase secrets set INSTAGRAM_CLIENT_SECRET=a791afe1ae5ee717eff0c6b8626d516c
supabase secrets set INSTAGRAM_REDIRECT_URI=https://hrhousfcmcqbtagycvii.supabase.co/functions/v1/instagram-oauth-callback

# Set Frontend URL
supabase secrets set FRONTEND_URL=https://anvesha137-app-quick-hylj.bolt.host

# Verify token for webhook subscriptions (can be any random string)
supabase secrets set INSTAGRAM_VERIFY_TOKEN=instagram_webhook_verify_token_12345
```

## Alternative: Set via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/hrhousfcmcqbtagycvii/settings/functions
2. Click on "Edge Functions" in the sidebar
3. Click on "Manage secrets"
4. Add each secret:
   - `INSTAGRAM_CLIENT_ID` = `1487967782460775`
   - `INSTAGRAM_CLIENT_SECRET` = `a791afe1ae5ee717eff0c6b8626d516c`
   - `INSTAGRAM_REDIRECT_URI` = `https://hrhousfcmcqbtagycvii.supabase.co/functions/v1/instagram-oauth-callback`
   - `FRONTEND_URL` = `https://anvesha137-app-quick-hylj.bolt.host`
   - `INSTAGRAM_VERIFY_TOKEN` = `instagram_webhook_verify_token_12345`

## Note

These secrets are automatically available to all edge functions as `Deno.env.get("SECRET_NAME")`. After setting them, your Instagram connection will work immediately - no redeployment needed.
