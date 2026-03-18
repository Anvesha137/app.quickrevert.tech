import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

    let id: string | null = null;
    let username: string | null = null;
    let followers_count: number = NaN;

    try {
      // n8n might send 'Using Fields' as JSON or Form Data depending on config. We support both.
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const body = await req.json();
        id = body.id ? String(body.id) : null;
        username = body.username ? String(body.username) : null;
        followers_count = Number(body.followers_count);
      } else {
        // Fallback to URL search params / form data if n8n didn't send JSON header
        const form = await req.formData();
        id = form.get('id')?.toString() || null;
        username = form.get('username')?.toString() || null;
        followers_count = Number(form.get('followers_count'));
      }
    } catch (parseError) {
      // Ultimate fallback to request URL params
      const url = new URL(req.url);
      id = url.searchParams.get('id');
      username = url.searchParams.get('username');
      followers_count = Number(url.searchParams.get('followers_count'));
    }

    if ((!id && !username) || isNaN(followers_count)) {
      return new Response(
        JSON.stringify({ error: `Missing or invalid parameters. Received id: ${id}, username: ${username}, followers_count: ${followers_count}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch current account to check initial_followers_count
    let query = supabaseClient.from('instagram_accounts').select('initial_followers_count, id');
    if (username) {
      query = query.eq('username', username);
    } else {
      query = query.eq('instagram_user_id', String(id));
    }

    const { data: account, error: fetchError } = await query.maybeSingle();

    if (fetchError) throw fetchError;
    if (!account) {
      return new Response(
        JSON.stringify({ error: `No instagram account found with user id ${id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Prepare the update payload
    const updatePayload: any = {
      followers_count: followers_count,
      followers_last_updated: new Date().toISOString()
    };

    // If initial_followers_count is 0 or null, set it to the current count to establish the baseline
    if (!account.initial_followers_count || account.initial_followers_count === 0) {
      updatePayload.initial_followers_count = followers_count;
    }

    // 3. Perform the update
    const { error: updateError } = await supabaseClient
      .from('instagram_accounts')
      .update(updatePayload)
      .eq('id', account.id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, updated: updatePayload }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error updating followers:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
