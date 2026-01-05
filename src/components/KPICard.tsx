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
    <div className="group bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className={`${iconBgColor} p-3.5 rounded-xl shadow-sm group-hover:shadow-md transition-shadow`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">{title}</p>
        <p className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">{value}</p>
        {trend && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${trend.isPositive ? 'bg-green-50' : 'bg-red-50'}`}>
              <span className={`text-xs font-bold ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.isPositive ? '↑' : '↓'} {trend.value}
              </span>
            </div>
            <span className="text-xs text-gray-500 font-medium">vs last week</span>
          </div>
        )}
      </div>
    </div>
  );
}
