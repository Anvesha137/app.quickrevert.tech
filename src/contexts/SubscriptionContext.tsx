import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type PlanId = 'basic' | 'premium' | 'gold' | 'enterprise';

interface Subscription {
    id: string;
    user_id: string;
    plan_id: PlanId;
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    current_period_end: string;
}

interface Usage {
    dms: number;
    contacts: number;
}

interface SubscriptionContextType {
    subscription: Subscription | null;
    usage: Usage;
    loading: boolean;
    isPremium: boolean;
    isGold: boolean;
    canUseAskToFollow: boolean;
    dmLimit: number | 'Unlimited';
    refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<Usage>({ dms: 0, contacts: 0 });
    const [loading, setLoading] = useState(true);

    const fetchSubscriptionData = async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            // 1. Fetch Subscription
            const { data: subData, error: subError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (subError) throw subError;
            setSubscription(subData as Subscription | null);

            // 2. Fetch Total Usage (All-time to match Dashboard counts)
            const { count: dmCount } = await supabase
                .from('automation_activities')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .in('activity_type', ['dm', 'dm_sent', 'send_dm', 'user_directed_messages']);

            // 3. Fetch Total Contacts (Match Dashboard Unique Users logic)
            const { count: uniqueUsersCount } = await supabase
                .from('contacts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            const { data: activities } = await supabase
                .from('automation_activities')
                .select('target_username')
                .eq('user_id', user.id);

            const uniqueFromActivities = new Set(
                activities
                    ?.map(a => a.target_username)
                    .filter(u => u && u !== 'Unknown' && !u.includes('undefined'))
            ).size;

            setUsage({
                dms: dmCount || 0,
                contacts: Math.max(uniqueUsersCount || 0, uniqueFromActivities)
            });
        } catch (err) {
            console.error('Error fetching subscription data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscriptionData();
        // Poll for updates every 5 minutes or listen to real-time
        const interval = setInterval(fetchSubscriptionData, 300000);
        return () => clearInterval(interval);
    }, [user]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase();

    // Robust detection: If it's not basic, and it has any premium-tier signal or is a paid interval, it's premium
    const isPremium = planId !== 'basic' && (
        planId.includes('premium') ||
        planId.includes('gold') ||
        planId.includes('enterprise') ||
        planId.includes('quarterly') ||
        planId.includes('annual')
    );

    const isGold = planId.includes('gold') || planId.includes('enterprise');

    const canUseAskToFollow = isPremium;
    const dmLimit = isPremium ? 'Unlimited' : 1000;

    return (
        <SubscriptionContext.Provider value={{
            subscription,
            usage,
            loading,
            isPremium,
            isGold,
            canUseAskToFollow,
            dmLimit,
            refresh: fetchSubscriptionData
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
}

export function useSubscription() {
    const context = useContext(SubscriptionContext);
    if (context === undefined) {
        throw new Error('useSubscription must be used within a SubscriptionProvider');
    }
    return context;
}
