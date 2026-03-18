import { LucideIcon, ArrowRight } from 'lucide-react';
import { useThemeColors } from '../hooks/useThemeColors';

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
}

export default function QuickActionCard({ title, description, icon: Icon, onClick, disabled }: QuickActionCardProps) {
  const { colorClasses } = useThemeColors();

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bg-white rounded-xl border ${colorClasses.border} p-6 text-left ${colorClasses.borderHover} hover:shadow-md transition-all duration-200 group w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:shadow-none`}
    >
      <div className="flex items-start gap-4">
        <div className={`${colorClasses.bg} p-3 rounded-lg ${colorClasses.bgHover} transition-colors`}>
          <Icon className={`w-6 h-6 ${colorClasses.text}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            {title}
            <ArrowRight className={`w-4 h-4 text-gray-400 group-hover:${colorClasses.text} group-hover:translate-x-1 transition-all`} />
          </h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </button>
  );
}
