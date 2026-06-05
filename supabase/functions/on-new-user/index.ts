import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendAlert } from "../_shared/alert.ts";
import { sendEmail } from "../_shared/email.ts";

/**
 * on-new-user
 * Triggered by Supabase Database Webhook on auth.users INSERT.
 * Sends Discord alert + Welcome email to the new user.
 *
 * Webhook setup (Supabase Dashboard):
 *   Database → Webhooks → Create webhook
 *   Table: auth.users | Event: INSERT
 *   URL: https://<project>.supabase.co/functions/v1/on-new-user
 *   Header: Authorization: Bearer <SERVICE_ROLE_KEY>
 */

Deno.serve(async (req: Request) => {
  try {
    // Only allow POST from Supabase DB webhook (authorized via service role key)
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    // Auth: accept DB Webhook calls (service role key) OR internal header
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isInternalHeader = req.headers.get("x-quickrevert-internal") === "true";
    const isServiceRoleKey = authHeader === `Bearer ${serviceKey}`;

    if (!isInternalHeader && !isServiceRoleKey) {
      console.warn("[on-new-user] Unauthorized request rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body = await req.json();

    // Supabase DB webhook payload structure: { type: "INSERT", table: "users", record: {...} }
    const record = body?.record ?? body;

    const email: string = record?.email || "";
    const createdAt: string = record?.created_at || new Date().toISOString();
    const rawUserMeta = record?.raw_user_meta_data || {};
    const rawAppMeta = record?.raw_app_meta_data || {};

    const fullName: string =
      rawUserMeta?.full_name ||
      rawUserMeta?.name ||
      rawUserMeta?.display_name ||
      email.split("@")[0];

    const provider: string =
      rawAppMeta?.provider ||
      (rawUserMeta?.iss?.includes("google") ? "google" : "email");

    const providerLabel =
      provider === "google" ? "Google OAuth 🔵" :
      provider === "github" ? "GitHub 🐱" :
      "Email & Password 📧";

    const timeIST = new Date(createdAt).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    if (!email) {
      console.warn("[on-new-user] No email in payload, skipping");
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    console.log(`[on-new-user] New user: ${email} via ${provider}`);

    // 1. Discord Notification (fire-and-forget, never block)
    sendAlert({
      channel: "new_user",
      level: "info",
      subject: `New User Joined — ${email}`,
      context: "on-new-user",
      details: `**${fullName}** just signed up for QuickRevert!\n\n**Email:** ${email}\n**Signed up via:** ${providerLabel}\n**Joined:** ${timeIST} IST`,
      data: { email, fullName, provider, createdAt },
    }).catch((e) => console.error("[on-new-user] Discord alert failed:", e));

    // 2. Welcome Email via Brevo
    sendEmail({
      emailType: "welcome",
      to: email,
      name: fullName,
    }).catch((e) => console.error("[on-new-user] Welcome email failed:", e));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[on-new-user] Unexpected error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? "Unknown error" }), { status: 500 });
  }
});
