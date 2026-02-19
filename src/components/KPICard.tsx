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
      <div className={`absolute top-0 right-0 w-20 h-20 -mr-10 -mt-10 rounded-full ${iconBgColor} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />

      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1 truncate">
            {title}
          </p>
          <p className="text-2xl font-black text-gray-900 tracking-tight leading-none">
            {value}
          </p>
        </div>

        <div className={`w-12 h-12 rounded-2xl ${iconBgColor} flex items-center justify-center shadow-lg shadow-emerald-500/5 transition-transform group-hover:scale-110 group-hover:rotate-3`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}
