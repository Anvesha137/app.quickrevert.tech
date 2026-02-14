import {
  LayoutDashboard,
  Zap,
  Users,
  CreditCard,
  Link2,
  Settings as SettingsIcon,
  LogOut
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import UsageStats from './UsageStats';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

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
  const { displayName, colorPalette } = useTheme();

  const getGradientClass = () => {
    const gradients: Record<string, string> = {
      default: 'from-blue-500 to-cyan-500',
      sunset: 'from-orange-500 to-amber-500',
      forest: 'from-emerald-500 to-green-500',
      lavender: 'from-violet-500 to-purple-500',
      rose: 'from-pink-500 to-rose-500',
      slate: 'from-slate-500 to-gray-500',
    };
    return gradients[colorPalette] || gradients.default;
  };



  const getShadowClass = () => {
    const shadows: Record<string, string> = {
      default: 'shadow-blue-500/30',
      sunset: 'shadow-orange-500/30',
      forest: 'shadow-emerald-500/30',
      lavender: 'shadow-violet-500/30',
      rose: 'shadow-pink-500/30',
      slate: 'shadow-slate-500/30',
    };
    return shadows[colorPalette] || shadows.default;
  };

  const getRingClass = () => {
    const rings: Record<string, string> = {
      default: 'ring-blue-500',
      sunset: 'ring-orange-500',
      forest: 'ring-emerald-500',
      lavender: 'ring-violet-500',
      rose: 'ring-pink-500',
      slate: 'ring-slate-500',
    };
    return rings[colorPalette] || rings.default;
  };

  const getUserInitials = () => {
    if (!user) return 'U';
    const name = displayName || user.user_metadata?.full_name || user.email || 'User';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
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

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex-col shadow-lg z-50">
      <div className="pt-8 pb-4 px-4 border-b border-gray-200 flex flex-col items-start bg-white">
        <div className="flex items-center gap-0 mb-0 w-full justify-center">
          <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
            <img src="/Logo.png" alt="QuickRevert" className="w-full h-full object-contain scale-150" />
          </div>
          <span className="text-2xl font-bold text-gray-900 tracking-tight -mt-2">QuickRevert</span>
        </div>
        <p className="text-[10px] text-gray-500 font-medium tracking-wide w-full text-center">Intelligent Responses | Zero Wait Time | 24x7</p>
      </div>

      <div className="flex-1 flex flex-col bg-slate-900 overflow-y-auto">
        <nav className="p-4">
          <ul className="space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    className={`group w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${isActive
                      ? `bg-blue-600 text-white shadow-md shadow-blue-900/20`
                      : 'text-gray-400 hover:bg-slate-800 hover:text-white'
                      }`}
                  >
                    <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'}`} />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto">
          <UsageStats />
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="bg-gray-50 rounded-xl p-3 mb-3 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={getUserName()}
                className={`w-11 h-11 rounded-full ring-2 ${getRingClass()} ring-offset-2`}
              />
            ) : (
              <div className={`w-11 h-11 bg-gradient-to-br ${getGradientClass()} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md`}>
                {getUserInitials()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{getUserName()}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-gray-200 hover:border-red-200"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
