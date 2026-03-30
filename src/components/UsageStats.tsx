import { useSubscription } from '../contexts/SubscriptionContext';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { Skeleton } from './ui/skeleton';

export default function UsageStats() {
    const { usage, isPremium, dmLimit, isGifted, giftedSettings, subscription, loading } = useSubscription();
    const { openModal } = useUpgradeModal();
    const { darkMode } = useTheme();
    const { uiStyle } = useUIStyle();
    const isMillennial = uiStyle === 'millennial';

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
            <div className={`p-3 transition-all ${
                isMillennial 
                ? (darkMode ? 'bg-[#1A1C23] border-[#2E323D] rounded-xl border shadow-sm group-hover:border-white/20' : 'bg-gray-50/50 border-gray-100 rounded-xl border shadow-sm group-hover:border-blue-500/30')
                : (darkMode ? 'bg-transparent border-none' : 'bg-slate-50 border-gray-100 rounded-xl border shadow-sm group-hover:border-blue-500/30 group-hover:bg-blue-500/5')
            }`}>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                            <span className={`uppercase tracking-widest transition-colors ${darkMode ? 'text-white font-bold' : 'text-gray-400'}`}>DMs Triggered</span>
                            <div className="flex items-center gap-1">
                                {loading ? (
                                    <Skeleton className="h-3 w-16" />
                                ) : (
                                    <span className={`font-bold transition-colors ${darkMode ? 'text-white' : 'text-gray-900'}`}>{usage.dms.toLocaleString()}/{isUnlimited ? 'unlimited' : limitValue}</span>
                                )}
                            </div>
                        </div>
                        <div className={`h-1 w-full rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-slate-200/40'}`}>
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
                            <span className={`uppercase tracking-widest transition-colors ${darkMode ? 'text-white font-bold' : 'text-gray-400'}`}>Total Contacts</span>
                            <div className="flex items-center gap-1">
                                {loading ? (
                                    <Skeleton className="h-3 w-16" />
                                ) : (
                                    <span className={`font-bold transition-colors ${darkMode ? 'text-white' : 'text-gray-900'}`}>{usage.contacts.toLocaleString()}/{isUnlimited ? 'unlimited' : limitValue}</span>
                                )}
                            </div>
                        </div>
                        <div className={`h-1 w-full rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-slate-200/40'}`}>
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
                        <div className={`pt-2 border-t ${darkMode ? 'border-white/5' : 'border-black/5'}`}>
                             <div className="flex justify-between text-[9px]">
                                <span className={`uppercase tracking-widest ${darkMode ? 'text-white/50' : 'text-gray-400'}`}>{dateLabel}</span>
                                <span className={`font-bold ${darkMode ? 'text-white' : 'text-black-600'}`}>{formatDate(expiryDate)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
