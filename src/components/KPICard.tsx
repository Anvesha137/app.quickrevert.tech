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
    <div className="group relative overflow-hidden rounded-[1.25rem] bg-white border border-gray-100 p-5 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
      {/* Subtle Background Glow */}
      <div className={`absolute top-0 right-0 w-20 h-20 -mr-10 -mt-10 rounded-full ${iconBgColor} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.05em] mb-0.5 truncate">
            {title}
          </p>
          <p className="text-xl font-black text-gray-900 tracking-tight leading-none">
            {value}
          </p>
        </div>

        <div className={`w-8 h-8 rounded-xl ${iconBgColor} flex items-center justify-center shadow-md transition-transform group-hover:scale-110 group-hover:rotate-3 shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}
