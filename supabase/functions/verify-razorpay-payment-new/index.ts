import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';

    // --- Auth Verification ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication token provided" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseSecretKey || supabaseAnonKey);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication failed: " + (authError?.message || "User not found") }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      planTier,
      planType,
      instagramHandle,
      couponCode,
      isFree
    } = await req.json();

    // Security: userId in body must match authenticated user
    if (userId !== user.id) {
      console.error(`User ID mismatch: Body=${userId}, Auth=${user.id}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized: User ID mismatch" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // ---------------------------------------------------------------
    // STEP 1: Verify Payment (Signature Check or Free Coupon)
    // ---------------------------------------------------------------
    if (isFree) {
      if (!couponCode) {
        return new Response(
          JSON.stringify({ error: 'Missing coupon code for free redemption' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const neonDbUrlFree = Deno.env.get('NEON_DB_URL') ?? '';
      if (!neonDbUrlFree) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: Neon not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const freeClient = new Client(neonDbUrlFree);
      try {
        await freeClient.connect();
        const freeResult = await freeClient.queryObject(`
          SELECT id, promo_code, discount_percentage,
                 max_usage, total_usage_tilldate, expiry_date, package
          FROM promo_codes
          WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
          LIMIT 1
        `, [couponCode.trim()]);

        if (freeResult.rows.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Invalid or Expired Coupon' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const coupon = freeResult.rows[0] as any;

        if (new Date(coupon.expiry_date) < new Date()) {
          return new Response(
            JSON.stringify({ error: 'Coupon has expired' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (coupon.discount_percentage !== 100) {
          return new Response(
            JSON.stringify({ error: 'Coupon is not 100% off' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

      const signatureBuffer = await crypto.subtle.sign("HMAC", key, msgData);
      const signatureHex = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (signatureHex !== razorpay_signature) {
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ---------------------------------------------------------------
    // STEP 2: Fetch canonical amount from Razorpay (prevent tampering)
    // ---------------------------------------------------------------
    const razorpay = new Razorpay({
      key_id: Deno.env.get('RAZORPAY_KEY_ID') || '',
      key_secret: Deno.env.get('RAZORPAY_KEY_SECRET') || ''
    });

    let rzpOrder: any = null;
    if (!isFree) {
      try {
        rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
      } catch (err) {
        console.error(`[SECURITY] Razorpay order fetch failed for ID: ${razorpay_order_id}`, err);
        throw new Error("Payment record not found on processor. Possible forged request.");
      }
    }

    // ---------------------------------------------------------------
    // STEP 3: Calculate expected amount & validate
    // ---------------------------------------------------------------
    let baseAmountPaise = 0;
    if (planTier === 'try_me_out') {
      baseAmountPaise = 199 * 100;
    } else if (planTier === 'premium') {
      baseAmountPaise = planType === 'annual' ? 4199 * 100 : 1199 * 100;
    } else if (planTier === 'professional') {
      baseAmountPaise = planType === 'annual' ? 5999 * 100 : 1799 * 100;
    } else {
      baseAmountPaise = planType === 'annual' ? (599 * 12 * 100) : (899 * 3 * 100);
    }

    let expectedPaise = baseAmountPaise;
    let serverCalculatedDiscountPaise = 0;

    // Fetch and calculate discount strictly on server
    if (couponCode) {
      const neonDbUrl2 = Deno.env.get('NEON_DB_URL');
      if (neonDbUrl2) {
        const couponClient = new Client(neonDbUrl2);
        try {
          await couponClient.connect();
          const couponResult = await couponClient.queryObject(`
            SELECT id, promo_code, discount_percentage, discount_amount, discount_type, package,
                   max_usage, total_usage_tilldate, expiry_date
            FROM promo_codes
            WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))
              AND (expiry_date >= NOW())
              AND (total_usage_tilldate < max_usage)
            LIMIT 1
          `, [couponCode.trim()]);

          if (couponResult.rows.length > 0) {
            const coupon = couponResult.rows[0] as any;
            const packType = coupon.package || '';

            // Re-enforce coupon restrictions on verify
            if (packType) {
              const pkg = packType.toLowerCase();
              const plan = (planType || '').toLowerCase();
              const tier = (planTier || '').toLowerCase();

              if ((pkg.includes('quarter') && plan !== 'quarterly') || (pkg.includes('annual') && plan !== 'annual')) {
                throw new Error(`Integrity Error: Coupon valid for ${pkg.includes('quarter') ? 'Quarterly' : 'Annual'} only.`);
              }

              const possibleTiers = ['try_me_out', 'premium', 'professional', 'enterprise', 'starter'];
              const restrictedTier = possibleTiers.find(t =>
                pkg.includes(t) || pkg.includes(t.replace(/_/g, ' '))
              );

              if (restrictedTier && tier !== restrictedTier && !(restrictedTier === 'starter' && tier === 'try_me_out')) {
                throw new Error(`Integrity Error: Coupon valid for ${restrictedTier.toUpperCase().replace(/_/g, ' ')} only.`);
              }
            }

            const discountPct = coupon.discount_percentage || 0;
            const discountAmt = coupon.discount_amount || 0;
            const discountType = coupon.discount_type || 'percentage';

            const baseRupees = baseAmountPaise / 100;
            let discountRupees = 0;

            if (discountType === 'flat') {
              discountRupees = discountAmt;
            } else if (discountPct > 0) {
              discountRupees = Math.floor(baseRupees * (discountPct / 100));
            }

            const finalRupees = Math.max(0, baseRupees - discountRupees);
            serverCalculatedDiscountPaise = discountRupees * 100;
            expectedPaise = Math.max(100, finalRupees * 100); // min ₹1 for Razorpay
          }
        } finally {
          await couponClient.end();
        }
      }
    }

    let amountPaidRs = 0;
    let discountRs = 0;

    if (!isFree) {
      const actualPaisePaid = rzpOrder.amount;
      if (actualPaisePaid < expectedPaise) {
        console.error(`[SECURITY] Amount Mismatch: Paid ${actualPaisePaid} paise, Expected ${expectedPaise} paise. User: ${userId}`);
        throw new Error("Payment amount mismatch. Integrity check failed.");
      }
      amountPaidRs = Math.floor(actualPaisePaid / 100);
      discountRs = Math.floor(serverCalculatedDiscountPaise / 100);
    } else {
      amountPaidRs = 0;
      discountRs = Math.floor(baseAmountPaise / 100);
    }

    // ---------------------------------------------------------------
    // STEP 4: Write Supabase Subscription (CRITICAL - must always succeed)
    // ---------------------------------------------------------------
    const { data: { user: userData } } = await supabaseClient.auth.admin.getUserById(userId);
    const email = userData?.email || '';

    const now = new Date();

    // Calculate period end
    const { data: existingSub } = await supabaseClient
      .from('subscriptions')
      .select('id, current_period_end, status')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    let startDate = now;
    if (existingSub?.status === 'active' && new Date(existingSub.current_period_end) > now) {
      startDate = new Date(existingSub.current_period_end);
      console.log(`Renewing: Extending subscription from ${startDate.toISOString()}`);
    }

    const periodEnd = new Date(startDate);
    if (planTier === 'try_me_out') {
      periodEnd.setMonth(startDate.getMonth() + 1);
    } else if (planType === 'annual') {
      periodEnd.setFullYear(startDate.getFullYear() + 1);
    } else {
      periodEnd.setMonth(startDate.getMonth() + 3);
    }

    const upsertData: any = {
      user_id: userId,
      user_email: email,
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
    };

    if (existingSub?.id) {
      upsertData.id = existingSub.id;
    }

    const { error: dbError } = await supabaseClient
      .from('subscriptions')
      .upsert(upsertData);

    if (dbError) {
      console.error('Supabase DB Error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Supabase subscription written for user ${userId}, plan ${planTier}_${planType}`);

    // ---------------------------------------------------------------
    // STEP 5: Sync to Neon DB (Dashboard analytics - ISOLATED, never kills main flow)
    // ---------------------------------------------------------------
    const neonDbUrl = Deno.env.get('NEON_DB_URL');
    if (neonDbUrl) {
      // Fire and forget — any Neon failure must NEVER affect the subscription
      (async () => {
        let neonClient: Client | null = null;
        try {
          // Build packageName FIRST before any usage
          let packageName = planTier === 'try_me_out'
            ? 'Monthly Sampler'
            : planTier
              ? planTier.charAt(0).toUpperCase() + planTier.slice(1).replace(/_/g, ' ')
              : 'Premium';
          if (planType === 'quarterly') packageName += ' (Quarterly)';
          if (planType === 'annual') packageName += ' (Annual)';

          // Single subscriptionEnd declaration
          const subscriptionEnd = periodEnd.toISOString();

          const istOffsetMs = 5.5 * 60 * 60 * 1000;
          const baseAmountRsCalculated = Math.floor(baseAmountPaise / 100);

          neonClient = new Client(neonDbUrl);
          await neonClient.connect();

          // Check if user was previously deleted in Neon
          const { rows: existingNeonUsers } = await neonClient.queryObject(
            `SELECT id, deleted FROM users WHERE email = $1`,
            [email]
          );
          if (existingNeonUsers.length > 0) {
            const existingUser = existingNeonUsers[0] as any;
            if (existingUser.deleted) {
              console.log(`User ${email} was previously deleted. Removing for fresh start.`);
              await neonClient.queryObject(`DELETE FROM users WHERE id = $1`, [existingUser.id]);
            }
          }

          // Fetch Instagram account and automations
          const { data: instagramData } = await supabaseClient
            .from('instagram_accounts')
            .select('username, followers_count, initial_followers_count')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

          const connectedHandle = instagramData?.username || null;

          const { data: automations, error: autoError } = await supabaseClient
            .from('automations')
            .select('status')
            .eq('user_id', userId);

          const totalAutomationsCount = autoError ? 0 : (automations?.length || 0);
          const activeAutomationsCount = autoError ? 0 : (automations?.filter(a => a.status === 'active').length || 0);
          const deactivatedAutomationsCount = autoError ? 0 : (automations?.filter(a => a.status === 'inactive').length || 0);

          const followersCount = instagramData?.followers_count || 0;
          const initialFollowersCount = instagramData?.initial_followers_count || 0;
          const growth = Math.max(0, followersCount - initialFollowersCount);

          // Fetch lifetime metrics
          const [dmRes, cmtRes, conRes] = await Promise.all([
            supabaseClient.from('automation_activities').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('activity_type', ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction']),
            supabaseClient.from('automation_activities').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('activity_type', ['comment', 'reply', 'incoming_comment', 'comment_reply']),
            supabaseClient.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId)
          ]);

          const totalDMs = dmRes.count || 0;
          const totalComments = cmtRes.count || 0;
          const totalReach = conRes.count || 0;

          // 1. Upsert User Profile in Neon
          await neonClient.queryObject(`
            INSERT INTO users (
              id, username, email, status, joining_date, last_active,
              instagram_handle, connected_instagram_handle, no_of_automations,
              automations_active, automations_deactivated,
              insta_followers_now, insta_followers_at_joining, insta_growth,
              total_dms, total_comments, total_reach,
              plan_name, plan_status,
              deleted, promo_code
            ) VALUES (
              $1, $2, $3, 'active',
              NOW() + INTERVAL '5 hours 30 minutes', NOW() + INTERVAL '5 hours 30 minutes',
              $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, FALSE, $17
            )
            ON CONFLICT (email) DO UPDATE SET
              username = COALESCE(EXCLUDED.username, users.username),
              status = EXCLUDED.status,
              last_active = EXCLUDED.last_active,
              instagram_handle = EXCLUDED.instagram_handle,
              connected_instagram_handle = EXCLUDED.connected_instagram_handle,
              no_of_automations = EXCLUDED.no_of_automations,
              automations_active = EXCLUDED.automations_active,
              automations_deactivated = EXCLUDED.automations_deactivated,
              insta_followers_now = EXCLUDED.insta_followers_now,
              insta_followers_at_joining = EXCLUDED.insta_followers_at_joining,
              insta_growth = EXCLUDED.insta_growth,
              total_dms = EXCLUDED.total_dms,
              total_comments = EXCLUDED.total_comments,
              total_reach = EXCLUDED.total_reach,
              plan_name = EXCLUDED.plan_name,
              plan_status = EXCLUDED.plan_status,
              promo_code = EXCLUDED.promo_code,
              deleted = FALSE;
          `, [
            userId,
            instagramHandle || email,
            email,
            instagramHandle,
            connectedHandle,
            totalAutomationsCount,
            activeAutomationsCount,
            deactivatedAutomationsCount,
            followersCount,
            initialFollowersCount,
            growth,
            totalDMs,
            totalComments,
            totalReach,
            packageName,       // ✅ declared BEFORE use now
            'active',
            couponCode || null
          ]);

          // 2. Fetch or Create Plan in Neon
          const planResult = await neonClient.queryObject(`
            INSERT INTO plans (name, billing_cycle, price, is_active)
            VALUES ($1, $2, $3, true)
            ON CONFLICT (name) DO UPDATE SET is_active = true
            RETURNING id;
          `, [packageName, planType, baseAmountRsCalculated]);
          const planId = (planResult.rows[0] as any).id;

          // 3. Update or Insert Subscription in Neon
          const subResult = await neonClient.queryObject(`
            UPDATE subscriptions
            SET plan_id = $1,
                subscription_end = $2,
                status = 'active'
            WHERE user_id = $3 AND status = 'active'
            RETURNING id;
          `, [planId, subscriptionEnd, userId]);

          if (subResult.rows.length === 0) {
            await neonClient.queryObject(`
              INSERT INTO subscriptions (user_id, plan_id, subscription_start, subscription_end, status)
              VALUES ($1, $2, NOW() + INTERVAL '5 hours 30 minutes', $3, 'active');
            `, [userId, planId, subscriptionEnd]);
          }

          // 4. Insert Payment Record in Neon
          const paymentStatus = isFree ? 'free' : 'paid';
          await neonClient.queryObject(`
            INSERT INTO payments (user_id, amount, discount_amount, promo_code, payment_status, paid_at)
            VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 hours 30 minutes');
          `, [userId, amountPaidRs, discountRs, couponCode || null, paymentStatus]);

          // 5. Increment Coupon Usage (paid transactions only)
          if (couponCode && !isFree) {
            try {
              await neonClient.queryObject(
                `UPDATE promo_codes SET total_usage_tilldate = total_usage_tilldate + 1 WHERE LOWER(TRIM(promo_code)) = LOWER(TRIM($1))`,
                [couponCode.trim()]
              );
              console.log(`Paid Coupon ${couponCode} usage incremented in Neon DB.`);
            } catch (couponErr) {
              console.error('Failed to increment coupon usage in Neon:', couponErr);
            }
          }

          console.log("✅ Neon DB Sync Successful");

        } catch (neonError) {
          console.error("⚠️ Neon Sync Failed (non-critical):", neonError);
        } finally {
          if (neonClient) {
            try { await neonClient.end(); } catch (_) { /* ignore */ }
          }
        }
      })();
    }

    // ---------------------------------------------------------------
    // Return success immediately — Neon sync runs in background
    // ---------------------------------------------------------------
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Payment verification critical error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
})