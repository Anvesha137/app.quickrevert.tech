import { validateUser, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { user, supabase } = await validateUser(req);

    const { accountId, action, force } = await req.json();

    if (!accountId || !action || !['subscribe', 'unsubscribe'].includes(action)) {
      throw new Error('Invalid request Payload');
    }

    const { data: instagramAccount, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !instagramAccount) {
      throw new Error('Instagram account not found');
    }

    const targetId = instagramAccount.instagram_business_id || instagramAccount.page_id;
    if (!targetId) {
      throw new Error('Neither Business ID nor Page ID found for Instagram account');
    }

    // Determine target URL for Meta Graph API
    // If we have a business_id, we use the Instagram Graph API (new pattern)
    // If we only have page_id, we use the Facebook Graph API (old pattern)
    const isInstagramId = !!instagramAccount.instagram_business_id;
    const graphUrl = isInstagramId 
      ? `https://graph.instagram.com/v24.0/${targetId}/subscribed_apps`
      : `https://graph.facebook.com/v24.0/${targetId}/subscribed_apps`;

    // Fast return if already correctly configured (unless force is true)
    if (action === 'subscribe' && instagramAccount.is_subscribed && !force) {
       console.log(`[manage-instagram-webhook] Already subscribed account ${accountId}. Returning idempotent success.`);
       return new Response(JSON.stringify({ success: true, message: 'Already subscribed' }), {
         status: 200,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
    }

    if (action === 'unsubscribe' && !instagramAccount.is_subscribed) {
      console.log(`[manage-instagram-webhook] Already unsubscribed account ${accountId}. Returning idempotent success.`);
       return new Response(JSON.stringify({ success: true, message: 'Already unsubscribed' }), {
         status: 200,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
    }

    let metaResponse;
    if (action === 'subscribe') {
      metaResponse = await fetch(graphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads,comments,story_insights',
          access_token: instagramAccount.access_token,
        }),
      });
    } else {
      metaResponse = await fetch(graphUrl + `?access_token=${instagramAccount.access_token}`, {
        method: 'DELETE'
      });
    }

    if (!metaResponse.ok) {
        const errorText = await metaResponse.text();
        // If meta returns an error saying app is already unsubscribed, we consider it a success and proceed
        if (action === 'unsubscribe' && errorText.includes('not subscribed')) {
            console.log("Meta API returned 'not subscribed', continuing with DB update");
        } else {
            console.error(`Failed to ${action} webhooks:`, errorText);
            throw new Error(`Meta API error during ${action}: ${errorText}`);
        }
    }

    // Update the local database state
    const { error: updateError } = await supabase
       .from('instagram_accounts')
       .update({ is_subscribed: action === 'subscribe' })
       .eq('id', accountId);

    if (updateError) {
        throw new Error(`Failed to save state to DB: ${updateError.message}`);
    }

    const message = action === 'subscribe' ? 'Webhooks successfully configured' : 'Webhooks successfully disabled';

    return new Response(JSON.stringify({ success: true, message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error managing webhooks:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
