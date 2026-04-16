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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const entries = body.entry || [];
    const object = body.object || 'instagram';
    console.log(`[BOUNCER] Processing ${entries.length} entries for ${object}`);

    for (const entry of entries) {
        const account_id = String(entry.id);

        // 1. FAST ACCOUNT LOOKUP
        const { data: accountsData } = await supabaseClient
            .from('instagram_accounts')
            .select('id, access_token, user_id, username, active_automations_count')
            .or(`instagram_business_id.eq.${account_id},instagram_user_id.eq.${account_id}`)
            .eq('status', 'active');

        if (!accountsData || accountsData.length === 0 || accountsData[0].active_automations_count === 0) {
            console.log(`[BOUNCER] Skipping account ${account_id}: No active automations found.`);
            continue;
        }

        const internalAccountId = accountsData[0].id;
        const userId = accountsData[0].user_id;

        // 2. PROCESS MESSAGES (DMs)
        if (entry.messaging) {
            for (const msg of entry.messaging) {
                if (msg.delivery || msg.read) continue;

                const isEcho = msg.message?.is_echo || false;
                const targetUserId = isEcho ? msg.recipient?.id : msg.sender?.id;
                const eventId = msg.message?.mid || msg.postback?.mid || await hashPayload(msg);

                if (await isDuplicate(supabaseClient, eventId, account_id)) continue;

                const sub_type = (msg.postback || msg.message?.quick_reply) ? 'postback' : (msg.message ? 'message' : 'other');

                // 🚀 SPEED: RESOLVE & TRIGGER FIRST
                const activeRoutes = await resolveRoutes(supabaseClient, internalAccountId, 'messaging', sub_type);
                
                if (activeRoutes.routes.length > 0 && !isEcho) {
                    // Pre-trigger limit check
                    const limitExceeded = await checkUserDmLimit(supabaseClient, userId);
                    if (limitExceeded) {
                        console.warn(`[LIMIT] User ${userId} exceeded limit. Skipping trigger.`);
                        continue;
                    }

                    const normalized = { object, entry: [{ id: account_id, time: entry.time, messaging: [msg] }] };
                    triggerWorkflows(normalized, activeRoutes.routes, activeRoutes.workflows).catch(e => console.error("Trigger Err:", e));
                    console.log(`[BOUNCER] Fast-triggered DMs for account ${account_id}`);
                }

                // 📥 BACKGROUND: Dashboard, Identity, Contacts
                (async () => {
                    try {
                        const targetAcc = accountsData[0];
                        if (!targetAcc || !targetUserId) return;

                        // Identity Caching
                        const { data: contactCache } = await supabaseClient
                            .from('contacts')
                            .select('id, username, full_name, avatar_url')
                            .eq('instagram_user_id', targetUserId)
                            .eq('user_id', userId)
                            .maybeSingle();
                        
                        let username = contactCache?.username;
                        let fullName = contactCache?.full_name;
                        let avatar = contactCache?.avatar_url;

                        if (!username || !avatar) {
                            const profile = await fetchInstagramProfile(targetUserId, targetAcc.access_token);
                            if (profile) {
                                username = profile.username;
                                fullName = profile.name;
                                avatar = profile.profile_pic;
                            }
                        }

                        const activityMsg = msg.message?.text || (msg.message?.attachments ? 'Sent an attachment' : 'Interaction');

                        await Promise.all(accountsData.map(async (acc) => {
                            const contact = await upsertContact(supabaseClient, {
                                user_id: acc.user_id,
                                instagram_account_id: acc.id,
                                instagram_user_id: targetUserId,
                                username: username,
                                full_name: fullName,
                                avatar_url: avatar,
                                platform: 'instagram'
                            });

                            if (contact) {
                                await supabaseClient.from('automation_activities').insert({
                                    user_id: acc.user_id,
                                    instagram_account_id: acc.id,
                                    contact_id: contact.id,
                                    activity_type: isEcho ? 'send_dm' : 'incoming_message',
                                    content: activityMsg,
                                    metadata: { mid: eventId, sub_type, is_echo: isEcho }
                                });
                            }
                        }));
                    } catch (e) {
                        console.error("DM Background task critical fail:", e);
                    }
                })();
            }
        }

        // 3. PROCESS CHANGES (Comments)
        if (entry.changes) {
            for (const change of entry.changes) {
                if (change.field !== 'comments') continue;

                const eventId = change.value?.id || await hashPayload(change);
                if (await isDuplicate(supabaseClient, eventId, account_id)) continue;

                const mediaId = change.value?.media?.id || change.value?.media_id;
                
                // 🚀 SPEED: RESOLVE & TRIGGER FIRST
                const activeRoutes = await resolveRoutes(supabaseClient, internalAccountId, 'changes', 'comments', mediaId);
                
                if (activeRoutes.routes.length > 0) {
                    const limitExceeded = await checkUserDmLimit(supabaseClient, userId);
                    if (limitExceeded) continue;

                    const payloadData = {
                        platform: 'instagram',
                        account_id: internalAccountId,
                        event_type: 'changes',
                        sub_type: 'comments',
                        payload: change,
                        entry: [{ id: account_id, time: Date.now(), changes: [change] }],
                        event_id: eventId
                    };

                    triggerWorkflows(payloadData, activeRoutes.routes, activeRoutes.workflows).catch(e => console.error("Comment Trigger Err:", e));
                    console.log(`[BOUNCER] Fast-triggered Comment for media ${mediaId} on account ${account_id}`);
                }

                // 📥 BACKGROUND: Identity Resolution & Dashboard Sync
                (async () => {
                    try {
                        const commenterId = change.value?.from?.id;
                        if (!commenterId) return;

                        // Identity Caching
                        const { data: contactCache } = await supabaseClient
                            .from('contacts')
                            .select('id, username, avatar_url')
                            .eq('instagram_user_id', commenterId)
                            .eq('user_id', userId)
                            .maybeSingle();
                        
                        let username = contactCache?.username || change.value?.from?.username;
                        let avatar = contactCache?.avatar_url;

                        if (!avatar) {
                            const profile = await fetchInstagramProfile(commenterId, accountsData[0].access_token);
                            if (profile) {
                                username = profile.username || username;
                                avatar = profile.profile_pic;
                            }
                        }

                        await Promise.all(accountsData.map(async (acc) => {
                            const contact = await upsertContact(supabaseClient, {
                                user_id: acc.user_id,
                                instagram_account_id: acc.id,
                                instagram_user_id: commenterId,
                                username: username,
                                platform: 'instagram',
                                avatar_url: avatar
                            });

                            if (contact) {
                                await supabaseClient.from('automation_activities').insert({
                                    user_id: acc.user_id,
                                    instagram_account_id: acc.id,
                                    contact_id: contact.id,
                                    activity_type: 'comment',
                                    content: change.value?.text || 'Post comment',
                                    metadata: { 
                                        direction: 'inbound', 
                                        media_id: mediaId, 
                                        field: change.field, 
                                        mid: eventId 
                                    }
                                });
                            }
                        }));
                    } catch (e) {
                        console.error("Comment background task fail:", e);
                    }
                })();
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

            const res = await fetch(targetUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(normalized)
            });

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
