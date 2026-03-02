
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://quickrevert.jiobase.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud2lqaHFvcXZ3enRwYmFobGx5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzU5ODU2OCwiZXhwIjoyMDgzMTc0NTY4fQ.qgFAZRYHuU2XDLkDCxF6O70McSKeEmFQNS-xPcnazfY';

const supabase = createClient(SUPABASE_URL, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function debugInteractions() {
    const targetUsername = 's.tella.ai';
    console.log(`Checking ${targetUsername}...`);

    try {
        const { data: activities, error } = await supabase
            .from('automation_activities')
            .select('*')
            .ilike('target_username', `%${targetUsername}%`)
            .order('created_at', { ascending: false });

        if (error) {
            fs.writeFileSync('debug_results.json', JSON.stringify({ error }, null, 2));
            return;
        }

        const result = {
            total: activities?.length || 0,
            psid_count: activities?.filter(a => a.metadata?.raw_id || a.metadata?.sender_id || a.metadata?.from?.id).length || 0,
            sample: activities?.slice(0, 10).map(a => ({
                id: a.id,
                type: a.activity_type,
                created_at: a.created_at,
                psid: a.metadata?.raw_id || a.metadata?.sender_id || a.metadata?.from?.id || null,
                username: a.target_username,
                account_id: a.instagram_account_id,
                user_id: a.user_id,
                metadata_field: a.metadata?.field
            }))
        };

        fs.writeFileSync('debug_results.json', JSON.stringify(result, null, 2));
        console.log('Done.');
    } catch (err) {
        fs.writeFileSync('debug_results.json', JSON.stringify({ error: String(err) }, null, 2));
    }
}

debugInteractions();
