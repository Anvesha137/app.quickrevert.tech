import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { sendAlert } from "../_shared/alert.ts";

// ---------------------------------------------------------------------------
// Razorpay sends all webhook requests WITHOUT CORS preflight — no CORS needed.
// We must respond with HTTP 200 quickly; Razorpay retries on non-2xx.
// ---------------------------------------------------------------------------

const HANDLED_EVENTS = new Set([
  "refund.created",
  "refund.processed",
  "refund.failed",   // Refund was initiated but bounced — alert only, do NOT cancel sub
]);

// ---------------------------------------------------------------------------
// Signature Verification
// Razorpay signs the raw request body with HMAC-SHA256 using
// RAZORPAY_WEBHOOK_SECRET (set in Razorpay Dashboard → Webhooks → Secret).
// Header: X-Razorpay-Signature
// ---------------------------------------------------------------------------
async function verifyRazorpaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signatureHeader;
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  // Razorpay only sends POST; reject anything else
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  if (!webhookSecret) {
    console.error("[razorpay-refund-webhook] RAZORPAY_WEBHOOK_SECRET not set");
    // Return 200 so Razorpay doesn't retry — this is a config issue, not a payload issue
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------------
  // 1. Read raw body (required for signature verification)
  // -------------------------------------------------------------------------
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("X-Razorpay-Signature");

  // -------------------------------------------------------------------------
  // 2. Verify HMAC signature
  // -------------------------------------------------------------------------
  const isValid = await verifyRazorpaySignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    console.warn("[razorpay-refund-webhook] ⚠️ Invalid signature — rejected");
    await sendAlert({
      level: "warning",
      subject: "Razorpay Webhook: Invalid Signature",
      context: "razorpay-refund-webhook",
      details: "A webhook request arrived with a mismatched HMAC signature. Possible forged request OR misconfigured RAZORPAY_WEBHOOK_SECRET.\nRazorpay will retry if this was a genuine delivery.",
      data: { signatureHeader, bodySnippet: rawBody.substring(0, 200) },
    });
    // Return 400 — Razorpay retries non-2xx responses for genuine deliveries.
    // A forged attacker just sees a 400; Razorpay never retries on their behalf.
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------------
  // 3. Parse event payload
  // -------------------------------------------------------------------------
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("[razorpay-refund-webhook] Failed to parse JSON body");
    return new Response(JSON.stringify({ received: true, error: "invalid_json" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType: string = event?.event ?? "";
  console.log(`[razorpay-refund-webhook] Received event: ${eventType}`);

  // -------------------------------------------------------------------------
  // 4. Ignore unrelated events (return 200 so Razorpay marks them delivered)
  // -------------------------------------------------------------------------
  if (!HANDLED_EVENTS.has(eventType)) {
    console.log(`[razorpay-refund-webhook] Ignoring unhandled event type: ${eventType}`);
    return new Response(JSON.stringify({ received: true, action: "ignored" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------------
  // 4. Short-circuit: refund.failed — alert only, subscription stays ACTIVE
  //    The refund bounced = customer's money never left Razorpay.
  //    Do NOT cancel their access. Alert admin to investigate.
  // -------------------------------------------------------------------------
  if (eventType === "refund.failed") {
    const paymentEntity = event?.payload?.payment?.entity ?? {};
    const refundEntity  = event?.payload?.refund?.entity  ?? {};
    const failedPaymentId = paymentEntity.id ?? refundEntity.payment_id ?? "unknown";
    const failedRefundId  = refundEntity.id ?? "unknown";
    const failedEmail     = paymentEntity.email ?? "";
    console.warn(`[razorpay-refund-webhook] ⚠️ refund.failed for payment ${failedPaymentId}`);
    await sendAlert({
      level: "error",
      subject: `🚨 Refund FAILED — Manual Action Required (${failedEmail || failedPaymentId})`,
      context: "razorpay-refund-webhook",
      details: `A refund was initiated but FAILED to process. The customer's money did NOT go back.\n\nSubscription has NOT been cancelled — the user still has access.\n\nAction required:\n1. Check Razorpay Dashboard for refund failure reason\n2. Manually retry the refund or resolve\n3. Manually cancel the Supabase subscription if appropriate`,
      data: { failedPaymentId, failedRefundId, failedEmail, eventType, rawPayload: JSON.stringify(event?.payload ?? {}).substring(0, 500) },
    });
    return new Response(JSON.stringify({ received: true, action: "refund_failed_alerted" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------------
  // 5. Extract payment & refund details from payload
  //
  // Razorpay payload shape:
  //   event.payload.payment.entity  → payment object
  //   event.payload.refund.entity   → refund object
  // -------------------------------------------------------------------------
  const paymentEntity = event?.payload?.payment?.entity ?? {};
  const refundEntity  = event?.payload?.refund?.entity  ?? {};

  const razorpayPaymentId: string = paymentEntity.id ?? refundEntity.payment_id ?? "";
  const razorpayOrderId:   string = paymentEntity.order_id ?? "";
  const refundId:          string = refundEntity.id ?? "";
  const refundAmountPaise: number = refundEntity.amount ?? paymentEntity.amount_refunded ?? 0;
  const refundAmountRs:    number = Math.floor(refundAmountPaise / 100);
  const payerEmail:        string = paymentEntity.email ?? "";

  if (!razorpayPaymentId) {
    console.error("[razorpay-refund-webhook] No payment ID found in payload");
    await sendAlert({
      level: "error",
      subject: "Razorpay Refund: Missing Payment ID",
      context: "razorpay-refund-webhook",
      details: `Event '${eventType}' arrived but no payment ID could be extracted.`,
      data: { eventType, payloadSnippet: JSON.stringify(event?.payload ?? {}).substring(0, 500) },
    });
    return new Response(JSON.stringify({ received: true, error: "missing_payment_id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[razorpay-refund-webhook] Processing refund for payment: ${razorpayPaymentId}, refund: ${refundId}, amount: ₹${refundAmountRs}`);

  // -------------------------------------------------------------------------
  // 6. Init Supabase (service-role so we can update any row)
  // -------------------------------------------------------------------------
  const supabaseUrl     = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseSecret  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  const supabase        = createClient(supabaseUrl, supabaseSecret);

  // -------------------------------------------------------------------------
  // 7. Look up the subscription by razorpay_payment_id
  // -------------------------------------------------------------------------
  const { data: subRow, error: subLookupErr } = await supabase
    .from("subscriptions")
    .select("id, user_id, user_email, plan_id, status, current_period_end")
    .eq("razorpay_payment_id", razorpayPaymentId)
    .maybeSingle();

  if (subLookupErr) {
    console.error("[razorpay-refund-webhook] Supabase lookup error:", subLookupErr);
  }

  // Fallback: try order_id if payment_id lookup failed
  let subscription = subRow;
  if (!subscription && razorpayOrderId) {
    const { data: subByOrder } = await supabase
      .from("subscriptions")
      .select("id, user_id, user_email, plan_id, status, current_period_end")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();
    subscription = subByOrder ?? null;
  }

  // Fallback: try email
  if (!subscription && payerEmail) {
    const { data: subByEmail } = await supabase
      .from("subscriptions")
      .select("id, user_id, user_email, plan_id, status, current_period_end")
      .eq("user_email", payerEmail)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    subscription = subByEmail ?? null;
  }

  if (!subscription) {
    console.warn(`[razorpay-refund-webhook] ⚠️ No subscription found for payment ${razorpayPaymentId}`);
    await sendAlert({
      level: "warning",
      subject: `Razorpay Refund: No Matching Subscription`,
      context: "razorpay-refund-webhook",
      details: `Refund event received for payment ${razorpayPaymentId} but no matching subscription was found in Supabase.\nEmail from payload: ${payerEmail || "N/A"}`,
      data: { razorpayPaymentId, razorpayOrderId, refundId, refundAmountRs, payerEmail },
    });
    return new Response(JSON.stringify({ received: true, warning: "no_subscription_found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId:    string = subscription.user_id;
  const userEmail: string = subscription.user_email ?? payerEmail ?? "";
  const planId:    string = subscription.plan_id ?? "";

  console.log(`[razorpay-refund-webhook] Found subscription for user: ${userId} (${userEmail}), plan: ${planId}`);

  // -------------------------------------------------------------------------
  // 8. Guard: already cancelled — idempotent, don't double-process
  // -------------------------------------------------------------------------
  if (subscription.status === "cancelled" || subscription.status === "refunded") {
    console.log(`[razorpay-refund-webhook] Subscription already ${subscription.status} — skipping`);
    return new Response(JSON.stringify({ received: true, action: "already_cancelled" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------------
  // 9. Cancel subscription in Supabase
  // -------------------------------------------------------------------------
  const { error: cancelErr } = await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id);

  if (cancelErr) {
    console.error("[razorpay-refund-webhook] Failed to cancel Supabase subscription:", cancelErr);
    await sendAlert({
      level: "error",
      subject: "Razorpay Refund: Supabase Update Failed",
      context: "razorpay-refund-webhook",
      details: `Could not cancel subscription ${subscription.id} for user ${userId}.\nError: ${cancelErr.message}`,
      data: { userId, userEmail, razorpayPaymentId, refundId },
    });
    // Still return 200 so Razorpay doesn't retry — we'll alert manually
    return new Response(JSON.stringify({ received: true, error: "supabase_update_failed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[razorpay-refund-webhook] ✅ Supabase subscription ${subscription.id} cancelled for user ${userId}`);

  // -------------------------------------------------------------------------
  // 10. Sync cancellation to Neon DB (fire-and-forget, isolated)
  // -------------------------------------------------------------------------
  const neonDbUrl = Deno.env.get("NEON_DB_URL") ?? "";
  if (neonDbUrl) {
    (async () => {
      let neonClient: Client | null = null;
      try {
        neonClient = new Client(neonDbUrl);
        await neonClient.connect();

        // 10a. Resolve correct Neon ID (handles cases where Neon ID != Supabase ID, or user doesn't exist)
        let neonUserId = userId;
        const neonUserRes = await neonClient.queryObject(
          `SELECT id FROM users WHERE email = $1`, [userEmail]
        );
        if (neonUserRes.rows.length > 0) {
           neonUserId = (neonUserRes.rows[0] as any).id;
        } else {
           await neonClient.queryObject(
             `INSERT INTO users (id, email, username, status, joining_date, last_active)
              VALUES ($1, $2, $2, 'inactive', NOW(), NOW())`,
             [neonUserId, userEmail]
           );
           console.log(`[razorpay-refund-webhook] ✅ Inserted minimal Neon user record for ${neonUserId}`);
        }

        // 10b. Cancel active subscription in Neon
        await neonClient.queryObject(
          `UPDATE subscriptions
           SET status = 'cancelled'
           WHERE user_id = $1 AND status = 'active'`,
          [neonUserId]
        );
        console.log(`[razorpay-refund-webhook] ✅ Neon subscription cancelled for user ${neonUserId}`);

        // 10c. Update user plan_status in Neon
        await neonClient.queryObject(
          `UPDATE users
           SET plan_status = 'cancelled',
               status = 'inactive'
           WHERE id = $1`,
          [neonUserId]
        );
        console.log(`[razorpay-refund-webhook] ✅ Neon user plan_status set to cancelled for ${neonUserId}`);

        // 10d. Insert a refund payment record in Neon
        await neonClient.queryObject(
          `INSERT INTO payments (user_id, amount, discount_amount, promo_code, payment_status, paid_at)
           VALUES ($1, $2, 0, NULL, 'refunded', NOW() + INTERVAL '5 hours 30 minutes')`,
          [neonUserId, refundAmountRs]
        );
        console.log(`[razorpay-refund-webhook] ✅ Neon refund payment record inserted: ₹${refundAmountRs} for user ${neonUserId}`);

      } catch (neonErr: any) {
        console.error("[razorpay-refund-webhook] ⚠️ Neon sync failed (non-critical):", neonErr);
        await sendAlert({
          level: "warning",
          subject: "Razorpay Refund: Neon Sync Failed",
          context: "razorpay-refund-webhook",
          details: `Supabase was cancelled OK, but Neon sync failed for user ${userId}.\nError: ${neonErr?.message ?? String(neonErr)}\nManual fix needed: cancel subscription + insert refund payment record in Neon.`,
          data: { userId, userEmail, razorpayPaymentId, refundId, refundAmountRs },
        });
      } finally {
        if (neonClient) {
          try { await neonClient.end(); } catch (_) { /* ignore */ }
        }
      }
    })();
  }

  // -------------------------------------------------------------------------
  // 11. Fire success alert to Discord / email
  // -------------------------------------------------------------------------
  await sendAlert({
    level: "info",
    subject: `💸 Refund Processed — ₹${refundAmountRs} (${userEmail})`,
    context: "razorpay-refund-webhook",
    details: `A Razorpay refund has been fully processed and the user's subscription has been cancelled.\n\nUser: ${userEmail}\nPlan: ${planId}\nRefund Amount: ₹${refundAmountRs}\nRefund ID: ${refundId}\nPayment ID: ${razorpayPaymentId}`,
    data: {
      userId,
      userEmail,
      planId,
      refundAmountRs,
      refundId,
      razorpayPaymentId,
      razorpayOrderId,
      eventType,
    },
  });

  // -------------------------------------------------------------------------
  // 12. Respond 200 — always, so Razorpay marks the event delivered
  // -------------------------------------------------------------------------
  return new Response(
    JSON.stringify({
      received: true,
      action: "subscription_cancelled",
      userId,
      refundId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
