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

            // DEBUG: Log raw payload to failed_events
            try {
                const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
                const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                await supabase.from('failed_events').insert({
                    event_id: 'debug-meta-' + Date.now(),
                    payload: json,
                    error_message: 'DEBUG: Meta Webhook Received'
                });
            } catch (e) {
                console.error('Debug log failed', e);
            }

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const object = body.object;
    const entries = body.entry || [];

    // DEBUG: Log full webhook payload
    console.log("[WEBHOOK DEBUG] Full payload:", JSON.stringify(body, null, 2));
    console.log("[WEBHOOK DEBUG] Number of entries:", entries.length);

    for (const entry of entries) {
        const account_id = String(entry.id); // ✅ CRITICAL: Convert to string for DB comparison!

        // DEBUG: Log entry details
        console.log("[WEBHOOK DEBUG] Entry ID:", account_id, "Type:", typeof account_id);
        console.log("[WEBHOOK DEBUG] Full entry:", JSON.stringify(entry, null, 2));

        // FETCH ALL ACCOUNT DETAILS (access_token, user_id)
        // ✅ CRITICAL: Webhooks send IGBA ID in entry.id, so check BOTH fields!
        // ✅ CRITICAL FIX: Look up by instagram_business_id (Page-scoped IGBA ID)
        console.log(`[ACCOUNT LOOKUP] Searching for account with IGBA ID: ${account_id}`);

        // 🔥 CRITICAL FIX: Handle type mismatch - convert both to text for comparison
        // The webhook sends a string, but the DB column might be bigint
        // 🔥 NEW SELF-HEALING LOOKUP LOGIC
        // 1. Initial Lookup handling type mismatches
        let { data: accountsData, error: accountsError } = await supabase
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
                const { data: candidates } = await supabase
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

                                    await supabase
                                        .from('instagram_accounts')
                                        .update({ instagram_business_id: account_id })
                                        .eq('id', candidate.id);

                                    // Success! Fetch the updated record
                                    const { data: healedData } = await supabase
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
            await logFailedEvent({
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
                    await supabase
                        .from('instagram_accounts')
                        .update({ instagram_business_id: account_id })
                        .eq('id', account.id);
                }
            }
        }

        // RATE LIMITING CHECK
        if (await checkRateLimit(account_id)) {
            console.warn(`Rate Limit Exceeded for account ${account_id}`);
            continue;
        }

        if (entry.messaging) {
            for (const msg of entry.messaging) {
                // STOP INFINITE LOOPS: Ignore Echoes and Self-Sent messages
                if (msg.message?.is_echo) {
                    console.log("Ignored Bot Echo");
                    continue;
                }
                // Ignore Delivery/Read receipts
                if (msg.delivery || msg.read) {
                    continue;
                }

                const eventId = msg.message?.mid || msg.postback?.mid || await hashPayload(msg);

                if (await isDuplicate(eventId, account_id)) {
                    console.log("Duplicate Event Skipped:", eventId);
                    continue;
                }

                // 1. IDENTITY RESOLUTION & CONTACT UPSERT
                // We must resolve the contact BEFORE logging activity or triggering automation.
                let contactIds: string[] = [];
                let resolvedUsername: string | null = null;
                let profileName: string | null = null;
                let profilePic: string | null = null;

                // Try to fetch profile using the FIRST available token
                const primaryAccount = accountsData?.[0];
                if (primaryAccount && msg.sender?.id) {
                    console.log(`Fetching profile for ${msg.sender.id}`);
                    const profile = await fetchInstagramProfile(msg.sender.id, primaryAccount.access_token);

                    if (profile) {
                        resolvedUsername = profile.username;
                        profileName = profile.name || profile.username;
                        profilePic = profile.profile_picture_url;
                    } else {
                        console.warn(`Profile Fetch Failed for ${msg.sender.id}, continuing with null username.`);
                    }
                }

                // Upsert Contact for ALL related dashboard users
                // ALWAYS RUN THIS regardless of profile fetch success
                if (accountsData && accountsData.length > 0) {
                    for (const account of accountsData) {
                        const contact = await upsertContact(supabase, {
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            instagram_user_id: msg.sender.id,
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

                    if (msg.message) {
                        // Only log DMs here, or whatever we decided (event_type check)
                        await supabase.from('automation_activities').insert({
                            user_id: account.user_id,
                            instagram_account_id: account.id,
                            contact_id: contactId,
                            activity_type: 'dm', // Assume DM for messaging entry
                            target_username: 'system_managed',
                            message: activityMsg,
                            status: 'success',
                            metadata: { direction: 'inbound', raw_id: msg.sender.id, resolved: !!resolvedUsername }
                        });
                    }
                }

                let sub_type = 'other';
                if (msg.message) sub_type = 'message';
                else if (msg.postback) sub_type = 'postback';

                // 3. TRIGGER AUTOMATION
                // Enrich payload with contact_id for N8n (so it can use it if needed)
                msg.contact_ids = contactIds;
                if (resolvedUsername) msg.sender_name = resolvedUsername; // Legacy compat

                // FLAGGING BASIC DISPLAY TOKEN
                // This informs N8n to NOT try to use the Graph API for replies if not supported.
                msg.is_basic_display = true;

                const legacyEntry = { id: account_id, time: Date.now(), messaging: [msg] };

                // FIX: Use the Internal UUID (accountsData[0].id) for routing, NOT the Instagram ID (entry.id)
                // automation_routes.account_id is a UUID foreign key.
                const internalAccountId = accountsData?.[0]?.id;

                if (internalAccountId) {
                    // 🔥 CRITICAL FIX: Call execute-automation for dashboard automations
                    // This triggers automations created in the dashboard (automations table)
                    for (const account of accountsData) {
                        try {
                            const executeUrl = `${SUPABASE_URL}/functions/v1/execute-automation`;
                            console.log(`Calling execute-automation for user ${account.user_id}`);

                            const executeResponse = await fetch(executeUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                },
                                body: JSON.stringify({
                                    userId: account.user_id,
                                    instagramAccountId: account.id,
                                    triggerType: 'user_directed_messages',
                                    eventData: {
                                        messageId: msg.message?.mid,
                                        messageText: msg.message?.text,
                                        from: {
                                            id: msg.sender?.id,
                                            username: resolvedUsername || msg.sender?.id,
                                            name: profileName
                                        },
                                        timestamp: msg.timestamp
                                    }
                                })
                            });

                            if (!executeResponse.ok) {
                                const errorText = await executeResponse.text();
                                console.error(`execute-automation failed: ${errorText}`);
                                await logFailedEvent({ event_id: eventId, payload: msg }, `execute-automation failed: ${errorText}`);
                            } else {
                                console.log('✅ execute-automation called successfully');
                            }
                        } catch (execError: any) {
                            console.error('Error calling execute-automation:', execError);
                            await logFailedEvent({ event_id: eventId, payload: msg }, `execute-automation error: ${execError.message}`);
                        }
                    }

                    // Also route to n8n workflows via automation_routes (existing system)
                    await routeAndTrigger({
                        platform: object,
                        account_id: internalAccountId, // Pass UUID
                        event_type: 'messaging',
                        sub_type,
                        payload: msg,
                        entry: [legacyEntry],
                        event_id: eventId,
                        is_basic_display: true
                    });
                } else {
                    console.error("No Internal Account ID found for routing.");
                    await logFailedEvent({ event_id: eventId, payload: msg }, "No Internal Account ID found (accountsData empty)");
                }
            }
        }
        if (entry.changes) {
            for (const change of entry.changes) {
                // IDEMPOTENCY CHECK (For changes/comments)
                const eventId = change.value?.id || await hashPayload(change);

                if (await isDuplicate(eventId, account_id)) {
                    console.log("Duplicate Change Skipped:", eventId);
                    continue;
                }

                const legacyEntry = { id: account_id, time: Date.now(), changes: [change] };

                // FIX: Use internal UUID (same as DM routing)
                const internalAccountId = accountsData?.[0]?.id;

                if (!internalAccountId) {
                    console.error("No Internal Account ID found for comment routing.");
                    await logFailedEvent({ event_id: eventId, payload: change }, "No Internal Account ID found for changes");
                    continue;
                }

                // 🔥 CRITICAL FIX: Call execute-automation for dashboard automations (comments)
                if (change.field === 'comments' && accountsData && accountsData.length > 0) {
                    for (const account of accountsData) {
                        try {
                            const executeUrl = `${SUPABASE_URL}/functions/v1/execute-automation`;
                            console.log(`Calling execute-automation for comment on user ${account.user_id}`);

                            const executeResponse = await fetch(executeUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                },
                                body: JSON.stringify({
                                    userId: account.user_id,
                                    instagramAccountId: account.id,
                                    triggerType: 'post_comment',
                                    eventData: {
                                        commentId: change.value?.id,
                                        commentText: change.value?.text,
                                        postId: change.value?.media?.id,
                                        from: {
                                            id: change.value?.from?.id,
                                            username: change.value?.from?.username || change.value?.from?.id
                                        },
                                        timestamp: change.value?.timestamp
                                    }
                                })
                            });

                            if (!executeResponse.ok) {
                                const errorText = await executeResponse.text();
                                console.error(`execute-automation (comment) failed: ${errorText}`);
                            } else {
                                console.log('✅ execute-automation (comment) called successfully');
                            }
                        } catch (execError: any) {
                            console.error('Error calling execute-automation for comment:', execError);
                        }
                    }
                }

                // Also route to n8n workflows via automation_routes (existing system)
                await routeAndTrigger({
                    platform: object,
                    account_id: internalAccountId, // UUID, not Instagram ID
                    event_type: 'changes',
                    sub_type: change.field,
                    payload: change,
                    entry: [legacyEntry],
                    event_id: eventId
                });
            }
        }
    }
}

