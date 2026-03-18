import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing authorization header');
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            throw new Error('Unauthorized');
        }

        console.log('🔍 WEBHOOK DIAGNOSTIC REPORT');
        console.log('═══════════════════════════════════════\n');

        const diagnostics: any = {
            timestamp: new Date().toISOString(),
            userId: user.id,
            checks: {}
        };

        // 1. Check Instagram Accounts
        console.log('1️⃣ Checking Instagram Accounts...');
        const { data: accounts, error: accountsError } = await supabase
            .from('instagram_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active');

        diagnostics.checks.instagram_accounts = {
            count: accounts?.length || 0,
            accounts: accounts?.map(a => ({
                id: a.id,
                username: a.username,
                instagram_user_id: a.instagram_user_id,
                instagram_business_id: a.instagram_business_id,
                has_access_token: !!a.access_token,
                token_expires_at: a.token_expires_at
            })) || [],
            error: accountsError?.message
        };
        console.log(`   ✅ Found ${accounts?.length || 0} active account(s)`);
        if (accounts && accounts.length > 0) {
            accounts.forEach(a => {
                console.log(`      - ${a.username} (IGBA: ${a.instagram_business_id})`);
            });
        }

        // 2. Check N8N Workflows
        console.log('\n2️⃣ Checking N8N Workflows...');
        const { data: workflows, error: workflowsError } = await supabase
            .from('n8n_workflows')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true);

        diagnostics.checks.n8n_workflows = {
            count: workflows?.length || 0,
            workflows: workflows?.map(w => ({
                id: w.id,
                name: w.name,
                n8n_workflow_id: w.n8n_workflow_id,
                webhook_path: w.webhook_path,
                webhook_url: w.webhook_url,
                trigger_type: w.trigger_type
            })) || [],
            error: workflowsError?.message
        };
        console.log(`   ✅ Found ${workflows?.length || 0} active workflow(s)`);
        if (workflows && workflows.length > 0) {
            workflows.forEach(w => {
                console.log(`      - ${w.name} (Path: ${w.webhook_path || 'N/A'})`);
            });
        }

        // 3. Check Automation Routes
        console.log('\n3️⃣ Checking Automation Routes...');
        if (accounts && accounts.length > 0) {
            for (const account of accounts) {
                const { data: routes, error: routesError } = await supabase
                    .from('automation_routes')
                    .select('*')
                    .eq('account_id', account.id)
                    .eq('is_active', true);

                console.log(`   Account: ${account.username}`);
                console.log(`   ✅ Found ${routes?.length || 0} active route(s)`);
                if (routes && routes.length > 0) {
                    routes.forEach(r => {
                        console.log(`      - ${r.event_type}/${r.sub_type || 'all'} → Workflow ${r.n8n_workflow_id}`);
                    });
                }

                if (!diagnostics.checks.automation_routes) {
                    diagnostics.checks.automation_routes = {};
                }
                diagnostics.checks.automation_routes[account.id] = {
                    account_username: account.username,
                    count: routes?.length || 0,
                    routes: routes || [],
                    error: routesError?.message
                };
            }
        }

        // 4. Check Recent Failed Events
        console.log('\n4️⃣ Checking Recent Failed Events (last 2 hours)...');
        const { data: failedEvents, error: failedError } = await supabase
            .from('failed_events')
            .select('*')
            .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

        diagnostics.checks.failed_events = {
            count: failedEvents?.length || 0,
            recent_events: failedEvents?.map(e => ({
                created_at: e.created_at,
                event_id: e.event_id,
                error_message: e.error_message,
                has_payload: !!e.payload
            })) || [],
            error: failedError?.message
        };
        console.log(`   ✅ Found ${failedEvents?.length || 0} recent failed event(s)`);
        if (failedEvents && failedEvents.length > 0) {
            failedEvents.slice(0, 3).forEach(e => {
                console.log(`      - ${e.created_at}: ${e.error_message}`);
            });
        }

        // 5. Check Recent Automation Activities
        console.log('\n5️⃣ Checking Recent Automation Activities (last 2 hours)...');
        const { data: activities, error: activitiesError } = await supabase
            .from('automation_activities')
            .select('*')
            .eq('user_id', user.id)
            .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

        diagnostics.checks.automation_activities = {
            count: activities?.length || 0,
            recent_activities: activities?.map(a => ({
                created_at: a.created_at,
                activity_type: a.activity_type,
                status: a.status,
                message: a.message
            })) || [],
            error: activitiesError?.message
        };
        console.log(`   ✅ Found ${activities?.length || 0} recent activity(ies)`);
        if (activities && activities.length > 0) {
            activities.slice(0, 3).forEach(a => {
                console.log(`      - ${a.created_at}: ${a.activity_type} (${a.status})`);
            });
        }

        // 6. Summary and Recommendations
        console.log('\n📊 SUMMARY');
        console.log('═══════════════════════════════════════');

        const issues: string[] = [];
        const recommendations: string[] = [];

        if (!accounts || accounts.length === 0) {
            issues.push('❌ No active Instagram accounts found');
            recommendations.push('Connect an Instagram account from the dashboard');
        }

        if (!workflows || workflows.length === 0) {
            issues.push('❌ No active n8n workflows found');
            recommendations.push('Create and activate a workflow in the dashboard');
        }

        if (accounts && workflows && accounts.length > 0 && workflows.length > 0) {
            let hasRoutes = false;
            for (const account of accounts) {
                const routes = diagnostics.checks.automation_routes?.[account.id]?.routes || [];
                if (routes.length > 0) {
                    hasRoutes = true;
                    break;
                }
            }

            if (!hasRoutes) {
                issues.push('❌ No automation routes configured');
                recommendations.push('Routes should be automatically created when you activate a workflow');
                recommendations.push('Check if workflow activation completed successfully');
            }
        }

        if (failedEvents && failedEvents.length > 0) {
            const recentWebhooks = failedEvents.filter(e =>
                e.error_message?.includes('DEBUG: Meta Webhook Received') ||
                e.error_message?.includes('DEBUG: Webhook Received')
            );

            if (recentWebhooks.length > 0) {
                console.log(`✅ Webhooks ARE being received (${recentWebhooks.length} in last 2 hours)`);
                diagnostics.webhooks_received = true;
            } else {
                issues.push('⚠️  No webhook reception logs found in last 2 hours');
                recommendations.push('Send a test DM to your Instagram account to trigger a webhook');
            }
        }

        diagnostics.issues = issues;
        diagnostics.recommendations = recommendations;

        if (issues.length > 0) {
            console.log('\n⚠️  ISSUES FOUND:');
            issues.forEach(issue => console.log(`   ${issue}`));
        }

        if (recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            recommendations.forEach(rec => console.log(`   ${rec}`));
        }

        console.log('\n═══════════════════════════════════════\n');

        return new Response(JSON.stringify(diagnostics, null, 2), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Diagnostic error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
