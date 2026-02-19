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
    <div className="group relative overflow-hidden rounded-[1.5rem] bg-white border border-gray-100 p-6 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
      {/* Decorative Background Element */}
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${iconBgColor} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className={`w-12 h-12 rounded-2xl ${iconBgColor} flex items-center justify-center shadow-inner`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${trend.isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-500 mb-1">{title}</p>
          <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
