
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

    if (!tokenData.access_token || !tokenData.user_id) {
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(tokenData.error_message || 'Token exchange failed')}`, 302);
    }

    const shortLivedToken = tokenData.access_token;
    // const instagramUserId = tokenData.user_id; // Legacy ID

    const longTokenUrl = new URL('https://graph.instagram.com/access_token');
    longTokenUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longTokenUrl.searchParams.set('client_secret', instagramClientSecret);
    longTokenUrl.searchParams.set('access_token', shortLivedToken);

    const longTokenResponse = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenResponse.json();

    if (!longTokenData.access_token) {
      console.error("Long token failed:", longTokenData);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Failed to get long-lived token')}`, 302);
    }

    const accessToken = longTokenData.access_token;
    const tokenExpiresAt = new Date(Date.now() + (longTokenData.expires_in || 5184000) * 1000).toISOString();

    const profileRes = await fetch(`https://graph.instagram.com/me?fields=id,username,account_type,media_count,profile_picture_url&access_token=${accessToken}`);
    const profileData = await profileRes.json();

    if (!profileRes.ok) {
      console.error('Failed to fetch Instagram profile:', profileData);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Failed to retrieve Instagram profile data')}`, 302);
    }

    if (!profileData || !profileData.username) {
      console.error('Instagram profile data missing username:', profileData);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Could not retrieve Instagram username')}`, 302);
    }

    // THIS ID is likely the App-Scoped ID (Basic Display), NOT the Business ID.
    // However, since we are forced to use Basic Display, we save this.
    // WARNING: This ID usually does NOT match the Webhook ID.
    const finalInstagramUserId = profileData.id;
    console.log(`Resolved Basic Instagram ID: ${finalInstagramUserId}`);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existingAccount } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("instagram_user_id", finalInstagramUserId)
      .maybeSingle();

    if (existingAccount) {
      await supabase.from("instagram_accounts").update({
        user_id: userId,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        username: profileData.username,
        profile_picture_url: profileData.profile_picture_url,
        status: "active",
        last_synced_at: new Date().toISOString(),
      }).eq("id", existingAccount.id);
    } else {
      await supabase.from("instagram_accounts").insert({
        user_id: userId,
        instagram_user_id: finalInstagramUserId,
        username: profileData.username,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        profile_picture_url: profileData.profile_picture_url,
        status: "active",
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      });
    }

    return Response.redirect(`${frontendUrl}/connect-accounts?instagram_connected=true&username=${encodeURIComponent(profileData.username)}`, 302);

  } catch (error: any) {
    const frontendUrl = (Deno.env.get("FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, '');
    return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(error.message || 'Unknown error')}`, 302);
  }
});