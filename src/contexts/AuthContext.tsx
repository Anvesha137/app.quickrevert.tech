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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/pricing`,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;

    if (data?.url) {
      // Force BOTH the Supabase domain AND the redirect back to use the proxy
      // This ensures that even if Supabase server-side logic fails, the browser handles it
      const correctedUrl = data.url
        .replace(/unwijhqoqvwztpbahlly\.supabase\.co/g, 'quickrevert.jiobase.com')
        .replace(/redirect_uri=[^&]*/, `redirect_uri=${encodeURIComponent('https://quickrevert.jiobase.com/auth/v1/callback')}`);

      // PERSISTENT LOG: Save the URL we are about to visit so user can check it after failure
      localStorage.setItem('last_auth_attempt', correctedUrl);
      console.log('Redirecting to corrected OAuth URL:', correctedUrl);

      window.location.href = correctedUrl;
    }
  };



  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
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
