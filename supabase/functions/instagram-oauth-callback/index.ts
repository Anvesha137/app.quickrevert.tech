import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INSTAGRAM_CLIENT_ID = Deno.env.get("INSTAGRAM_CLIENT_ID") || "1487967782460775";
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

    if (!tokenData.access_token || !tokenData.user_id) {
      const errorMsg = tokenData.error_message || tokenData.error?.message || JSON.stringify(tokenData);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Token exchange failed: ' + errorMsg)}`, 302);
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id;

    console.log('Short-lived token received for Instagram user_id:', instagramUserId);
    console.log('Exchanging for long-lived token...');

    const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${instagramClientSecret}&access_token=${shortLivedToken}`;
    const longLivedTokenRes = await fetch(longLivedTokenUrl);
    const longLivedTokenData = await longLivedTokenRes.json();

    console.log('Long-lived token response status:', longLivedTokenRes.status);

    if (!longLivedTokenRes.ok || !longLivedTokenData.access_token) {
      const errorMsg = longLivedTokenData.error?.message || 'Failed to exchange for long-lived token';
      console.error('Long-lived token exchange failed:', errorMsg);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const accessToken = longLivedTokenData.access_token;
    const tokenExpiresAt = new Date(Date.now() + (longLivedTokenData.expires_in || 5184000) * 1000).toISOString();

    console.log('Long-lived token received, expires in:', longLivedTokenData.expires_in, 'seconds');

    // 3. Fetch Instagram profile (for username and profile picture)
    // We still need this for the UI, even if the ID is wrong for webhooks.
    const profileUrl = `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${accessToken}`;
    console.log('Fetching Instagram profile...');

    const profileRes = await fetch(profileUrl);
    const profileData = await profileRes.json();

    console.log('Profile response status:', profileRes.status);

    if (!profileRes.ok || profileData.error) {
      const errorMsg = profileData.error?.message || 'Failed to fetch profile';
      console.error('Profile fetch failed:', errorMsg);
      return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(errorMsg)}`, 302);
    }

    const username = profileData.username || `user_${instagramUserId}`;
    const profilePictureUrl = profileData.profile_picture_url || null;

    // 4. Fetch the Instagram Business Account ID (IGBA) linked to the user's Page
    // standard /me endpoint returns the User ID, which is WRONG for webhooks.
    // We must find the Page that this Instagram account is connected to.

    console.log('Fetching Pages to find linked Instagram Business Account...');
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    let igbaId = null;
    let pageName = null;

    if (pagesData.data) {
      for (const page of pagesData.data) {
        if (page.instagram_business_account) {
          igbaId = page.instagram_business_account.id;
          pageName = page.name;
          console.log(`✅ Found Linked Instagram Business ID: ${igbaId} (Page: ${pageName})`);
          break;
        }
      }
    }

    if (!igbaId) {
      console.warn("⚠️ No linked Instagram Business Account found in Pages. Fallback to User ID (might cause webhook mismatch).");
      // Fallback to the ID we got from the token exchange or /me
      igbaId = profileData.id || instagramUserId;
    }

    console.log('Final Instagram Business Account ID:', igbaId);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existingAccount } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("instagram_user_id", instagramUserId)
      .maybeSingle();

    const accountData = {
      user_id: userId,
      instagram_user_id: instagramUserId,
      instagram_business_id: igbaId,
      username: username,
      profile_picture_url: profilePictureUrl,
      access_token: accessToken,
      token_expires_at: tokenExpiresAt,
      status: "active",
      last_synced_at: new Date().toISOString(),
    };

    if (existingAccount) {
      const { error: updateError } = await supabase
        .from("instagram_accounts")
        .update(accountData)
        .eq("id", existingAccount.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Database update failed: ' + updateError.message)}`, 302);
      }

      console.log('Account updated successfully');
    } else {
      const { error: insertError } = await supabase
        .from("instagram_accounts")
        .insert({
          ...accountData,
          connected_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Database insert error:', insertError);
        return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent('Database insert failed: ' + insertError.message)}`, 302);
      }

      console.log('New account created successfully');
    }

    // ✅ CRITICAL: Subscribe webhooks using Page-scoped IGBA ID
    console.log('🔔 Subscribing webhooks for IGBA:', igbaId);
    try {
      const webhookUrl = `https://graph.instagram.com/v21.0/${igbaId}/subscribed_apps`;

      const subscribeRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscribed_fields: 'messages,messaging_postbacks,message_reactions',
          access_token: accessToken
        })
      });

      const subscribeData = await subscribeRes.json();
      console.log('Webhook subscription response:', JSON.stringify(subscribeData, null, 2));

      if (!subscribeRes.ok) {
        console.error('⚠️  Webhook subscription failed (non-fatal):', subscribeData);
        await supabase.from('failed_events').insert({
          event_id: 'webhook-subscribe-fail-' + Date.now(),
          payload: {
            igbaId,
            instagramUserId,
            error: subscribeData
          },
          error_message: 'Webhook subscription failed during OAuth'
        });
      } else {
        console.log('✅ Webhooks subscribed successfully for IGBA:', igbaId);
      }
    } catch (webhookError: any) {
      console.error('⚠️  Webhook subscription error (non-fatal):', webhookError);
    }

    return Response.redirect(`${frontendUrl}/connect-accounts?instagram_connected=true&username=${encodeURIComponent(username)}`, 302);

  } catch (error: any) {
    console.error('Unexpected error:', error);
    const frontendUrl = (Deno.env.get("FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, '');
    return Response.redirect(`${frontendUrl}/connect-accounts?error=${encodeURIComponent(error.message || 'Unknown error')}`, 302);
  }
});