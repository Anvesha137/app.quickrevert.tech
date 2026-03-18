import { createContext, useContext, useState, ReactNode } from 'react';

export type UIStyle = 'genz' | 'millennial';

interface UIStyleContextType {
  uiStyle: UIStyle;
  toggleUIStyle: () => void;
  setUIStyle: (style: UIStyle) => void;
}

const UIStyleContext = createContext<UIStyleContextType | undefined>(undefined);

export function UIStyleProvider({ children }: { children: ReactNode }) {
  const [uiStyle, setUIStyleState] = useState<UIStyle>(() => {
    const saved = localStorage.getItem('ui-style');
    return (saved as UIStyle) || 'millennial';
  });

  const setUIStyle = (style: UIStyle) => {
    setUIStyleState(style);
    localStorage.setItem('ui-style', style);
    document.documentElement.setAttribute('data-ui-style', style);
  };

  const toggleUIStyle = () => {
    setUIStyle(uiStyle === 'genz' ? 'millennial' : 'genz');
  };

  // Apply on mount
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-ui-style', uiStyle);
  }

  return (
    <UIStyleContext.Provider value={{ uiStyle, toggleUIStyle, setUIStyle }}>
      {children}
    </UIStyleContext.Provider>
  );
}

export function useUIStyle() {
  const context = useContext(UIStyleContext);
  if (context === undefined) {
    throw new Error('useUIStyle must be used within a UIStyleProvider');
  }
  return context;
}
