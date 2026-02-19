import { useState, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
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

            const { data: activities, error } = await supabase
                .from('automation_activities')
                .select('created_at')
                .eq('user_id', user!.id)
                .gte('created_at', sevenDaysAgo.toISOString())
                .in('activity_type', ['dm', 'dm_sent', 'send_dm', 'user_directed_messages']);

            if (error) throw error;

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
        <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            {/* Dark chart area */}
            <div className="bg-[#1b1f3b] p-5 pb-4">
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data} barCategoryGap="40%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{
                                background: "#2d3361",
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                fontSize: 12,
                            }}
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <Bar dataKey="value" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* White footer area */}
            <div className="bg-white px-5 py-4 min-h-[100px] flex flex-col justify-center">
                <p className="text-sm font-bold text-gray-800 uppercase tracking-wider">DMs Sent per Day</p>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Last 7 days real-time activity</p>
                <div className="h-px bg-gray-100 my-3" />
                <p className="text-xs text-gray-500 font-medium">
                    {loading ? 'Crunching data...' : `${data.reduce((acc, curr) => acc + curr.value, 0)} messages total`}
                </p>
            </div>
        </div>
    );
}
