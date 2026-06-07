/**
 * Unsubscribe Edge Function
 * GET /functions/v1/unsubscribe?email=...&token=...
 *
 * Validates the HMAC token, sets email_unsubscribed = TRUE in Neon DB,
 * and returns a simple HTML confirmation page.
 */

import { generateUnsubscribeToken } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const html = (title: string, body: string, isError = false) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — QuickRevert</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { min-height:100vh; background:#0a0b1a; display:flex; align-items:center; justify-content:center;
           font-family:'Segoe UI',Arial,sans-serif; color:#e5e5e5; padding:24px; }
    .card { background:#1a1a2e; border:1px solid #2a2a3e; border-radius:20px; padding:48px 40px;
            max-width:480px; width:100%; text-align:center; }
    .icon { font-size:52px; margin-bottom:20px; }
    h1 { font-size:22px; font-weight:700; margin-bottom:12px;
         color:${isError ? "#f87171" : "#4ade80"}; }
    p { font-size:14px; color:#a0a0b0; line-height:1.7; margin-bottom:16px; }
    a { color:#6c3fff; text-decoration:none; font-size:13px; }
    a:hover { color:#c084fc; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isError ? "⚠️" : "✅"}</div>
    <h1>${title}</h1>
    ${body}
    <a href="https://quickrevert.tech">← Back to QuickRevert</a>
  </div>
</body>
</html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  // ── Validate params ──
  if (!email || !token) {
    return new Response(
      html("Invalid Link", "<p>This unsubscribe link is missing required parameters. Please use the link from your email.</p>", true),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── Verify HMAC token ──
  const expectedToken = await generateUnsubscribeToken(email);
  if (token !== expectedToken) {
    return new Response(
      html("Invalid Token", "<p>This unsubscribe link is invalid or has expired. Please use the exact link from your email.</p>", true),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // ── Update Neon DB ──
  const neonDbUrl = Deno.env.get("NEON_DB_URL");
  if (!neonDbUrl) {
    console.error("[UNSUBSCRIBE] NEON_DB_URL not set");
    return new Response(
      html("Server Error", "<p>We couldn't process your request right now. Please try again later or contact connect@quickrevert.tech.</p>", true),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const client = new Client(neonDbUrl);
    await client.connect();
    await client.queryArray(
      "UPDATE users SET email_unsubscribed = TRUE WHERE email = $1",
      [email]
    );
    await client.end();
    console.log(`[UNSUBSCRIBE] ✅ ${email} unsubscribed successfully.`);
  } catch (e: any) {
    console.error("[UNSUBSCRIBE] DB error:", e.message);
    return new Response(
      html("Something Went Wrong", "<p>We encountered an error processing your request. Please email connect@quickrevert.tech and we'll remove you manually.</p>", true),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new Response(
    html(
      "You've been unsubscribed",
      `<p>You've been successfully removed from QuickRevert marketing emails.</p>
       <p style="font-size:12px;color:#555570;">Note: You may still receive critical account emails (e.g. password reset, account security). These cannot be unsubscribed from.</p>`
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
});
