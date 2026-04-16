import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // Security check: ensure the request is triggered by our internal cron job or admin
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error('[sweep-inactive-webhooks] Unauthorized invocation attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('[sweep-inactive-webhooks] Initiating sweep for inactive webhook subscriptions...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey!);

    // Query finding accounts with 0 active automations, that are still subscribed, 
    // and haven't been updated in the last 15 minutes.
    const { data: sweepTargets, error: queryError } = await supabase
      .from('instagram_accounts')
      .select('id, access_token, page_id, username')
      .eq('is_subscribed', true)
      .eq('active_automations_count', 0)
      .lt('updated_at', new Date(Date.now() - 15 * 60000).toISOString()); // Older than 15 mins

    if (queryError) {
      throw new Error(`Failed querying sweep targets: ${queryError.message}`);
    }

    if (!sweepTargets || sweepTargets.length === 0) {
      console.log('[sweep-inactive-webhooks] No accounts require sweeping at this time.');
      return new Response(JSON.stringify({ success: true, swept: 0 }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[sweep-inactive-webhooks] Found ${sweepTargets.length} account(s) to unsubscribe.`);
    
    let processedCount = 0;
    const errors = [];

    for (const target of sweepTargets) {
      try {
        console.log(`Unsubscribing account ${target.id} (${target.username})...`);
        const graphUrl = `https://graph.facebook.com/v21.0/${target.page_id}/subscribed_apps?access_token=${target.access_token}`;

        const metaResponse = await fetch(graphUrl, {
          method: 'DELETE'
        });

        if (!metaResponse.ok) {
            const errorText = await metaResponse.text();
            // Suppress error if already not subscribed upstream
            if (!errorText.includes('not subscribed')) {
                throw new Error(`Meta API Error: ${errorText}`);
            }
        }

        // Successfully sent DELETE to Meta, now update our DB
        const { error: updateError } = await supabase
          .from('instagram_accounts')
          .update({ is_subscribed: false })
          .eq('id', target.id);

        if (updateError) {
          throw new Error(`DB Update Error: ${updateError.message}`);
        }

        processedCount++;
        console.log(`Successfully swept account ${target.id}`);
      } catch (err: any) {
        console.error(`Failed to sweep account ${target.id}:`, err);
        errors.push({ id: target.id, error: err.message });
        // continue sweeping other targets
      }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        swept: processedCount,
        errors: errors.length > 0 ? errors : undefined 
    }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Fatal error in sweep-inactive-webhooks:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
