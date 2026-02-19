import { Instagram, ArrowRight } from "lucide-react";

interface ConnectCardProps {
    username?: string;
    isConnected: boolean;
}

export function ConnectCard({ username, isConnected }: ConnectCardProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex gap-4 items-center shadow-sm">
            {/* Text side */}
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                    <p className="text-xl font-bold text-gray-800">Hello @{username || 'username'}</p>
                    <span
                        className="text-2xl"
                        style={{
                            display: "inline-block",
                            animation: "wave-jump 0.8s ease-in-out infinite",
                        }}
                    >
                        🤚
                    </span>
                </div>

                {/* Connect button */}
                <button className={`flex items-center gap-2 border transition rounded-xl px-4 py-2.5 ${isConnected
                        ? 'border-emerald-100 bg-emerald-50/50 text-emerald-700'
                        : 'border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 text-gray-700'
                    }`}>
                    <Instagram size={15} className={isConnected ? "text-emerald-500" : "text-pink-500"} />
                    <div className="text-left">
                        <p className="text-xs font-bold">{isConnected ? 'Account Connected' : 'Connect your account now'}</p>
                        <p className="text-[10px] opacity-60 tracking-tight font-medium uppercase">
                            {isConnected ? 'Syncing Automations' : 'Instagram Not Connected'}
                        </p>
                    </div>
                    {!isConnected && <ArrowRight size={13} className="text-gray-400 ml-2" />}
                </button>
            </div>

            {/* Outlined donut illustration */}
            <div className="flex-shrink-0 relative hidden sm:block">
                <svg width="110" height="110" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                    <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke={isConnected ? "#10b981" : "#d1d5db"}
                        strokeWidth="10"
                        strokeDasharray={`${2 * Math.PI * 38 * (isConnected ? 1 : 0.25)} ${2 * Math.PI * 38 * (isConnected ? 0 : 0.75)}`}
                        strokeDashoffset={2 * Math.PI * 38 * 0.05}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                    />
                </svg>
            </div>

            <style>{`
        @keyframes wave-jump {
          0%   { transform: translateY(0px) rotate(0deg); }
          20%  { transform: translateY(-6px) rotate(-10deg); }
          40%  { transform: translateY(-10px) rotate(10deg); }
          60%  { transform: translateY(-6px) rotate(-8deg); }
          80%  { transform: translateY(-2px) rotate(5deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
      `}</style>
        </div>
    );
}
