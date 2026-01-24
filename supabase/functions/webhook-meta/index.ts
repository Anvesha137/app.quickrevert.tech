import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const N8N_BASE_URL = Deno.env.get("N8N_BASE_URL")!;
const N8N_API_KEY = Deno.env.get("X-N8N-API-KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
    const url = new URL(req.url);

    if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === META_VERIFY_TOKEN) return new Response(challenge, { status: 200 });
        return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "POST") {
        try {
            const signature = req.headers.get("x-hub-signature-256");
            const body = await req.text();
            if (!await verifySignature(signature, body, META_APP_SECRET)) {
                console.error("Invalid Signature");
                return new Response("Unauthorized", { status: 403 });
            }

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
    const object = body.object;
    const entries = body.entry || [];

    for (const entry of entries) {
        const account_id = entry.id;

        // RATE LIMITING CHECK
        if (await checkRateLimit(account_id)) {
            console.warn(`Rate Limit Exceeded for account ${account_id}`);
            continue;
        }

        if (entry.messaging) {
            for (const msg of entry.messaging) {
                const eventId = msg.message?.mid || msg.postback?.mid || await hashPayload(msg);

                if (await isDuplicate(eventId, account_id)) {
                    console.log("Duplicate Event Skipped:", eventId);
                    continue;
                }

                let sub_type = 'other';
                if (msg.message) sub_type = 'message';
                else if (msg.postback) sub_type = 'postback';

                await routeAndTrigger({ platform: object, account_id, event_type: 'messaging', sub_type, payload: msg, event_id: eventId });
            }
        }
        if (entry.changes) {
            for (const change of entry.changes) {
                // IDEMPOTENCY CHECK (For changes/comments)
                // Changes might not have a clear global ID, so checking value + time might be needed.
                // For simple comments, 'value.id' is the comment ID.
                const eventId = change.value?.id || await hashPayload(change);

                if (await isDuplicate(eventId, account_id)) {
                    console.log("Duplicate Change Skipped:", eventId);
                    continue;
                }

                await routeAndTrigger({ platform: object, account_id, event_type: 'changes', sub_type: change.field, payload: change, event_id: eventId });
            }
        }
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
    console.log("Routing:", normalized);

    const { data: routes, error } = await supabase
        .from('automation_routes')
        .select('n8n_workflow_id, sub_type')
        .eq('account_id', normalized.account_id)
        .eq('event_type', normalized.event_type) // e.g. 'messaging'
        .eq('is_active', true)
        .or(`sub_type.eq.${normalized.sub_type},sub_type.is.null`);

    if (error) { console.error("Route Lookup Error:", error); return; }
    if (!routes || routes.length === 0) { console.log("No active routes found."); return; }

    for (const route of routes) {
        try {
            console.log(`Triggering Workflow: ${route.n8n_workflow_id}`);
            const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${route.n8n_workflow_id}/execute`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-N8N-API-KEY": N8N_API_KEY },
                body: JSON.stringify(normalized)
            });
            if (!res.ok) throw new Error(`n8n responded with ${res.status}: ${await res.text()}`);
        } catch (err) {
            console.error(`Failed to trigger workflow ${route.n8n_workflow_id}`, err);
            await logFailedEvent(normalized, err instanceof Error ? err.message : String(err));
        }
    }
}

async function logFailedEvent(payload: any, errorMessage: string) {
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
