import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Zap, X, LogOut, ExternalLink, ArrowUpCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { navigation } from './Sidebar';

export default function MobileNav() {
    const [isOpen, setIsOpen] = useState(false);
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
            setIsOpen(false);
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <>
            {/* Bottom Navigation Bar */}
            <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50 pb-safe">
                <div className="grid grid-cols-3 h-16">
                    {/* Upgrade Button */}
                    <Link
                        to="/billing"
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-blue-600 active:bg-gray-50"
                    >
                        <ArrowUpCircle className="w-6 h-6" />
                        <span className="text-xs font-medium">Upgrade</span>
                    </Link>

                    {/* Menu Button */}
                    <button
                        onClick={() => setIsOpen(true)}
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-blue-600 active:bg-gray-50 relative"
                    >
                        <div className={`absolute -top-6 w-12 h-12 bg-gradient-to-br ${getGradientClass()} rounded-full flex items-center justify-center shadow-lg border-4 border-gray-50`}>
                            <Menu className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-medium mt-6">Menu</span>
                    </button>

                    {/* Support Button */}
                    <a
                        href="https://quickrevert.tech/contact"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-blue-600 active:bg-gray-50"
                    >
                        <ExternalLink className="w-6 h-6" />
                        <span className="text-xs font-medium">Support</span>
                    </a>
                </div>
            </div>

            {/* Full Screen Menu Overlay */}
            {isOpen && (
                <div className="md:hidden fixed inset-0 bg-white z-[60] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 bg-gradient-to-br ${getGradientClass()} rounded-xl flex items-center justify-center shadow-lg`}>
                                    <Zap className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-xl font-bold text-gray-900 tracking-tight">QuickRevert</span>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 rounded-full hover:bg-gray-100"
                            >
                                <X className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>

                        {/* User Profile */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                            <div className="flex items-center gap-3 mb-3">
                                {user?.user_metadata?.avatar_url ? (
                                    <img
                                        src={user.user_metadata.avatar_url}
                                        alt={getUserName()}
                                        className="w-12 h-12 rounded-full ring-2 ring-white"
                                    />
                                ) : (
                                    <div className={`w-12 h-12 bg-gradient-to-br ${getGradientClass()} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md`}>
                                        {getUserInitials()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-base font-bold text-gray-900 truncate">{getUserName()}</p>
                                    <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 bg-white border border-gray-200 rounded-lg shadow-sm active:bg-red-50"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign Out
                            </button>
                        </div>

                        {/* Navigation Links */}
                        <nav>
                            <ul className="space-y-2">
                                {navigation.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

                                    return (
                                        <li key={item.id}>
                                            <Link
                                                to={item.path}
                                                onClick={() => setIsOpen(false)}
                                                className={`group w-full flex items-center gap-3 px-4 py-4 rounded-xl text-base font-semibold transition-all duration-200 ${isActive
                                                        ? `bg-gradient-to-r ${getGradientClass()} text-white shadow-md`
                                                        : 'text-gray-700 bg-gray-50 hover:bg-gray-100'
                                                    }`}
                                            >
                                                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                                {item.name}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>

                        {/* Added styling for safe area padding at bottom */}
                        <div className="h-safe pb-8"></div>
                    </div>
                </div>
            )}
        </>
    );
}
