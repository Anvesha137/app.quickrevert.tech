import { useState, useEffect } from 'react';
import { TrendingUp, Reply } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { useTheme } from '../contexts/ThemeContext';


export default function TopPerforming() {
    const { user } = useAuth();
    const { uiStyle } = useUIStyle();
    const { darkMode } = useTheme();
    const isMillennial = uiStyle === 'millennial';
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
                .order('created_at', { ascending: false })
                .limit(2000);

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
                const count = activities?.filter(a => {
                    const aId = a.automation_id || (a.metadata as any)?.automation_id || (a.metadata as any)?.automationId || (a.metadata as any)?.AutomationId;
                    return aId === auto.id;
                }).length || 0;
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
        <div className={isMillennial 
            ? `rounded-[1.25rem] p-6 shadow-sm border transition-all duration-300 ${darkMode ? 'bg-[#1A1C23] border-[#2E323D]' : 'bg-white border-gray-100 hover:shadow-md'}`
            : `transition-colors duration-500 p-6 ${darkMode ? 'bg-transparent border-none shadow-none' : 'rounded-2xl border bg-white border-gray-100 shadow-xl'}`
        }>
            <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${isMillennial ? (darkMode ? 'bg-emerald-500/20 to-emerald-600/20' : 'from-emerald-100 to-emerald-200') : (darkMode ? 'bg-emerald-600/20 border border-emerald-500/30' : 'bg-gradient-to-br from-green-500 to-emerald-600')}`}>
                    <TrendingUp className={`w-5 h-5 ${isMillennial || darkMode ? 'text-emerald-500' : 'text-white'}`} />
                </div>
                <div>
                    <h3 className={`font-bold text-lg transition-colors ${darkMode ? 'text-white' : 'text-gray-800'}`}>Top Performing Automation</h3>
                    <p className={`text-sm transition-colors ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>Active engagement metrics</p>
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
                    <div className={`flex items-center justify-between mb-6 p-4 rounded-xl border transition-all duration-500 ${darkMode ? 'bg-white/5 border-white/10 shadow-none' : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-200 shadow-inner'}`}>
                        <div className="flex items-center gap-3">
                            <Reply className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                            <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-700'}`}>Top Activity</span>
                        </div>
                        <div className="text-right">
                            <p className={`text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent ${darkMode ? 'from-blue-400 to-purple-400' : ''}`}>
                                {automations[0].count}
                            </p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Responses</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {automations.map((automation, index) => (
                            <div key={index} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className={`text-sm font-medium truncate max-w-[150px] transition-colors ${darkMode ? 'text-gray-400' : 'text-gray-700'}`}>{automation.name}</span>
                                    <span className={`text-sm font-bold transition-colors ${darkMode ? 'text-white' : 'text-gray-800'}`}>{automation.count}</span>
                                </div>
                                <div className={`relative h-2 rounded-full overflow-hidden transition-colors ${darkMode ? 'bg-white/5' : 'bg-gray-200/50'}`}>
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


        </div>
    );
}
