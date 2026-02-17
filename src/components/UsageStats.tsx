import { useSubscription } from '../contexts/SubscriptionContext';

export default function UsageStats() {
    const { usage, isPremium, dmLimit } = useSubscription();

    const limitValue = dmLimit;
    const isUnlimited = isPremium;

    return (
        <div className="px-0">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 backdrop-blur-md border border-white/40 shadow-sm">
                <div className="space-y-3">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                            <span className="text-black-500 uppercase tracking-widest text-shadow-sm">DMs Triggered</span>
                            <span className="text-black-900">{usage.dms.toLocaleString()}/{limitValue}</span>
                        </div>
                        <div className="h-1 w-full bg-slate-200/40 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                                style={{ width: isUnlimited ? '100%' : `${Math.min((usage.dms / (typeof limitValue === 'number' ? limitValue : 1)) * 100, 100)}%` }}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                            <span className="text-black-500 uppercase tracking-widest text-shadow-sm">Total Contacts</span>
                            <span className="text-black-900">{usage.contacts.toLocaleString()}/{limitValue}</span>
                        </div>
                        <div className="h-1 w-full bg-slate-200/40 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-600 transition-all duration-1000 shadow-[0_0_8px_rgba(168,85,247,0.3)]"
                                style={{ width: isUnlimited ? '100%' : `${Math.min((usage.contacts / (typeof limitValue === 'number' ? limitValue : 1)) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
