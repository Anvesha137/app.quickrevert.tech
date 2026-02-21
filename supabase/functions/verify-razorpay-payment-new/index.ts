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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, planTier, planType, instagramHandle, couponCode, isFree } = await req.json()

    // 1. Verify Payment (Signature or Free Coupon)
    if (isFree) {
      // Validate Coupon is actually 100% off
      if (!couponCode) {
        return new Response(
          JSON.stringify({ error: 'Missing coupon code for free redemption' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const neonDbUrlFree = Deno.env.get('NEON_DB_URL') ?? '';
      if (!neonDbUrlFree) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: Neon not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const freeClient = new Client(neonDbUrlFree);
      try {
        await freeClient.connect();
        const freeResult = await freeClient.queryObject(`
          SELECT id, promo_code, discount_percentage, max_usage,
                 total_usage_tilldate, expiry_date
          FROM promo_codes
          WHERE LOWER(promo_code) = LOWER($1)
          LIMIT 1
        `, [couponCode.trim()]);

        if (freeResult.rows.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Invalid or Expired Coupon' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const coupon = freeResult.rows[0] as any;

        // Check expiry
        if (new Date(coupon.expiry_date) < new Date()) {
          return new Response(
            JSON.stringify({ error: 'Coupon has expired' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Validate 100% off
        if (coupon.discount_percentage !== 100) {
          return new Response(
            JSON.stringify({ error: 'Coupon is not 100% off' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Increment total_usage_tilldate in Neon DB
        await freeClient.queryObject(
          `UPDATE promo_codes SET total_usage_tilldate = total_usage_tilldate + 1 WHERE id = $1`,
          [coupon.id]
        );
        console.log(`Coupon ${couponCode} usage incremented in Neon DB (free flow).`);

      } finally {
        await freeClient.end();
      }

    } else {
      // Standard Razorpay Signature Verification
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
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // 3. Upsert to Supabase
    // Calculate amount paid and discount (in rupees as integer)
    let amountPaidRs = 0;
    let discountRs = 0;

    // Fetch coupon details from Neon DB if any to calculate discount
    let couponData = null;
    if (couponCode) {
      const neonDbUrl2 = Deno.env.get('NEON_DB_URL');
      if (neonDbUrl2) {
        const couponClient = new Client(neonDbUrl2);
        try {
          await couponClient.connect();
          const couponResult = await couponClient.queryObject(`
            SELECT id, discount_percentage, max_usage, total_usage_tilldate
            FROM promo_codes
            WHERE LOWER(promo_code) = LOWER($1)
            LIMIT 1
          `, [couponCode.trim()]);
          if (couponResult.rows.length > 0) {
            couponData = couponResult.rows[0];
          }
        } catch (e) {
          console.error('Error fetching coupon from Neon:', e);
        } finally {
          await couponClient.end();
        }
      }
    }

    // Default price before discount
    const baseAmountRs = planType === 'annual' ? (599 * 12) : (899 * 3);

    if (isFree) {
      amountPaidRs = 0;
      discountRs = baseAmountRs;
    } else {
      if (couponData) {
        // Neon promo_codes only has discount_percentage
        const discountPct = (couponData as any).discount_percentage || 0;
        discountRs = Math.floor(baseAmountRs * (discountPct / 100));
      }
      // Allow 0 Rs if coupon covers 100%
      amountPaidRs = Math.max(0, baseAmountRs - discountRs);
    }

    // 3. Update Supabase Subscription Status
    // Fetch user email from Supabase (needed early for schema sync and dashboard sync)
    const { data: { user: userData }, error: userError } = await supabaseClient.auth.admin.getUserById(userId);
    const email = userData?.email || '';

    // Calculate Period End (Renewal Logic)
    const { data: existingSub } = await supabaseClient
      .from('subscriptions')
      .select('current_period_end, status')
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date();
    let startDate = now;

    // If there's an active subscription that hasn't expired, extend it
    if (existingSub?.status === 'active' && new Date(existingSub.current_period_end) > now) {
      startDate = new Date(existingSub.current_period_end);
      console.log(`Renewing: Extending subscription from ${startDate.toISOString()}`);
    }

    const periodEnd = new Date(startDate);
    if (planType === 'annual') {
      periodEnd.setFullYear(startDate.getFullYear() + 1);
    } else {
      periodEnd.setMonth(startDate.getMonth() + 3);
    }

    const { error: dbError } = await supabaseClient
      .from('subscriptions')
      .upsert({
        user_id: userId,
        user_email: email, // Added user_email column
        status: 'active',
        plan_id: `${planTier || 'premium'}_${planType}`,
        current_period_end: periodEnd.toISOString(),
        razorpay_order_id: razorpay_order_id || `free_order_${Date.now()}`,
        razorpay_payment_id: razorpay_payment_id || `free_pay_${Date.now()}`,
        instagram_handle: instagramHandle,
        coupon_code: couponCode,
        amount_paid: amountPaidRs,
        discount_amount: discountRs,
        updated_at: new Date().toISOString()
      })

    if (dbError) {
      console.error('Database Error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Sync to Neon DB (Internal Dashboard)
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (neonDbUrl) {
      try {
        console.log("Syncing to Neon DB...");
        const neonClient = new Client(neonDbUrl);
        await neonClient.connect();

        // Check if user already exists in Neon and was deleted
        const { rows: existingNeonUsers } = await neonClient.queryObject(
          `SELECT id, deleted FROM users WHERE email = $1`,
          [email]
        );

        if (existingNeonUsers.length > 0) {
          const existingUser = existingNeonUsers[0] as any;
          if (existingUser.deleted) {
            console.log(`User ${email} was previously deleted. Removing old record for fresh start.`);
            await neonClient.queryObject(`DELETE FROM users WHERE id = $1`, [existingUser.id]);
          }
        }

        // Determine Package Name 
        let packageName = 'Premium';
        if (planType === 'quarterly') packageName += ' Quarterly';
        if (planType === 'annual') packageName += ' Annual';

        // Calculate Dates in JS (IST Offset + Plan Duration)
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffsetMs);

        const expiryDate = new Date(istDate);
        if (planType === 'annual') {
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        } else {
          expiryDate.setMonth(expiryDate.getMonth() + 3);
        }

        // --- Fetch connected handle and automations count ---
        const { data: instagramData } = await supabaseClient
          .from('instagram_accounts')
          .select('username')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        const connectedHandle = instagramData?.username || null;

        const { count: automationsCount, error: countError } = await supabaseClient
          .from('automations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'active');

        const activeAutomationsCount = countError ? 0 : (automationsCount || 0);

        const subscriptionEnd = expiryDate.toISOString();

        await neonClient.queryObject`
          INSERT INTO users (
            id,
            username, 
            email, 
            package,
            billing_cycle,
            status,
            subscription_start,
            subscription_end,
            payment_status,
            last_payment_date,
            amount_paid,
            discount_amount,
            currency,
            deleted,
            last_active,
            instagram_handle,
            connected_instagram_handle,
            automations_count
          ) VALUES (
            ${userId},
            ${instagramHandle || email}, 
            ${email}, 
            ${packageName},
            ${planType},
            'active',
            NOW() + INTERVAL '5 hours 30 minutes',
            ${subscriptionEnd},
            'paid',
            NOW() + INTERVAL '5 hours 30 minutes',
            ${amountPaidRs},
            ${discountRs},
            'INR',
            FALSE,
            NOW() + INTERVAL '5 hours 30 minutes',
            ${connectedHandle},
            ${connectedHandle},
            ${activeAutomationsCount}
          )
          ON CONFLICT (email) DO UPDATE SET
            username = COALESCE(EXCLUDED.username, users.username),
            package = EXCLUDED.package,
            billing_cycle = EXCLUDED.billing_cycle,
            status = EXCLUDED.status,
            subscription_start = EXCLUDED.subscription_start,
            subscription_end = EXCLUDED.subscription_end,
            payment_status = EXCLUDED.payment_status,
            last_payment_date = EXCLUDED.last_payment_date,
            amount_paid = EXCLUDED.amount_paid,
            discount_amount = EXCLUDED.discount_amount,
            currency = EXCLUDED.currency,
            deleted = FALSE,
            last_active = NOW() + INTERVAL '5 hours 30 minutes',
            instagram_handle = EXCLUDED.instagram_handle,
            connected_instagram_handle = EXCLUDED.connected_instagram_handle,
            automations_count = EXCLUDED.automations_count;
        `;


        // Increment Coupon Usage in Neon DB (for paid transactions)
        if (couponCode) {
          try {
            await neonClient.queryObject(
              `UPDATE promo_codes SET total_usage_tilldate = total_usage_tilldate + 1 WHERE LOWER(promo_code) = LOWER($1)`,
              [couponCode.trim()]
            );
            console.log(`Paid Coupon ${couponCode} usage incremented in Neon DB.`);
          } catch (couponErr) {
            console.error('Failed to increment coupon usage in Neon:', couponErr);
          }
        }

        await neonClient.end();
        console.log("Neon DB Sync Successful");

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