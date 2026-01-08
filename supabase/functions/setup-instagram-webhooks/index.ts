import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { instagramAccountId } = await req.json();

    const { data: instagramAccount, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('id', instagramAccountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !instagramAccount) {
      throw new Error('Instagram account not found');
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/instagram-webhook`;
    const appId = Deno.env.get('INSTAGRAM_APP_ID');
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');

    if (!appId || !appSecret) {
      console.warn('Instagram app credentials not configured');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Instagram app not configured. Webhooks will be set up automatically when configured.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pageId = instagramAccount.page_id;
    if (!pageId) {
      throw new Error('Page ID not found for Instagram account');
    }

    const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`;
    
    const subscribeResponse = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscribed_fields: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'comments', 'story_insights'],
        access_token: instagramAccount.access_token,
      }),
    });

    if (!subscribeResponse.ok) {
      const errorText = await subscribeResponse.text();
      console.error('Failed to subscribe to webhooks:', errorText);
      throw new Error(`Failed to subscribe to webhooks: ${errorText}`);
    }

    const subscribeResult = await subscribeResponse.json();
    console.log('Webhook subscription successful:', subscribeResult);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Webhooks configured successfully',
      webhookUrl,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error setting up webhooks:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});