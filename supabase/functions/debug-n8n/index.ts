import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!;
    const n8nApiKey = Deno.env.get("X-N8N-API-KEY")!;

    // Step 1: Get ruchita's current access_token from DB
    const { data: accounts } = await supabase
      .from("instagram_accounts")
      .select("*")
      .ilike("username", "%ruchita_1930%");
    m
    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "Account not found" }), { status: 404, headers: corsHeaders });
    }

    const account = accounts[0];
    const token = account.access_token;
    const credId = "pAxV3P4XFMOA6fHw"; // The ghost credential used by old workflows

    // Step 2: Test that the token itself is valid against Instagram
    const igTestRes = await fetch(`https://graph.instagram.com/v24.0/me?fields=id,username&access_token=${token}`);
    const igTestData = await igTestRes.json();

    // Step 3: Try updating the credential with FULL body (name + type + data)
    const putBody = {
      name: `Instagram - ${account.username} (${account.instagram_user_id})`,
      type: "facebookGraphApi",
      data: {
        accessToken: token
      }
    };

    const putRes = await fetch(`${n8nBaseUrl}/api/v1/credentials/${credId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey
      },
      body: JSON.stringify(putBody)
    });

    const putStatus = putRes.status;
    const putResponseText = await putRes.text();

    // Step 4: Try PATCH instead of PUT (maybe n8n needs PATCH)
    const patchRes = await fetch(`${n8nBaseUrl}/api/v1/credentials/${credId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey
      },
      body: JSON.stringify({ data: { accessToken: token } })
    });

    const patchStatus = patchRes.status;
    const patchResponseText = await patchRes.text();

    return new Response(JSON.stringify({
      step1_db_token_exists: !!token,
      step1_token_prefix: token?.substring(0, 20) + "...",
      step2_instagram_api_test: {
        status: igTestRes.status,
        data: igTestData
      },
      step3_put_update: {
        credential_id: credId,
        http_status: putStatus,
        response: putResponseText.substring(0, 500),
        body_sent: { ...putBody, data: { accessToken: putBody.data.accessToken.substring(0, 20) + "..." } }
      },
      step4_patch_update: {
        http_status: patchStatus,
        response: patchResponseText.substring(0, 500)
      }
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
