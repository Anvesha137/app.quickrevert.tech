import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Crown, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';

export default function UsageStats() {
    const { user } = useAuth();
    const { openModal } = useUpgradeModal();
    const [counts, setCounts] = useState({
        dms: 0,
        comments: 0
    });
    // ... (rest of imports/setup)
    const [loading, setLoading] = useState(true);

    const LIMIT = 1000;

    useEffect(() => {
        if (!user) return;

        const fetchUsage = async () => {
            try {
                const startOfMonth = new Date();
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);
                const startOfMonthIso = startOfMonth.toISOString();

                // Fetch DM count
                const { count: dmCount, error: dmError } = await supabase
                    .from('automation_activities')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('activity_type', ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'])
                    .gte('executed_at', startOfMonthIso);

                // Fetch Comment count
                const { count: commentCount, error: commentError } = await supabase
                    .from('automation_activities')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('activity_type', ['incoming_comment', 'reply_to_comment', 'comment', 'reply', 'post_comment'])
                    .gte('executed_at', startOfMonthIso);

                if (!dmError && !commentError) {
                    setCounts({
                        dms: dmCount || 0,
                        comments: commentCount || 0
                    });
                }
            } catch (error) {
                console.error('Error fetching usage stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsage();

        // Refresh interval every minute to keep it somewhat updated
        const interval = setInterval(fetchUsage, 60000);
        return () => clearInterval(interval);
    }, [user]);

    if (loading) return <div className="p-4 text-xs text-center text-gray-400">Loading usage...</div>;

    return (
        <div className="mx-4 mb-4">
            <div className="mb-4">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">{counts.dms}/{LIMIT} DM in {new Date().toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-xs text-gray-400">per month</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((counts.dms / LIMIT) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="mb-6">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">{counts.comments}/{LIMIT} contacts</span>
                    <span className="text-xs text-gray-400">per month</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div
                        className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((counts.comments / LIMIT) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="space-y-2">
                <button
                    onClick={openModal}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-bold rounded shadow-sm transition-all border border-blue-600"
                >
                    <Crown className="w-4 h-4 text-yellow-300" />
                    Upgrade to Pro
                </button>

                <a href="mailto:support@quickrevert.tech" className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded shadow-sm transition-all border border-slate-700">
                    <MessageCircle className="w-4 h-4 text-gray-300" />
                    Support/Feedback
                </a>
            </div>
        </div>
    );
}
