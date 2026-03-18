import "jsr:@supabase/functions-js/edge-runtime.d.ts";
<<<<<<< HEAD
import { createClient } from "npm:@supabase/supabase-js@2";
=======
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

<<<<<<< HEAD
// Verify HMAC-SHA256 signature from Meta's signed_request
async function verifySignedRequest(signedRequest: string, appSecret: string): Promise<Record<string, any> | null> {
  try {
    const [encodedSig, payload] = signedRequest.split('.');
    if (!encodedSig || !payload) return null;

    const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload + '='.repeat((4 - base64Payload.length % 4) % 4);
    const decodedPayload = JSON.parse(atob(paddedPayload));

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
      console.error('ig-delete: Invalid HMAC signature');
      return null;
    }

    return decodedPayload;
  } catch (e) {
    console.error('ig-delete: Error verifying signed_request:', e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Meta also does a GET to the deletion-status URL to confirm it resolves
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
=======
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    });
  }

  try {
<<<<<<< HEAD
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      console.error("ig-delete: META_APP_SECRET not configured");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Meta sends signed_request as form data
    const formData = await req.formData().catch(() => null);
    const signedRequest = formData?.get("signed_request") as string | null;

    if (!signedRequest) {
      console.error("ig-delete: Missing signed_request");
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
      console.error("ig-delete: No user_id in payload", payload);
      return new Response(JSON.stringify({ error: "No user_id in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`ig-delete: Starting full data deletion for Instagram user: ${instagramUserId}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find the Instagram account record to get the internal account id + user_id
    const { data: account, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("id, user_id")
      .eq("instagram_user_id", instagramUserId)
      .maybeSingle();

    if (accountError) {
      console.error("ig-delete: Error finding account:", accountError);
    }

    // Generate a confirmation code regardless (Meta needs a response even if no data exists)
    const confirmationCode = `del_${instagramUserId}_${Date.now()}`;
    const frontendUrl = (Deno.env.get("FRONTEND_URL") || "https://app.quickrevert.tech").replace(/\/$/, '');
    const statusUrl = `${frontendUrl}/deletion-status?id=${confirmationCode}`;

    if (!account) {
      console.warn(`ig-delete: No account found for instagram_user_id: ${instagramUserId}. Returning confirmation.`);
      return new Response(JSON.stringify({ url: statusUrl, confirmation_code: confirmationCode }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountId = account.id;
    const userId = account.user_id;

    // 2. Find all automations for this account to use for cascading deletes
    const { data: automations } = await supabase
      .from("automations")
      .select("id")
      .eq("instagram_account_id", accountId);

    const automationIds = automations?.map(a => a.id) ?? [];

    // 3. Delete in FK-safe order

    // automation_activities (references automations)
    if (automationIds.length > 0) {
      const { error: e } = await supabase
        .from("automation_activities")
        .delete()
        .in("automation_id", automationIds);
      if (e) console.error("ig-delete: Error deleting automation_activities:", e);
      else console.log("ig-delete: Deleted automation_activities");
    }

    // automation_routes (references instagram_accounts)
    const { error: routeErr } = await supabase
      .from("automation_routes")
      .delete()
      .eq("instagram_account_id", accountId);
    if (routeErr) console.error("ig-delete: Error deleting automation_routes:", routeErr);
    else console.log("ig-delete: Deleted automation_routes");

    // contacts (references instagram_accounts)
    const { error: contactErr } = await supabase
      .from("contacts")
      .delete()
      .eq("instagram_account_id", accountId);
    if (contactErr) console.error("ig-delete: Error deleting contacts:", contactErr);
    else console.log("ig-delete: Deleted contacts");

    // processed_events (references instagram_accounts)
    const { error: procErr } = await supabase
      .from("processed_events")
      .delete()
      .eq("instagram_account_id", accountId);
    if (procErr) console.error("ig-delete: Error deleting processed_events:", procErr);
    else console.log("ig-delete: Deleted processed_events");

    // failed_events — filter by user_id if column exists, otherwise skip
    const { error: failErr } = await supabase
      .from("failed_events")
      .delete()
      .eq("instagram_account_id", accountId);
    if (failErr && !failErr.message?.includes('column')) {
      console.error("ig-delete: Error deleting failed_events:", failErr);
    } else {
      console.log("ig-delete: Processed failed_events deletion");
    }

    // n8n_workflows (references automations)
    if (automationIds.length > 0) {
      const { error: wfErr } = await supabase
        .from("n8n_workflows")
        .delete()
        .in("automation_id", automationIds);
      if (wfErr) console.error("ig-delete: Error deleting n8n_workflows:", wfErr);
      else console.log("ig-delete: Deleted n8n_workflows");
    }

    // automations (references instagram_accounts)
    const { error: autoErr } = await supabase
      .from("automations")
      .delete()
      .eq("instagram_account_id", accountId);
    if (autoErr) console.error("ig-delete: Error deleting automations:", autoErr);
    else console.log("ig-delete: Deleted automations");

    // instagram_accounts — final delete
    const { error: igErr } = await supabase
      .from("instagram_accounts")
      .delete()
      .eq("id", accountId);
    if (igErr) console.error("ig-delete: Error deleting instagram_accounts:", igErr);
    else console.log("ig-delete: Deleted instagram_accounts");

    console.log(`ig-delete: Completed full data deletion for Instagram user ${instagramUserId} (account: ${accountId}, user: ${userId})`);

    // Meta requires this exact response format
    return new Response(JSON.stringify({ url: statusUrl, confirmation_code: confirmationCode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("ig-delete: Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
=======
    return new Response(
      JSON.stringify({ status: "data deletion received" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
  }
});