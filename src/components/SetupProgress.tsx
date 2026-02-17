import { Check, AlertCircle } from 'lucide-react';

interface SetupProgressProps {
    progress: number;
    tasks: { label: string; completed: boolean }[];
}

export default function SetupProgress({ progress, tasks }: SetupProgressProps) {
    const dashArray = 339;
    const dashOffset = dashArray - (dashArray * progress) / 100;

    return (
        <div className="rounded-2xl backdrop-blur-xl bg-white/60 border border-white/40 p-6 shadow-xl">
            <h3 className="font-bold text-lg text-gray-800 mb-6">Setup Progress</h3>

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
                            className="text-slate-200/60"
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
                            className="transition-all duration-1000 ease-out filter drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"
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

            <div className="space-y-3">
                {tasks.map((task, index) => (
                    <div key={index} className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${task.completed ? 'bg-gradient-to-br from-green-400 to-emerald-500 shadow-sm' : 'bg-orange-500 shadow-sm'
                            }`}>
                            {task.completed ? (
                                <Check className="w-3 h-3 text-white" />
                            ) : (
                                <AlertCircle className="w-3 h-3 text-white" />
                            )}
                        </div>
                        <span className={`text-sm ${task.completed ? 'text-gray-700 font-medium' : 'text-orange-600 font-semibold'}`}>
                            {task.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
