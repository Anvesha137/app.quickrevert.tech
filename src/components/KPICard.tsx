import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
}

export default function KPICard({ title, value, icon: Icon, iconColor, iconBgColor }: KPICardProps) {
  return (
    <div className="group relative overflow-hidden rounded-[1.5rem] bg-white border border-gray-100 p-6 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
      {/* Decorative Background Element */}
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${iconBgColor} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl ${iconBgColor} flex items-center justify-center shadow-inner`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{title}</p>
        </div>

        <div>
          <p className="text-3xl font-black text-gray-900 tracking-tight">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
