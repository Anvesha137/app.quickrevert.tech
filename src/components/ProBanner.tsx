import { Crown, Sparkles } from 'lucide-react';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useSubscription } from '../contexts/SubscriptionContext';

interface ProBannerProps {
    isCompact?: boolean;
}

export default function ProBanner({ isCompact }: ProBannerProps) {
    const { openModal } = useUpgradeModal();
    const { isPremium } = useSubscription();

    if (isPremium) return null;

    if (isCompact) {
        return (
            <div className="h-full rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 p-5 shadow-xl shadow-red-500/20 group transition-all hover:scale-[1.01]">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                            <Crown className="w-6 h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-white font-bold text-base truncate">Unlock Pro</h3>
                            <p className="text-white/80 text-xs">Advanced features</p>
                        </div>
                    </div>
                    <button
                        onClick={openModal}
                        className="px-4 py-2 bg-white text-red-600 text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all whitespace-nowrap"
                    >
                        Upgrade
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 p-4 shadow-2xl shadow-red-500/50 group">
            <div className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity" style={{
                backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")`
            }}></div>

            <div className="relative flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                        <Crown className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base flex items-center gap-2 justify-center md:justify-start">
                            Unlock Pro Power! <Sparkles className="w-4 h-4" />
                        </h3>
                        <p className="text-white/90 text-xs">Get unlimited automations, contacts & advanced analytics</p>
                    </div>
                </div>
                <button
                    onClick={openModal}
                    className="px-5 py-2 rounded-lg bg-white text-red-600 font-bold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center gap-2 whitespace-nowrap text-sm"
                >
                    <Crown className="w-4 h-4" />
                    Upgrade to Pro
                </button>
            </div>
        </div>
    );
}
