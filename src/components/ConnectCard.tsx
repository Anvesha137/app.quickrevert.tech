import { Instagram, ArrowRight } from "lucide-react";

interface ConnectCardProps {
    username?: string;
    isConnected: boolean;
}

export function ConnectCard({ username, isConnected }: ConnectCardProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex gap-4 items-center shadow-sm min-h-[140px]">
            {/* Text side */}
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                    <p className="text-lg font-black text-gray-800">Hello @{username || 'username'}</p>
                    <span
                        className="text-xl"
                        style={{
                            display: "inline-block",
                            animation: "wave-jump 0.8s ease-in-out infinite",
                        }}
                    >
                        🤚
                    </span>
                </div>

                {/* Connect button */}
                <button className={`flex items-center gap-2 border transition rounded-xl px-4 py-2 ${isConnected
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-gray-100 hover:border-cyan-300 hover:bg-cyan-50 text-gray-700'
                    }`}>
                    <Instagram size={14} className={isConnected ? "text-emerald-500" : "text-pink-500"} />
                    <div className="text-left">
                        <p className="text-[11px] font-black">{isConnected ? 'Account Connected' : 'Connect your account now'}</p>
                        <p className="text-[9px] opacity-60 tracking-tight font-black uppercase">
                            {isConnected ? 'Syncing Automations' : 'Instagram Not Connected'}
                        </p>
                    </div>
                    {!isConnected && <ArrowRight size={12} className="text-gray-400 ml-1" />}
                </button>
            </div>

            {/* Compact donut illustration */}
            <div className="flex-shrink-0 relative hidden sm:block">
                <svg width="80" height="80" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#f3f4f6" strokeWidth="12" />
                    <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke={isConnected ? "#10b981" : "#e5e7eb"}
                        strokeWidth="12"
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
