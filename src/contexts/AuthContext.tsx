import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Force production domain if user lands on the old vercel domain (post-OAuth redirects included)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { hostname, pathname, search, hash } = window.location;
      // Check if we are on the Vercel domain
      if (hostname.includes('vercel.app')) {
        const target = `https://app.quickrevert.tech${pathname}${search}${hash}`;
        window.location.replace(target);
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
  };



  const signInWithEmail = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // If credentials are invalid, it might be a gifted user who hasn't been synced to Supabase Auth yet
        if (error.message.includes('Invalid login credentials')) {
          console.log('[Auth] Login failed, checking Neon for gifted credentials for:', email);
          
          try {
            const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-neon-user-to-auth', {
              body: { email, password }
            });

            console.log('[Auth] Neon sync response:', { syncData, syncError });

            if (!syncError && syncData?.success) {
              console.log('[Auth] User successfully synced from Neon, retrying login...');
              const { error: retryError } = await supabase.auth.signInWithPassword({
                email,
                password,
              });
              if (retryError) {
                console.error('[Auth] Login retry failed after sync:', retryError);
                throw retryError;
              }
              console.log('[Auth] Login successful on retry!');
              return; 
            } else {
              let debugInfo = syncData?.debug;
              if (syncError && 'context' in syncError) {
                try {
                   const response = (syncError as any).context as Response;
                   response.clone().json().then(data => {
                     console.warn('[Auth] Neon sync failed with debug info:', data);
                   });
                } catch (e) {
                  console.error('[Auth] Failed to parse sync error body:', e);
                }
              }
              console.warn('[Auth] Neon sync was not successful:', {
                message: syncError?.message || syncData?.message,
                syncError
              });
            }
          } catch (syncErr) {
            console.error('[Auth] Neon sync fallback exception:', syncErr);
          }
        }
        
        throw error;
      }
    } catch (err) {
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    localStorage.removeItem('quickrevert_subscription_cache_v2');
    localStorage.removeItem('quickrevert_banned');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
