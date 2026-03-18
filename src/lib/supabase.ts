import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
};

<<<<<<< HEAD
=======
// Log error if configuration is missing, but don't hard crash the app immediately
// to allow build-time importing without env vars if necessary
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
if (!isSupabaseConfigured()) {
  console.error('Missing Supabase environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
}

<<<<<<< HEAD
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-client-info': 'quickrevert-app' },
  },
});
=======
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
