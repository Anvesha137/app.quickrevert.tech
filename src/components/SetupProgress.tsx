import { Check, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface SetupProgressProps {
    progress: number;
    tasks: { label: string; completed: boolean; action?: () => void; actionLabel?: string; loading?: boolean; disabled?: boolean }[];
}

export default function SetupProgress({ progress, tasks }: SetupProgressProps) {
    const { darkMode } = useTheme();
    const dashArray = 339;
    const dashOffset = dashArray - (dashArray * progress) / 100;

    return (
        <div className={`transition-colors duration-500 p-6 ${darkMode ? 'bg-transparent border-none shadow-none' : 'rounded-2xl border bg-white border-gray-100 shadow-xl'}`}>
            <h3 className={`font-bold text-lg mb-6 transition-colors ${darkMode ? 'text-white' : 'text-gray-800'}`}>Setup Progress</h3>

            <div className="flex items-center justify-center mb-8">
                <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg className="w-40 h-40 -rotate-90 origin-center" viewBox="0 0 128 128">
                        <circle
                            cx="64"
                            cy="64"
                            r="54"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="none"
                            className={darkMode ? 'text-white/5' : 'text-slate-200/60'}
                        />
                        <circle
                            cx="64"
                            cy="64"
                            r="54"
                            stroke="url(#progress-gradient)"
                            strokeWidth="12"
                            fill="none"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            className={`transition-all duration-1000 ease-out ${darkMode ? '' : 'filter drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]'}`}
                        />
                        <defs>
                            <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#3B82F6" />
                                <stop offset="100%" stopColor="#8B5CF6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <span className="text-4xl font-extrabold bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                {progress}<span className="text-2xl">%</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {tasks.map((task, index) => (
                    <div key={index} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                             <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${task.completed ? (darkMode ? 'bg-green-600' : 'bg-green-500 shadow-sm') : 'bg-[#FF5D23] shadow-sm'
                                }`}>
                                {task.completed ? (
                                    <Check className="w-3 h-3 text-white" />
                                ) : (
                                    <AlertCircle className="w-3 h-3 text-white" />
                                )}
                            </div>
                            <span className={`text-sm tracking-wide ${task.completed 
                                ? (darkMode ? 'text-gray-400 font-medium' : 'text-gray-700 font-medium') 
                                : (darkMode ? 'text-[#FF5D23] font-bold' : 'text-orange-600 font-semibold')}`}>
                                {task.label}
                            </span>
                        </div>
                        {!task.completed && task.action && (
                            <button
                                onClick={task.action}
                                disabled={task.loading || task.disabled}
                                className={`px-3 py-1 text-white text-[10px] font-bold uppercase rounded-lg transition-colors shadow-sm ${task.disabled
                                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                                    }`}
                                title={task.disabled ? 'Complete the previous steps first' : (task.actionLabel || 'Enable')}
                            >
                                {task.loading ? 'Enabling...' : (task.actionLabel || 'Enable')}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
