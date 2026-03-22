import { useSubscription } from '../contexts/SubscriptionContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { Crown } from 'lucide-react';

export default function PlanBanner() {
    const { isPremium, isExpired, isGifted, isAtLimit } = useSubscription();
    const { openModal } = useUpgradeModal();

    // Show banner if not premium OR if gifted and at limit
    const shouldShow = !isPremium || (isGifted && isAtLimit);
    if (!shouldShow) return null;

    const customMessage = (isGifted && isAtLimit) ? "you have reached the limit - please upgrade to continue using" : undefined;

    return (
        <div className="fixed top-0 left-0 md:left-80 right-0 z-[100] bg-yellow-400 text-yellow-950 py-0.5 px-4 text-center shadow-sm border-b border-yellow-500/20">
            <div className="flex items-center justify-center gap-2">
                <p className="text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5 text-yellow-900 fill-yellow-900/20" />
                    {isAtLimit ? 'Gifted plan limit reached' : (isExpired ? 'Your premium plan has expired' : 'You are on the free plan')}
                </p>
                <button
                    onClick={() => openModal(undefined, customMessage)}
                    className="px-2 py-[1px] bg-yellow-950 text-yellow-400 rounded-full text-[8px] font-black uppercase tracking-tighter hover:bg-yellow-900 transition-all shadow-sm hover:scale-105 active:scale-95"
                >
                    {isAtLimit ? 'Renew / Upgrade' : (isExpired ? 'Renew Now' : 'Upgrade')}
                </button>
            </div>
        </div>
    );
}
