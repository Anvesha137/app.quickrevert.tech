import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


// Lazy load config to prevents crash if secrets are missing
// const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); // Move inside logic

serve(async (req) => {
    const url = new URL(req.url);
    console.log(`[WEBHOOK] Incoming Request: ${req.method} ${url.pathname}${url.search}`);

    if (req.method === "GET") {
        const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN");
        if (!META_VERIFY_TOKEN) {
            console.error("Missing META_VERIFY_TOKEN");
            return new Response("Config Error", { status: 500 });
        }

        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        // 🔥 ROBURSTNESS FIX: Trim values to avoid hidden space/newline issues
        const trimmedSecret = META_VERIFY_TOKEN?.trim();
        const trimmedToken = token?.trim();

        if (mode === "subscribe" && trimmedToken === trimmedSecret) {
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

            if (!await verifySignature(signature, body, META_APP_SECRET)) {
                console.error("Invalid Signature");
                return new Response("Unauthorized", { status: 403 });
            }
            console.log("Signature Verified Successfully");

            const json = JSON.parse(body);

            // ⚡ FAST-TRACK: drop junk traffic immediately before doing ANY DB work
            const firstEntry = json?.entry?.[0];
            const firstMsg = firstEntry?.messaging?.[0];
            if (firstMsg?.delivery || firstMsg?.read) {
                console.log("[BOUNCER] Dropped Receipt/Read event");
                return new Response("EVENT_RECEIVED", { status: 200 });
            }

            // Async processing to allow immediate 200 OK
            // We do NOT await processEvent here so Meta gets 200 OK immediately
            processEvent(json).catch(err => console.error("Background processing error:", err));

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
    // Note: Junk receipts are already filtered at the entry point now.

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const object = body.object;
    const entries = body.entry || [];

    // DEBUG: Log basic webhook metadata only
    console.log(`[WEBHOOK EVENT] Processing ${entries.length} entries for object: ${object}`);

    for (const entry of entries) {
        const account_id = String(entry.id); // ✅ CRITICAL: Convert to string for DB comparison!

        // FETCH ALL ACCOUNT DETAILS (access_token, user_id)
        // ✅ CRITICAL: Webhooks send IGBA ID in entry.id, so check BOTH fields!
        // ✅ CRITICAL FIX: Look up by instagram_business_id (Page-scoped IGBA ID)
        console.log(`[ACCOUNT LOOKUP] Searching for account with IGBA ID: ${account_id}`);

        // 🔥 CRITICAL FIX: Handle type mismatch - convert both to text for comparison
        // The webhook sends a string, but the DB column might be bigint
        // 🔥 NEW SELF-HEALING LOOKUP LOGIC
        // 1. Initial Lookup handling type mismatches
        let { data: accountsData, error: accountsError } = await supabaseClient
            .from('instagram_accounts')
            .select('id, access_token, user_id, instagram_user_id, instagram_business_id, username, active_automations_count, is_subscribed')
            .or(`instagram_business_id.eq.${account_id},instagram_user_id.eq.${account_id}`)
            .eq('status', 'active');

        // Removed Early Exit check for active_automations_count to prevent silent failures
        // if the database trigger is slow or fails. Processing will now proceed to
        // route resolution.

        // 2. Self-Healing: If lookup failed, try to find by USERNAME via Graph API
        if (!accountsData || accountsData.length === 0) {
            console.log(`❌ Initial Lookup Failed for ${account_id}. Attempting Advanced Self-Healing via Candidate Tokens...`);

            try {
                // Fetch potential candidates (accounts where ID might be wrong)
                // We check active accounts. We can't check ALL if there are 500+, 
                // so maybe we order by created_at desc (newest first)?
                const { data: candidates } = await supabaseClient
                    .from('instagram_accounts')
                    .select('id, username, access_token')
                    .eq('status', 'active')
                    .not('access_token', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (candidates && candidates.length > 0) {
                    console.log(`[SELF-HEALING] Racing ${candidates.length} candidate tokens in parallel...`);

                    const results = await Promise.all(candidates.map(async (candidate) => {
                        const graphUrl = `https://graph.instagram.com/${account_id}?fields=username&access_token=${candidate.access_token}`;
                        try {
                            const res = await fetch(graphUrl);
                            if (!res.ok) return null;
                            const data = await res.json();
                            return { candidate, username: data.username };
                        } catch { return null; }
                    }));

                    const winningResult = results.find(r => r && r.username);

                    if (winningResult) {
                        const { candidate, username } = winningResult;
                        console.log(`✅ Parallel Healing resolved ID ${account_id} to ${username} using token from ${candidate.username}`);

                        if (username === candidate.username) {
                            console.log(`🎯 MATCH CONFIRMED! Updating ID for ${candidate.username}...`);
                            await supabaseClient
                                .from('instagram_accounts')
                                .update({ instagram_business_id: account_id })
                                .eq('id', candidate.id);

                            const { data: healedData } = await supabaseClient
                                .from('instagram_accounts')
                                .select('id, access_token, user_id, instagram_user_id, instagram_business_id, username, active_automations_count, is_subscribed')
                                .eq('id', candidate.id);

                            if (healedData && healedData.length > 0) {
                                accountsData = healedData;
                            }
                        }
                    }
                } else {
                    console.warn(`⚠️ No candidate tokens available for self-healing.`);
                }
            } catch (healErr) {
                console.error("Advanced self-healing exception:", healErr);
            }
        }

        console.log(`[QUERY RESULT] Found ${accountsData?.length || 0} potential accounts`);

        if (!accountsData || accountsData.length === 0) {
            console.error(`❌ Final Account Lookup Failed for ${account_id} (even after self-healing)`);
            // We can't fetch profile without token, but we should still try to route?
            // Without account data, we can't upsert contacts or enrich with confident username.

            // Log failure
            await logFailedEvent(supabaseClient, {
                event_id: "unknown",
                payload: entry
            }, "No Internal Account ID found (accountsData empty)");
            continue;
        } else {
            console.log(`✅ Found ${accountsData.length} account(s) for execution.`);

            // Auto-Correction for existing accounts if ID was matched via user_id but business_id is wrong
            for (const account of accountsData) {
                const oldBusinessId = String(account.instagram_business_id);
                if (oldBusinessId !== account_id) {
                    console.log(`🔄 Auto-correcting stored Business ID for ${account.username}: ${oldBusinessId} → ${account_id}`);
                    await supabaseClient
                        .from('instagram_accounts')
                        .update({ instagram_business_id: account_id })
                        .eq('id', account.id);

                    // 🔥 CRITICAL FIX: Propagate the corrected ID to automation_routes and tracked_payloads.
                    // Without this, existing automations registered with the OLD account_id will never
                    // match incoming webhook events that carry the NEW (corrected) account_id.
                    // This is why "Send Access" postback didn't trigger — the payload was registered
                    // against the old ID, so resolveRoutes couldn't find it.
                    const { error: routeUpdateErr } = await supabaseClient
                        .from('automation_routes')
                        .update({ account_id: account_id })
                        .eq('account_id', oldBusinessId);
                    if (routeUpdateErr) {
                        console.error(`[ID-FIX] Failed to update automation_routes for ${oldBusinessId}:`, routeUpdateErr.message);
                    } else {
                        console.log(`[ID-FIX] ✅ Updated automation_routes: ${oldBusinessId} → ${account_id}`);
                    }

                    const { error: payloadUpdateErr } = await supabaseClient
                        .from('tracked_payloads')
                        .update({ account_id: account_id })
                        .eq('account_id', oldBusinessId);
                    if (payloadUpdateErr) {
                        console.error(`[ID-FIX] Failed to update tracked_payloads for ${oldBusinessId}:`, payloadUpdateErr.message);
                    } else {
                        console.log(`[ID-FIX] ✅ Updated tracked_payloads: ${oldBusinessId} → ${account_id}`);
                    }
                }
            }
        }

        // RATE LIMITING CHECK
        if (await checkRateLimit(supabaseClient, account_id)) {
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

                if (await isDuplicate(supabaseClient, eventId, account_id)) {
                    console.log("Duplicate Event Skipped:", eventId);
                    continue;
                }

                let sub_type = 'other';
                if (msg.postback || msg.message?.quick_reply) sub_type = 'postback';
                else if (msg.message) sub_type = 'message';

                // 1. RESOLVE ROUTES FIRST (Saving 1 DB Call later)
                const internalAccountId = accountsData?.[0]?.id;
                let matchedAutomationId = null;
                let activeRoutes: { routes: any[]; workflows: any[] } = { routes: [], workflows: [] };

                if (internalAccountId) {
                    // Extract the postback payload so resolveRoutes can do a direct lookup via tracked_payloads
                    const postbackPayload = msg.postback?.payload || msg.message?.quick_reply?.payload || msg.message?.text?.trim()?.toLowerCase() || undefined;
                    // ⚠️ CRITICAL: automation_routes.account_id stores Meta ID (account_id), NOT internal UUID
                    console.log(`[ROUTING] Resolving routes for Meta account: ${account_id}, sub_type: ${sub_type}, payload: ${postbackPayload || 'none'}`);
                    activeRoutes = await resolveRoutes(supabaseClient, account_id, 'messaging', sub_type, undefined, postbackPayload);
                    console.log(`[ROUTING] Found ${activeRoutes.routes.length} active routes for messaging`);
                    
                    const matchedWf = activeRoutes.workflows.find((w: any) => w.automation_id && activeRoutes.routes.some((r: any) => r.n8n_workflow_id === w.n8n_workflow_id));
                    if (matchedWf) {
                        matchedAutomationId = matchedWf.automation_id;
                        console.log(`[ROUTING] Matched Automation ID: ${matchedAutomationId}`);
                    }
                }

                // 2. IDENTITY RESOLUTION & CONTACT UPSERT
                let contactIds: string[] = [];
                let resolvedUsername: string | null = null;
                let profileName: string | null = null;
                let profilePic: string | null = null;
                let primaryActivityId: string | null = null;

                // Try to fetch profile using the FIRST available token
                const primaryAccount = accountsData?.[0];
                if (primaryAccount && targetUserId) {
                    // console.log(`Fetching profile for ${targetUserId} (isEcho: ${isEcho})`);
                    const profile = await fetchInstagramProfile(targetUserId, primaryAccount.access_token);

                    if (profile) {
                        resolvedUsername = profile.username;
                        profileName = profile.name || profile.username;
                        profilePic = profile.profile_pic; // Fixed property name mapping
                    } else {
                        console.warn(`Profile Fetch Failed for ${targetUserId}, continuing with null username.`);
                    }
                }

                // Upsert Contact for ALL related dashboard users
                if (accountsData && accountsData.length > 0) {
                    for (const account of accountsData) {
                        const contact = await upsertContact(supabaseClient, {
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
                    const { data: loggedActivity } = await supabaseClient.from('automation_activities').insert({
                        user_id: account.user_id,
                        instagram_account_id: account.id,
                        contact_id: contactId,
                        automation_id: matchedAutomationId, // Included right from the start
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
                if (internalAccountId) {
                    // 🔒 DM LIMIT ENFORCEMENT — check before triggering any workflow
                    const dmUserId = accountsData[0].user_id;
                    const dmLimitExceeded = await checkUserDmLimit(supabaseClient, dmUserId);
                    if (dmLimitExceeded) {
                        console.warn(`[DM LIMIT] User ${dmUserId} has exceeded their DM limit. Skipping workflow trigger.`);
                        // Log a limit_exceeded activity so it's visible in the dashboard
                        await supabaseClient.from('automation_activities').insert({
                            user_id: dmUserId,
                            instagram_account_id: internalAccountId,
                            automation_id: matchedAutomationId,
                            activity_type: 'limit_exceeded',
                            target_username: resolvedUsername || 'Instagram User',
                            message: 'DM limit exceeded — automation skipped',
                            status: 'blocked',
                            metadata: { reason: 'dm_limit_exceeded', mid: msg.message?.mid }
                        });
                        continue;
                    }

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
                }
            }
        }
        if (entry.changes) {
            for (const change of entry.changes) {
                // IDEMPOTENCY CHECK (For changes/comments)
                const eventId = change.value?.id || await hashPayload(change);

                if (await isDuplicate(supabaseClient, eventId, account_id)) {
                    console.log("Duplicate Change Skipped:", eventId);
                    continue;
                }

                const legacyEntry = { id: account_id, time: Date.now(), changes: [change] };

                // FIX: Use internal UUID (same as DM routing)
                const internalAccountId = accountsData?.[0]?.id;

                if (!internalAccountId) {
                    console.error("No Internal Account ID found for comment routing.");
                    await logFailedEvent(supabaseClient, { event_id: eventId, payload: change }, "No Internal Account ID found for changes");
                    continue;
                }

                // 1. RESOLVE ROUTES FIRST (Fix 3: Early Exit for Untracked Comments)
                const mediaId = change.value?.media?.id || change.value?.media_id;
                let activeRoutes: { routes: any[]; workflows: any[] } = { routes: [], workflows: [] };
                let matchedAutomationId = null;

                if (internalAccountId) {
                    activeRoutes = await resolveRoutes(supabaseClient, internalAccountId, 'changes', change.field, mediaId);
                    const matchedWf = activeRoutes.workflows.find((w: any) => w.automation_id && activeRoutes.routes.some((r: any) => r.n8n_workflow_id === w.n8n_workflow_id));
                    if (matchedWf) matchedAutomationId = matchedWf.automation_id;
                }

                // 🔥 EARLY EXIT: If no routes found for a comment, stop here before heavy work
                if (change.field === 'comments' && activeRoutes.routes.length === 0) {
                    console.log(`[EARLY EXIT] No active routes found for comment on media ${mediaId}. Bailing out.`);
                    continue;
                }

                // 2. CONTACT UPSERT & LOG ACTIVITY
                let primaryActivityId: string | null = null;
                if (change.field === 'comments' && accountsData && accountsData.length > 0) {
                    // RESOLVE IDENTITY for comments
                    let resolvedUsername = change.value?.from?.username;
                    let profileName = null;
                    let profilePic = null;

                    const primaryAccount = accountsData[0];
                    if (primaryAccount && change.value?.from?.id) {
                        const profile = await fetchInstagramProfile(change.value.from.id, primaryAccount.access_token);
                        if (profile) {
                            resolvedUsername = profile.username || resolvedUsername;
                            profileName = profile.name;
                            profilePic = profile.profile_picture_url || profile.profile_pic;
                        }
                    }

                    for (const account of accountsData) {
                        // Upsert Contact for comments
                        const contact = await upsertContact(supabaseClient, {
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            instagram_user_id: change.value?.from?.id,
                            username: resolvedUsername,
                            full_name: profileName,
                            avatar_url: profilePic,
                            platform: 'instagram'
                        });

                        // LOG COMMENT AS ACTIVITY
                        const { data: loggedActivity } = await supabaseClient.from('automation_activities').insert({
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            contact_id: contact?.id || null,
                            automation_id: matchedAutomationId,
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

                if (internalAccountId && activeRoutes.routes.length > 0) {
                    // 🔒 DM LIMIT ENFORCEMENT for comment-triggered automations too
                    const commentUserId = accountsData[0].user_id;
                    const commentLimitExceeded = await checkUserDmLimit(supabaseClient, commentUserId);
                    if (commentLimitExceeded) {
                        console.warn(`[DM LIMIT] User ${commentUserId} has exceeded their DM limit. Skipping comment workflow trigger.`);
                        await supabaseClient.from('automation_activities').insert({
                            user_id: commentUserId,
                            instagram_account_id: internalAccountId,
                            automation_id: matchedAutomationId,
                            activity_type: 'limit_exceeded',
                            target_username: change.value?.from?.username || 'Instagram User',
                            message: 'DM limit exceeded — comment automation skipped',
                            status: 'blocked',
                            metadata: { reason: 'dm_limit_exceeded', field: change.field }
                        });
                    } else {
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
                }
            }
        }
    }
}

// Helpers
async function fetchInstagramProfile(senderId: string, accessToken: string) {
    // Stage 1: Try full profile (name, username, profile_pic)
    const stages = [
        `fields=name,username,profile_pic`,
        `fields=name,username`,
        `fields=username`
    ];

    for (const fields of stages) {
        try {
            const url = `https://graph.instagram.com/v21.0/${senderId}?${fields}&access_token=${accessToken}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`✅ Profile Fetch Success using: ${fields}`);
                return data;
            }

            const errData = await res.json();
            console.warn(`⚠️ Profile Fetch Stage Failed (${fields}):`, errData.error?.message);

            // If the error isn't about missing fields, don't bother with other stages
            if (!errData.error?.message?.includes('field')) break;

        } catch (e) {
            console.error(`❌ Profile Fetch Exception (${fields}):`, e);
            break;
        }
    }
    return null;
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

async function isDuplicate(supabaseClient: any, eventId: string, accountId: string): Promise<boolean> {
    // Try to insert event_id. If conflict -> it exists -> return true (is duplicate)
    const { error } = await supabaseClient
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

async function checkRateLimit(supabaseClient: any, accountId: string): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // Use an optimized query that only scans the last hour to prevent full table scans
    // and limits the count calculation to necessary rows only.
    const { count, error } = await supabaseClient
        .from('processed_events')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('created_at', oneMinuteAgo)
        .limit(601); // Only need to know if it exceeds 600

    if (error) { console.error("Rate Limit Check Error", error); return false; }
    return (count || 0) > 600; // Limit: 600 requests per minute
}

async function resolveRoutes(supabaseClient: any, account_id: string, event_type: string, sub_type: string, mediaId?: string, postbackPayload?: string) {
    let routes = [];
    let specificWorkflowId = null;

    // Priority 1: tracked_posts — specific post comment → specific workflow
    if (mediaId && mediaId !== 'undefined') {
        const { data: trackedData } = await supabaseClient.from('tracked_posts')
            .select('workflow_id').eq('media_id', mediaId).eq('platform', 'instagram').maybeSingle();
        if (trackedData) specificWorkflowId = trackedData.workflow_id;
    }

    // Priority 2: tracked_payloads — postback button tap OR keyword match → specific workflow
    if (!specificWorkflowId && postbackPayload) {
        // Pass 1: Fast lookup by account_id (correct path)
        const { data: payloadData } = await supabaseClient.from('tracked_payloads')
            .select('n8n_workflow_id')
            .eq('payload', postbackPayload)
            .eq('account_id', account_id)
            .maybeSingle();
        if (payloadData) {
            specificWorkflowId = payloadData.n8n_workflow_id;
            console.log(`[ROUTING] tracked_payloads hit for payload "${postbackPayload}" → workflow ${specificWorkflowId}`);
        } else {
            // Pass 2: Stale-ID fallback — look up via workflow IDs from automation_routes.
            // This handles the case where tracked_payloads was registered with an OLD account_id
            // (before self-healing corrected instagram_accounts.instagram_business_id).
            // We know automation_routes.account_id IS correct (updated by our fix or originally correct),
            // so we use those workflow IDs to cross-reference tracked_payloads by payload value alone.
            console.log(`[ROUTING] tracked_payloads miss for "${postbackPayload}" with account_id ${account_id} — trying stale-ID fallback`);
            const { data: accountRoutes } = await supabaseClient.from('automation_routes')
                .select('n8n_workflow_id')
                .eq('account_id', account_id)
                .eq('is_active', true);
            if (accountRoutes && accountRoutes.length > 0) {
                const wfIds = accountRoutes.map((r: any) => r.n8n_workflow_id);
                const { data: fallbackData } = await supabaseClient.from('tracked_payloads')
                    .select('n8n_workflow_id')
                    .eq('payload', postbackPayload)
                    .in('n8n_workflow_id', wfIds)
                    .maybeSingle();
                if (fallbackData) {
                    specificWorkflowId = fallbackData.n8n_workflow_id;
                    console.log(`[ROUTING] ✅ Stale-ID fallback resolved "${postbackPayload}" → workflow ${specificWorkflowId}. Auto-healing tracked_payloads...`);
                    // Auto-heal: correct the stale account_id so next lookup is fast
                    supabaseClient.from('tracked_payloads')
                        .update({ account_id: account_id })
                        .eq('n8n_workflow_id', fallbackData.n8n_workflow_id)
                        .then(() => console.log(`[ROUTING] ✅ tracked_payloads account_id healed for workflow ${fallbackData.n8n_workflow_id}`))
                        .catch((e: any) => console.error(`[ROUTING] Failed to heal tracked_payloads:`, e));
                } else {
                    console.log(`[ROUTING] Stale-ID fallback also missed for "${postbackPayload}" across ${wfIds.length} workflows`);
                }
            }
        }
    }

    if (specificWorkflowId) {
        routes = [{ n8n_workflow_id: specificWorkflowId }];
    } else {
        // Fallback: global automation_routes (old behaviour — covers plain DMs with no buttons)
        const { data: globalRoutes } = await supabaseClient.from('automation_routes')
            .select('n8n_workflow_id, sub_type')
            .eq('account_id', account_id)
            .eq('event_type', event_type)
            .eq('is_active', true)
            .or(`sub_type.eq.${sub_type},sub_type.is.null`);

        if (globalRoutes && globalRoutes.length > 0) routes = globalRoutes;
    }

    // Deduplicate
    const uniqueRoutes = [];
    const seen = new Set();
    for (const r of routes) {
        if (!seen.has(r.n8n_workflow_id)) { 
            seen.add(r.n8n_workflow_id); 
            uniqueRoutes.push(r); 
        }
    }

    if (uniqueRoutes.length === 0) {
        console.log(`[resolveRoutes] No active routes found for ${account_id} / ${event_type} / ${sub_type}`);
        return { routes: [], workflows: [] };
    }

    const workflowIds = uniqueRoutes.map((r: any) => r.n8n_workflow_id);
    console.log(`[resolveRoutes] Found unique workflow IDs: ${workflowIds.join(', ')}`);
    const { data: workflows } = await supabaseClient.from('n8n_workflows')
        .select('n8n_workflow_id, webhook_path, automation_id').in('n8n_workflow_id', workflowIds);

    return { routes: uniqueRoutes, workflows: workflows || [] };
}

async function triggerWorkflows(normalized: any, routes: any[], workflows: any[]) {
    const N8N_BASE_URL = Deno.env.get("N8N_BASE_URL");
    const N8N_API_KEY = Deno.env.get("X-N8N-API-KEY");

    if (!N8N_BASE_URL) console.error("Missing N8N_BASE_URL");

    const pathMap = new Map();
    workflows.forEach((w: any) => { if (w.webhook_path) pathMap.set(w.n8n_workflow_id, w.webhook_path); });

    // 🔥 PARALLEL PERFORMANCE FIX: Trigger all routes at once
    await Promise.all(routes.map(async (route) => {
        try {
            const webhookPath = pathMap.get(route.n8n_workflow_id);
            let targetUrl = `${N8N_BASE_URL}/api/v1/workflows/${route.n8n_workflow_id}/execute`;
            const headers: any = { "Content-Type": "application/json" };

            if (webhookPath) {
                targetUrl = `${N8N_BASE_URL}/webhook/${webhookPath}`;
            } else {
                headers["X-N8N-API-KEY"] = N8N_API_KEY;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const res = await fetch(targetUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(normalized),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`n8n responded with ${res.status}: ${await res.text()}`);
            console.log(`[n8n] Successfully triggered workflow: ${route.n8n_workflow_id}`);
        } catch (err) {
            console.error(`Failed to trigger workflow ${route.n8n_workflow_id}`, err);
        }
    }));
}

// 🔒 DM LIMIT CHECK — queries user's dm_limit from Supabase users table
// Returns true if user has EXCEEDED their limit (should block)
// dm_limit = null means unlimited, a number means enforce that limit
const DM_ACTIVITY_TYPES = ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction'];

async function checkUserDmLimit(supabaseClient: any, userId: string): Promise<boolean> {
    try {
        // 1. Get user's dm_limit from user_limits table (synced by sync-user-neon)
        const { data: userData, error: userError } = await supabaseClient
            .from('user_limits')
            .select('dm_limit, is_gifted')
            .eq('user_id', userId)
            .maybeSingle();

        if (userError || !userData) {
            console.warn(`[DM LIMIT] Could not fetch user limits for ${userId}:`, userError?.message);
            return false; // Fail open — don't block if we can't check
        }

        const dmLimit = userData.dm_limit;

        // null = unlimited (paid premium plans)
        if (dmLimit === null || dmLimit === undefined) {
            return false;
        }

        // 2. Count existing DM activities for this user
        const { count, error: countError } = await supabaseClient
            .from('automation_activities')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('activity_type', DM_ACTIVITY_TYPES);

        if (countError) {
            console.warn(`[DM LIMIT] Could not count DMs for ${userId}:`, countError.message);
            return false;
        }

        const currentCount = count || 0;
        const exceeded = currentCount >= dmLimit;
        if (exceeded) {
            console.log(`[DM LIMIT] User ${userId} at ${currentCount}/${dmLimit} — LIMIT EXCEEDED`);
        }
        return exceeded;
    } catch (e) {
        console.error(`[DM LIMIT] Exception checking limit for ${userId}:`, e);
        return false; // Fail open
    }
}

async function logFailedEvent(supabaseClient: any, payload: any, errorMessage: string) {
    const { error } = await supabaseClient
        .from('failed_events')
        .insert({
            event_id: payload.event_id,
            account_id: payload.account_id,
            payload: payload,
            error_message: errorMessage
        });

    if (error) console.error("Failed to log failed event:", error);
}
