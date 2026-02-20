
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

// Create client with service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function debugContacts() {
    console.log('Querying contacts for %admitgenie_%...');

    const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .ilike('username', '%admitgenie_%');

    if (contactError) {
        console.error('Error fetching contact:', contactError);
        return;
    }

    if (!contacts || contacts.length === 0) {
        console.log('No contacts found for admitgenie_');
        return;
    }

    console.log(`Found ${contacts.length} contacts.`);
    contacts.forEach(contact => {
        console.log(`Contact ID: ${contact.id}, Username: ${contact.username}, Interacted Automations: ${JSON.stringify(contact.interacted_automations)}`);
    });

    const contact = contacts[0];
    console.log('Querying activities for this user...');

    // Find activities for this user
    const { data: activities, error: activityError } = await supabase
        .from('automation_activities')
        .select('*')
        .ilike('target_username', `%${contact.username?.replace('@', '')}%`);

    if (activityError) {
        console.error('Error fetching activities:', activityError);
    } else {
        console.log(`Found ${activities?.length || 0} activities.`);
        if (activities && activities.length > 0) {
            activities.forEach(act => {
                // console.log(`Activity ID: ${act.id}, Type: ${act.activity_type}, Automation ID: ${act.automation_id}, Meta AutoID: ${act.metadata?.automation_id || act.metadata?.automationId}`);
            });

            // Check if automation IDs exist in automations table
            const automationIds = [...new Set(activities.map(act => act.automation_id || act.metadata?.automation_id || act.metadata?.automationId).filter(Boolean))];
            console.log('Checking Unique Automation IDs from Activities:', automationIds);

            if (automationIds.length > 0) {
                const { data: automations } = await supabase
                    .from('automations')
                    .select('id, name')
                    .in('id', automationIds);

                console.log('Corresponding Automations found in automations table:', automations);
            } else {
                console.log('No automation IDs found in activities metadata or columns.');
            }
        }
    }
}

debugContacts();
