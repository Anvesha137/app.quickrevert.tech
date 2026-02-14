import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  iconColor: string;
  iconBgColor: string;
}

export default function KPICard({ title, value, icon: Icon, trend, iconColor, iconBgColor }: KPICardProps) {
  return (
    <div className="group bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex items-center gap-4">
      <div className={`${iconBgColor} p-4 rounded-xl shadow-sm group-hover:shadow-md transition-shadow shrink-0`}>
        <Icon className={`w-8 h-8 ${iconColor}`} />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
        {trend && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-xs font-bold ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </span>
            <span className="text-xs text-gray-500 font-medium">vs last week</span>
          </div>
        )}
      </div>
    </div>
  );
}
