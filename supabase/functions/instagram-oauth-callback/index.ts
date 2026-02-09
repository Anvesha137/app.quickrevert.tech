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

    // 1. Exchange code for User Access Token (Facebook Graph API)
    console.log('Exchanging code for Facebook User Access Token...');
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', INSTAGRAM_CLIENT_ID);
    tokenUrl.searchParams.set('redirect_uri', INSTAGRAM_REDIRECT_URI);
    tokenUrl.searchParams.set('client_secret', instagramClientSecret);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString(), { method: 'GET' });
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Failed to get user access token:', tokenData.error);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(tokenData.error.message || 'Token exchange failed')}`, 302);
    }

    const userAccessToken = tokenData.access_token;
    console.log('Got User Access Token');

    // 2. Fetch Pages to find connected Instagram Business Account
    console.log('Fetching Pages...');
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url},picture&access_token=${userAccessToken}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('Failed to fetch pages:', pagesData.error);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Failed to fetch Facebook Pages')}`, 302);
    }

    let foundBusinessAccount = null;
    let pageAccessToken = null;
    let pageId = null;

    if (pagesData.data && Array.isArray(pagesData.data)) {
      for (const page of pagesData.data) {
        if (page.instagram_business_account) {
          foundBusinessAccount = page.instagram_business_account;
          pageAccessToken = page.access_token;
          pageId = page.id;
          console.log(`Found Instagram Business Account: ${foundBusinessAccount.id} on Page: ${page.name}`);
          break; // Stop at the first one for now
        }
      }
    }

    if (!foundBusinessAccount) {
      console.warn('No Instagram Business Account found on any Page.');
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('No Instagram Business Account connected to your Facebook Pages. Please ensure you have converted your Instagram account to Business/Creator and linked it to a Facebook Page.')}`, 302);
    }

    // 3. We have everything we need.
    const instagramBusinessId = foundBusinessAccount.id;
    const username = foundBusinessAccount.username;
    const profilePictureUrl = foundBusinessAccount.profile_picture_url || foundBusinessAccount.profile_picture?.data?.url; // profile_picture_url field might safely return it if requested, but nested struct is possible.
    // Actually `instagram_business_account{id,username,profile_picture_url}` request should return `profile_picture_url` directly if valid.


    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existingAccount } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("instagram_business_id", instagramBusinessId) // match on business id
      .maybeSingle();

    const timestamp = new Date().toISOString();
    // Start with a long expiry, Page tokens are effectively long-lived (never expire unless password change/revoked) for most cases, or valid for 60 days. simpler to just set a far future or handle validation logic elsewhere.

    if (existingAccount) {
      await supabase.from("instagram_accounts").update({
        instagram_user_id: instagramBusinessId, // Legacy column support
        username: username,
        access_token: pageAccessToken, // Storing PAGE ACCESS TOKEN as primary token
        page_access_token: pageAccessToken,
        page_id: pageId,
        instagram_business_id: instagramBusinessId,
        profile_picture_url: profilePictureUrl,
        status: "active",
        last_synced_at: timestamp,
        token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // ~60 days
      }).eq("id", existingAccount.id);
    } else {
      await supabase.from("instagram_accounts").insert({
        user_id: userId,
        instagram_user_id: instagramBusinessId, // Legacy column
        instagram_business_id: instagramBusinessId,
        username: username,
        access_token: pageAccessToken, // Storing PAGE ACCESS TOKEN
        page_access_token: pageAccessToken,
        page_id: pageId,
        profile_picture_url: profilePictureUrl,
        status: "active",
        connected_at: timestamp,
        last_synced_at: timestamp,
        token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    return Response.redirect(`${frontendUrl}/connect-accounts?instagram_connected=true&username=${encodeURIComponent(username)}`, 302);

  } catch (error: any) {
    const frontendUrl = (Deno.env.get("FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, '');
    console.error('Unexpected error:', error);
    return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(error.message || 'Unknown error')}`, 302);
  }
});
