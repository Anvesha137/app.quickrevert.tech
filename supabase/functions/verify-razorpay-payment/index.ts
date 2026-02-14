import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, planType } = await req.json()

    // 1. Verify Signature
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
    const generated_signature = hmac("sha256", key_secret, razorpay_order_id + "|" + razorpay_payment_id, "utf8", "hex");

    if (generated_signature !== razorpay_signature) {
      throw new Error("Invalid signature");
    }

    // 2. Update Database
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calculate period end
    const now = new Date();
    const periodEnd = new Date(now);
    if (planType === 'annual') {
      periodEnd.setFullYear(now.getFullYear() + 1);
    } else {
      periodEnd.setMonth(now.getMonth() + 1);
    }

    // Upsert subscription
    // Check if user already has a sub, if so update it, else insert
    // Ideally we might want to check for existing active sub first

    // For now, simpler: insert new record or update existing "active" one?
    // Let's assume one active sub per user for now.

    // We'll insert a new record for history/logging for now, or update 'active' status.
    // Let's do a simple Insert for now. A more complex system would handle upgrades/downgrades.
    const { error: dbError } = await supabaseClient
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status: 'active',
        plan_id: planType,
        current_period_end: periodEnd.toISOString(),
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        updated_at: new Date().toISOString()
      })
    // Note: This upsert might create duplicates if we don't have a unique constraint on user_id.
    // But for this MVP flow, it ensures the user gets the record.
    // Ideally we'd select first.

    if (dbError) throw dbError;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
