import { Crown, Sparkles } from 'lucide-react';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTheme } from '../contexts/ThemeContext';

interface ProBannerProps {
    isCompact?: boolean;
}

export default function ProBanner({ isCompact }: ProBannerProps) {
    const { openModal } = useUpgradeModal();
    const { isPremium, isExpired, isGifted, isAtLimit, dmLimitExceeded, automationLimitExceeded } = useSubscription();
    const { darkMode } = useTheme();

    // Show banner if not premium OR if gifted and at limit
    const shouldShow = !isPremium || (isGifted && isAtLimit);
    if (!shouldShow) return null;

    let limitTitle = "Limit Reached!";
    let compactLimitTitle = "Limit Reached";
    let limitDesc = "Please upgrade to continue using.";
    let compactLimitDesc = "Upgrade to keep usage";
    
    if (isAtLimit) {
        if (dmLimitExceeded && automationLimitExceeded) {
            limitTitle = "Limits Reached!";
            compactLimitTitle = "Limits Reached";
            compactLimitDesc = "DMs & Automations full";
            limitDesc = "DM & Automation limits reached. Upgrade to continue.";
        } else if (dmLimitExceeded) {
            limitTitle = "DM Limit Reached!";
            compactLimitTitle = "DM Limit Reached";
            compactLimitDesc = "Upgrade for more DMs";
            limitDesc = "Reach more contacts by upgrading your plan.";
        } else if (automationLimitExceeded) {
            limitTitle = "Automation Limit!";
            compactLimitTitle = "Automation Limit";
            compactLimitDesc = "Need more automations?";
            limitDesc = "Build more automations by upgrading your plan.";
        }
    }

    const customMessage = (isGifted && isAtLimit) ? limitDesc : undefined;

    if (isCompact) {
        return (
            <div className={`h-full rounded-2xl p-5 shadow-xl group transition-all hover:scale-[1.01] ${darkMode ? 'bg-gradient-to-br from-indigo-900 to-purple-900 border border-white/10 shadow-indigo-500/10' : 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 shadow-red-500/20'}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                            <Crown className="w-6 h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-white font-bold text-base truncate">
                                {isAtLimit ? compactLimitTitle : (isExpired ? 'Plan Expired' : 'Unlock Pro')}
                            </h3>
                            <p className="text-white/80 text-xs text-balance">
                                {isAtLimit ? compactLimitDesc : (isExpired ? 'Renew to keep features' : 'Advanced features')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => openModal(undefined, customMessage)}
                        className={`px-4 py-2 text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all whitespace-nowrap ${darkMode ? `bg-gradient-to-r ${isPremium ? 'from-indigo-600 to-violet-700' : 'from-blue-500 to-purple-600'} text-white shadow-indigo-500/50 hover:brightness-110` : 'bg-white text-red-600'}`}
                    >
                        {isAtLimit ? 'Upgrade' : (isExpired ? 'Renew' : 'Upgrade')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-2xl p-3 md:p-5 shadow-2xl group ${darkMode ? 'bg-gradient-to-br from-indigo-900 to-purple-900 border border-white/10 shadow-indigo-500/10' : 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 shadow-red-500/50'}`}>
            <div className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity" style={{
                backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")`
            }}></div>
            
            <div className="relative flex flex-row items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                        <Crown className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-white font-bold text-sm md:text-base flex items-center gap-2 truncate">
                            {isAtLimit ? limitTitle : (isExpired ? 'Plan Expired!' : 'Unlock Pro!')} <Sparkles className="hidden md:block w-4 h-4" />
                        </h3>
                        <p className="text-white/90 text-[10px] md:text-xs truncate">
                          {isAtLimit ? limitDesc : 
                           (isExpired ? 'Renew now to restore features' : 'Get unlimited automations')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => openModal(undefined, customMessage)}
                    className={`px-3 py-1.5 md:px-5 md:py-2 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center gap-2 whitespace-nowrap text-xs md:text-sm shrink-0 ${darkMode ? `bg-gradient-to-r ${isPremium ? 'from-indigo-600 to-violet-700' : 'from-blue-500 to-purple-600'} text-white shadow-indigo-500/50 hover:brightness-110` : 'bg-white text-red-600'}`}
                >
                    <Crown className="hidden md:block w-4 h-4" />
                    {isAtLimit ? 'Upgrade' : (isExpired ? 'Renew' : 'Upgrade')}
                </button>
            </div>
        </div>
    );
}
