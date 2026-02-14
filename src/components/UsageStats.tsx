import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Crown, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UsageStats() {
    const { user } = useAuth();
    const [counts, setCounts] = useState({
        dms: 0,
        comments: 0
    });
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
                    .eq('activity_type', 'send_dm')
                    .gte('executed_at', startOfMonthIso);

                // Fetch Comment count
                const { count: commentCount, error: commentError } = await supabase
                    .from('automation_activities')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('activity_type', 'incoming_comment')
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
        <div className="bg-slate-800 rounded-lg p-4 text-white mx-4 mb-4">
            <div className="mb-4">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">{counts.dms}/{LIMIT} DM</span>
                    <span className="text-xs text-gray-400">per month</span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-1.5">
                    <div
                        className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((counts.dms / LIMIT) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="mb-6">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">{counts.comments}/{LIMIT} contacts</span>
                    <span className="text-xs text-gray-400">per month</span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-1.5">
                    <div
                        className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((counts.comments / LIMIT) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="space-y-2">
                <Link to="/pricing" className="flex items-center justify-center gap-2 w-full py-2 bg-gradient-to-r from-gray-200 to-gray-100 hover:from-white hover:to-gray-50 text-slate-800 text-sm font-bold rounded shadow-sm transition-all">
                    <Crown className="w-4 h-4 text-black" />
                    Upgrade to Pro
                </Link>

                <a href="mailto:support@quickrevert.tech" className="flex items-center justify-center gap-2 w-full py-2 bg-gray-200 hover:bg-gray-100 text-slate-800 text-sm font-bold rounded shadow-sm transition-all">
                    <MessageCircle className="w-4 h-4 text-slate-700" />
                    Support/Feedback
                </a>
            </div>
        </div>
    );
}
