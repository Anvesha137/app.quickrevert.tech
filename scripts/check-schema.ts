
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function checkSchema() {
    console.log('Checking contacts table schema...');

    // Try to insert a dummy record with the new column (and rollback or fail)
    // Or just try to select it.

    const { data, error } = await supabase
        .from('contacts')
        .select('interacted_automations')
        .limit(1);

    if (error) {
        console.error('Error selecting interacted_automations column:', error);
    } else {
        console.log('Column interacted_automations exists. Data sample:', data);
    }

    // Also check automation_activities for automation_id
    const { data: actData, error: actError } = await supabase
        .from('automation_activities')
        .select('automation_id')
        .limit(1);

    if (actError) {
        console.error('Error selecting automation_id from activities:', actError);
    } else {
        console.log('Column automation_id in activities exists.');
    }
}

checkSchema();
