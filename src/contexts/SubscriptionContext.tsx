import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type PlanId = 'basic' | 'premium' | 'enterprise';

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

// DM activity types for server-side filtering
const DM_ACTIVITY_TYPES = ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction'];

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<Usage>({ dms: 0, contacts: 0 });
    const [loading, setLoading] = useState(true);

    const fetchSubscriptionData = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            // Run all queries in parallel
            const [subResult, dmCountResult, contactCountResult] = await Promise.all([
                // 1. Fetch Subscription
                supabase
                    .from('subscriptions')
                    .select('id, user_id, plan_id, status, current_period_end')
                    .eq('user_id', user.id)
                    .maybeSingle(),

                // 2. Server-side DM count (no row data transferred)
                supabase
                    .from('automation_activities')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('activity_type', DM_ACTIVITY_TYPES),

                // 3. Contacts count
                supabase
                    .from('contacts')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id),
            ]);

            if (subResult.error) throw subResult.error;
            setSubscription(subResult.data as Subscription | null);

            setUsage({
                dms: dmCountResult.count || 0,
                contacts: contactCountResult.count || 0,
            });
        } catch (err) {
            console.error('Error fetching subscription data:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchSubscriptionData();
        // Poll for updates every 5 minutes
        const interval = setInterval(fetchSubscriptionData, 300_000);
        return () => clearInterval(interval);
    }, [fetchSubscriptionData]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase();

    const isPremium = planId !== 'basic' && (
        planId.includes('premium') ||
        planId.includes('enterprise') ||
        planId.includes('quarterly') ||
        planId.includes('annual')
    );

    const isGold = planId.includes('enterprise');
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
