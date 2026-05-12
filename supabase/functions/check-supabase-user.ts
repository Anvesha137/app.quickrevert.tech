import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const email = 's08770363@gmail.com';

const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
const targetUser = userData?.users.find(u => u.email === email);

if (!targetUser) {
    console.log(`User ${email} NOT found in Supabase Auth`);
} else {
    console.log(`User ${email} found with ID: ${targetUser.id}`);
    const { data: sub } = await supabase.from('subscriptions').select('*').eq('user_id', targetUser.id).maybeSingle();
    if (!sub) {
        console.log(`No subscription found for ID: ${targetUser.id}`);
    } else {
        console.log(`Subscription found:`, JSON.stringify(sub, null, 2));
    }
}
