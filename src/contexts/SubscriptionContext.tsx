import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type PlanId = 'basic' | 'try_me_out' | 'premium' | 'professional' | 'enterprise';

interface Subscription {
    id: string;
    user_id: string;
    plan_id: PlanId;
    status: 'active' | 'past_due' | 'canceled' | 'cancelled' | 'trialing';
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
    hadExpiredGift: boolean;
    expiredGiftSettings: any | null;
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

// DM activity types — kept for reference, count now read from user_limits.total_dms counter

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const CACHE_KEY = 'quickrevert_subscription_cache_v2';
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

    const [isGiftedState, setIsGiftedState] = useState(() => {
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
    
    const [giftedSettingsState, setGiftedSettingsState] = useState<any | null>(() => {
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

    // Live Supabase user_limits row — updated immediately when admin saves Gift Premium.
    // This is the authoritative source for dm_limit, automation_limit and feature flags.
    // It bypasses the stale 6-hour Neon sync so Usage Stats always shows the correct ceiling.
    const [userLimits, setUserLimits] = useState<any | null>(null);

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
                // 🚀 Fetch full user_limits row: total_dms counter + live gifted limit fields
                // dm_limit, automation_limit etc. are pushed here immediately on admin Gift Premium saves
                supabase
                    .from('user_limits')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle(),
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
                dms: dmCountResult.data?.total_dms || 0,  // reads from counter, not table scan
                contacts: contactCountResult.count || 0,
                automations: automationCountResult.count || 0,
                accounts: instagramAccountResult.count || 0
            });

            // Store live limit values — this is now the authoritative source for all limit computations
            setUserLimits(dmCountResult.data || null);

            try {
                const neonSyncCacheKey = `neon_sync_v2_${user.id}`;
                const lastNeonSync = parseInt(localStorage.getItem(neonSyncCacheKey) || '0');
                
                let updatedIsGifted = false;
                let updatedGiftedSettings: any = null;

                if (dmCountResult.data) {
                    updatedIsGifted = dmCountResult.data.is_gifted === true;
                    if (updatedIsGifted) {
                        updatedGiftedSettings = {
                            dm_limit: dmCountResult.data.dm_limit,
                            automation_limit: dmCountResult.data.automation_limit,
                            ask_to_follow_enabled: dmCountResult.data.ask_to_follow_enabled,
                            lead_manager: dmCountResult.data.lead_manager,
                            carousel_enabled: dmCountResult.data.carousel_enabled,
                            carousel_count: dmCountResult.data.carousel_count,
                            menu_flow_enabled: dmCountResult.data.menu_flow_enabled,
                            menu_flow_count: dmCountResult.data.menu_flow_count,
                            expiry_date: dmCountResult.data.expiry_date
                        };
                    }
                } else {
                    // Fallback to cache if database table has no entry
                    try {
                        const cached = localStorage.getItem(CACHE_KEY);
                        if (cached) {
                            const parsed = JSON.parse(cached);
                            updatedIsGifted = parsed.isGifted || false;
                            updatedGiftedSettings = parsed.giftedSettings || null;
                        }
                    } catch (e) {
                        console.error('Failed to parse cached gifted status:', e);
                    }
                }

                // Only sync every 6 hours or on first load
                if (Date.now() - lastNeonSync > 21600_000) {
                    // Lock instantly before invoking to prevent concurrent render loops
                    localStorage.setItem(neonSyncCacheKey, Date.now().toString());

                    try {
                        const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-user-neon', {
                            body: { userId: user.id, email: user.email, fullName: user.user_metadata?.full_name }
                        });

                        if (!syncError && syncData?.isBanned) {
                            localStorage.setItem('quickrevert_banned', 'true');
                            await supabase.auth.signOut();
                            return;
                        }

                        if (!syncError) {
                            updatedIsGifted = !!syncData?.isGifted;
                            updatedGiftedSettings = syncData?.giftedSettings || null;
                        } else {
                            // On sync error, allow retry after 5 minutes rather than locking for 6 hours
                            localStorage.setItem(neonSyncCacheKey, (Date.now() - 21600_000 + 300_000).toString());
                        }
                    } catch (err) {
                        // On network or invoke error, allow retry after 5 minutes
                        localStorage.setItem(neonSyncCacheKey, (Date.now() - 21600_000 + 300_000).toString());
                    }
                }

                setIsGiftedState(updatedIsGifted);
                setGiftedSettingsState(updatedGiftedSettings);

                // Save to cache with LOCAL variables to avoid closure issues
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    subscription: subResult.data?.[0] || null,
                    invoices: subResult.data || [],
                    usage: {
                        dms: dmCountResult.data?.total_dms || 0,
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
                        dms: dmCountResult.data?.total_dms || 0,
                        contacts: contactCountResult.count || 0,
                        automations: automationCountResult.count || 0,
                        accounts: instagramAccountResult.count || 0
                    },
                    isGifted: updatedIsGifted, // fallback to local variable if sync failed
                    giftedSettings: updatedGiftedSettings,
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

    // -------------------------------------------------------------------------
    // Realtime: instantly degrade to free plan when the webhook cancels the sub.
    // Without this, the user stays on premium until the next 15-min poll.
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`sub-changes-${user.id}`)
            .on(
                'postgres_changes' as any,
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'subscriptions',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload: any) => {
                    const newStatus = payload?.new?.status;
                    console.log('[SubscriptionContext] Realtime subscription update:', newStatus);

                    // Clear stale cache immediately so premium features don't linger
                    localStorage.removeItem(CACHE_KEY);

                    if (newStatus === 'cancelled' || newStatus === 'canceled') {
                        console.log('[SubscriptionContext] 🔴 Subscription cancelled — degrading to free plan now');
                    }
                    // Always re-fetch fresh data from Supabase
                    fetchSubscriptionData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, fetchSubscriptionData]);

    // -------------------------------------------------------------------------
    // Realtime: instantly degradation/upgrade when user_limits changes (Gift Premium)
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`limits-changes-${user.id}`)
            .on(
                'postgres_changes' as any,
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_limits',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload: any) => {
                    console.log('[SubscriptionContext] Realtime user_limits update:', payload);
                    // Clear stale cache immediately
                    localStorage.removeItem(CACHE_KEY);
                    // Always re-fetch fresh data from Supabase
                    fetchSubscriptionData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, fetchSubscriptionData]);

    const planId = (subscription?.plan_id || 'basic').toLowerCase() as PlanId;
    const isPlanActive = subscription && (
        subscription.status === 'active' || 
        subscription.status === 'trialing' || 
        subscription.status === 'past_due'
    ) && new Date(subscription.current_period_end) > new Date();

    // ── Gifted status & settings derived from live userLimits ──────────────────
    // Always check expiry before treating gift as active.
    // The DB flag is_gifted may still be true even after expiry (no server-side cron clears it),
    // so the client must enforce the date check as the authoritative guard.
    const now = new Date();

    const userLimitsGiftExpired =
        userLimits?.is_gifted === true &&
        userLimits?.expiry_date &&
        new Date(userLimits.expiry_date) <= now;

    // isGifted: has a gift record (may be expired)
    const isGifted = (userLimits?.is_gifted === true) || isGiftedState;

    const giftedSettings = userLimits?.is_gifted === true ? {
        dm_limit: userLimits.dm_limit,
        automation_limit: userLimits.automation_limit,
        ask_to_follow_enabled: userLimits.ask_to_follow_enabled,
        lead_manager: userLimits.lead_manager,
        carousel_enabled: userLimits.carousel_enabled,
        carousel_count: userLimits.carousel_count,
        menu_flow_enabled: userLimits.menu_flow_enabled,
        menu_flow_count: userLimits.menu_flow_count,
        expiry_date: userLimits.expiry_date
    } : giftedSettingsState;

    // ── Gifted active: only true if NOT expired ────────────────────────────────
    // Check expiry_date from both userLimits (live) and giftedSettings (Neon sync).
    // If expiry_date is set and has passed, treat gift as inactive regardless of is_gifted flag.
    const isGiftedActive =
        // Live userLimits path — must pass expiry check
        (userLimits?.is_gifted === true && !userLimitsGiftExpired) ||
        // Neon-sync fallback path — also must pass expiry check
        (isGifted && !userLimits && (!giftedSettings?.expiry_date || new Date(giftedSettings.expiry_date) > now));

    const isPremium = isGiftedActive || (!planId.includes('basic') && isPlanActive);
    const isProfessional = isGiftedActive || (['professional', 'enterprise'].some(p => planId.includes(p)) && !!isPlanActive);
    const isGold = isPremium && planId.includes('enterprise');

    // ── Track expired gift for display purposes (Billing history) ────────────────
    // Even if gift is expired, we still want to show it in billing history.
    // hadExpiredGift = true if there's a gift record in DB with a past expiry.
    const hadExpiredGift = !!userLimitsGiftExpired ||
        (!isGiftedActive && isGifted && !!giftedSettings?.expiry_date && new Date(giftedSettings.expiry_date) <= now);
    const expiredGiftSettings = hadExpiredGift ? (giftedSettings || {
        expiry_date: userLimits?.expiry_date,
        dm_limit: userLimits?.dm_limit,
    }) : null;

    // ── Effective gifted settings ───────────────────────────────────────────────
    // userLimits (Supabase, refreshed every 15 min + immediately on admin saves) takes priority
    // over giftedSettings (from Neon sync, stale up to 6 hours).
    const effectiveDmLimit       = userLimits?.dm_limit          ?? giftedSettings?.dm_limit;
    const effectiveAutoLimit     = userLimits?.automation_limit  ?? giftedSettings?.automation_limit;
    const effectiveCarousel      = userLimits?.carousel_enabled  ?? giftedSettings?.carousel_enabled  ?? false;
    const effectiveLeadManager   = userLimits?.lead_manager      ?? giftedSettings?.lead_manager      ?? false;
    const effectiveMenuFlow      = userLimits?.menu_flow_enabled ?? giftedSettings?.menu_flow_enabled ?? false;
    const effectiveCarouselCount = userLimits?.carousel_count    ?? giftedSettings?.carousel_count    ?? 6;
    const effectiveMenuFlowCount = userLimits?.menu_flow_count   ?? giftedSettings?.menu_flow_count   ?? 10;
    const effectiveAskToFollow   = userLimits?.ask_to_follow_enabled ?? giftedSettings?.ask_to_follow_enabled ?? false;
    const effectiveAccountLimit  = userLimits?.account_limit     ?? giftedSettings?.account_limit     ?? 1;

    // Feature flags
    const canUseAskToFollow = isGiftedActive ? effectiveAskToFollow : (!planId.includes('basic') && !!isPlanActive);
    const advancedPlanIds: PlanId[] = ['try_me_out', 'professional', 'enterprise'];
    const hasAdvancedFeatures = isGiftedActive || (advancedPlanIds.some(p => planId.includes(p)) && !!isPlanActive);
    
    // Feature flags - Gifted users respect their specific configuration
    const canUseCarousel = isGiftedActive ? effectiveCarousel : hasAdvancedFeatures;
    const canUseLeadManager = isGiftedActive ? effectiveLeadManager : hasAdvancedFeatures;
    const canUseMenuFlow = isGiftedActive ? effectiveMenuFlow : hasAdvancedFeatures;
    const canUseFollowUpMsgs = hasAdvancedFeatures;
    const canUseAppointmentManager = hasAdvancedFeatures;
    
    const maxCarouselCards = isGiftedActive ? effectiveCarouselCount : 6;
    const maxMenuFlowCards = isGiftedActive ? effectiveMenuFlowCount : 10;

    // Limits — prefer live user_limits values, fall back to Neon giftedSettings
    const dmLimit = isGiftedActive
        ? (effectiveDmLimit ?? 'Unlimited')
        : planId === 'basic' ? 2000
        : planId.includes('try_me_out') && isPlanActive ? 10000
        : isPlanActive ? 'Unlimited' : 2000;

    const automationLimit = isGiftedActive
        ? (effectiveAutoLimit ?? 'Unlimited')
        : planId === 'basic' ? 5
        : planId.includes('try_me_out') && isPlanActive ? 10
        : isPlanActive ? 'Unlimited' : 5;

    const accountLimit = isGiftedActive
        ? effectiveAccountLimit
        : planId.includes('enterprise') ? 10
        : planId.includes('professional') ? 2
        : 1;

    const isExpired = !isPremium && (isGifted || (subscription !== null && planId !== 'basic'));
    
    const dmLimitExceeded = (dmLimit !== 'Unlimited') && (usage.dms >= dmLimit);
    const automationLimitExceeded = (automationLimit !== 'Unlimited') && (usage.automations >= automationLimit);
    const accountLimitExceeded = (accountLimit !== 'Unlimited') && (usage.accounts >= accountLimit);
    
    // Connected accounts limit should NOT trigger the global "Limit Reached" banner
    const isAtLimit = dmLimitExceeded || automationLimitExceeded;

    const hasUsedSampler = invoices.some(inv => 
        inv.plan_id?.toLowerCase().includes('try_me_out') && 
        inv.status !== 'canceled' && inv.status !== 'cancelled'
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
            hadExpiredGift,
            expiredGiftSettings,
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
