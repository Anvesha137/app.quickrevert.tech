import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extremely lightweight alternative to googleapis to avoid npm dependency issues
async function appendToGoogleSheet(values: string[][]) {
  const privateKey = (Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const spreadsheetId = Deno.env.get('GOOGLE_SHEET_ID');
  
  if (!privateKey || !clientEmail || !spreadsheetId) {
    throw new Error('Google Sheets credentials are not configured.');
  }

  // Generate JWT using simple crypto
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const toBase64Url = (obj: any) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedHeader = toBase64Url(header);
  const encodedClaim = toBase64Url(claim);
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  // Sign using Web Crypto API
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey.substring(privateKey.indexOf(pemHeader) + pemHeader.length, privateKey.indexOf(pemFooter)).replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenReq = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  const tokenRes = await tokenReq.json();
  if (!tokenRes.access_token) {
      throw new Error('Failed to get access token: ' + JSON.stringify(tokenRes));
  }

  // Append data
  const appendReq = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A:K:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenRes.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values })
  });

  const appendRes = await appendReq.json();
  if (appendRes.error) {
      throw new Error(appendRes.error.message);
  }
  return appendRes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      email, name, instagram, location, phone,
      language, niche, usedDmTool, followers, affiliateInterest,
    } = body;

    if (!email || !name || !instagram || !location || !phone || !language || !niche || !usedDmTool || !followers || !affiliateInterest) {
      return new Response(
        JSON.stringify({ success: false, message: 'All fields are required.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const timestamp = new Date().toISOString();
    const values = [[
      timestamp,
      email,
      name,
      `@${instagram.replace(/^@/, '')}`,
      location,
      phone,
      language,
      niche,
      usedDmTool,
      String(followers),
      affiliateInterest,
    ]];

    await appendToGoogleSheet(values);

    console.log('[COLLAB] Row appended to Google Sheet successfully.');
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[COLLAB] Error appending to Google Sheet:', error.message);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to submit application. Please try again.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
