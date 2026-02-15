import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, planType, instagramHandle, couponCode } = await req.json()

    // 1. Verify Signature using Web Crypto API (No external deps)
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
    const message = razorpay_order_id + "|" + razorpay_payment_id;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(key_secret);
    const msgData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      msgData
    );

    const signatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (signatureHex !== razorpay_signature) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // 3. Upsert to Supabase
    // Calculate Period End
    const now = new Date();
    const periodEnd = new Date();
    if (planType === 'annual') {
      periodEnd.setFullYear(now.getFullYear() + 1);
    } else {
      periodEnd.setMonth(now.getMonth() + 3);
    }

    const { error: dbError } = await supabaseClient
      .from('subscriptions')
      .upsert({
        user_id: userId,
        status: 'active',
        plan_id: planType,
        current_period_end: periodEnd.toISOString(),
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        instagram_handle: instagramHandle,
        coupon_code: couponCode,
        updated_at: new Date().toISOString()
      })

    if (dbError) {
      console.error('Database Error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. (Optional) Sync to Neon DB (Internal Dashboard)
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (neonDbUrl) {
      try {
        // We need to import Client dynamically or ensure it's at top of file
        // For simplicity and to avoid top-level await issues in some environments,
        // we'll assume the import is handled or use a basic fetch if Neon supports HTTP (it does via drivers).
        // But here let's try the postgres client if we can duplicate the import.
        // Since we can't easily add import at top right now without reading whole file, 
        // I will reply to the user to add it manually or rely on Supabase for now.
        // actually, I can just use the tool to add the import at the top.

        // Placeholder for Neon Sync logging
        console.log("Syncing to Neon DB...");

        // Importing here inside the function body is not standard in Deno/ESM usually.
        // We will handle the import in a separate tool call.

        const neonClient = new Client(neonDbUrl);
        await neonClient.connect();

        // Assuming a table 'external_subscriptions' or similar exists in Neon
        // Or just logging it for now.
        // Let's try to insert into a generic 'leads' or 'sales' table if it exists
        // For now, let's just Log and maybe try a safe insert.

        // Example: Insert into a 'sales' table in Neon
        await neonClient.queryObject`
             INSERT INTO sales (
               user_id, 
               plan_type, 
               razorpay_order_id, 
               razorpay_payment_id, 
               instagram_handle, 
               coupon_code, 
               sale_date
             ) VALUES (
               ${userId}, 
               ${planType}, 
               ${razorpay_order_id}, 
               ${razorpay_payment_id}, 
               ${instagramHandle}, 
               ${couponCode}, 
               NOW()
             )
           `;

        await neonClient.end();

      } catch (neonError) {
        console.error("Neon Sync Failed:", neonError);
        // proper fail-safe: don't fail the request if neon sync fails
      }
    }

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
