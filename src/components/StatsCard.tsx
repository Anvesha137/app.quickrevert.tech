import { ReactNode } from "react";

interface StatsCardProps {
    label: string;
    value: string | number;
    change?: string;
    positive?: boolean;
    icon: ReactNode;
    iconBg: string;
}

export default function StatsCard({ label, value, change, positive, icon, iconBg }: StatsCardProps) {
    return (
        <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-between border border-gray-100 hover:shadow-md transition-shadow">
            <div>
                <p className="text-xs text-gray-400 mb-1 font-bold uppercase tracking-wider">{label}</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-xl text-gray-800 font-extrabold">{value}</span>
                    {change && (
                        <span className={`text-xs font-bold ${positive ? "text-emerald-500" : "text-red-400"}`}>
                            {change}
                        </span>
                    )}
                </div>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-inner ${iconBg}`}>
                {icon}
            </div>
        </div>
    );
}
