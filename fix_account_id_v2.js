
import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

let envVars = {};
try {
    const envText = fs.readFileSync('.env', 'utf-8');
    envText.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            let val = parts.slice(1).join('=').trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            envVars[key] = val;
        }
    });
} catch (e) { }

const supabaseUrl = envVars['SUPABASE_URL'] || envVars['VITE_SUPABASE_URL'];
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_UUID = '67855b04-0cec-4b64-b9e1-5222763a0a1a';
const NEW_IG_ID = '17841477169708943';

(async () => {
    console.log(`Fetching accounts for user: ${USER_UUID}...`);

    const { data: accounts, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', USER_UUID);

    if (error) {
        console.error("Error fetching accounts:", error);
        return;
    }

    console.log(`Found ${accounts.length} accounts.`);
    console.log(JSON.stringify(accounts, null, 2));

    if (accounts.length > 0) {
        const accountToUpdate = accounts[0];
        console.log(`Updating Account ${accountToUpdate.id} from ${accountToUpdate.instagram_user_id} to ${NEW_IG_ID}`);

        const { data: updateData, error: updateError } = await supabase
            .from('instagram_accounts')
            .update({ instagram_user_id: NEW_IG_ID })
            .eq('id', accountToUpdate.id)
            .select();

        if (updateError) console.error("Update Error:", updateError);
        else console.log("Update Success:", updateData);
    }
})();
