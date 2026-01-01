import { useTheme } from '../contexts/ThemeContext';

export function useThemeColors() {
  const { colorPalette } = useTheme();

  const getColorClasses = () => {
    const colorMap: Record<string, {
      bg: string;
      bgHover: string;
      text: string;
      border: string;
      borderHover: string;
    }> = {
      default: {
        bg: 'bg-blue-50',
        bgHover: 'group-hover:bg-blue-100',
        text: 'text-blue-600',
        border: 'border-gray-200',
        borderHover: 'hover:border-blue-300',
      },
      sunset: {
        bg: 'bg-orange-50',
        bgHover: 'group-hover:bg-orange-100',
        text: 'text-orange-600',
        border: 'border-gray-200',
        borderHover: 'hover:border-orange-300',
      },
      forest: {
        bg: 'bg-emerald-50',
        bgHover: 'group-hover:bg-emerald-100',
        text: 'text-emerald-600',
        border: 'border-gray-200',
        borderHover: 'hover:border-emerald-300',
      },
      lavender: {
        bg: 'bg-violet-50',
        bgHover: 'group-hover:bg-violet-100',
        text: 'text-violet-600',
        border: 'border-gray-200',
        borderHover: 'hover:border-violet-300',
      },
      rose: {
        bg: 'bg-pink-50',
        bgHover: 'group-hover:bg-pink-100',
        text: 'text-pink-600',
        border: 'border-gray-200',
        borderHover: 'hover:border-pink-300',
      },
      slate: {
        bg: 'bg-slate-50',
        bgHover: 'group-hover:bg-slate-100',
        text: 'text-slate-600',
        border: 'border-gray-200',
        borderHover: 'hover:border-slate-300',
      },
    };

    return colorMap[colorPalette] || colorMap.default;
  };

  const getGradientClass = () => {
    const gradients: Record<string, string> = {
      default: 'from-blue-500 to-cyan-500',
      sunset: 'from-orange-500 to-amber-500',
      forest: 'from-emerald-500 to-green-500',
      lavender: 'from-violet-500 to-purple-500',
      rose: 'from-pink-500 to-rose-500',
      slate: 'from-slate-500 to-gray-500',
    };
    return gradients[colorPalette] || gradients.default;
  };

  return {
    colorClasses: getColorClasses(),
    gradientClass: getGradientClass(),
  };
}
