# Configure Supabase Edge Function Secrets

Your edge functions need these environment variables configured in Supabase.

## Required Secrets

Run these commands to set up your edge function secrets:

```bash
# Set Razorpay credentials (CRITICAL for payments)
supabase secrets set RAZORPAY_KEY_SECRET=your_razorpay_secret_here

# Set Supabase Service Role Key (Used for admin-level operations)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Set Instagram OAuth credentials
supabase secrets set INSTAGRAM_CLIENT_ID=your_id
supabase secrets set INSTAGRAM_CLIENT_SECRET=your_secret
supabase secrets set INSTAGRAM_REDIRECT_URI=https://unwijhqoqvwztpbahlly.supabase.co/functions/v1/instagram-oauth-callback

# Set Frontend URL
supabase secrets set FRONTEND_URL=https://app.quickrevert.tech
```

## Alternative: Set via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/unwijhqoqvwztpbahlly/settings/functions
2. Click on "Manage secrets"
3. Add the following secrets:
   - `RAZORPAY_KEY_SECRET` = (Your Razorpay Secret Key)
   - `SUPABASE_SERVICE_ROLE_KEY` = (Your Supabase Service Role Key)
   - `INSTAGRAM_CLIENT_ID`
   - `INSTAGRAM_CLIENT_SECRET`
   - `FRONTEND_URL` = `https://app.quickrevert.tech`

## Note

These secrets are automatically available to all edge functions as `Deno.env.get("SECRET_NAME")`. After setting them, your payment and Instagram connections will work immediately.
