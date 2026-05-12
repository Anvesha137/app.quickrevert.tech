import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

export default function UsageGraph() {
    const { user } = useAuth();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                const today = new Date();
                const start = startOfMonth(today);
                const end = endOfMonth(today);

                // Get all days in month
                const daysInMonth = eachDayOfInterval({ start, end });

                // Initialize data map
                const dataMap = new Map();
                daysInMonth.forEach(day => {
                    dataMap.set(format(day, 'yyyy-MM-dd'), {
                        date: format(day, 'MMM dd'),
                        dms: 0,
                        comments: 0
                    });
                });

                // 🚀 OPTIMIZED: Use RPC to get counts instead of raw rows
                const { data: stats, error } = await supabase
                    .rpc('get_daily_activity_stats', {
                        p_user_id: user.id,
                        p_start_date: start.toISOString(),
                        p_end_date: end.toISOString()
                    });

                if (error) throw error;

                stats?.forEach((stat: any) => {
                    const dateKey = stat.date;
                    if (dataMap.has(dateKey)) {
                        const entry = dataMap.get(dateKey);
                        const type = (stat.activity_type || '').toLowerCase();
                        
                        if (['dm', 'dm_sent', 'send_dm', 'user_directed_messages', 'incoming_message', 'interaction'].includes(type)) {
                            entry.dms += Number(stat.count);
                        } else if (['incoming_comment', 'reply_to_comment', 'comment', 'reply', 'post_comment', 'comment_reply'].includes(type)) {
                            entry.comments += Number(stat.count);
                        }
                    }
                });

                setData(Array.from(dataMap.values()));
            } catch (error) {
                console.error('Error fetching usage stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    if (loading) return <div className="h-64 flex items-center justify-center text-gray-400">Loading chart...</div>;

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Monthly Activity</h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                        />
                        <Tooltip
                            cursor={{ fill: '#F3F4F6' }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Legend />
                        <Bar dataKey="dms" name="Sent DMs" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="comments" name="Comments Processed" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
