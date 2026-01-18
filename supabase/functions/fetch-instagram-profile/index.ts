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

    // Try to fetch profile with all available fields
    // Note: Instagram Basic Display API doesn't provide followers_count/follows_count
    // We'll try to get them from the account data if available
    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${instagramAccount.access_token}`
    );

    if (!profileResponse.ok) {
      const errorData = await profileResponse.json();
      throw new Error(errorData.error?.message || "Failed to fetch Instagram profile");
    }

    const profileData = await profileResponse.json();
    
    // Try to get followers/following count from Instagram Business API if available
    // For now, we'll use stored values or fetch from account if page_id exists
    let followers_count = 0;
    let follows_count = 0;
    let profile_picture_url = profileData.profile_picture_url || null;
    let name = profileData.name || null;
    
    if (instagramAccount.page_id) {
      try {
        // Try Instagram Graph API (Business account)
        const businessProfileResponse = await fetch(
          `https://graph.facebook.com/v24.0/${instagramAccount.page_id}?fields=followers_count,follows_count,profile_picture_url,name&access_token=${instagramAccount.access_token}`
        );
        
        if (businessProfileResponse.ok) {
          const businessData = await businessProfileResponse.json();
          followers_count = businessData.followers_count || 0;
          follows_count = businessData.follows_count || 0;
          if (businessData.profile_picture_url) profile_picture_url = businessData.profile_picture_url;
          if (businessData.name) name = businessData.name;
        }
      } catch (e) {
        console.error('Error fetching business profile:', e);
      }
    }
    
    // Use stored values from instagram_accounts if available
    const finalProfile = {
      ...profileData,
      followers_count: followers_count || instagramAccount.followers_count || 0,
      follows_count: follows_count || instagramAccount.follows_count || 0,
      media_count: profileData.media_count || 0,
      profile_picture_url: profile_picture_url || instagramAccount.profile_picture_url || null,
      name: name || instagramAccount.name || null,
    };

    return new Response(
      JSON.stringify({ profile: finalProfile }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error fetching Instagram profile:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});