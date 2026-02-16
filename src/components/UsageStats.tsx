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
    const [loading, setLoading] = useState(true);
    const [subscription, setSubscription] = useState<any>(null);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // 1. Fetch Subscription
                const { data: subData } = await supabase
                    .from('subscriptions')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();
                setSubscription(subData);

                // 2. Fetch Usage
                const startOfMonth = new Date();
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);
                const startOfMonthIso = startOfMonth.toISOString();

                // Fetch DM count
                const { count: dmCount } = await supabase
                    .from('automation_activities')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('activity_type', ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'])
                    .gte('executed_at', startOfMonthIso);

                // Fetch Comment count
                const { count: commentCount } = await supabase
                    .from('automation_activities')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('activity_type', ['incoming_comment', 'reply_to_comment', 'comment', 'reply', 'post_comment'])
                    .gte('executed_at', startOfMonthIso);

                setCounts({
                    dms: dmCount || 0,
                    comments: commentCount || 0
                });
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [user]);

    const isUnlimited = subscription && (subscription.plan_id.startsWith('premium') || subscription.plan_id.startsWith('gold'));
    const limitValue = isUnlimited ? 'Unlimited' : 1000;

    if (loading) return <div className="p-4 text-xs text-center text-gray-400">Loading usage...</div>;

    return (
        <div className="mx-4 mb-4">
            <div className="mb-4">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">
                        {counts.dms.toLocaleString()}/{limitValue} DMs
                    </span>
                    <span className="text-xs text-gray-400 font-medium">MTD Usage</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                        className={`h-1.5 rounded-full transition-all duration-700 ${isUnlimited ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: isUnlimited ? '100%' : `${Math.min((counts.dms / 1000) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="mb-6">
                <div className="flex justify-between items-end mb-1">
                    <span className="text-sm font-bold text-white">
                        {counts.comments.toLocaleString()}/{limitValue} Activities
                    </span>
                    <span className="text-xs text-gray-400 font-medium">Monthly</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                        className={`h-1.5 rounded-full transition-all duration-700 ${isUnlimited ? 'bg-green-500' : 'bg-purple-500'}`}
                        style={{ width: isUnlimited ? '100%' : `${Math.min((counts.comments / 1000) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>

            <div className="space-y-2">
                {!isUnlimited && (
                    <button
                        onClick={openModal}
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all border border-blue-600 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Crown className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                        Upgrade to Premium
                    </button>
                )}

                <a
                    href="mailto:support@quickrevert.tech"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm font-bold rounded-lg transition-all border border-slate-700"
                >
                    <MessageCircle className="w-4 h-4" />
                    Support
                </a>
            </div>
        </div>
    );
}
