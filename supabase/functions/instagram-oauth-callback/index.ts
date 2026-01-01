import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INSTAGRAM_CLIENT_ID = Deno.env.get("INSTAGRAM_CLIENT_ID");
const INSTAGRAM_REDIRECT_URI = Deno.env.get("INSTAGRAM_REDIRECT_URI");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://app-quickrevert-tech.vercel.app";

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

    // Short-lived token
    const tokenResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${INSTAGRAM_CLIENT_ID}&client_secret=${instagramClientSecret}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}&code=${code}`);
    const tokenData = await tokenResponse.json();
    const shortLivedToken = tokenData.access_token;
    if (!shortLivedToken) return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(tokenData.error?.message || 'Token exchange failed')}`, 302);

    // Debug token to get Instagram user ID
    const debugResponse = await fetch(`https://graph.facebook.com/v18.0/debug_token?input_token=${shortLivedToken}&access_token=${INSTAGRAM_CLIENT_ID}|${instagramClientSecret}`);
    const debugData = await debugResponse.json();
    const instagramUserId = debugData.data?.user_id;
    if (!instagramUserId) return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Failed to get Instagram user ID')}`, 302);

    // Long-lived token
    const longTokenResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${INSTAGRAM_CLIENT_ID}&client_secret=${instagramClientSecret}&fb_exchange_token=${shortLivedToken}`);
    const longTokenData = await longTokenResponse.json();
    const accessToken = longTokenData.access_token;
    const tokenExpiresAt = new Date(Date.now() + longTokenData.expires_in * 1000).toISOString();

    // Profile fetch
    const profileRes = await fetch(`https://graph.instagram.com/${instagramUserId}?fields=id,username,profile_picture_url&access_token=${accessToken}`);
    const profileData = await profileRes.json();

    // Save to Supabase
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existingAccount } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("instagram_user_id", instagramUserId)
      .maybeSingle();

    if (existingAccount) {
      await supabase.from("instagram_accounts").update({
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
        instagram_user_id: instagramUserId,
        username: profileData.username,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        profile_picture_url: profileData.profile_picture_url,
        status: "active",
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      });
    }

    return Response.redirect(`${frontendUrl}/connect-accounts?instagram_connected=true`, 302);

  } catch (error: any) {
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://app-quickrevert-tech.vercel.app";
    return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(error.message || 'Unknown error')}`, 302);
  }
});