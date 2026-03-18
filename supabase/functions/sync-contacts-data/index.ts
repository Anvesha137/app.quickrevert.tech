import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

console.log("Syncing contact data (Follows + Interactions)...")

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Missing Authorization header");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) throw new Error("Invalid user token");

    // 1. Fetch connected IG accounts
    const { data: accounts, error: accountsError } = await supabaseClient
      .from('instagram_accounts')
      .select('id, instagram_user_id, access_token, username')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (accountsError) throw accountsError;
    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "No active Instagram accounts found" }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let totalUpdated = 0;

    for (const account of accounts) {
      // 2. Fetch all contacts for this account
      const { data: contacts, error: contactsError } = await supabaseClient
        .from('contacts')
        .select('*')
        .eq('instagram_account_id', account.id);

      if (contactsError) {
        console.error(`Error fetching contacts for account ${account.id}:`, contactsError);
        continue;
      }

      // 3. Process each contact to check follow status
      // We do this in small batches to avoid hitting rate limits too fast (though Graph API limits are per-token)
      for (const contact of contacts) {
        if (!contact.instagram_user_id) continue;

        try {
          // Check follow status via Graph API
          const profileUrl = `https://graph.facebook.com/v21.0/${contact.instagram_user_id}?fields=is_user_follow_business&access_token=${account.access_token}`;
          const profileRes = await fetch(profileUrl);
          
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            const followsUs = profileData.is_user_follow_business || false;

            if (followsUs !== contact.follows_us) {
              await supabaseClient
                .from('contacts')
                .update({ follows_us: followsUs })
                .eq('id', contact.id);
              totalUpdated++;
            }
          }
        } catch (err) {
          console.error(`Error syncing follow status for contact ${contact.username}:`, err);
        }
      }

      // 4. Backfill Interactions (Sync activities from recent media)
      // This is a basic version: fetch recent media -> fetch comments -> upsert activities
      try {
        const mediaUrl = `https://graph.facebook.com/v21.0/${account.instagram_user_id}/media?limit=10&access_token=${account.access_token}`;
        const mediaRes = await fetch(mediaUrl);
        if (mediaRes.ok) {
          const { data: mediaItems } = await mediaRes.json();
          for (const item of (mediaItems || [])) {
            const commentsUrl = `https://graph.facebook.com/v21.0/${item.id}/comments?fields=id,text,from,timestamp&access_token=${account.access_token}`;
            const commentsRes = await fetch(commentsUrl);
            if (commentsRes.ok) {
              const { data: comments } = await commentsRes.json();
              for (const comment of (comments || [])) {
                if (!comment.from?.id) continue;

                // Insert into activities if doesn't exist
                await supabaseClient.from('automation_activities').upsert({
                    user_id: user.id,
                    instagram_account_id: account.id,
                    activity_type: 'comment',
                    target_username: comment.from.username || 'Instagram User',
                    message: comment.text,
                    status: 'success',
                    created_at: comment.timestamp,
                    metadata: { 
                        inbound: true, 
                        media_id: item.id, 
                        comment_id: comment.id,
                        from_sync: true
                    }
                }, { onConflict: 'metadata->>comment_id' }); // Heuristic for duplicate check
              }
            }
          }
        }
      } catch (backfillErr) {
        console.error(`Backfill Error for account ${account.username}:`, backfillErr);
      }
      
      // Finally, trigger a re-count of interactions for all contacts of this user
      // This matches the logic in syncHistoricalContactsInternal but in SQL
      await supabaseClient.rpc('recalculate_contact_interactions', { p_user_id: user.id });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated follow status for ${totalUpdated} contacts and triggered interaction recount.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error in sync-contacts-data:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
