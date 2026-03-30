import { LucideIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface KPICardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
}

export default function KPICard({ title, value, icon: Icon, iconColor, iconBgColor }: KPICardProps) {
  const { darkMode } = useTheme();
  return (
    <div className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 cursor-pointer p-5 ${darkMode ? 'bg-transparent border-none shadow-none' : 'bg-white border border-gray-100 rounded-[1.25rem] shadow-sm hover:shadow-xl hover:shadow-blue-500/5'}`}>
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-1 truncate transition-colors duration-500 ${darkMode ? 'text-white' : 'text-gray-400'}`}>
            {title}
          </p>
          <p className={`text-2xl font-black tracking-tight leading-none transition-colors duration-500 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {value}
          </p>
        </div>

        <div className={`w-12 h-12 rounded-2xl ${darkMode ? 'bg-white/5 border border-white/5' : iconBgColor} flex items-center justify-center shadow-md transition-transform group-hover:scale-110 group-hover:rotate-3`}>
          <Icon className={`w-6 h-6 ${darkMode ? 'text-white' : iconColor}`} />
        </div>
      </div>
    </div>
  );
}
