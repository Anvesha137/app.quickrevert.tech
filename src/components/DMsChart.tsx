import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function DMsChart() {
    const { user } = useAuth();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchChartData();
        }
    }, [user]);

    const fetchChartData = async () => {
        try {
            setLoading(true);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
            sevenDaysAgo.setHours(0, 0, 0, 0);

            const { data: allActivities, error } = await supabase
                .from('automation_activities')
                .select('created_at, activity_type, metadata')
                .eq('user_id', user!.id)
                .gte('created_at', sevenDaysAgo.toISOString());

            if (error) throw error;

            // Filter for DM-like activities
            const dmActivities = (allActivities || []).filter(a => {
                const type = (a.activity_type || '').toLowerCase();
                return (
                    type.includes('dm') ||
                    type.includes('message') ||
                    type.includes('interaction') ||
                    (a.metadata as any)?.direction === 'inbound' ||
                    (a.metadata as any)?.direction === 'outbound'
                );
            });

            // Process data for the chart using the filtered set
            const activities = dmActivities;

            // Process data for the chart
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const chartData = [];

            for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                const dayName = days[date.getDay()];
                const dateStr = date.toISOString().split('T')[0];

                const count = activities?.filter(a => a.created_at.startsWith(dateStr)).length || 0;
                chartData.push({ name: dayName, value: count });
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
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <span className="text-white text-lg font-bold">📈</span>
                </div>
                <div>
                    <h3 className="font-bold text-lg text-gray-800">DMs Sent per Day</h3>
                    <p className="text-sm text-gray-600">Last 7 days activity</p>
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
