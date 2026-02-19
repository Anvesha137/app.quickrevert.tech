import { useState, useEffect } from 'react';
import { TrendingUp, Reply } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import confetti from 'canvas-confetti';

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

            // 1. Fetch all automations for the user
            const { data: autos, error: autosError } = await supabase
                .from('automations')
                .select('id, name')
                .eq('user_id', user!.id);

            if (autosError) throw autosError;
            if (!autos || autos.length === 0) {
                setAutomations([]);
                return;
            }

            // 2. Fetch activity counts for these automations
            const { data: activities, error: activitiesError } = await supabase
                .from('automation_activities')
                .select('automation_id')
                .eq('user_id', user!.id)
                .not('automation_id', 'is', null);

            if (activitiesError) throw activitiesError;

            // 3. Process data
            const colors = [
                'from-blue-500 to-cyan-500',
                'from-purple-500 to-indigo-500',
                'from-green-500 to-emerald-500',
                'from-cyan-500 to-teal-500',
                'from-orange-500 to-red-500'
            ];

            const processedAutos = autos.map((auto, index) => {
                const count = activities?.filter(a => a.automation_id === auto.id).length || 0;
                return {
                    name: auto.name,
                    count: count,
                    color: colors[index % colors.length]
                };
            });

            // Sort by count descending and take top 3
            const sortedAutos = processedAutos.sort((a, b) => b.count - a.count).slice(0, 3);

            // Calculate relative percentages for progress bars
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
        <div className="rounded-2xl backdrop-blur-xl bg-white/60 border border-white/40 p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                    <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-lg text-gray-800">Top Performing Automation</h3>
                    <p className="text-sm text-gray-600">Active engagement metrics</p>
                </div>
            </div>

            {loading ? (
                <div className="py-12 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                </div>
            ) : automations.length === 0 ? (
                <div className="py-8 text-center">
                    <p className="text-sm text-gray-500 italic">No activity recorded yet</p>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200 shadow-inner">
                        <div className="flex items-center gap-3">
                            <Reply className="w-5 h-5 text-blue-600" />
                            <span className="text-sm text-gray-700 font-medium">Top Activity</span>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                {automations[0].count}
                            </p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Responses</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {automations.map((automation, index) => (
                            <div key={index} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]">{automation.name}</span>
                                    <span className="text-sm font-bold text-gray-800">{automation.count}</span>
                                </div>
                                <div className="relative h-2 bg-gray-200/50 rounded-full overflow-hidden">
                                    <div
                                        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${automation.color} rounded-full transition-all duration-1000 ease-out`}
                                        style={{ width: `${automation.percent}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <button
                onClick={() => {
                    const duration = 3 * 1000;
                    const animationEnd = Date.now() + duration;
                    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

                    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

                    const interval: any = setInterval(function () {
                        const timeLeft = animationEnd - Date.now();

                        if (timeLeft <= 0) {
                            return clearInterval(interval);
                        }

                        const particleCount = 50 * (timeLeft / duration);
                        // since particles fall down, start a bit higher than random
                        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
                    }, 250);
                }}
                className="mt-6 w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
                Congratulations
            </button>
        </div>
    );
}
