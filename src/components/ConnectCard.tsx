import { Instagram, ArrowRight } from "lucide-react";

interface ConnectCardProps {
    username?: string;
    isConnected: boolean;
    planId?: string;
    profilePicture?: string;
}

export function ConnectCard({ username, isConnected, planId, profilePicture }: ConnectCardProps) {
    const getPlanLabel = () => {
        if (!planId) return 'Basic';
        const p = planId.toLowerCase();
        if (p.includes('quarterly')) return 'Premium Quarterly';
        if (p.includes('annual')) return 'Premium Annual';
        if (p.includes('gold')) return 'Gold';
        if (p.includes('enterprise')) return 'Enterprise';
        return p.charAt(0).toUpperCase() + p.slice(1);
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex gap-4 items-center shadow-sm min-h-[140px]">
            {/* Text side */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-0.5 mb-2">
                    <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.1em]">
                        {getPlanLabel()}
                    </span>
                    <p className="text-xl font-black text-gray-800 flex items-center gap-2">
                        Hello @{username || 'username'}
                    </p>
                </div>

                {/* Connect button */}
                <button className={`flex items-center gap-2 border transition rounded-xl px-4 py-2 ${isConnected
                    ? 'border-cyan-100 bg-cyan-50/50 text-cyan-700'
                    : 'border-gray-100 hover:border-cyan-300 hover:bg-cyan-50 text-gray-700'
                    }`}>
                    <Instagram size={14} className={isConnected ? "text-cyan-500" : "text-pink-500"} />
                    <div className="text-left">
                        <p className="text-[11px] font-black">{isConnected ? 'Account Connected' : 'Connect your account now'}</p>
                        <p className="text-[9px] opacity-60 tracking-tight font-black uppercase">
                            {isConnected ? 'Syncing Automations' : 'Instagram Not Connected'}
                        </p>
                    </div>
                    {!isConnected && <ArrowRight size={12} className="text-gray-400 ml-1" />}
                </button>
            </div>

            {/* Profile Image or Fallback */}
            <div className="flex-shrink-0 relative hidden sm:block">
                <div className="w-20 h-20 rounded-full border-4 border-gray-50 overflow-hidden shadow-xl shadow-cyan-100/30">
                    {profilePicture ? (
                        <img
                            src={profilePicture}
                            alt={username}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                            <Instagram size={32} className="text-gray-400 opacity-30" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
