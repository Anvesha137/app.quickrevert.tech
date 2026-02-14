import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Razorpay from "npm:razorpay@2.8.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { planType } = await req.json()

    // Initialize Razorpay
    const key_id = Deno.env.get('RAZORPAY_KEY_ID');
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!key_id || !key_secret) {
      console.error("Missing Razorpay keys");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: Missing Razorpay keys" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const razorpay = new Razorpay({
      key_id,
      key_secret,
    });

    // Calculate Amount
    // Annual: 599 * 12 = 7188 INR -> 718800 paise
    // Monthly: 999 INR -> 99900 paise
    const amount = planType === 'annual' ? 718800 : 99900;
    const currency = 'INR';

    const options = {
      amount,
      currency,
      receipt: `receipt_${Date.now()}`,
    };

    try {
      const order = await razorpay.orders.create(options);
      return new Response(
        JSON.stringify(order),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (rzpError) {
      console.error("Razorpay API Error:", rzpError);
      return new Response(
        JSON.stringify({ error: `Razorpay Error: ${rzpError.message || JSON.stringify(rzpError)}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

  } catch (error) {
    console.error("General Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
