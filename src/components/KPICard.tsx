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
    <div className="group relative overflow-hidden rounded-2xl backdrop-blur-xl bg-white/60 border border-white/40 p-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer">
      <div className="relative space-y-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${iconBgColor} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <p className="text-sm text-gray-600 font-medium">{title}</p>
        </div>
        <p className="text-4xl font-bold text-gray-800 tracking-tight">{value}</p>
        {trend && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-xs font-bold ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </span>
            <span className="text-xs text-gray-500 font-medium">vs last month</span>
          </div>
        )}
      </div>
    </div>
  );
}
