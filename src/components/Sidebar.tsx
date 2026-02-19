import {
  LayoutDashboard,
  Zap,
  Users,
  CreditCard,
  Link2,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export const navigation = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard, path: '/' },
  { id: "automations", name: "Automations", icon: Zap, path: '/automation' },
  { id: "contacts", name: "Contacts", icon: Users, path: '/contacts' },
  { id: "billing", name: "Billing", icon: CreditCard, path: '/billing' },
  { id: "connected-accounts", name: "Connected Accounts", icon: Link2, path: '/connect-accounts' },
  { id: "settings", name: "Settings", icon: SettingsIcon, path: '/settings' },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { displayName } = useTheme();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const getUserName = () => {
    return displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  };

  return (
    <div className="flex flex-col h-full w-64 bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/40">
      {/* Logo */}
      <div className="px-6 pt-8 pb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-200">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="2" fill="white" opacity="0.9" />
            <rect x="13" y="3" width="8" height="8" rx="2" fill="white" opacity="0.6" />
            <rect x="3" y="13" width="8" height="8" rx="2" fill="white" opacity="0.6" />
            <rect x="13" y="13" width="8" height="8" rx="2" fill="white" opacity="0.3" />
          </svg>
        </div>
        <span className="text-[12px] tracking-[0.2em] text-gray-500 uppercase font-black">
          QuickRevert
        </span>
      </div>

      <div className="h-px bg-gray-100/60 mx-6 mb-6" />

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
        {navigation.map(({ id, name, icon: Icon, path }) => {
          const isActive = location.pathname === path || (path === '/' && location.pathname === '/dashboard');
          return (
            <Link
              key={id}
              to={path}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-left transition-all duration-300 transform ${isActive
                ? "bg-gradient-to-r from-cyan-400 to-teal-500 shadow-xl shadow-cyan-100 scale-[1.02]"
                : "hover:bg-gray-50 active:scale-95"
                }`}
            >
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isActive ? "bg-white/20 shadow-inner" : "bg-gray-100"
                  }`}
              >
                <Icon
                  size={16}
                  className={isActive ? "text-white" : "text-gray-500"}
                />
              </span>
              <span
                className={`text-sm font-black tracking-tight ${isActive ? "text-white" : "text-gray-600"
                  }`}
              >
                {name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="mx-4 mb-4 p-4 bg-gray-50/50 backdrop-blur rounded-[1.5rem] border border-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center shadow-lg text-white text-xs font-black flex-shrink-0">
            {getUserName().substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-800 truncate">{getUserName()}</p>
            <p className="text-[10px] text-gray-400 font-bold truncate tracking-tight">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 text-[11px] font-black text-rose-400 hover:text-rose-600 transition-all py-2 rounded-xl hover:bg-rose-50 border border-transparent hover:border-rose-100"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
