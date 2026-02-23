import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function DMsChart() {
    const { user } = useAuth();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState<7 | 15 | 30>(7);

    useEffect(() => {
        if (user) {
            fetchChartData();
        }
    }, [user, timeframe]);

    const fetchChartData = async () => {
        try {
            setLoading(true);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - (timeframe - 1));
            startDate.setHours(0, 0, 0, 0);

            const { data: allActivities, error } = await supabase
                .from('automation_activities')
                .select('created_at, activity_type, metadata')
                .eq('user_id', user!.id)
                .gte('created_at', startDate.toISOString());

            if (error) throw error;

            // Filter for DM-like activities (sent + received)
            const DM_TYPES = new Set(['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction']);
            const dmActivities = (allActivities || []).filter(a => {
                const type = (a.activity_type || '').toLowerCase();
                return DM_TYPES.has(type) || type.includes('dm') || type.includes('message');
            });

            // Process data for the chart using the filtered set
            const activities = dmActivities;

            // Process data for the chart
            const chartData = [];

            for (let i = 0; i < timeframe; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);

                let labelName = '';
                if (timeframe === 7) {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    labelName = days[date.getDay()];
                } else {
                    labelName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }

                const dateStr = date.toISOString().split('T')[0];

                const count = activities?.filter(a => a.created_at.startsWith(dateStr)).length || 0;
                chartData.push({ name: labelName, value: count });
            }

            setData(chartData);
        } catch (error) {
            console.error('Error fetching chart data:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-2xl backdrop-blur-xl bg-white/60 border border-white/40 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <span className="text-white text-lg font-bold">📈</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-gray-800">DMs Sent per Day</h3>
                        <p className="text-sm text-gray-600">Last {timeframe} days activity</p>
                    </div>
                </div>
                <div>
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(Number(e.target.value) as 7 | 15 | 30)}
                        className="bg-white/50 border border-gray-200 text-gray-700 sm:text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full p-2.5 font-medium cursor-pointer"
                    >
                        <option value={7}>Last 7 Days</option>
                        <option value={15}>Last 15 Days</option>
                        <option value={30}>Last 30 Days</option>
                    </select>
                </div>
            </div>

            <div className="h-64 w-full">
                {loading ? (
                    <div className="h-full w-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                            <XAxis
                                dataKey="name"
                                stroke="#9ca3af"
                                tick={{ fontSize: 12, fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                stroke="#9ca3af"
                                tick={{ fontSize: 12, fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                                dx={-10}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    borderRadius: '12px',
                                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#8B5CF6"
                                strokeWidth={3}
                                fill="url(#colorValue)"
                                animationDuration={1500}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
