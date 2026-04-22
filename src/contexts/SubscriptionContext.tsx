import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type PlanId = 'basic' | 'try_me_out' | 'premium' | 'professional' | 'enterprise';

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
    accounts: number;
}

interface SubscriptionContextType {
    subscription: Subscription | null;
    usage: Usage;
    loading: boolean;
    isPremium: boolean;
    isProfessional: boolean;
    isGold: boolean;
    isGifted: boolean;
    isGiftedActive: boolean;
    isExpired: boolean;
    isAtLimit: boolean;
    giftedSettings: any | null;
    canUseAskToFollow: boolean;
    canUseCarousel: boolean;
    canUseLeadManager: boolean;
    canUseMenuFlow: boolean;
    canUseFollowUpMsgs: boolean;
    canUseAppointmentManager: boolean;
    dmLimit: number | 'Unlimited';
    automationLimit: number | 'Unlimited';
    maxCarouselCards: number;
    maxMenuFlowCards: number;
    accountLimit: number;
    accountLimitExceeded: boolean;
    automationLimitExceeded: boolean;
    dmLimitExceeded: boolean;
    hasInstagramConnected: boolean;
    hasUsedSampler: boolean;
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
        if (typeof window === 'undefined') return { dms: 0, contacts: 0, automations: 0, accounts: 0 };
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > 3600_000) return { dms: 0, contacts: 0, automations: 0, accounts: 0 };
                return parsed.usage || { dms: 0, contacts: 0, automations: 0, accounts: 0 };
            }
        } catch (e) { console.error('Cache read error:', e); }
        return { dms: 0, contacts: 0, automations: 0, accounts: 0 };
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
                    .select('id', { count: 'exact', head: false })
                    .eq('user_id', user.id)
                    .eq('status', 'active')
            ]);

            if (subResult.error) throw subResult.error;
            const subData = subResult.data as Subscription[];
            setInvoices(subData);
            setSubscription(subData[0] || null);
            setHasInstagramConnected((instagramAccountResult.count || 0) > 0);

            setUsage({
                dms: dmCountResult.count || 0,
                contacts: contactCountResult.count || 0,
                automations: automationCountResult.count || 0,
                accounts: instagramAccountResult.count || 0
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
                        accounts: instagramAccountResult.count || 0
                    },
                    isGifted: updatedIsGifted,
                    giftedSettings: updatedGiftedSettings,
                    hasInstagramConnected: (instagramAccountResult.count || 0) > 0,
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
                        accounts: instagramAccountResult.count || 0
                    },
                    isGifted, // fallback to state if sync failed
                    giftedSettings,
                    hasInstagramConnected: (instagramAccountResult.count || 0) > 0,
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
    }, [user, initialFetchDone]);

    useEffect(() => {
        fetchSubscriptionData();
        const interval = setInterval(fetchSubscriptionData, 900_000); // 15 minutes (Optimized from 7m)

        // Smart Refresh: Check when the user comes back to the tab
        let lastFocusTime = Date.now();
        const handleFocus = () => {
            const now = Date.now();
            // Only refresh if at least 5 minutes have passed since last refresh
            if (now - lastFocusTime > 300_000) {
                console.log('[SubscriptionContext] Tab focused, triggering smart refresh...');
                lastFocusTime = now;
                fetchSubscriptionData();
            }
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, [fetchSubscriptionData]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase() as PlanId;
    const isPlanActive = subscription && (
        subscription.status === 'active' || 
        subscription.status === 'trialing' || 
        subscription.status === 'past_due'
    ) && new Date(subscription.current_period_end) > new Date();

    const isGiftedActive = isGifted && giftedSettings?.expiry_date && new Date(giftedSettings.expiry_date) > new Date();
    const isPremium = isGiftedActive || (planId !== 'basic' && isPlanActive);
    const isProfessional = isGiftedActive || (['professional', 'enterprise'].includes(planId) && !!isPlanActive);
    const isGold = isPremium && planId.includes('enterprise');

    // Feature flags
    const canUseAskToFollow = isGiftedActive ? (giftedSettings?.ask_to_follow_enabled ?? true) : (planId !== 'basic' && !!isPlanActive);
    const advancedPlanIds: PlanId[] = ['try_me_out', 'professional', 'enterprise'];
    const hasAdvancedFeatures = isGiftedActive || (advancedPlanIds.includes(planId) && !!isPlanActive);
    
    // Feature flags - Gifted users respect their specific configuration
    const canUseCarousel = isGiftedActive ? (giftedSettings?.carousel_enabled ?? true) : hasAdvancedFeatures;
    const canUseLeadManager = isGiftedActive ? (giftedSettings?.lead_manager ?? true) : hasAdvancedFeatures;
    const canUseMenuFlow = isGiftedActive ? (giftedSettings?.menu_flow_enabled ?? true) : hasAdvancedFeatures;
    const canUseFollowUpMsgs = hasAdvancedFeatures;
    const canUseAppointmentManager = hasAdvancedFeatures;
    
    const maxCarouselCards = isGiftedActive ? (giftedSettings?.carousel_count ?? 10) : 10;
    const maxMenuFlowCards = isGiftedActive ? (giftedSettings?.menu_flow_count ?? 10) : 10;

    // Limits
    const dmLimit = isGiftedActive
        ? (giftedSettings?.dm_limit ?? 'Unlimited')
        : planId === 'basic' ? 2000
        : planId === 'try_me_out' && isPlanActive ? 10000
        : isPlanActive ? 'Unlimited' : 2000;

    const automationLimit = isGiftedActive
        ? (giftedSettings?.automation_limit ?? 'Unlimited')
        : planId === 'basic' ? 5
        : planId === 'try_me_out' && isPlanActive ? 10
        : isPlanActive ? 'Unlimited' : 5;

    const accountLimit = isGiftedActive
        ? (giftedSettings?.account_limit ?? 1)
        : planId === 'enterprise' ? 10
        : planId === 'professional' ? 2
        : 1;

    const isExpired = !isPremium && (isGifted || (subscription !== null && planId !== 'basic'));
    
    const dmLimitExceeded = (dmLimit !== 'Unlimited') && (usage.dms >= dmLimit);
    const automationLimitExceeded = (automationLimit !== 'Unlimited') && (usage.automations >= automationLimit);
    const accountLimitExceeded = (accountLimit !== 'Unlimited') && (usage.accounts >= accountLimit);
    
    // Connected accounts limit should NOT trigger the global "Limit Reached" banner
    const isAtLimit = dmLimitExceeded || automationLimitExceeded;

    const hasUsedSampler = invoices.some(inv => 
        inv.plan_id?.toLowerCase().includes('try_me_out') && 
        inv.status !== 'canceled' // Only count successful or active as 'used'
    );


    return (
        <SubscriptionContext.Provider value={{
            subscription,
            usage,
            loading,
            isPremium,
            isProfessional,
            isGold,
            isGifted,
            isGiftedActive,
            isExpired,
            isAtLimit,
            giftedSettings,
            canUseAskToFollow,
            canUseCarousel,
            canUseLeadManager,
            canUseMenuFlow,
            canUseFollowUpMsgs,
            canUseAppointmentManager,
            dmLimit,
            automationLimit,
            maxCarouselCards,
            maxMenuFlowCards,
            accountLimit,
            accountLimitExceeded,
            automationLimitExceeded,
            dmLimitExceeded,
            hasInstagramConnected,
            hasUsedSampler,
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
