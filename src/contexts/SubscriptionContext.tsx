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
    amount_paid?: number;
    discount_amount?: number;
    coupon_code?: string;
    created_at?: string;
}

interface Usage {
    dms: number;
    contacts: number;
    automations: number;
}

interface SubscriptionContextType {
    subscription: Subscription | null;
    usage: Usage;
    loading: boolean;
    isPremium: boolean;
    isGold: boolean;
    isGifted: boolean;
    isExpired: boolean;
    isAtLimit: boolean;
    giftedSettings: any | null;
    canUseAskToFollow: boolean;
    dmLimit: number | 'Unlimited';
    automationLimit: number | 'Unlimited';
    hasInstagramConnected: boolean;
    initialFetchDone: boolean;
    invoices: Subscription[];
    refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// DM activity types for server-side filtering
const DM_ACTIVITY_TYPES = ['dm', 'send_dm', 'incoming_message', 'incoming_event', 'interaction'];

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const CACHE_KEY = 'quickrevert_subscription_cache';
    const [initialFetchDone, setInitialFetchDone] = useState(false);

    const [invoices, setInvoices] = useState<Subscription[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return [];
                return parsed.invoices || [];
            }
        } catch (e) { console.error('Cache read error:', e); }
        return [];
    });

    const [subscription, setSubscription] = useState<Subscription | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return null;
                return parsed.subscription || null;
            }
        } catch (e) { console.error('Cache read error:', e); }
        return null;
    });

    const [usage, setUsage] = useState<Usage>(() => {
        if (typeof window === 'undefined') return { dms: 0, contacts: 0, automations: 0 };
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return { dms: 0, contacts: 0, automations: 0 };
                return parsed.usage || { dms: 0, contacts: 0, automations: 0 };
            }
        } catch (e) { console.error('Cache read error:', e); }
        return { dms: 0, contacts: 0, automations: 0 };
    });

    const [loading, setLoading] = useState(() => {
        if (!user) return false;
        const cached = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
        if (cached) {
            try { 
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return true;
                return false;
            } catch { return true; }
        }
        return true;
    });

    const [isGifted, setIsGifted] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return false;
                return parsed.isGifted;
            }
        } catch { return false; }
        return false;
    });
    
    const [giftedSettings, setGiftedSettings] = useState<any | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return null;
                return parsed.giftedSettings;
            }
        } catch { return null; }
        return null;
    });

    const [hasInstagramConnected, setHasInstagramConnected] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return false;
                return parsed.hasInstagramConnected || false;
            }
        } catch { return false; }
        return false;
    });

    const fetchSubscriptionData = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            if (!subscription && !initialFetchDone) {
                setLoading(true);
            }
            const [subResult, dmCountResult, contactCountResult, automationCountResult, instagramAccountResult] = await Promise.all([
                supabase
                    .from('subscriptions')
                    .select('id, user_id, plan_id, status, current_period_end, amount_paid, discount_amount, coupon_code, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('automation_activities')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('activity_type', DM_ACTIVITY_TYPES),
                supabase
                    .from('contacts')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id),
                supabase
                    .from('automations')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('status', 'active'),
                supabase
                    .from('instagram_accounts')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .maybeSingle()
            ]);

            if (subResult.error) throw subResult.error;
            const subData = subResult.data as Subscription[];
            setInvoices(subData);
            setSubscription(subData[0] || null);
            setHasInstagramConnected(!!instagramAccountResult.data);

            setUsage({
                dms: dmCountResult.count || 0,
                contacts: contactCountResult.count || 0,
                automations: automationCountResult.count || 0,
            });

            try {
                const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-user-neon', {
                    body: { userId: user.id, email: user.email, fullName: user.user_metadata?.full_name }
                });

                let updatedIsGifted = false;
                let updatedGiftedSettings = null;

                if (!syncError && syncData?.isBanned) {
                    localStorage.setItem('quickrevert_banned', 'true');
                    await supabase.auth.signOut();
                    return;
                }

                if (!syncError && syncData?.isGifted) {
                    updatedIsGifted = true;
                    updatedGiftedSettings = syncData.giftedSettings;
                }

                setIsGifted(updatedIsGifted);
                setGiftedSettings(updatedGiftedSettings);

                // Save to cache with LOCAL variables to avoid closure issues
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    subscription: subResult.data?.[0] || null,
                    invoices: subResult.data || [],
                    usage: {
                        dms: dmCountResult.count || 0,
                        contacts: contactCountResult.count || 0,
                        automations: automationCountResult.count || 0,
                    },
                    isGifted: updatedIsGifted,
                    giftedSettings: updatedGiftedSettings,
                    hasInstagramConnected: !!instagramAccountResult.data,
                    timestamp: Date.now()
                }));
            } catch (syncErr) {
                console.warn('Neon sync failed:', syncErr);
                // Even if sync-user-neon fails, still save the rest of the data
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    subscription: subResult.data?.[0] || null,
                    invoices: subResult.data || [],
                    usage: {
                        dms: dmCountResult.count || 0,
                        contacts: contactCountResult.count || 0,
                        automations: automationCountResult.count || 0,
                    },
                    isGifted, // fallback to state if sync failed
                    giftedSettings,
                    hasInstagramConnected: !!instagramAccountResult.data,
                    timestamp: Date.now()
                }));
            }

        } catch (err) {
            console.error('Error fetching subscription data:', err);
        } finally {
            setLoading(false);
            if (user) {
                setInitialFetchDone(true);
            }
        }
    }, [user, initialFetchDone, isGifted, giftedSettings]);

    useEffect(() => {
        fetchSubscriptionData();
        const interval = setInterval(fetchSubscriptionData, 300_000);
        return () => clearInterval(interval);
    }, [fetchSubscriptionData]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase();
    const isPlanActive = subscription && (
        subscription.status === 'active' || 
        subscription.status === 'trialing' || 
        subscription.status === 'past_due'
    ) && new Date(subscription.current_period_end) > new Date();

    const isGiftedActive = isGifted && giftedSettings?.expiry_date && new Date(giftedSettings.expiry_date) > new Date();
    const isPremium = isGiftedActive || (planId !== 'basic' && isPlanActive);
    const isGold = isPremium && planId.includes('enterprise');
    const canUseAskToFollow = isGiftedActive ? (giftedSettings?.ask_to_follow_enabled ?? true) : isPremium;
    const dmLimit = isGiftedActive ? (giftedSettings?.dm_limit ?? 'Unlimited') : (isPremium ? 'Unlimited' : 1000);
    const automationLimit = isGiftedActive ? (giftedSettings?.automation_limit ?? 'Unlimited') : (isPremium ? 'Unlimited' : 3);


    const isExpired = !isPremium && (isGifted || (subscription !== null && planId !== 'basic'));
    const limitValueForCheck = typeof dmLimit === 'number' ? dmLimit : 1000;
    const isAtLimit = (dmLimit !== 'Unlimited') && (usage.dms >= limitValueForCheck || usage.contacts >= limitValueForCheck);

    return (
        <SubscriptionContext.Provider value={{
            subscription,
            usage,
            loading,
            isPremium,
            isGold,
            isGifted,
            isExpired,
            isAtLimit,
            giftedSettings,
            canUseAskToFollow,
            dmLimit,
            automationLimit,
            hasInstagramConnected,
            initialFetchDone,
            invoices,
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
