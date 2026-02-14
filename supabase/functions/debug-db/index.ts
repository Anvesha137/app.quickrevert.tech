
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        const url = new URL(req.url);
        const trace = { log: [] as string[] };
        const log = (msg: string) => {
            console.log(msg);
            trace.log.push(msg);
        };

        if (req.method === "GET") {
            // ... existing dump logic ...
            // Not critical for now, keeping simple dump
        }

        if (req.method === "POST") {
            try {
                const body = await req.json();
                log(`DEBUG: Body keys: ${Object.keys(body).join(',')}`);

                // --- CREATE ROUTE (Helper) - Moved to TOP ---
                if (body.create_route) {
                    log(`Create Route Request: Acc=${body.account_id}, WF=${body.workflow_id}`);
                    if (!body.account_id || !body.workflow_id) {
                        return new Response(JSON.stringify({ error: "Missing account_id or workflow_id" }), { headers: corsHeaders });
                    }

                    // Fetch user_id from instagram_accounts
                    const { data: accData, error: accError } = await supabase
                        .from('instagram_accounts')
                        .select('user_id')
                        .eq('id', body.account_id)
                        .maybeSingle(); // Changed to maybeSingle to avoid errors on no rows

                    if (accError || !accData) {
                        return new Response(JSON.stringify({ error: "Invalid Account ID, user_id not found" }), { headers: corsHeaders });
                    }

                    const { data, error } = await supabase
                        .from('automation_routes')
                        .insert({
                            user_id: accData.user_id, // REQUIRED
                            account_id: body.account_id,
                            n8n_workflow_id: body.workflow_id,
                            event_type: body.event_type || 'messaging',
                            sub_type: body.sub_type || null,
                            is_active: true
                        })
                        .select();

                    if (error) {
                        log(`❌ Create Route Failed: ${error.message}`);
                        return new Response(JSON.stringify({ trace, error: error.message }, null, 2), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" },
                        });
                    } else {
                        log(`✅ Create Route Success: ${JSON.stringify(data)}`);
                        return new Response(JSON.stringify({ trace, data }, null, 2), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" },
                        });
                    }
                }

                // --- DELETE ROUTE (Helper) ---
                if (body.delete_route) {
                    log(`Deleting route: ${body.route_id}`);

                    const { error } = await supabase
                        .from('automation_routes')
                        .delete()
                        .eq('id', body.route_id);

                    if (error) {
                        log(`❌ Delete Failed: ${error.message}`);
                        return new Response(JSON.stringify({ trace, error: error.message }), { headers: corsHeaders });
                    }

                    log(`✅ Route deleted`);
                    return new Response(JSON.stringify({ trace, success: true }), { headers: corsHeaders });
                }

                // --- FIX ROUTE SUBTYPE (Helper) ---
                if (body.fix_route_subtype) {
                    log(`Fixing route sub_type for route: ${body.route_id}`);

                    const { data, error } = await supabase
                        .from('automation_routes')
                        .update({ sub_type: 'message' })
                        .eq('id', body.route_id)
                        .select();

                    if (error) {
                        log(`❌ Update Failed: ${error.message}`);
                        return new Response(JSON.stringify({ trace, error: error.message }), { headers: corsHeaders });
                    }

                    log(`✅ Route updated with sub_type='message'`);
                    return new Response(JSON.stringify({ trace, data }), { headers: corsHeaders });
                }

                // --- COPY ACCOUNT TWEAK (Helper) ---
                if (body.copy_account_tweak) {
                    log(`Patching Account: Source=${body.source_account_id} -> TargetIG=${body.target_ig_id}`);

                    // 1. Get Source Data
                    const { data: source, error: srcErr } = await supabase
                        .from('instagram_accounts')
                        .select('*')
                        .eq('id', body.source_account_id)
                        .single();

                    if (srcErr || !source) {
                        return new Response(JSON.stringify({ error: "Source Account Not Found" }), { headers: corsHeaders });
                    }

                    // 2. Insert New Account (Duplicate with new IG ID)
                    // Remove 'id' so it generates a new one. Update instagram_user_id.
                    const newAccount = { ...source };
                    delete newAccount.id;
                    delete newAccount.created_at;
                    delete newAccount.updated_at;
                    newAccount.instagram_user_id = body.target_ig_id;
                    newAccount.username = newAccount.username + "_patch"; // suffix to avoid unique constraint if username is unique? Usually only ID is.

                    const { data: inserted, error: insErr } = await supabase
                        .from('instagram_accounts')
                        .insert(newAccount)
                        .select()
                        .single();

                    if (insErr) {
                        log(`❌ Insert Fail: ${insErr.message}`);
                        // If it failed because it exists, try to fetch it
                        if (insErr.code === '23505') {
                            log("Account already exists, proceeding to route check.");
                        } else {
                            return new Response(JSON.stringify({ trace, error: insErr.message }), { headers: corsHeaders });
                        }
                    } else {
                        log(`✅ Inserted New Internal Account: ${inserted.id}`);
                    }

                    // 3. Get the ID (either inserted or existing)
                    const { data: targetAccount } = await supabase
                        .from('instagram_accounts')
                        .select('id, user_id')
                        .eq('instagram_user_id', body.target_ig_id)
                        .single();

                    if (!targetAccount) return new Response(JSON.stringify({ error: "Could not retrieve target account" }), { headers: corsHeaders });

                    // 4. Create Route
                    const { data: route, error: routeErr } = await supabase
                        .from('automation_routes')
                        .insert({
                            user_id: targetAccount.user_id,
                            account_id: targetAccount.id,
                            n8n_workflow_id: body.workflow_id,
                            event_type: 'messaging',
                            is_active: true
                        })
                        .select();

                    if (routeErr) log(`⚠️ Route Create Warn: ${routeErr.message}`);
                    else log(`✅ Route Created for New Account.`);

                    return new Response(JSON.stringify({ trace, targetAccount, route }), { headers: corsHeaders });
                }

                // --- FIX ROUTES (Helper) ---
                if (body.fix_routes) {
                    log("Fixing Routes...");

                    const correctUUID = 'b8052d33-a63a-42d5-8bc5-7094d8716f76';
                    const correctWorkflow = 'NkcwXefOijzi1XhP';

                    // 1. Delete the bad route (KqAQ...) for this account
                    const { error: delError } = await supabase
                        .from('automation_routes')
                        .delete()
                        .eq('account_id', correctUUID)
                        .eq('n8n_workflow_id', 'KqAQ7y21axJKZUll');

                    if (delError) log(`❌ Delete Bad Route Failed: ${delError.message}`);
                    else log("✅ Deleted Bad Route (KqAQ...)");

                    // 2. Update the good route (Nkcw...) to use the UUID
                    // It currently has account_id = '25404995002437490'
                    const { data: routeToFix, error: findError } = await supabase
                        .from('automation_routes')
                        .select('id')
                        .eq('n8n_workflow_id', correctWorkflow)
                        .eq('account_id', '25404995002437490') // The IG ID
                        .single();

                    if (findError || !routeToFix) {
                        log(`⚠️ Could not find route with IG ID. Checking if already fixed...`);
                        const { data: fixedRoute } = await supabase
                            .from('automation_routes')
                            .select('id')
                            .eq('n8n_workflow_id', correctWorkflow)
                            .eq('account_id', correctUUID)
                            .single();

                        if (fixedRoute) log("✅ Route already has correct UUID.");
                        else log("❌ Route for Nkcw... not found at all.");

                    } else {
                        const { error: updateError } = await supabase
                            .from('automation_routes')
                            .update({ account_id: correctUUID })
                            .eq('id', routeToFix.id);

                        if (updateError) log(`❌ Update Route Failed: ${updateError.message}`);
                        else log("✅ Updated Route (Nkcw...) to use UUID.");
                    }

                    return new Response(JSON.stringify({ trace }), { headers: corsHeaders });
                }

                // --- LOOKUP ACCOUNT ID (Helper) ---
                if (body.lookup_account_id) {
                    log(`Looking up account with instagram_user_id: '${body.lookup_account_id}'`);
                    const { data: accounts, error } = await supabase
                        .from('instagram_accounts')
                        .select('id, access_token, user_id, instagram_user_id')
                        .eq('instagram_user_id', body.lookup_account_id);

                    if (error) {
                        log(`❌ Lookup Error: ${error.message}`);
                    } else {
                        log(`✅ Lookup found ${accounts?.length || 0} rows.`);
                        if (accounts && accounts.length > 0) {
                            log(`FIRST MATCH: ${JSON.stringify(accounts[0])}`);
                        } else {
                            log(`❌ NO MATCH FOUND for '${body.lookup_account_id}'`);
                        }
                    }
                    return new Response(JSON.stringify({ trace, count: accounts?.length, accounts }, null, 2), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // --- CHECK IG DETAILS (Helper) ---
                if (body.check_ig_details_id) {
                    // ... skipping for brevity as not critical for this fix ...
                }

                // FALLBACK: Dump recent activity
                log("Dumping Recent Activity (Fallback)");

                const { data: accounts } = await supabase.from('instagram_accounts').select('*').limit(5);
                const { data: failures } = await supabase.from('failed_events').select('*').order('created_at', { ascending: false }).limit(5);
                const { data: activities } = await supabase.from('automation_activities').select('*').order('created_at', { ascending: false }).limit(5);
                const { data: routes } = await supabase.from('automation_routes').select('*').limit(20);

                return new Response(JSON.stringify({
                    trace,
                    accounts,
                    routes,
                    failures,
                    activities
                }, null, 2), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });

            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders, status: 500 });
            }
        }

        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders, status: 500 });
    }
});
