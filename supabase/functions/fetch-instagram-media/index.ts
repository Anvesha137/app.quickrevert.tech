import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    // Get media type from query params first, then from request body
    const url = new URL(req.url);
    let mediaType = url.searchParams.get("type") || "posts";
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        mediaType = body.type || mediaType;
      } catch (e) {
        // If JSON parsing fails, continue with URL param value
        console.warn('Could not parse request body as JSON:', e);
      }
    }

    const { data: instagramAccount, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (accountError || !instagramAccount) {
      return new Response(
        JSON.stringify({ error: "No active Instagram account found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if token is expired or expiring soon (within 1 hour)
    const tokenExpiry = new Date(instagramAccount.token_expires_at);
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    
    if (tokenExpiry < oneHourFromNow) {
      console.log('Instagram token is expired or expiring soon, attempting refresh');
      
      // Refresh the token
      const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
      refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
      refreshUrl.searchParams.set('access_token', instagramAccount.access_token);

      const refreshResponse = await fetch(refreshUrl.toString());
      const refreshData = await refreshResponse.json();

      if (refreshData.access_token) {
        const newAccessToken = refreshData.access_token;
        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 5184000) * 1000).toISOString();
        
        // Update the token in the database
        const { error: updateError } = await supabase
          .from('instagram_accounts')
          .update({
            access_token: newAccessToken,
            token_expires_at: newExpiresAt,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', instagramAccount.id);

        if (!updateError) {
          // Update the account object with new token
          instagramAccount.access_token = newAccessToken;
          console.log('Instagram token refreshed successfully');
        } else {
          console.error('Failed to update Instagram token in database:', updateError);
        }
      } else {
        console.error('Failed to refresh Instagram token:', refreshData);
        return new Response(
          JSON.stringify({ error: `Failed to refresh Instagram token: ${refreshData.error?.message || 'Unknown error'}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    let mediaData = [];

    if (mediaType === "posts") {
      const mediaResponse = await fetch(
        `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${instagramAccount.access_token}`
      );

      if (!mediaResponse.ok) {
        const errorData = await mediaResponse.json().catch(() => ({}));
        throw new Error(`Failed to fetch Instagram media: ${errorData.error?.message || mediaResponse.statusText || 'Unknown error'}`);
      }

      const mediaJson = await mediaResponse.json();
      mediaData = mediaJson.data || [];
    } else if (mediaType === "stories") {
      mediaData = [];
    }

    return new Response(
      JSON.stringify({ media: mediaData }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error fetching Instagram media:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});