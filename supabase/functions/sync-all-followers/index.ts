import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

console.log("Syncing all followers...")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch all connected accounts that have an access token
    const { data: accounts, error: fetchError } = await supabaseClient
      .from('instagram_accounts')
      .select('instagram_user_id, access_token, initial_followers_count')
      .not('access_token', 'is', null);

    if (fetchError) throw fetchError;

    let successCount = 0;
    let failCount = 0;

    // 2. Loop and hit Graph API for each account natively
    for (const account of accounts) {
      if (!account.instagram_user_id) continue;

      try {
        const response = await fetch(`https://graph.instagram.com/v19.0/${account.instagram_user_id}?fields=followers_count&access_token=${account.access_token}`);
        if (!response.ok) {
          console.error(`Failed to fetch for ${account.instagram_user_id}: ${response.statusText}`);
          failCount++;
          continue;
        }

        const data = await response.json();
        const followers_count = data.followers_count;

        if (typeof followers_count === 'number') {
          const updatePayload: any = {
            followers_count: followers_count,
            followers_last_updated: new Date().toISOString()
          };

          // Lock in the baseline if it's currently 0 or null
          if (!account.initial_followers_count || account.initial_followers_count === 0) {
            updatePayload.initial_followers_count = followers_count;
          }

          const { error: updateError } = await supabaseClient
            .from('instagram_accounts')
            .update(updatePayload)
            .eq('instagram_user_id', account.instagram_user_id);

          if (updateError) {
            console.error(`DB Update Error for ${account.instagram_user_id}:`, updateError);
            failCount++;
          } else {
            successCount++;
          }
        }
      } catch (err) {
        console.error(`Error processing ${account.instagram_user_id}:`, err);
        failCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount} accounts. Failed ${failCount}.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in sync-all-followers:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
