import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { sendAlert } from "../_shared/alert.ts";

/**
 * send-expiry-warnings
 * Called daily by pg_cron at 9 AM IST (03:30 UTC).
 * Finds active subscriptions expiring in ~3 days or ~1 day
 * and sends warning emails via Brevo.
 *
 * Also accepts manual POST for testing:
 *   curl -X POST https://<project>.supabase.co/functions/v1/send-expiry-warnings \
 *     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
 *     -H "x-quickrevert-internal: true"
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.quickrevert.tech",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-quickrevert-internal",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: only internal calls
    const authHeader = req.headers.get("Authorization") || "";
    const isInternal =
      req.headers.get("x-quickrevert-internal") === "true" &&
      authHeader === `Bearer ${serviceKey}`;

    if (!isInternal) {
      console.warn("[send-expiry-warnings] Unauthorized request rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const now = new Date();

    let sent3day = 0;
    let sent1day = 0;
    let errors = 0;

    // ── 3-Day Warning ──────────────────────────────────────────────────────────
    // Window: expiring between 2 days from now and 4 days from now
    const window3DayStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const window3DayEnd   = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();

    const { data: subs3day, error: err3 } = await supabase
      .from("subscriptions")
      .select("id, user_id, user_email, plan_id, current_period_end")
      .eq("status", "active")
      .eq("expiry_warning_sent_3day", false)
      .gte("current_period_end", window3DayStart)
      .lte("current_period_end", window3DayEnd);

    if (err3) {
      console.error("[send-expiry-warnings] 3-day query error:", err3);
    } else {
      for (const sub of (subs3day || [])) {
        if (!sub.user_email) continue;
        try {
          const planLabel = formatPlanName(sub.plan_id);
          const expiryStr = new Date(sub.current_period_end).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
          });

          await sendEmail({
            emailType: "expiry_warning_3days",
            to: sub.user_email,
            name: sub.user_email.split("@")[0],
            planName: planLabel,
            expiryDate: sub.current_period_end,
          });

          // Mark as sent so we never send twice
          await supabase
            .from("subscriptions")
            .update({ expiry_warning_sent_3day: true })
            .eq("id", sub.id);

          // Discord alert
          sendAlert({
            channel: "warning",
            level: "warning",
            subject: `Plan Expiring in 3 Days — ${sub.user_email}`,
            context: "send-expiry-warnings",
            details: `**${sub.user_email}**'s plan is expiring in **3 days**\n**Plan:** ${planLabel}\n**Expires:** ${expiryStr}\n\n3-day warning email sent ✅`,
            data: { userId: sub.user_id, email: sub.user_email, planId: sub.plan_id, expiresOn: expiryStr },
          }).catch(() => {});

          sent3day++;
          console.log(`[send-expiry-warnings] ✅ 3-day warning sent to ${sub.user_email}`);
        } catch (e: any) {
          console.error(`[send-expiry-warnings] Failed 3-day for ${sub.user_email}:`, e.message);
          errors++;
        }
      }
    }

    // ── 1-Day Warning ──────────────────────────────────────────────────────────
    // Window: expiring between now and 2 days from now
    const window1DayStart = now.toISOString();
    const window1DayEnd   = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: subs1day, error: err1 } = await supabase
      .from("subscriptions")
      .select("id, user_id, user_email, plan_id, current_period_end")
      .eq("status", "active")
      .eq("expiry_warning_sent_1day", false)
      .gte("current_period_end", window1DayStart)
      .lte("current_period_end", window1DayEnd);

    if (err1) {
      console.error("[send-expiry-warnings] 1-day query error:", err1);
    } else {
      for (const sub of (subs1day || [])) {
        if (!sub.user_email) continue;
        try {
          const planLabel = formatPlanName(sub.plan_id);
          const expiryStr = new Date(sub.current_period_end).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
          });

          await sendEmail({
            emailType: "expiry_warning_1day",
            to: sub.user_email,
            name: sub.user_email.split("@")[0],
            planName: planLabel,
            expiryDate: sub.current_period_end,
          });

          await supabase
            .from("subscriptions")
            .update({ expiry_warning_sent_1day: true })
            .eq("id", sub.id);

          // Discord alert
          sendAlert({
            channel: "warning",
            level: "warning",
            subject: `Plan Expiring TODAY — ${sub.user_email}`,
            context: "send-expiry-warnings",
            details: `🚨 **${sub.user_email}**'s plan expires **today**\n**Plan:** ${planLabel}\n**Expires:** ${expiryStr}\n\nLast-day warning email sent ✅`,
            data: { userId: sub.user_id, email: sub.user_email, planId: sub.plan_id, expiresOn: expiryStr },
          }).catch(() => {});

          sent1day++;
          console.log(`[send-expiry-warnings] ✅ 1-day warning sent to ${sub.user_email}`);
        } catch (e: any) {
          console.error(`[send-expiry-warnings] Failed 1-day for ${sub.user_email}:`, e.message);
          errors++;
        }
      }
    }

    const summary = `Sent: ${sent3day} x 3-day, ${sent1day} x 1-day. Errors: ${errors}`;
    console.log(`[send-expiry-warnings] Done. ${summary}`);

    // Alert Discord if any errors occurred
    if (errors > 0) {
      sendAlert({
        channel: "error",
        level: "error",
        subject: "Expiry Warning Emails — Partial Failures",
        context: "send-expiry-warnings",
        details: `Some expiry warning emails failed to send.\n${summary}`,
        data: { sent3day, sent1day, errors },
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, sent3day, sent1day, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[send-expiry-warnings] Fatal error:", err.message);
    sendAlert({
      channel: "error",
      level: "error",
      subject: "send-expiry-warnings Crashed",
      context: "send-expiry-warnings",
      details: `Fatal error in expiry warning cron.\nError: ${err.message}`,
    }).catch(() => {});
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPlanName(planId: string): string {
  if (!planId) return "Your Plan";
  // plan_id format: "try_me_out_undefined", "premium_annual", "professional_quarterly"
  const [tier, billing] = planId.split("_annual").length > 1
    ? [planId.replace("_annual", ""), "annual"]
    : planId.split("_quarterly").length > 1
      ? [planId.replace("_quarterly", ""), "quarterly"]
      : [planId, ""];

  const tierLabel = tier === "try_me_out" ? "Monthly Sampler"
    : tier.charAt(0).toUpperCase() + tier.slice(1).replace(/_/g, " ");

  const billingLabel = billing === "annual" ? " (Annual)"
    : billing === "quarterly" ? " (Quarterly)" : "";

  return `${tierLabel}${billingLabel}`;
}
