<<<<<<< HEAD
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
=======
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
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

<<<<<<< HEAD
// DM activity types for server-side filtering
const DM_ACTIVITY_TYPES = ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction'];

=======
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<Usage>({ dms: 0, contacts: 0 });
    const [loading, setLoading] = useState(true);

<<<<<<< HEAD
    const fetchSubscriptionData = useCallback(async () => {
=======
    const fetchSubscriptionData = async () => {
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
        if (!user) {
            setLoading(false);
            return;
        }

        try {
<<<<<<< HEAD
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
=======
            // 1. Fetch Subscription
            const { data: subData, error: subError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (subError) throw subError;
            setSubscription(subData as Subscription | null);

            // 2. Fetch All Activities for Usage Counting
            const { data: allActivities } = await supabase
                .from('automation_activities')
                .select('activity_type, metadata, target_username')
                .eq('user_id', user.id);

            // 3. Robust Usage Categorization
            const dmCount = allActivities?.filter(a => {
                const type = (a.activity_type || '').toLowerCase();
                return (
                    type.includes('dm') ||
                    type.includes('message') ||
                    type.includes('event') ||
                    type.includes('interaction') ||
                    (a.metadata as any)?.direction === 'inbound' ||
                    (a.metadata as any)?.direction === 'outbound'
                );
            }).length || 0;

            // 4. Contacts Count
            const { count: uniqueUsersCount } = await supabase
                .from('contacts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            const uniqueFromActivities = new Set(
                allActivities
                    ?.map(a => a.target_username)
                    .filter(u => u && u !== 'Unknown' && !u.includes('undefined'))
            ).size;

            setUsage({
                dms: dmCount,
                contacts: Math.max(uniqueUsersCount || 0, uniqueFromActivities)
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
            });
        } catch (err) {
            console.error('Error fetching subscription data:', err);
        } finally {
            setLoading(false);
        }
<<<<<<< HEAD
    }, [user]);

    useEffect(() => {
        fetchSubscriptionData();
        // Poll for updates every 5 minutes
        const interval = setInterval(fetchSubscriptionData, 300_000);
        return () => clearInterval(interval);
    }, [fetchSubscriptionData]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase();

=======
    };

    useEffect(() => {
        fetchSubscriptionData();
        // Poll for updates every 5 minutes or listen to real-time
        const interval = setInterval(fetchSubscriptionData, 300000);
        return () => clearInterval(interval);
    }, [user]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase();

    // Robust detection: If it's not basic, and it has any premium-tier signal or is a paid interval, it's premium
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    const isPremium = planId !== 'basic' && (
        planId.includes('premium') ||
        planId.includes('enterprise') ||
        planId.includes('quarterly') ||
        planId.includes('annual')
    );

    const isGold = planId.includes('enterprise');
<<<<<<< HEAD
=======

>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
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
