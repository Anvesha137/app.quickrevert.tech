import { useSubscription } from '../contexts/SubscriptionContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { Crown } from 'lucide-react';

export default function PlanBanner() {
    const { isPremium } = useSubscription();
    const { openModal } = useUpgradeModal();

    if (isPremium) return null;

    return (
        <div className="fixed top-0 left-0 md:left-64 right-0 z-[100] bg-yellow-400 text-yellow-950 py-0.5 px-4 text-center shadow-sm border-b border-yellow-500/20">
            <div className="flex items-center justify-center gap-2">
                <p className="text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5 text-yellow-900 fill-yellow-900/20" />
                    You are on the free plan
                </p>
                <button
                    onClick={openModal}
                    className="px-2 py-[1px] bg-yellow-950 text-yellow-400 rounded-full text-[8px] font-black uppercase tracking-tighter hover:bg-yellow-900 transition-all shadow-sm hover:scale-105 active:scale-95"
                >
                    Upgrade
                </button>
            </div>
        </div>
    );
}
