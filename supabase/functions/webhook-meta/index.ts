import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// Lazy load config to prevents crash if secrets are missing
// const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); // Move inside logic

serve(async (req) => {
    const url = new URL(req.url);

    if (req.method === "GET") {
        const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN");
        if (!META_VERIFY_TOKEN) {
            console.error("Missing META_VERIFY_TOKEN");
            return new Response("Config Error", { status: 500 });
        }

        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        console.log(`[VERIFY DEBUG] Mode: '${mode}', Token: '${token}', Secret: '${META_VERIFY_TOKEN}'`);

        if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
            console.log("[VERIFY SUCCESS] Returning challenge");
            return new Response(challenge, { status: 200 });
        }
        console.warn("[VERIFY FAILED] Token Mismatch or Bad Mode");
        return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "POST") {
        try {
            const signature = req.headers.get("x-hub-signature-256");
            const body = await req.text();

            const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
            if (!META_APP_SECRET) {
                console.error("Missing META_APP_SECRET");
                return new Response("Config Error", { status: 500 });
            }

            // BYPASS SIGNATURE CHECK FOR DEBUGGING
            // if (!await verifySignature(signature, body, META_APP_SECRET)) {
            //    console.error("Invalid Signature");
            //    return new Response("Unauthorized", { status: 403 });
            // }
            console.log("Signature Check Bypassed");

            const json = JSON.parse(body);

            // Async processing to allow immediate 200 OK
            // @ts-ignore
            if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
                // @ts-ignore
                EdgeRuntime.waitUntil(processEvent(json));
            } else {
                processEvent(json);
            }
            return new Response("EVENT_RECEIVED", { status: 200 });
        } catch (e) {
            console.error("Error in ingestion:", e);
            return new Response("Internal Server Error", { status: 500 });
        }
    }
    return new Response("Method Not Allowed", { status: 405 });
});

async function verifySignature(signature: string | null, body: string, secret: string) {
    if (!signature) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signatureBytes = hexToBytes(signature.split("=")[1]);
    return await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(body));
}

