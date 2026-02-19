import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

interface BarChartCardProps {
    title: string;
    subtitle: string;
    data: { name: string; value: number }[];
    color: string;
    footer: string;
}

export function BarChartCard({ title, subtitle, data, color, footer }: BarChartCardProps) {
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
                        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* White footer area */}
            <div className="bg-white px-5 py-4">
                <p className="text-sm font-bold text-gray-800">{title}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">{subtitle}</p>
                <div className="h-px bg-gray-100 my-3" />
                <p className="text-xs text-gray-500 font-medium">{footer}</p>
            </div>
        </div>
    );
}
