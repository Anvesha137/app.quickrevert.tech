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


export const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'automations', name: 'Automations', icon: Zap, path: '/automation' },
  { id: 'contacts', name: 'Contacts', icon: Users, path: '/contacts' },
  { id: 'billing', name: 'Billing', icon: CreditCard, path: '/billing' },
  { id: 'connected', name: 'Connected Accounts', icon: Link2, path: '/connect-accounts' },
  { id: 'settings', name: 'Settings', icon: SettingsIcon, path: '/settings' },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { displayName } = useTheme();
  const { isPremium } = useSubscription();

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

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-80 backdrop-blur-xl bg-white/40 border-r border-white/20 shadow-2xl flex-col z-50 p-4">
      {/* Logo Section */}
      <div className="mb-6 p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-md border border-white/20">
        <div className="flex items-center gap-0 justify-center mb-1">
          <img src="/Logo.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain -mr-1" />
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

      {/* Usage Stats Section */}
      <div className="mt-auto space-y-2 -mx-1">
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
