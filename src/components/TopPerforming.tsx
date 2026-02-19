import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function TopPerforming() {
    const { user } = useAuth();
    const [automations, setAutomations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchTopAutomations();
        }
    }, [user]);

    const fetchTopAutomations = async () => {
        try {
            setLoading(true);

            const { data: autos, error: autosError } = await supabase
                .from('automations')
                .select('id, name')
                .eq('user_id', user!.id);

            if (autosError) throw autosError;
            if (!autos || autos.length === 0) {
                setAutomations([]);
                return;
            }

            const { data: activities, error: activitiesError } = await supabase
                .from('automation_activities')
                .select('automation_id')
                .eq('user_id', user!.id)
                .not('automation_id', 'is', null);

            if (activitiesError) throw activitiesError;

            const colors = [
                'from-blue-500 to-cyan-500',
                'from-purple-500 to-indigo-500',
                'from-emerald-500 to-teal-500',
                'from-pink-500 to-rose-500',
                'from-orange-500 to-amber-500'
            ];

            const processedAutos = autos.map((auto, index) => {
                const count = activities?.filter(a => a.automation_id === auto.id).length || 0;
                return {
                    name: auto.name,
                    count: count,
                    color: colors[index % colors.length]
                };
            });

            const sortedAutos = processedAutos.sort((a, b) => b.count - a.count).slice(0, 3);
            const maxCount = Math.max(...sortedAutos.map(a => a.count), 1);
            const finalAutos = sortedAutos.map(a => ({
                ...a,
                percent: Math.round((a.count / maxCount) * 100)
            }));

            setAutomations(finalAutos);
        } catch (error) {
            console.error('Error fetching top automations:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-lg font-black text-gray-800 uppercase tracking-wider">Top Automations</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-tight mt-1">Best Performing Creators</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                    <TrendingUp size={18} className="text-cyan-500" />
                </div>
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                </div>
            ) : automations.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-tight">No activity recorded</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {automations.map((automation, index) => (
                        <div key={index} className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-sm font-black text-gray-700 truncate max-w-[150px]">{automation.name}</span>
                                <span className="text-sm font-black text-gray-800">{automation.count}</span>
                            </div>
                            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`absolute inset-y-0 left-0 bg-gradient-to-r ${automation.color} rounded-full transition-all duration-1000 ease-out`}
                                    style={{ width: `${automation.percent}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
