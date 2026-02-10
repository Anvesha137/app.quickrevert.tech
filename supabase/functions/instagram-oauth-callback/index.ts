import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INSTAGRAM_CLIENT_ID = "1487967782460775";
const INSTAGRAM_REDIRECT_URI = Deno.env.get("INSTAGRAM_REDIRECT_URI")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const frontendUrl = (Deno.env.get("FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, '');

    if (errorParam) return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(errorDescription || errorParam)}`, 302);
    if (!code) return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Authorization code missing')}`, 302);
    if (!state) return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('State parameter missing')}`, 302);

    let userId: string;
    try {
      const base64 = state.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const binaryString = atob(base64 + padding);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoder = new TextDecoder();
      const stateData = JSON.parse(decoder.decode(bytes));
      userId = stateData.user_id;
    } catch {
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Invalid state parameter')}`, 302);
    }

    const instagramClientSecret = Deno.env.get("INSTAGRAM_CLIENT_SECRET");
    if (!instagramClientSecret) return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Instagram client secret not configured')}`, 302);

    // Step 1: Exchange authorization code for short-lived token
    console.log('Exchanging authorization code for access token...');
    const tokenFormData = new URLSearchParams();
    tokenFormData.append('client_id', INSTAGRAM_CLIENT_ID);
    tokenFormData.append('client_secret', instagramClientSecret);
    tokenFormData.append('grant_type', 'authorization_code');
    tokenFormData.append('redirect_uri', INSTAGRAM_REDIRECT_URI);
    tokenFormData.append('code', code);

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: tokenFormData,
    });
    const tokenData = await tokenResponse.json();

    console.log('Token response status:', tokenResponse.status);
    console.log('Token response:', JSON.stringify(tokenData, null, 2));

    if (!tokenData.access_token || !tokenData.user_id) {
      const errorMsg = tokenData.error_message || tokenData.error?.message || JSON.stringify(tokenData);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Token exchange failed: ' + errorMsg)}`, 302);
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id;

    console.log('Short-lived token received, user_id:', instagramUserId);

    // Step 2: Fetch profile using the user_id (NOT /me endpoint)
    console.log('Fetching Instagram profile...');
    const profileRes = await fetch(`https://graph.instagram.com/${instagramUserId}?fields=id,username&access_token=${shortLivedToken}`);
    const profileData = await profileRes.json();

    console.log('Profile response status:', profileRes.status);
    console.log('Profile data:', JSON.stringify(profileData, null, 2));

    if (!profileRes.ok || profileData.error) {
      const errorMsg = profileData.error?.message || JSON.stringify(profileData);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Profile fetch failed: ' + errorMsg)}`, 302);
    }

    if (!profileData.username) {
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Instagram username not found in profile')}`, 302);
    }

    // Use short-lived token (expires in 1 hour)
    // Note: Instagram Graph API with Instagram Login doesn't support programmatic long-lived token exchange
    const accessToken = shortLivedToken;
    const tokenExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour

    console.log('Saving to database...');
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existingAccount } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("instagram_user_id", instagramUserId)
      .maybeSingle();

    if (existingAccount) {
      const { error: updateError } = await supabase.from("instagram_accounts").update({
        user_id: userId,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        username: profileData.username,
        status: "active",
        last_synced_at: new Date().toISOString(),
      }).eq("id", existingAccount.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Database update failed')}`, 302);
      }
    } else {
      const { error: insertError } = await supabase.from("instagram_accounts").insert({
        user_id: userId,
        instagram_user_id: instagramUserId,
        username: profileData.username,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        status: "active",
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('Database insert error:', insertError);
        return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Database insert failed')}`, 302);
      }
    }

    console.log('Success! Redirecting...');
    return Response.redirect(`${frontendUrl}/connect-accounts?instagram_connected=true&username=${encodeURIComponent(profileData.username)}`, 302);

  } catch (error: any) {
    console.error('Unexpected error:', error);
    const frontendUrl = (Deno.env.get("FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, '');
    return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(error.message || 'Unknown error')}`, 302);
  }
});