// Helpers
async function fetchInstagramProfile(senderId: string, accessToken: string) {
    try {
        const url = `https://graph.facebook.com/v21.0/${senderId}?fields=username,name,profile_picture_url&access_token=${accessToken}`;
        const res = await fetch(url);
        if (res.ok) {
            return await res.json();
        }
        const errText = await res.text();
        console.error(`Profile Fetch Failed (${res.status}):`, errText);
        // We can't log to DB here easily without passing supabase client, handled by caller
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

async function isDuplicate(eventId: string, accountId: string): Promise<boolean> {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to insert event_id. If conflict -> it exists -> return true (is duplicate)
    const { error } = await supabase
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

async function checkRateLimit(accountId: string): Promise<boolean> {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count, error } = await supabase
        .from('processed_events')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('created_at', oneMinuteAgo);

    if (error) { console.error("Rate Limit Check Error", error); return false; }
    return (count || 0) > 600; // Limit: 600 requests per minute
}

async function routeAndTrigger(normalized: any) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const N8N_BASE_URL = Deno.env.get("N8N_BASE_URL");
    const N8N_API_KEY = Deno.env.get("X-N8N-API-KEY");

    if (!N8N_BASE_URL) console.error("Missing N8N_BASE_URL");
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

    let routes = [];

    if (specificWorkflowId) {
        // If specific match found, we ONLY trigger that one.
        routes = [{ n8n_workflow_id: specificWorkflowId }];
    } else {
        // 2. Fallback: Global Routes
        const { data: globalRoutes, error } = await supabase
            .from('automation_routes')
            .select('n8n_workflow_id, sub_type')
            .eq('account_id', normalized.account_id)
            .eq('event_type', normalized.event_type) // e.g. 'messaging'
            .eq('is_active', true)
            .or(`sub_type.eq.${normalized.sub_type},sub_type.is.null`);

        if (error) { console.error("Route Lookup Error:", error); return; }
        routes = globalRoutes || [];
    }

    if (!routes || routes.length === 0) { console.log("No active routes found (Specific or Global)."); return; }

    // Resolve Webhook Paths
    const workflowIds = routes.map(r => r.n8n_workflow_id);
    const { data: workflows, error: wfError } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id, webhook_path')
        .in('n8n_workflow_id', workflowIds);

    if (wfError) console.error("Workflow Lookup Error:", wfError);

    const pathMap = new Map();
    if (workflows) {
        workflows.forEach((w: any) => {
            if (w.webhook_path) pathMap.set(w.n8n_workflow_id, w.webhook_path);
        });
    }

    for (const route of routes) {
        try {
            const webhookPath = pathMap.get(route.n8n_workflow_id);
            let targetUrl = `${N8N_BASE_URL}/api/v1/workflows/${route.n8n_workflow_id}/execute`; // Fallback

            if (webhookPath) {
                targetUrl = `${N8N_BASE_URL}/webhook/${webhookPath}`;
                // console.log(`Triggering Workflow via Webhook: ${route.n8n_workflow_id} -> ${webhookPath}`);
            } else {
                // console.log(`Triggering Workflow via Execute (No Path): ${route.n8n_workflow_id}`);
            }

            await logFailedEvent({ ...normalized, event_id: `debug-n8n-attempt-${Date.now()}` }, `DEBUG: Attempting ${targetUrl}`);

            // Headers: Execute needs API Key, Webhook might not (but good to verify)
            const headers: any = { "Content-Type": "application/json" };
            if (!webhookPath) headers["X-N8N-API-KEY"] = N8N_API_KEY;

            const res = await fetch(targetUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(normalized)
            });

            await logFailedEvent({ ...normalized, event_id: `debug-n8n-response-${Date.now()}` }, `DEBUG: N8n Responded ${res.status} ${res.statusText}`);

            if (!res.ok) throw new Error(`n8n responded with ${res.status}: ${await res.text()}`);
        } catch (err) {
            console.error(`Failed to trigger workflow ${route.n8n_workflow_id}`, err);
            await logFailedEvent(normalized, `N8N ERROR: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

async function logFailedEvent(payload: any, errorMessage: string) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
        .from('failed_events')
        .insert({
            event_id: payload.event_id,
            account_id: payload.account_id,
            payload: payload,
            error_message: errorMessage
        });

    if (error) console.error("Failed to log failed event:", error);
}
