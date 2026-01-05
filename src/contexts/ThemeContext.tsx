import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface ThemeContextType {
  colorPalette: string;
  displayName: string;
  setColorPalette: (palette: string) => void;
  setDisplayName: (name: string) => void;
  refreshUserProfile: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const colorPalettes: Record<string, { primary: string; secondary: string; gradient: string }> = {
  default: { primary: '#3b82f6', secondary: '#06b6d4', gradient: 'from-blue-500 to-cyan-500' },
  sunset: { primary: '#f97316', secondary: '#fb923c', gradient: 'from-orange-500 to-amber-500' },
  forest: { primary: '#10b981', secondary: '#34d399', gradient: 'from-emerald-500 to-green-500' },
  lavender: { primary: '#8b5cf6', secondary: '#a78bfa', gradient: 'from-violet-500 to-purple-500' },
  rose: { primary: '#ec4899', secondary: '#f472b6', gradient: 'from-pink-500 to-rose-500' },
  slate: { primary: '#64748b', secondary: '#94a3b8', gradient: 'from-slate-500 to-gray-500' },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [colorPalette, setColorPaletteState] = useState('default');
  const [displayName, setDisplayNameState] = useState('');

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);

  useEffect(() => {
    applyTheme(colorPalette);
  }, [colorPalette]);

  async function loadUserProfile() {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, color_palette')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setColorPaletteState(data.color_palette || 'default');
        setDisplayNameState(data.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '');
      } else {
        setDisplayNameState(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  function applyTheme(palette: string) {
    const theme = colorPalettes[palette] || colorPalettes.default;
    document.documentElement.style.setProperty('--color-primary', theme.primary);
    document.documentElement.style.setProperty('--color-secondary', theme.secondary);
    document.documentElement.setAttribute('data-theme', palette);
  }

  const setColorPalette = (palette: string) => {
    setColorPaletteState(palette);
    applyTheme(palette);
  };

  const setDisplayName = (name: string) => {
    setDisplayNameState(name);
  };

  const refreshUserProfile = async () => {
    await loadUserProfile();
  };

  return (
    <ThemeContext.Provider
      value={{
        colorPalette,
        displayName,
        setColorPalette,
        setDisplayName,
        refreshUserProfile,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function getThemeGradient(palette: string): string {
  return colorPalettes[palette]?.gradient || colorPalettes.default.gradient;
}
