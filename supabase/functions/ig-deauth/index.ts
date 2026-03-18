import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Verify HMAC-SHA256 signature from Meta's signed_request
async function verifySignedRequest(signedRequest: string, appSecret: string): Promise<Record<string, any> | null> {
  try {
    const [encodedSig, payload] = signedRequest.split('.');
    if (!encodedSig || !payload) return null;

    // Decode the payload
    const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload + '='.repeat((4 - base64Payload.length % 4) % 4);
    const decodedPayload = JSON.parse(atob(paddedPayload));

    // Verify the signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const base64Sig = encodedSig.replace(/-/g, '+').replace(/_/g, '/');
    const paddedSig = base64Sig + '='.repeat((4 - base64Sig.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(paddedSig), c => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
    if (!isValid) {
      console.error('ig-deauth: Invalid HMAC signature');
      return null;
    }

    return decodedPayload;
  } catch (e) {
    console.error('ig-deauth: Error verifying signed_request:', e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      console.error("ig-deauth: META_APP_SECRET not configured");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Meta sends signed_request as form data
    const formData = await req.formData().catch(() => null);
    const signedRequest = formData?.get("signed_request") as string | null;

    if (!signedRequest) {
      console.error("ig-deauth: Missing signed_request");
      return new Response(JSON.stringify({ error: "Missing signed_request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify and decode the payload
    const payload = await verifySignedRequest(signedRequest, appSecret);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instagramUserId = payload.user_id || payload.instagram_user_id;
    if (!instagramUserId) {
      console.error("ig-deauth: No user_id in payload", payload);
      return new Response(JSON.stringify({ error: "No user_id in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`ig-deauth: Processing deauthorization for Instagram user: ${instagramUserId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find the instagram account
    const { data: account, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("id, user_id")
      .eq("instagram_user_id", instagramUserId)
      .maybeSingle();

    if (accountError) {
      console.error("ig-deauth: Error finding account:", accountError);
    }

    if (!account) {
      console.warn(`ig-deauth: No account found for instagram_user_id: ${instagramUserId}. Nothing to do.`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountId = account.id;

    // 2. Mark account as revoked, nullify access token
    const { error: updateErr } = await supabase
      .from("instagram_accounts")
      .update({
        status: "revoked",
        access_token: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateErr) console.error("ig-deauth: Failed to revoke account:", updateErr);
    else console.log(`ig-deauth: Account ${accountId} marked as revoked`);

    // 3. Deactivate all automation_routes for this account
    const { error: routeErr } = await supabase
      .from("automation_routes")
      .update({ is_active: false })
      .eq("instagram_account_id", accountId);

    if (routeErr) console.error("ig-deauth: Failed to deactivate routes:", routeErr);
    else console.log(`ig-deauth: Deactivated automation_routes for account ${accountId}`);

    // 4. Set n8n_workflows.is_active = false for all automations tied to this account
    // First find automations for this user's account
    const { data: automations } = await supabase
      .from("automations")
      .select("id")
      .eq("instagram_account_id", accountId);

    if (automations && automations.length > 0) {
      const automationIds = automations.map(a => a.id);
      const { error: workflowErr } = await supabase
        .from("n8n_workflows")
        .update({ is_active: false })
        .in("automation_id", automationIds);

      if (workflowErr) console.error("ig-deauth: Failed to deactivate workflows:", workflowErr);
      else console.log(`ig-deauth: Deactivated n8n_workflows for ${automationIds.length} automations`);
    }

    console.log(`ig-deauth: Completed deauthorization for Instagram user ${instagramUserId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("ig-deauth: Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});