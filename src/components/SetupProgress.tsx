import { Check, AlertCircle } from 'lucide-react';

interface SetupProgressProps {
    progress: number;
    tasks: { label: string; completed: boolean }[];
}

export default function SetupProgress({ progress, tasks }: SetupProgressProps) {
    const dashArray = 339;
    const dashOffset = dashArray - (dashArray * progress) / 100;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-6 shadow-sm min-h-[140px]">
            {/* Left: Donut Chart */}
            <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
                <svg className="w-24 h-24 -rotate-90 origin-center" viewBox="0 0 128 128">
                    <circle
                        cx="64"
                        cy="64"
                        r="54"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="none"
                        className="text-gray-100"
                    />
                    <circle
                        cx="64"
                        cy="64"
                        r="54"
                        stroke="url(#progress-gradient-mini)"
                        strokeWidth="12"
                        fill="none"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                        <linearGradient id="progress-gradient-mini" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3B82F6" />
                            <stop offset="100%" stopColor="#8B5CF6" />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-black bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {progress}<span className="text-sm">%</span>
                    </span>
                </div>
            </div>

            {/* Right: Content & Steps */}
            <div className="flex-1 min-w-0">
                <div className="mb-3">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Setup Progress</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    {tasks.map((task, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${task.completed ? 'bg-emerald-500' : 'bg-gray-100'
                                }`}>
                                {task.completed ? (
                                    <Check className="w-2.5 h-2.5 text-white" />
                                ) : (
                                    <AlertCircle className="w-2.5 h-2.5 text-gray-400" />
                                )}
                            </div>
                            <span className={`text-[11px] font-bold truncate ${task.completed ? 'text-gray-400 line-through' : 'text-gray-600'
                                }`}>
                                {task.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