function hexToBytes(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

async function processEvent(body: any) {
    // Early-exit: skip delivery receipts, read receipts, and pure echo events
    // before touching Supabase or doing any heavy work.
    const firstEntry = body?.entry?.[0];
    if (firstEntry?.messaging) {
        const firstMsg = firstEntry.messaging[0];
        if (firstMsg?.delivery || firstMsg?.read) {
            console.log("[SKIP] Delivery/read receipt — no processing needed.");
            return;
        }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
<<<<<<< HEAD
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const object = body.object;
    const entries = body.entry || [];

    // DEBUG: Log basic webhook metadata only
    console.log(`[WEBHOOK EVENT] Processing ${entries.length} entries for object: ${object}`);
=======
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const object = body.object;
    const entries = body.entry || [];

    // DEBUG: Log full webhook payload
    console.log("[WEBHOOK DEBUG] Full payload:", JSON.stringify(body, null, 2));
    console.log("[WEBHOOK DEBUG] Number of entries:", entries.length);
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e

    for (const entry of entries) {
        const account_id = String(entry.id); // ✅ CRITICAL: Convert to string for DB comparison!

<<<<<<< HEAD
=======
        // DEBUG: Log entry details
        console.log("[WEBHOOK DEBUG] Entry ID:", account_id, "Type:", typeof account_id);
        console.log("[WEBHOOK DEBUG] Full entry:", JSON.stringify(entry, null, 2));

>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
        // FETCH ALL ACCOUNT DETAILS (access_token, user_id)
        // ✅ CRITICAL: Webhooks send IGBA ID in entry.id, so check BOTH fields!
        // ✅ CRITICAL FIX: Look up by instagram_business_id (Page-scoped IGBA ID)
        console.log(`[ACCOUNT LOOKUP] Searching for account with IGBA ID: ${account_id}`);

        // 🔥 CRITICAL FIX: Handle type mismatch - convert both to text for comparison
        // The webhook sends a string, but the DB column might be bigint
        // 🔥 NEW SELF-HEALING LOOKUP LOGIC
        // 1. Initial Lookup handling type mismatches
<<<<<<< HEAD
        let { data: accountsData, error: accountsError } = await supabaseClient
=======
        let { data: accountsData, error: accountsError } = await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
            .from('instagram_accounts')
            .select('id, access_token, user_id, instagram_user_id, instagram_business_id, username')
            .or(`instagram_business_id.eq.${account_id},instagram_user_id.eq.${account_id}`)
            .eq('status', 'active');

        // 2. Self-Healing: If lookup failed, try to find by USERNAME via Graph API
        if (!accountsData || accountsData.length === 0) {
            console.log(`❌ Initial Lookup Failed for ${account_id}. Attempting Advanced Self-Healing via Candidate Tokens...`);

            try {
                // Fetch potential candidates (accounts where ID might be wrong)
                // We check active accounts. We can't check ALL if there are 500+, 
                // so maybe we order by created_at desc (newest first)?
<<<<<<< HEAD
                const { data: candidates } = await supabaseClient
=======
                const { data: candidates } = await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                    .from('instagram_accounts')
                    .select('id, username, access_token')
                    .eq('status', 'active')
                    .not('access_token', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(20); // Check 20 most recent accounts to avoid timeout

                if (candidates && candidates.length > 0) {
                    for (const candidate of candidates) {
                        // Try to query the unknown ID using THIS candidate's token
                        // If this token owns the ID, it should work (or at least return data)
                        const graphUrl = `https://graph.instagram.com/${account_id}?fields=username&access_token=${candidate.access_token}`;
                        // console.log(`🔍 Probe ${candidate.username}...`); 

                        try {
                            const graphRes = await fetch(graphUrl);
                            const graphData = await graphRes.json();

                            if (graphData.username) {
                                console.log(`✅ Token for candidate [${candidate.username}] successfully resolved ID ${account_id} to username: ${graphData.username}`);

                                // Check if it matches the candidate
                                if (graphData.username === candidate.username) {
                                    console.log(`🎯 MATCH CONFIRMED! Updating ID for ${candidate.username}...`);

<<<<<<< HEAD
                                    await supabaseClient
=======
                                    await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                                        .from('instagram_accounts')
                                        .update({ instagram_business_id: account_id })
                                        .eq('id', candidate.id);

                                    // Success! Fetch the updated record
<<<<<<< HEAD
                                    const { data: healedData } = await supabaseClient
=======
                                    const { data: healedData } = await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                                        .from('instagram_accounts')
                                        .select('id, access_token, user_id, instagram_user_id, instagram_business_id, username')
                                        .eq('id', candidate.id);

                                    if (healedData) {
                                        accountsData = healedData;
                                        console.log(`✅ Self-Healing Successful. Proceeding with account.`);
                                    }
                                    break; // Stop looking
                                } else {
                                    console.warn(`⚠️ Token worked but username mismatch: Candidate=${candidate.username}, Res=${graphData.username}`);
                                }
                            }
                        } catch (err) {
                            // Ignore errors for wrong tokens
                        }
                    }
                } else {
                    console.warn(`⚠️ No candidate tokens available for self-healing.`);
                }
            } catch (healErr) {
                console.error("Advanced self-healing exception:", healErr);
            }
        }

        console.log(`[QUERY RESULT] Data:`, JSON.stringify(accountsData));

        if (!accountsData || accountsData.length === 0) {
            console.error(`❌ Final Account Lookup Failed for ${account_id} (even after self-healing)`);
            // We can't fetch profile without token, but we should still try to route?
            // Without account data, we can't upsert contacts or enrich with confident username.

            // Log failure
<<<<<<< HEAD
            await logFailedEvent(supabaseClient, {
=======
            await logFailedEvent({
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                event_id: "unknown",
                payload: entry
            }, "No Internal Account ID found (accountsData empty)");
            continue;
        } else {
            console.log(`✅ Found ${accountsData.length} account(s) for execution.`);

            // Auto-Correction for existing accounts if ID was matched via user_id but business_id is wrong
            for (const account of accountsData) {
                if (String(account.instagram_business_id) !== account_id) {
                    console.log(`🔄 Auto-correcting stored Business ID for ${account.username} to ${account_id}`);
<<<<<<< HEAD
                    await supabaseClient
=======
                    await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                        .from('instagram_accounts')
                        .update({ instagram_business_id: account_id })
                        .eq('id', account.id);
                }
            }
        }

        // RATE LIMITING CHECK
<<<<<<< HEAD
        if (await checkRateLimit(supabaseClient, account_id)) {
=======
        if (await checkRateLimit(account_id)) {
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
            console.warn(`Rate Limit Exceeded for account ${account_id}`);
            continue;
        }

        if (entry.messaging) {
            for (const msg of entry.messaging) {
                // Ignore Delivery/Read receipts
                if (msg.delivery || msg.read) {
                    continue;
                }

                const isEcho = msg.message?.is_echo || false;
                const targetUserId = isEcho ? msg.recipient?.id : msg.sender?.id;

                const eventId = msg.message?.mid || msg.postback?.mid || await hashPayload(msg);

<<<<<<< HEAD
                if (await isDuplicate(supabaseClient, eventId, account_id)) {
=======
                if (await isDuplicate(eventId, account_id)) {
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                    console.log("Duplicate Event Skipped:", eventId);
                    continue;
                }

<<<<<<< HEAD
                let sub_type = 'other';
                if (msg.postback || msg.message?.quick_reply) sub_type = 'postback';
                else if (msg.message) sub_type = 'message';

                // 1. RESOLVE ROUTES FIRST (Saving 1 DB Call later)
                const internalAccountId = accountsData?.[0]?.id;
                let matchedAutomationId = null;
                let activeRoutes: { routes: any[]; workflows: any[] } = { routes: [], workflows: [] };

                if (internalAccountId) {
                    activeRoutes = await resolveRoutes(supabaseClient, internalAccountId, 'messaging', sub_type);
                    const matchedWf = activeRoutes.workflows.find((w: any) => w.automation_id && activeRoutes.routes.some((r: any) => r.n8n_workflow_id === w.n8n_workflow_id));
                    if (matchedWf) matchedAutomationId = matchedWf.automation_id;
                }

                // 2. IDENTITY RESOLUTION & CONTACT UPSERT
=======
                // 1. IDENTITY RESOLUTION & CONTACT UPSERT
                // We must resolve the contact BEFORE logging activity or triggering automation.
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                let contactIds: string[] = [];
                let resolvedUsername: string | null = null;
                let profileName: string | null = null;
                let profilePic: string | null = null;
                let primaryActivityId: string | null = null;

                // Try to fetch profile using the FIRST available token
                const primaryAccount = accountsData?.[0];
                if (primaryAccount && targetUserId) {
<<<<<<< HEAD
                    // console.log(`Fetching profile for ${targetUserId} (isEcho: ${isEcho})`);
=======
                    console.log(`Fetching profile for ${targetUserId} (isEcho: ${isEcho})`);
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                    const profile = await fetchInstagramProfile(targetUserId, primaryAccount.access_token);

                    if (profile) {
                        resolvedUsername = profile.username;
                        profileName = profile.name || profile.username;
<<<<<<< HEAD
                        profilePic = profile.profile_pic; // Fixed property name mapping
=======
                        profilePic = profile.profile_picture_url;
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                    } else {
                        console.warn(`Profile Fetch Failed for ${targetUserId}, continuing with null username.`);
                    }
                }

                // Upsert Contact for ALL related dashboard users
<<<<<<< HEAD
                if (accountsData && accountsData.length > 0) {
                    for (const account of accountsData) {
                        const contact = await upsertContact(supabaseClient, {
=======
                // ALWAYS RUN THIS regardless of profile fetch success
                if (accountsData && accountsData.length > 0) {
                    for (const account of accountsData) {
                        const contact = await upsertContact(supabase, {
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            instagram_user_id: targetUserId,
                            username: resolvedUsername, // Can be null
                            full_name: profileName,
                            avatar_url: profilePic,
                            platform: 'instagram'
                        });
                        if (contact) contactIds.push(contact.id);
                    }
                }

<<<<<<< HEAD
=======
                let sub_type = 'other';
                if (msg.postback || msg.message?.quick_reply) sub_type = 'postback';
                else if (msg.message) sub_type = 'message';

>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                // 2. ACTIVITY LOGGING (Source of Truth for Events)
                // Log immediately linked to the contact(s)
                const activityMsg = msg.message?.text || (msg.message?.attachments ? 'Sent an attachment' : 'Interaction');

                // If we have contactIds, log properly. If Upsert failed entirely, we might skip logging or log with null?
                // Logic: accountsData loop again to ensure alignment
                for (let i = 0; i < accountsData.length; i++) {
                    const account = accountsData[i];
                    // contactIds might be partial if some upserts failed. 
                    // Best effort: Try to find the contactId for this user.
                    // Since we pushed in order, logic holds IF strict order maintained. 
                    // Safer: Do upsert and log in same loop? OR trust index.
                    // Let's trust index matching for now or just use contactIds[i] if valid.

                    const contactId = contactIds[i] || null;

                    // ALWAYS LOG ACTIVITY (Source of Truth for Dashboard)
<<<<<<< HEAD
                    const { data: loggedActivity } = await supabaseClient.from('automation_activities').insert({
                        user_id: account.user_id,
                        instagram_account_id: account.id,
                        contact_id: contactId,
                        automation_id: matchedAutomationId, // Included right from the start
=======
                    const { data: loggedActivity } = await supabase.from('automation_activities').insert({
                        user_id: account.user_id,
                        instagram_account_id: account.id,
                        contact_id: contactId,
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                        activity_type: sub_type === 'postback' ? 'interaction' : (isEcho ? 'send_dm' : 'dm'),
                        target_username: resolvedUsername || 'Instagram User',
                        message: activityMsg,
                        status: 'success',
                        metadata: {
                            direction: isEcho ? 'outbound' : 'inbound',
                            raw_id: targetUserId,
                            resolved: !!resolvedUsername,
                            sub_type: sub_type,
                            mid: msg.message?.mid || msg.postback?.mid
                        }
                    }).select('id').single();

                    if (i === 0 && loggedActivity) primaryActivityId = loggedActivity.id;
                }

                // STOP INFINITE LOOPS: Do NOT route bot echoes to n8n
                if (isEcho) {
                    console.log("Activity logged, but ignoring bot echo for routing");
                    continue;
                }

                // 3. TRIGGER AUTOMATION
                // Enrich payload with contact_id for N8n (so it can use it if needed)
                msg.contact_ids = contactIds;
                if (resolvedUsername) msg.sender_name = resolvedUsername; // Legacy compat

                // FLAGGING BASIC DISPLAY TOKEN
                // This informs N8n to NOT try to use the Graph API for replies if not supported.
                msg.is_basic_display = true;

                const legacyEntry = { id: account_id, time: Date.now(), messaging: [msg] };

                // FIX: Use the Internal UUID (accountsData[0].id) for routing, NOT the Instagram ID (entry.id)
<<<<<<< HEAD
                if (internalAccountId) {
                    if (activeRoutes.routes.length > 0) {
                        const payloadData = {
                            platform: object,
                            account_id: internalAccountId,
                            event_type: 'messaging',
                            sub_type,
                            payload: msg,
                            entry: [legacyEntry],
                            event_id: eventId,
                            is_basic_display: true,
                            activity_id: primaryActivityId
                        };
                        await triggerWorkflows(payloadData, activeRoutes.routes, activeRoutes.workflows);
                    }
                } else {
                    console.error("No Internal Account ID found for routing.");
                    await logFailedEvent(supabaseClient, { event_id: eventId, payload: msg }, "No Internal Account ID found (accountsData empty)");
=======
                // automation_routes.account_id is a UUID foreign key.
                const internalAccountId = accountsData?.[0]?.id;

                if (internalAccountId) {
                    // Also route to n8n workflows via automation_routes (existing system)
                    await routeAndTrigger({
                        platform: object,
                        account_id: internalAccountId, // Pass UUID
                        event_type: 'messaging',
                        sub_type,
                        payload: msg,
                        entry: [legacyEntry],
                        event_id: eventId,
                        is_basic_display: true,
                        activity_id: primaryActivityId // Pass primary activity ID for linking
                    });
                } else {
                    console.error("No Internal Account ID found for routing.");
                    await logFailedEvent({ event_id: eventId, payload: msg }, "No Internal Account ID found (accountsData empty)");
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                }
            }
        }
        if (entry.changes) {
            for (const change of entry.changes) {
                // IDEMPOTENCY CHECK (For changes/comments)
                const eventId = change.value?.id || await hashPayload(change);

<<<<<<< HEAD
                if (await isDuplicate(supabaseClient, eventId, account_id)) {
=======
                if (await isDuplicate(eventId, account_id)) {
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                    console.log("Duplicate Change Skipped:", eventId);
                    continue;
                }

                const legacyEntry = { id: account_id, time: Date.now(), changes: [change] };

                // FIX: Use internal UUID (same as DM routing)
                const internalAccountId = accountsData?.[0]?.id;

                if (!internalAccountId) {
                    console.error("No Internal Account ID found for comment routing.");
<<<<<<< HEAD
                    await logFailedEvent(supabaseClient, { event_id: eventId, payload: change }, "No Internal Account ID found for changes");
                    continue;
                }

                // 1. RESOLVE ROUTES FIRST
                const mediaId = change.value?.media?.id || change.value?.media_id;
                let activeRoutes: { routes: any[]; workflows: any[] } = { routes: [], workflows: [] };
                let matchedAutomationId = null;

                if (internalAccountId) {
                    activeRoutes = await resolveRoutes(supabaseClient, internalAccountId, 'changes', change.field, mediaId);
                    const matchedWf = activeRoutes.workflows.find((w: any) => w.automation_id && activeRoutes.routes.some((r: any) => r.n8n_workflow_id === w.n8n_workflow_id));
                    if (matchedWf) matchedAutomationId = matchedWf.automation_id;
                }

                // 2. CONTACT UPSERT & LOG ACTIVITY
                let primaryActivityId: string | null = null; 
=======
                    await logFailedEvent({ event_id: eventId, payload: change }, "No Internal Account ID found for changes");
                    continue;
                }

                // 🔥 CRITICAL FIX: Removed redundant execute-automation call. 
                // Dashboard automations are now handled exclusively via n8n workflows triggered by routeAndTrigger() below.
                let primaryActivityId: string | null = null; // Declare here so routeAndTrigger can access it
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                if (change.field === 'comments' && accountsData && accountsData.length > 0) {
                    // RESOLVE IDENTITY for comments too
                    let resolvedUsername = change.value?.from?.username;
                    let profileName = null;
                    let profilePic = null;

                    const primaryAccount = accountsData[0];
                    if (primaryAccount && change.value?.from?.id) {
                        const profile = await fetchInstagramProfile(change.value.from.id, primaryAccount.access_token);
                        if (profile) {
                            resolvedUsername = profile.username || resolvedUsername;
                            profileName = profile.name;
                            profilePic = profile.profile_pic;
                        }
                    }

                    for (const account of accountsData) {
<<<<<<< HEAD
                        // Upsert Contact for comments
                        const contact = await upsertContact(supabaseClient, {
=======
                        // Upsert Contact for comments (Keep this piece for tracking)
                        const contact = await upsertContact(supabase, {
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            instagram_user_id: change.value?.from?.id,
                            username: resolvedUsername,
                            full_name: profileName,
                            avatar_url: profilePic,
                            platform: 'instagram'
                        });

<<<<<<< HEAD
                        // 🔥 LOG COMMENT AS ACTIVITY WITH AUTOMATION ID
                        const { data: loggedActivity } = await supabaseClient.from('automation_activities').insert({
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            contact_id: contact?.id || null,
                            automation_id: matchedAutomationId, // Included to save a DB string
=======
                        // 🔥 LOG COMMENT AS ACTIVITY
                        const { data: loggedActivity } = await supabase.from('automation_activities').insert({
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            contact_id: contact?.id || null,
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                            activity_type: 'comment',
                            target_username: resolvedUsername || 'Instagram User',
                            message: change.value?.text || 'Post comment',
                            status: 'success',
                            metadata: {
                                direction: 'inbound',
                                field: change.field,
                                verb: change.value?.verb,
                                media_id: change.value?.media?.id,
                                resolved: !!resolvedUsername
                            }
                        }).select('id').single();

                        if (account.id === internalAccountId && loggedActivity) primaryActivityId = loggedActivity.id;
                    }
                }

<<<<<<< HEAD
                if (internalAccountId && activeRoutes.routes.length > 0) {
                    const payloadData = {
                        platform: object,
                        account_id: internalAccountId,
                        event_type: 'changes',
                        sub_type: change.field,
                        payload: change,
                        entry: [legacyEntry],
                        event_id: eventId,
                        activity_id: primaryActivityId
                    };
                    await triggerWorkflows(payloadData, activeRoutes.routes, activeRoutes.workflows);
                }
=======
                // Also route to n8n workflows via automation_routes (existing system)
                await routeAndTrigger({
                    platform: object,
                    account_id: internalAccountId, // UUID, not Instagram ID
                    event_type: 'changes',
                    sub_type: change.field,
                    payload: change,
                    entry: [legacyEntry],
                    event_id: eventId,
                    activity_id: primaryActivityId // Pass primary activity ID for linking
                });
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
            }
        }
    }
}

// Helpers
async function fetchInstagramProfile(senderId: string, accessToken: string) {
    try {
        // Use graph.instagram.com for Instagram Business IDs (Messaging PSIDs)
        // Fields for Instagram Messaging: name, profile_pic
        const url = `https://graph.instagram.com/v21.0/${senderId}?fields=name,profile_pic&access_token=${accessToken}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            // Map profile_pic to profile_picture_url if needed for compatibility, 
            // but let's keep it consistent with the API
            return data;
        }
        const errText = await res.text();
        console.error(`Profile Fetch Failed (${res.status}):`, errText);
        return null;
    } catch (e) {
        console.error("Profile Fetch Error:", e);
        return null;
    }
}

async function upsertContact(supabase: any, contact: any) {
    try {
        const { data, error } = await supabase
            .from('contacts')
            .upsert({
                user_id: contact.user_id,
                instagram_account_id: contact.instagram_account_id,
                instagram_user_id: contact.instagram_user_id,
                username: contact.username,
                full_name: contact.full_name,
                avatar_url: contact.avatar_url,
                last_interaction_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                platform: contact.platform || 'instagram'
            }, {
                onConflict: 'user_id, instagram_account_id, instagram_user_id',
                ignoreDuplicates: false
            })
            .select() // REQUIRED to get the ID back
            .single();

        if (error) {
            console.error("Contact Upsert Error:", error);
            return null;
        }
        return data;
    } catch (e) {
        console.error("Contact Upsert Exception:", e);
        return null;
    }
}

// Helpers for Idempotency
async function hashPayload(payload: any): Promise<string> {
    const str = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'hash_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

<<<<<<< HEAD
async function isDuplicate(supabaseClient: any, eventId: string, accountId: string): Promise<boolean> {
    // Try to insert event_id. If conflict -> it exists -> return true (is duplicate)
    const { error } = await supabaseClient
=======
async function isDuplicate(eventId: string, accountId: string): Promise<boolean> {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to insert event_id. If conflict -> it exists -> return true (is duplicate)
    const { error } = await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
        .from('processed_events')
        .insert({ event_id: eventId, account_id: accountId });

    // Postgres Unique Violation Code usually 23505
    if (error && error.code === '23505') return true;
    if (error) {
        console.error("Idempotency Check Error:", error);
        return false;
    }
    return false;
}

<<<<<<< HEAD
async function checkRateLimit(supabaseClient: any, accountId: string): Promise<boolean> {
=======
async function checkRateLimit(accountId: string): Promise<boolean> {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // Use an optimized query that only scans the last hour to prevent full table scans
    // and limits the count calculation to necessary rows only.
<<<<<<< HEAD
    const { count, error } = await supabaseClient
=======
    const { count, error } = await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
        .from('processed_events')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('created_at', oneMinuteAgo)
        .limit(601); // Only need to know if it exceeds 600

    if (error) { console.error("Rate Limit Check Error", error); return false; }
    return (count || 0) > 600; // Limit: 600 requests per minute
}

<<<<<<< HEAD
async function resolveRoutes(supabaseClient: any, account_id: string, event_type: string, sub_type: string, mediaId?: string) {
    let routes = [];
    let specificWorkflowId = null;

    if (mediaId && mediaId !== 'undefined') {
        const { data: trackedData } = await supabaseClient.from('tracked_posts')
            .select('workflow_id').eq('media_id', mediaId).eq('platform', 'instagram').maybeSingle();
        if (trackedData) specificWorkflowId = trackedData.workflow_id;
    }

    if (specificWorkflowId) {
        routes = [{ n8n_workflow_id: specificWorkflowId }];
    } else {
        const { data: globalRoutes } = await supabaseClient.from('automation_routes')
            .select('n8n_workflow_id, sub_type')
            .eq('account_id', account_id).eq('event_type', event_type).eq('is_active', true)
            .or(`sub_type.eq.${sub_type},sub_type.is.null`);
            
        if (globalRoutes && globalRoutes.length > 0) routes = globalRoutes;
    }

    // Deduplicate
    const uniqueRoutes = [];
    const seen = new Set();
    for (const r of routes) {
        if (!seen.has(r.n8n_workflow_id)) { seen.add(r.n8n_workflow_id); uniqueRoutes.push(r); }
    }

    if (uniqueRoutes.length === 0) return { routes: [], workflows: [] };

    const workflowIds = uniqueRoutes.map((r: any) => r.n8n_workflow_id);
    const { data: workflows } = await supabaseClient.from('n8n_workflows')
        .select('n8n_workflow_id, webhook_path, automation_id').in('n8n_workflow_id', workflowIds);

    return { routes: uniqueRoutes, workflows: workflows || [] };
}

async function triggerWorkflows(normalized: any, routes: any[], workflows: any[]) {
=======
async function routeAndTrigger(normalized: any) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    const N8N_BASE_URL = Deno.env.get("N8N_BASE_URL");
    const N8N_API_KEY = Deno.env.get("X-N8N-API-KEY");

    if (!N8N_BASE_URL) console.error("Missing N8N_BASE_URL");
<<<<<<< HEAD

    const pathMap = new Map();
    workflows.forEach((w: any) => { if (w.webhook_path) pathMap.set(w.n8n_workflow_id, w.webhook_path); });
=======
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("Routing:", normalized);

    // 1. Priority: Tracked Posts (Specific)
    // Only relevant for 'changes' logic (comments) or if we later support specific DM flows via postback
    // For now, check if payload has a media id (comments usually do)
    let specificWorkflowId = null;

    // Check if this is a comment/change with a media object
    const mediaId = normalized.payload?.value?.media?.id || normalized.payload?.value?.media_id;

    if (mediaId) {
        const { data: trackedData, error: trackedError } = await supabase
            .from('tracked_posts')
            .select('workflow_id')
            .eq('media_id', mediaId)
            .eq('platform', 'instagram')
            .maybeSingle(); // We assume unique constraint enforces one workflow per post per platform?
        // If not, we might trigger multiple. User architecture notes "multiple workflows track same post is undefined".
        // maybeSingle() picks one arbitrary if multiple exist, or null if none.

        if (trackedData) {
            console.log(`Specific Route Found for Media ${mediaId} -> Workflow ${trackedData.workflow_id}`);
            specificWorkflowId = trackedData.workflow_id;
        }
    }

    console.log(`[ROUTING DEBUG] Searching routes for AccountUUID: ${normalized.account_id}, Event: ${normalized.event_type}, Sub: ${normalized.sub_type}`);

    let routes = [];

    if (specificWorkflowId) {
        // If specific match found, we ONLY trigger that one.
        routes = [{ n8n_workflow_id: specificWorkflowId }];
    } else {
        // 2. Fallback: Global Routes
        // Try UUID match first
        const { data: globalRoutes, error } = await supabase
            .from('automation_routes')
            .select('n8n_workflow_id, sub_type, account_id')
            .eq('account_id', normalized.account_id)
            .eq('event_type', normalized.event_type)
            .eq('is_active', true)
            .or(`sub_type.eq.${normalized.sub_type},sub_type.is.null`);

        if (error) { console.error("Route Lookup Error:", error); return; }

        if (globalRoutes && globalRoutes.length > 0) {
            console.log(`[ROUTING DEBUG] Found ${globalRoutes.length} routes via UUID.`);
            routes = globalRoutes;
        } else {
            console.warn(`[ROUTING DEBUG] No routes found for UUID ${normalized.account_id}. Trying Legacy Meta ID lookup...`);

            // LEGACY FALLBACK: Try Meta ID from the entry.id (if we have it)
            // normalized.payload?.recipient?.id or normalized.payload?.sender?.id might be the Meta ID
            // Actually, entry.id is the Meta ID. We should have passed it.
            const metaId = normalized.entry?.[0]?.id;
            if (metaId) {
                const { data: legacyRoutes } = await supabase
                    .from('automation_routes')
                    .select('n8n_workflow_id, sub_type')
                    .eq('account_id', String(metaId))
                    .eq('event_type', normalized.event_type)
                    .eq('is_active', true)
                    .or(`sub_type.eq.${normalized.sub_type},sub_type.is.null`);

                if (legacyRoutes && legacyRoutes.length > 0) {
                    console.log(`[ROUTING DEBUG] Found ${legacyRoutes.length} routes via Legacy Meta ID ${metaId}.`);
                    routes = legacyRoutes;
                }
            }
        }
    }

    if (!routes || routes.length === 0) {
        console.warn(`[ROUTING FAILED] No active routes found for Account ${normalized.account_id} (Type: ${normalized.event_type}, Sub: ${normalized.sub_type})`);
        // Log all routes for this account to see what's actually there
        const { data: allRoutes } = await supabase.from('automation_routes').select('*').eq('account_id', normalized.account_id);
        console.log(`[ROUTING FAILED] All routes for this account:`, JSON.stringify(allRoutes));
        return;
    }

    // 🔥 FIX: Deduplicate routes by n8n_workflow_id to prevent the same workflow from firing twice
    // for the same event (e.g. if one route matches sub_type and another is a catch-all)
    const uniqueRoutes = [];
    const seenWorkflows = new Set();
    for (const route of routes) {
        if (!seenWorkflows.has(route.n8n_workflow_id)) {
            seenWorkflows.add(route.n8n_workflow_id);
            uniqueRoutes.push(route);
        }
    }
    routes = uniqueRoutes;

    // Resolve Webhook Paths
    const workflowIds = routes.map((r: any) => r.n8n_workflow_id);
    const { data: workflows, error: wfError } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id, webhook_path, automation_id')
        .in('n8n_workflow_id', workflowIds);

    if (wfError) console.error("Workflow Lookup Error:", wfError);

    const pathMap = new Map();
    if (workflows) {
        workflows.forEach((w: any) => {
            if (w.webhook_path) pathMap.set(w.n8n_workflow_id, w.webhook_path);
        });

        // 🔥 LINK ACTIVITY TO AUTOMATION ID
        if (normalized.activity_id) {
            const matchedWf = workflows.find((w: any) => w.automation_id && routes.some((r: any) => r.n8n_workflow_id === w.n8n_workflow_id));
            if (matchedWf) {
                console.log(`🔗 Linking Activity ${normalized.activity_id} to Automation ${matchedWf.automation_id}`);
                const { error: updateError } = await supabase
                    .from('automation_activities')
                    .update({ automation_id: matchedWf.automation_id })
                    .eq('id', normalized.activity_id);

                if (updateError) console.error("❌ Failed to link activity to automation:", updateError);
            }
        }
    }
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e

    for (const route of routes) {
        try {
            const webhookPath = pathMap.get(route.n8n_workflow_id);
<<<<<<< HEAD
            let targetUrl = `${N8N_BASE_URL}/api/v1/workflows/${route.n8n_workflow_id}/execute`;
            const headers: any = { "Content-Type": "application/json" };

            if (webhookPath) {
                targetUrl = `${N8N_BASE_URL}/webhook/${webhookPath}`;
            } else {
                headers["X-N8N-API-KEY"] = N8N_API_KEY;
            }

=======
            let targetUrl = `${N8N_BASE_URL}/api/v1/workflows/${route.n8n_workflow_id}/execute`; // Fallback

            if (webhookPath) {
                targetUrl = `${N8N_BASE_URL}/webhook/${webhookPath}`;
                // console.log(`Triggering Workflow via Webhook: ${route.n8n_workflow_id} -> ${webhookPath}`);
            } else {
                // console.log(`Triggering Workflow via Execute (No Path): ${route.n8n_workflow_id}`);
            }

            // Headers: Execute needs API Key, Webhook might not (but good to verify)
            const headers: any = { "Content-Type": "application/json" };
            if (!webhookPath) headers["X-N8N-API-KEY"] = N8N_API_KEY;

>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
            const res = await fetch(targetUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(normalized)
            });

            if (!res.ok) throw new Error(`n8n responded with ${res.status}: ${await res.text()}`);
        } catch (err) {
            console.error(`Failed to trigger workflow ${route.n8n_workflow_id}`, err);
<<<<<<< HEAD
=======
            await logFailedEvent(normalized, `N8N ERROR: ${err instanceof Error ? err.message : String(err)}`);
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
        }
    }
}

<<<<<<< HEAD
async function logFailedEvent(supabaseClient: any, payload: any, errorMessage: string) {
    const { error } = await supabaseClient
=======
async function logFailedEvent(payload: any, errorMessage: string) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
        .from('failed_events')
        .insert({
            event_id: payload.event_id,
            account_id: payload.account_id,
            payload: payload,
            error_message: errorMessage
        });

    if (error) console.error("Failed to log failed event:", error);
}
