
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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  console.log("Checking for 'expiration_notified' column in 'instagram_accounts'...");

  // Attempt to select the column specifically
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('expiration_notified')
    .limit(1);

  if (error) {
    console.error("Error selecting 'expiration_notified':", error.message);
    if (error.message.includes("column \"expiration_notified\" does not exist")) {
      console.log("CONFIRMED: Column 'expiration_notified' is MISSING.");
    }
  } else {
    console.log("SUCCESS: Column 'expiration_notified' EXISTS.");
    console.log("Data sample:", data);
  }
})();
