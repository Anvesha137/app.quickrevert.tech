import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, ExternalLink, ArrowUpCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { navigation } from './Sidebar';
import DayNightToggle from './ui/DayNightToggle';

export default function MobileNav() {
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();
    const { user, signOut } = useAuth();
    const { displayName, colorPalette, darkMode } = useTheme();
    const { uiStyle, toggleUIStyle } = useUIStyle();
    const isGenZ = uiStyle === 'genz';

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
            <div className={`md:hidden fixed bottom-0 left-0 w-full border-t z-50 pb-safe transition-all duration-500 backdrop-blur-xl ${darkMode ? 'bg-black/90 border-white/10' : 'bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-700/20 border-orange-200/50 shadow-[0_-4px_20px_-10px_rgba(249,115,22,0.1)]'}`}>
                <div className="grid grid-cols-3 h-20">
                    {/* Upgrade Button */}
                    <Link
                        to="/billing"
                        className={`flex flex-col items-center justify-center gap-1.5 transition-colors ${darkMode ? 'text-gray-400 hover:text-white active:bg-white/5' : 'text-gray-600 hover:text-blue-600 active:bg-gray-50'}`}
                    >
                        <ArrowUpCircle className="w-7 h-7" />
                        <span className="text-sm font-semibold">Upgrade</span>
                    </Link>

                    {/* Menu Button */}
                    <button
                        onClick={() => setIsOpen(true)}
                        className={`flex flex-col items-center justify-center gap-1.5 active:bg-gray-50 relative transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-blue-600'}`}
                    >
                        <div className={`absolute -top-8 w-16 h-16 bg-gradient-to-br ${getGradientClass()} rounded-full flex items-center justify-center shadow-lg border-4 ${darkMode ? 'border-black' : 'border-gray-50'}`}>
                            <Menu className="w-8 h-8 text-white" />
                        </div>
                        <span className="text-sm font-semibold mt-10">Menu</span>
                    </button>

                    {/* Support Button */}
                    <a
                        href="https://quickrevert.tech/contact"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex flex-col items-center justify-center gap-1.5 active:bg-gray-50 transition-colors ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-blue-600'}`}
                    >
                        <ExternalLink className="w-7 h-7" />
                        <span className="text-sm font-semibold">Support</span>
                    </a>
                </div>
            </div>

            {/* Full Screen Menu Overlay */}
            {isOpen && (
                <div className={`md:hidden fixed inset-0 z-[60] overflow-y-auto animate-in slide-in-from-bottom duration-300 transition-colors ${darkMode ? 'bg-black' : 'bg-white'}`}>
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2">
                                <img src="/Logo_optimized.png" alt="QuickRevert" className="h-8 w-auto object-contain" />
                                <h1 className={`font-bold text-xl tracking-tighter ${darkMode ? 'text-white' : 'text-gray-800'}`}>QuickRevert</h1>
                            </div>
                            <div className="flex flex-col items-center gap-4">
                                <DayNightToggle />
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                                >
                                    <X className={`w-6 h-6 ${darkMode ? 'text-white' : 'text-gray-500'}`} />
                                </button>
                            </div>
                        </div>

                        {/* User Profile */}
                        <div className={`p-4 mb-6 transition-colors ${darkMode ? 'bg-transparent border-none' : 'bg-gray-50 border border-gray-100 rounded-xl'}`}>
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`w-12 h-12 bg-gradient-to-br ${getGradientClass()} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md ring-2 ${darkMode ? 'ring-black' : 'ring-white'}`}>
                                    {getUserInitials()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-base font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{getUserName()}</p>
                                    <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user?.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSignOut}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg shadow-sm active:scale-95 transition-all ${darkMode ? 'text-gray-400 bg-white/5 border border-white/10' : 'text-red-600 bg-white border border-gray-200 active:bg-red-50'}`}
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
                                                    : (darkMode ? 'text-gray-400 bg-transparent border-none' : 'text-gray-700 bg-gray-50 hover:bg-gray-100')
                                                    }`}
                                            >
                                                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : (darkMode ? 'text-gray-500' : 'text-gray-500')}`} />
                                                {item.name}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>

                        {/* Mobile Vibe Mode Toggle */}
                        <div className={`mt-6 p-4 mb-6 transition-colors ${darkMode ? 'bg-transparent border-none' : 'bg-gray-50 border border-gray-100 rounded-2xl'}`}>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center mb-3">Vibe Mode</p>
                            <div
                                onClick={toggleUIStyle}
                                className="relative flex items-center rounded-xl cursor-pointer select-none overflow-hidden shadow-inner h-12"
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
                                <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                                    <span className="text-[11px] font-bold tracking-wide uppercase flex items-center gap-1.5" style={{ color: isGenZ ? (darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(180,180,210,0.5)') : '#fff' }}>
                                        <span className="text-sm">✨</span> Millennial
                                    </span>
                                </div>
                                <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                                    <span className="text-[11px] font-bold tracking-wide uppercase flex items-center gap-1.5" style={{ color: isGenZ ? '#fff' : (darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.5)') }}>
                                        <span className="text-sm">⚡</span> Gen Z
                                    </span>
                                </div>
                            </div>
                            <p className="text-center mt-3 text-[11px] font-bold tracking-wide" style={{ color: isGenZ ? (darkMode ? '#B400FF' : '#b400ff') : (darkMode ? '#6366f1' : '#6366f1') }}>
                                {isGenZ ? 'no cap frrr 🔥' : 'absolutely iconic 💅'}
                            </p>
                        </div>

                        {/* Added styling for safe area padding at bottom */}
                        <div className="h-safe pb-8"></div>
                    </div>
                </div>
            )}
        </>
    );
}
