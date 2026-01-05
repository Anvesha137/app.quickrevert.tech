import {
  LayoutDashboard,
  Zap,
  Users,
  Activity,
  CreditCard,
  Link2,
  Settings as SettingsIcon,
  LogOut
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'automations', name: 'Automations', icon: Zap, path: '/automation' },
  { id: 'contacts', name: 'Contacts', icon: Users, path: '/contacts' },
  { id: 'activity', name: 'Activity Log', icon: Activity, path: '/activity' },
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

  const getLogoGradientClass = () => {
    const gradients: Record<string, string> = {
      default: 'from-blue-500 via-blue-600 to-cyan-600',
      sunset: 'from-orange-500 via-orange-600 to-amber-600',
      forest: 'from-emerald-500 via-emerald-600 to-green-600',
      lavender: 'from-violet-500 via-violet-600 to-purple-600',
      rose: 'from-pink-500 via-pink-600 to-rose-600',
      slate: 'from-slate-500 via-slate-600 to-gray-600',
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
    <aside className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-gray-50 to-white border-r border-gray-200 flex flex-col shadow-lg">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 bg-gradient-to-br ${getLogoGradientClass()} rounded-xl flex items-center justify-center shadow-lg`}>
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">QuickRevert</span>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1.5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  className={`group w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? `bg-gradient-to-r ${getGradientClass()} text-white shadow-md ${getShadowClass()}`
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200 bg-gray-50/50">
        <div className="bg-white rounded-xl p-3 mb-3 shadow-sm border border-gray-100">
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
