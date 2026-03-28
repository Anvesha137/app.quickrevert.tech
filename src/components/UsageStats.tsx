import { useSubscription } from '../contexts/SubscriptionContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { Skeleton } from './ui/skeleton';

export default function UsageStats() {
    const { usage, isPremium, dmLimit, isGifted, giftedSettings, subscription, loading } = useSubscription();
    const { openModal } = useUpgradeModal();

    const limitValue = dmLimit;
    const isUnlimited = dmLimit === 'Unlimited';
    
    const isAtLimit = !isUnlimited && (
        usage.dms >= (typeof limitValue === 'number' ? limitValue : 0) || 
        usage.contacts >= (typeof limitValue === 'number' ? limitValue : 0)
    );
    const customMessage = (isGifted && isAtLimit) ? "you have reached the limit - please upgrade to continue using" : undefined;

    const expiryDate = isGifted ? giftedSettings?.expiry_date : subscription?.current_period_end;
    const dateLabel = isGifted || isPremium ? 'Expiry Date' : 'Next Billing';

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
    };

    return (
        <div className="px-0 cursor-pointer group" onClick={() => openModal(undefined, customMessage)}>
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 backdrop-blur-md border border-white/40 shadow-sm transition-all group-hover:border-blue-500/30 group-hover:bg-blue-500/5">
                <div className="space-y-3">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                            <span className="text-black-500 uppercase tracking-widest text-shadow-sm">DMs Triggered</span>
                            <div className="flex items-center gap-1">
                                {loading ? (
                                    <Skeleton className="h-3 w-16" />
                                ) : (
                                    <span className="text-black-900">{usage.dms.toLocaleString()}/{isUnlimited ? 'unlimited' : limitValue}</span>
                                )}
                            </div>
                        </div>
                        <div className="h-1 w-full bg-slate-200/40 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                                style={{ 
                                    width: isUnlimited ? '100%' : `${Math.min((usage.dms / (typeof limitValue === 'number' ? limitValue : 1000)) * 100, 100)}%`,
                                    background: !isUnlimited && usage.dms >= (typeof limitValue === 'number' ? limitValue : 0) ? '#ef4444' : undefined 
                                }}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                            <span className="text-black-500 uppercase tracking-widest text-shadow-sm">Total Contacts</span>
                            <div className="flex items-center gap-1">
                                {loading ? (
                                    <Skeleton className="h-3 w-16" />
                                ) : (
                                    <span className="text-black-900">{usage.contacts.toLocaleString()}/{isUnlimited ? 'unlimited' : limitValue}</span>
                                )}
                            </div>
                        </div>
                        <div className="h-1 w-full bg-slate-200/40 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-600 transition-all duration-1000 shadow-[0_0_8px_rgba(168,85,247,0.3)]"
                                style={{ 
                                    width: isUnlimited ? '100%' : `${Math.min((usage.contacts / (typeof limitValue === 'number' ? limitValue : 1000)) * 100, 100)}%`,
                                    background: !isUnlimited && usage.contacts >= (typeof limitValue === 'number' ? limitValue : 0) ? '#ef4444' : undefined
                                }}
                            />
                        </div>
                    </div>

                    {(isGifted || isPremium) && (
                        <div className="pt-2 border-t border-black/5">
                            <div className="flex justify-between text-[9px]">
                                <span className="text-black-400 uppercase tracking-widest">{dateLabel}</span>
                                <span className="text-black-600 font-bold">{formatDate(expiryDate)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
