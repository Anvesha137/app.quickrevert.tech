import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Zap,
  Users,
  CreditCard,
  Link2,
  Settings as SettingsIcon,
  LogOut,
  User
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import UsageStats from './UsageStats';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { supabase } from '../lib/supabase';


export const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'automations', name: 'Automations', icon: Zap, path: '/automation' },
  { id: 'contacts', name: 'Contacts', icon: Users, path: '/contacts' },
  { id: 'billing', name: 'Billing', icon: CreditCard, path: '/billing' },
  { id: 'connected', name: 'Connected Accounts', icon: Link2, path: '/connect-accounts' },
  { id: 'settings', name: 'Settings', icon: SettingsIcon, path: '/settings' },
];

interface SidebarProps {
  millennial?: boolean;
}

export default function Sidebar({ millennial = false }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { displayName } = useTheme();
  const { isPremium, dmLimit, automationLimit } = useSubscription();
  const { uiStyle, toggleUIStyle } = useUIStyle();
  const isGenZ = uiStyle === 'genz';

  const [stats, setStats] = useState({
    dmsTriggered: 0,
    uniqueUsers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && millennial) {
      fetchStats();
    }
  }, [user, millennial]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data: activities, error } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', user!.id);
      
      if (error) throw error;
      
      const uniqueUsersSet = new Set((activities || []).map(a => a.contact_id).filter(Boolean));
      const dmActivities = (activities || []).filter(a => {
        const type = (a.activity_type || '').toLowerCase();
        return type.includes('dm') || type.includes('message');
      });
      
      setStats({
        dmsTriggered: dmActivities.length,
        uniqueUsers: uniqueUsersSet.size
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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

  // ─── MILLENNIAL SIDEBAR (inside black card) ────────────────────────────────
  if (millennial) {
    return (
      <aside className="hidden md:flex w-80 flex-shrink-0 flex-col h-full bg-transparent p-6 overflow-y-auto">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-2">
          <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-10 h-10 object-contain" />
          <span className="font-bold text-white text-2xl tracking-tight">QuickRevert</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 overflow-hidden flex-shrink-0">
            <User className="w-5 h-5 text-white/70" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{getUserName()}</p>
            <p className="text-[10px] text-white/50 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1 flex-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path ||
              location.pathname.startsWith(item.path + '/') ||
              (item.id === 'dashboard' && location.pathname === '/');

            return (
              <Link
                key={item.id}
                to={item.path}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-black font-bold shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-black' : 'text-white/60'}`} />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Vibe Mode Toggle */}
        <div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10">
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest text-center mb-2">Vibe Mode</p>
          <div
            onClick={toggleUIStyle}
            className="relative flex items-center rounded-xl cursor-pointer select-none overflow-hidden"
            style={{
              background: isGenZ
                ? 'linear-gradient(135deg, #0f0f1a, #1a0a2e)'
                : 'linear-gradient(135deg, #1e1e2e, #2a2a3e)',
              border: isGenZ ? '1.5px solid rgba(180,0,255,0.4)' : '1.5px solid rgba(255,255,255,0.15)',
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
                  : 'linear-gradient(135deg, #ffffff, #e0e7ff)',
                boxShadow: isGenZ ? '0 0 14px rgba(180,0,255,0.6)' : '0 2px 8px rgba(255,255,255,0.3)',
                transform: isGenZ ? 'translateX(calc(100% + 3px))' : 'translateX(3px)',
                transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                zIndex: 0,
              }}
            />
            <div className="relative z-10 flex-1 flex flex-col items-center py-2 gap-0.5">
              <span className="text-sm leading-none">✨</span>
              <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? 'rgba(200,200,255,0.4)' : '#000' }}>
                Millennial
              </span>
            </div>
            <div className="relative z-10 flex-1 flex flex-col items-center py-2 gap-0.5">
              <span className="text-sm leading-none">⚡</span>
              <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                Gen Z
              </span>
            </div>
          </div>
        </div>

        {/* Usage Stats (Millennial) */}
        <div className="mt-4 bg-white/5 rounded-2xl p-4 border border-white/10">
          <h3 className="font-bold text-white text-sm mb-4">Usage Stats</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-white/70">DMs Triggered</span>
                <span className="text-white font-medium">
                  {loading ? '-' : stats.dmsTriggered.toLocaleString()}/{dmLimit === 'Unlimited' ? 'unlimited' : dmLimit.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#10b981] rounded-full transition-all duration-1000" 
                  style={{ width: dmLimit === 'Unlimited' ? '100%' : `${Math.min((stats.dmsTriggered / (typeof dmLimit === 'number' ? dmLimit : 1000)) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-white/70">Total Contacts</span>
                <span className="text-white font-medium">
                  {loading ? '-' : stats.uniqueUsers.toLocaleString()}/{dmLimit === 'Unlimited' ? 'unlimited' : dmLimit.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#8b5cf6] rounded-full transition-all duration-1000" 
                  style={{ width: dmLimit === 'Unlimited' ? '100%' : `${Math.min((stats.uniqueUsers / (typeof dmLimit === 'number' ? dmLimit : 1000)) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 hover:text-red-400 transition-colors border border-white/10"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </aside>
    );
  }

  // ─── GEN Z / DEFAULT SIDEBAR ───────────────────────────────────────────────
  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-80 backdrop-blur-xl bg-white/40 border-r border-white/20 shadow-2xl flex-col z-50 p-4">
      {/* Logo Section */}
      <div className="mb-6 p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-md border border-white/20">
        <div className="flex items-center gap-0 justify-center mb-1">
          <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain -mr-1" />
          <h1 className="font-bold text-gray-800 text-2xl tracking-tighter -mt-1">QuickRevert</h1>
        </div>
        <p className="text-[9px] text-gray-500 tracking-tight text-center leading-none">
          Intelligent Responses | Zero Wait Time | 24x7
        </p>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
        {navigation.map((item) => {
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
                : 'text-gray-700 hover:bg-white/50 hover:backdrop-blur-md transition-colors'
                }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
              <span className="font-medium text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Gen Z / Millennial Toggle */}
      <div className="mt-4 mx-1 p-3 rounded-2xl bg-white/30 backdrop-blur-md border border-white/40">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center mb-2">Vibe Mode</p>
        <div
          onClick={toggleUIStyle}
          className="relative flex items-center rounded-xl cursor-pointer select-none overflow-hidden shadow-inner"
          style={{
            background: isGenZ
              ? 'linear-gradient(135deg, #0f0f1a, #1a0a2e)'
              : 'linear-gradient(135deg, #e0e7ff, #f0f4ff)',
            border: isGenZ ? '1.5px solid rgba(180,0,255,0.4)' : '1.5px solid rgba(99,102,241,0.25)',
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
                : 'linear-gradient(135deg, #6366f1, #818cf8)',
              boxShadow: isGenZ
                ? '0 0 14px rgba(180,0,255,0.6)'
                : '0 2px 8px rgba(99,102,241,0.45)',
              transform: isGenZ ? 'translateX(calc(100% + 3px))' : 'translateX(3px)',
              transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              zIndex: 0,
            }}
          />
          <div className="relative z-10 flex-1 flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base leading-none">✨</span>
            <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? 'rgba(180,180,210,0.5)' : '#fff' }}>
              Millennial
            </span>
          </div>
          <div className="relative z-10 flex-1 flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base leading-none">⚡</span>
            <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: isGenZ ? '#fff' : 'rgba(99,102,241,0.5)' }}>
              Gen Z
            </span>
          </div>
        </div>
        <p className="text-center mt-2 text-[10px] font-bold tracking-wide" style={{ color: isGenZ ? '#b400ff' : '#6366f1' }}>
          {isGenZ ? 'no cap fr fr 🔥' : 'absolutely iconic 💅'}
        </p>
      </div>

      {/* Usage Stats Section */}
      <div className="mt-2 space-y-2 -mx-1">
        <UsageStats />
      </div>

      {/* User & Sign Out Section */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/30 backdrop-blur-md border border-white/40 cursor-pointer hover:bg-white/40 transition-all">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shadow-sm relative overflow-hidden border border-blue-500/20">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{getUserName()}</p>
            </div>
            <p className="text-[10px] text-gray-600 truncate">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
