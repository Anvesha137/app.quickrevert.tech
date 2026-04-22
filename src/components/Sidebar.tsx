import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Bot,
  ClipboardCheck,
  CreditCard,
  LogOut,
  User
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import UsageStats from './UsageStats';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { supabase } from '../lib/supabase';


export const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'automations', name: 'Automations', icon: Bot, path: '/automation' },
  { id: 'contacts', name: 'Lead Manager', icon: ClipboardCheck, path: '/lead-manager' },
  { id: 'billing', name: 'Billing', icon: CreditCard, path: '/billing' },
  { id: 'account', name: 'My Account', icon: User, path: '/account' },
];

interface SidebarProps {
  millennial?: boolean;
}

export default function Sidebar({ millennial = false }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { displayName, darkMode } = useTheme();
  const { isPremium, dmLimit, automationLimit, usage, loading, isGifted, canUseLeadManager } = useSubscription();
  const { openModal } = useUpgradeModal();
  const { uiStyle, toggleUIStyle } = useUIStyle();
  const isGenZ = uiStyle === 'genz';

  const filteredNavigation = navigation.filter(item => {
    if (item.id === 'contacts' && !canUseLeadManager) return false;
    return true;
  });

  const getUserName = () => {
    return displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const totalDmsValue = usage?.dms || 0;
  const totalContactsValue = usage?.contacts || 0;

  const limitValueForCheck = typeof dmLimit === 'number' ? dmLimit : 1000;
  const isAtLimit = (dmLimit !== 'Unlimited') && (totalDmsValue >= limitValueForCheck || totalContactsValue >= limitValueForCheck);
  const customMessage = (isGifted && isAtLimit) ? "you have reached the limit - please upgrade to continue using" : undefined;

  // ─── MILLENNIAL SIDEBAR (inside black card) ────────────────────────────────
  if (millennial) {
    return (
      <aside className={`hidden md:flex w-80 flex-shrink-0 flex-col h-full p-6 overflow-y-auto transition-colors duration-500 ${darkMode ? 'bg-white' : 'bg-transparent'}`}>
        {/* Logo */}
        <div className="mb-6 flex items-center gap-2">
          <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-10 h-10 object-contain" />
          <span className={`font-bold text-2xl tracking-tight transition-colors duration-500 ${darkMode ? 'text-black' : 'text-white'}`}>QuickRevert</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center border overflow-hidden flex-shrink-0 transition-colors duration-500 ${darkMode ? 'bg-black/5 border-black/10' : 'bg-white/10 border-white/20'}`}>
            <User className={`w-5 h-5 transition-colors duration-500 ${darkMode ? 'text-black/70' : 'text-white/70'}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate transition-colors duration-500 ${darkMode ? 'text-black' : 'text-white'}`}>{getUserName()}</p>
            <p className={`text-[10px] truncate transition-colors duration-500 ${darkMode ? 'text-black/50' : 'text-white/50'}`}>{user?.email}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1 flex-1">
          {filteredNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path ||
              location.pathname.startsWith(item.path + '/') ||
              (item.id === 'dashboard' && location.pathname === '/');

            return (
              <Link
                key={item.id}
                to={item.path}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${isActive
                    ? (darkMode ? 'bg-black text-white font-bold shadow-lg' : 'bg-white text-black font-bold shadow-lg')
                    : (darkMode ? 'text-black/60 hover:text-black hover:bg-black/5' : 'text-white/60 hover:text-white hover:bg-white/10')
                  }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 transition-colors duration-300 ${isActive ? (darkMode ? 'text-white' : 'text-black') : (darkMode ? 'text-black/60' : 'text-white/60')}`} />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Vibe Mode Toggle */}
        <div className={`mt-4 p-3 rounded-2xl transition-colors duration-500 ${darkMode ? 'bg-gray-50 border border-gray-100' : 'bg-white/5 border border-white/10'}`}>
          <p className={`text-[9px] font-bold uppercase tracking-widest text-center mb-2 transition-colors duration-500 ${darkMode ? 'text-gray-400' : 'text-white/30'}`}>Vibe Mode</p>
          <div
            onClick={toggleUIStyle}
            className="relative flex items-center rounded-xl cursor-pointer select-none overflow-hidden"
            style={{
              background: isGenZ
                ? 'linear-gradient(135deg, #0f0f1a, #1a0a2e)'
                : (darkMode ? '#F3F4F6' : 'linear-gradient(135deg, #1e1e2e, #2a2a3e)'),
              border: isGenZ ? '1.5px solid rgba(180,0,255,0.4)' : (darkMode ? '1px solid rgba(0,0,0,0.05)' : '1.5px solid rgba(255,255,255,0.15)'),
              transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              height: '42px'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '3px',
                bottom: '3px',
                width: 'calc(50% - 3px)',
                borderRadius: '9px',
                background: isGenZ
                  ? 'linear-gradient(135deg, #b400ff, #5500ff)'
                  : (darkMode ? '#000' : 'linear-gradient(135deg, #ffffff, #e0e7ff)'),
                boxShadow: isGenZ ? '0 0 14px rgba(180,0,255,0.6)' : (darkMode ? 'none' : '0 2px 8px rgba(255,255,255,0.3)'),
                transform: isGenZ ? 'translateX(calc(100% + 3px))' : 'translateX(3px)',
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                zIndex: 0,
              }}
            />
            <div className="relative z-10 flex-1 flex flex-col items-center py-1.5 gap-0.5">
              <span className={`text-[11px] leading-none ${isGenZ ? '' : (darkMode ? 'opacity-100' : '')}`}>✨</span>
              <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? (darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(200,200,255,0.4)') : (darkMode ? '#fff' : '#000') }}>
                Millennial
              </span>
            </div>
            <div className="relative z-10 flex-1 flex flex-col items-center py-1.5 gap-0.5">
              <span className={`text-[11px] leading-none ${isGenZ ? '' : (darkMode ? 'opacity-30' : '')}`}>⚡</span>
              <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? '#fff' : (darkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)') }}>
                Gen Z
              </span>
            </div>
          </div>
        </div>

        {/* Usage Stats (Millennial) */}
        <div
          className={`mt-4 rounded-2xl p-4 border transition-all cursor-pointer group ${darkMode ? 'bg-black/5 border-black/10 hover:bg-black/10 hover:border-black/20' : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'}`}
          onClick={() => openModal(undefined, customMessage)}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className={`font-bold text-sm transition-colors duration-500 ${darkMode ? 'text-black' : 'text-white'}`}>Usage Stats</h3>
            {(totalDmsValue >= (typeof dmLimit === 'number' ? dmLimit : 1000) || totalContactsValue >= (typeof dmLimit === 'number' ? dmLimit : 1000)) && (
              <span className="text-[10px] font-black text-red-500 animate-pulse tracking-tighter">UPGRADE</span>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className={`transition-colors duration-500 ${darkMode ? 'text-black/70' : 'text-white/70'}`}>DMs Triggered</span>
                <span className={`font-medium transition-colors duration-500 ${darkMode ? 'text-black' : 'text-white'}`}>
                  {loading ? '-' : totalDmsValue.toLocaleString()}/{dmLimit === 'Unlimited' ? 'unlimited' : dmLimit.toLocaleString()}
                </span>
              </div>
              <div className={`h-1.5 w-full rounded-full overflow-hidden transition-colors duration-500 ${darkMode ? 'bg-black/10' : 'bg-white/10'}`}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: dmLimit === 'Unlimited' ? '100%' : `${Math.min((totalDmsValue / (typeof dmLimit === 'number' ? dmLimit : 1000)) * 100, 100)}%`,
                    background: dmLimit !== 'Unlimited' && totalDmsValue >= (typeof dmLimit === 'number' ? dmLimit : 1000) ? '#ef4444' : '#10b981'
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className={`transition-colors duration-500 ${darkMode ? 'text-black/70' : 'text-white/70'}`}>Total Contacts</span>
                <span className={`font-medium transition-colors duration-500 ${darkMode ? 'text-black' : 'text-white'}`}>
                  {loading ? '-' : totalContactsValue.toLocaleString()}/{dmLimit === 'Unlimited' ? 'unlimited' : dmLimit.toLocaleString()}
                </span>
              </div>
              <div className={`h-1.5 w-full rounded-full overflow-hidden transition-colors duration-500 ${darkMode ? 'bg-black/10' : 'bg-white/10'}`}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: dmLimit === 'Unlimited' ? '100%' : `${Math.min((totalContactsValue / (typeof dmLimit === 'number' ? dmLimit : 1000)) * 100, 100)}%`,
                    background: dmLimit !== 'Unlimited' && totalContactsValue >= (typeof dmLimit === 'number' ? dmLimit : 1000) ? '#ef4444' : '#8b5cf6'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border ${darkMode ? 'bg-black/5 text-black hover:bg-black/10 hover:text-red-600 border-black/10' : 'bg-white/10 text-white hover:bg-white/20 hover:text-red-400 border-white/10'}`}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </aside>
    );
  }

  // ─── GEN Z / DEFAULT SIDEBAR ───────────────────────────────────────────────
  return (
    <aside className={`hidden md:flex fixed left-0 top-0 h-full w-80 border-r shadow-2xl flex-col z-50 p-4 transition-all duration-500 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-gray-100'}`}>
      {/* Logo Section */}
      <div className={`mb-6 p-4 rounded-3xl transition-colors ${darkMode ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-gray-100'}`}>
        <div className="flex items-center gap-1 justify-center mb-1">
          <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain" />
          <h1 className={`font-bold text-2xl tracking-tighter -mt-1 ${darkMode ? 'text-white' : 'text-gray-800'}`}>QuickRevert</h1>
        </div>
        <p className={`text-[10px] font-bold tracking-tight text-center leading-none ${darkMode ? 'text-white' : 'text-gray-600'}`}>
          Intelligent Responses | Zero Wait Time | 24x7
        </p>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
        {filteredNavigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            location.pathname.startsWith(item.path + '/') ||
            (item.id === 'dashboard' && location.pathname === '/');

          const activeGradient = isPremium
            ? 'bg-gradient-to-r from-indigo-600 to-violet-700 shadow-indigo-500/50'
            : 'bg-gradient-to-r from-blue-500 to-purple-600 shadow-purple-500/50';

          return (
            <Link
              key={item.id}
              to={item.path}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${isActive
                ? `${activeGradient} text-white shadow-lg`
                : (darkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-600 hover:bg-gray-50')
                }`}
            >
              <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-white' : (darkMode ? 'text-white/30' : 'text-gray-400')}`} />
              <span className="font-medium text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Gen Z / Millennial Toggle */}
      <div className={`mt-4 mx-1 p-3 transition-colors ${darkMode ? 'bg-transparent border-none' : 'bg-slate-50 border border-gray-100 rounded-2xl'}`}>
        <p className={`text-[9px] font-bold uppercase tracking-widest text-center mb-2 ${darkMode ? 'text-white/50' : 'text-gray-400'}`}>Vibe Mode</p>
        <div
          onClick={toggleUIStyle}
          className="relative flex items-center rounded-xl cursor-pointer select-none overflow-hidden shadow-inner"
          style={{
            background: isGenZ
              ? (darkMode ? '#1A1A2E' : 'linear-gradient(135deg, #0f0f1a, #1a0a2e)')
              : (darkMode ? '#1f1f2e' : 'linear-gradient(135deg, #e0e7ff, #f0f4ff)'),
            border: isGenZ ? '1.5px solid rgba(180,0,255,0.4)' : (darkMode ? '1px solid rgba(255,255,255,0.1)' : '1.5px solid rgba(99,102,241,0.25)'),
            transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '3px',
              bottom: '3px',
              width: 'calc(50% - 3px)',
              borderRadius: '10px',
              background: isGenZ
                ? 'linear-gradient(135deg, #b400ff, #5500ff)'
                : (darkMode ? '#6366f1' : 'linear-gradient(135deg, #6366f1, #818cf8)'),
              boxShadow: isGenZ
                ? '0 0 14px rgba(180,0,255,0.6)'
                : (darkMode ? 'none' : '0 2px 8px rgba(99,102,241,0.45)'),
              transform: isGenZ ? 'translateX(calc(100% + 3px))' : 'translateX(3px)',
              transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              zIndex: 0,
            }}
          />
          <div className="relative z-10 flex-1 flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base leading-none">✨</span>
            <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? (darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(180,180,210,0.5)') : '#fff' }}>
              Millennial
            </span>
          </div>
          <div className="relative z-10 flex-1 flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base leading-none">⚡</span>
            <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? '#fff' : (darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.5)') }}>
              Gen Z
            </span>
          </div>
        </div>
        <p className="text-center mt-2 text-[10px] font-bold tracking-wide" style={{ color: isGenZ ? (darkMode ? '#B400FF' : '#b400ff') : (darkMode ? '#6366f1' : '#6366f1') }}>
          {isGenZ ? 'no cap frrr🔥' : 'absolutely iconic 💅'}
        </p>
      </div>

      {/* Usage Stats Section */}
      <div className="mt-2 space-y-2 -mx-1">
        <UsageStats />
      </div>

      {/* User & Sign Out Section */}
      <div className="mt-4 space-y-2">
        <div className={`flex items-center gap-3 p-3 transition-all cursor-pointer ${darkMode ? 'bg-white/5 border border-white/10 rounded-xl hover:bg-white/10' : 'bg-slate-50 border border-gray-100 rounded-xl hover:bg-gray-100'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm relative overflow-hidden border ${darkMode ? 'bg-white/10 border-white/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
            <User className={`w-5 h-5 ${darkMode ? 'text-white/70' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-800'}`}>{getUserName()}</p>
            </div>
            <p className={`text-[10px] truncate ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>{user?.email}</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold transition-colors ${darkMode ? 'text-white/40 hover:text-red-400' : 'text-gray-600 hover:text-red-600'}`}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
