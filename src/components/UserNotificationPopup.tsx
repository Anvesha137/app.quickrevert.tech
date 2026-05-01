import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Bell, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    is_dismissible: boolean;
}

const UserNotificationPopup: React.FC = () => {
    const { user } = useAuth();
    const [activeNotifications, setActiveNotifications] = useState<Notification[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFetching, setIsFetching] = useState(false);

    useEffect(() => {
        if (user && !isFetching) {
            fetchNotifications();
        }
    }, [user]);

    const fetchNotifications = async () => {
        setIsFetching(true);
        try {
            const { data, error } = await supabase.functions.invoke('get-user-notifications');
            if (!error && data) {
                setActiveNotifications(data);
            }
        } catch (err) {
            console.error('[UserNotificationPopup] Fetch error:', err);
        } finally {
            setIsFetching(false);
        }
    };

    const handleDismiss = (id: string) => {
        const remaining = activeNotifications.filter(n => n.id !== id);
        setActiveNotifications(remaining);
        if (currentIndex >= remaining.length && remaining.length > 0) {
            setCurrentIndex(remaining.length - 1);
        }
    };

    if (activeNotifications.length === 0) return null;

    const current = activeNotifications[currentIndex];

    const getIcon = () => {
        switch (current.type) {
            case 'error': return <AlertCircle className="w-6 h-6 text-red-500" />;
            case 'warning': return <AlertCircle className="w-6 h-6 text-yellow-500" />;
            case 'success': return <CheckCircle className="w-6 h-6 text-green-500" />;
            default: return <Info className="w-6 h-6 text-blue-500" />;
        }
    };

    const getTypeStyles = () => {
        switch (current.type) {
            case 'error': return 'border-red-100 bg-red-50';
            case 'warning': return 'border-yellow-100 bg-yellow-50';
            case 'success': return 'border-green-100 bg-green-50';
            default: return 'border-blue-100 bg-blue-50';
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl transition-all duration-500 scale-100 bg-white animate-in zoom-in-95">
                <div className={`p-6 ${getTypeStyles()}`}>
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-white rounded-xl shadow-sm">
                            {getIcon()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-slate-900 mb-1">{current.title}</h3>
                            <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                {current.message}
                            </div>
                        </div>
                        {current.is_dismissible && (
                            <button 
                                onClick={() => handleDismiss(current.id)}
                                className="p-1 hover:bg-white/50 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        )}
                    </div>

                    <div className="mt-6 flex items-center justify-between">
                        <div className="flex gap-1">
                            {activeNotifications.length > 1 && activeNotifications.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-1 rounded-full transition-all duration-300 ${i === currentIndex ? 'w-4 bg-slate-900' : 'w-1 bg-slate-300'}`} 
                                />
                            ))}
                        </div>
                        <button
                            onClick={() => handleDismiss(current.id)}
                            className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/20"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserNotificationPopup;
