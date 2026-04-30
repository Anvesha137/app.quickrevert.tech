import { X, CheckCircle2, Tag, Zap, Sparkles, Trophy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription, PlanId } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import { Skeleton } from './ui/skeleton';

declare global {
    interface Window {
        Razorpay: any;
    }
}

type PlanTier = 'try_me_out' | 'premium' | 'professional';

interface CouponState {
    status: 'idle' | 'validating' | 'valid' | 'invalid';
    message: string;
    discountAmount: number;
    finalAmount: number;
    isFree: boolean;
}

export default function UpgradeModal() {
    const { isOpen, closeModal, openCelebration, defaultBillingCycle, selectedPlanId, message } = useUpgradeModal();
    const { user, session } = useAuth();
    const { isPremium, isGifted } = useSubscription();
    const [planTier, setPlanTier] = useState<PlanTier>((selectedPlanId as PlanTier) || 'professional');
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>(defaultBillingCycle || 'annual');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [instagramHandle, setInstagramHandle] = useState('');
    const [couponCode, setCouponCode] = useState('');
    const [coupon, setCoupon] = useState<CouponState>({
        status: 'idle',
        message: '',
        discountAmount: 0,
        finalAmount: 0,
        isFree: false,
    });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setBillingCycle(defaultBillingCycle || 'annual');
            setPlanTier((selectedPlanId as PlanTier) || 'professional');
            setCouponCode('');
            setCoupon({ status: 'idle', message: '', discountAmount: 0, finalAmount: 0, isFree: false });
        }
    }, [isOpen, defaultBillingCycle, selectedPlanId]);

    // Force quarterly for 'try_me_out'
    useEffect(() => {
        if (planTier === 'try_me_out' && billingCycle === 'annual') {
            setBillingCycle('quarterly');
        }
    }, [planTier, billingCycle]);

    // Reset coupon validation when plan or billing cycle changes
    useEffect(() => {
        if (coupon.status === 'valid') {
            validateCoupon(couponCode);
        }
    }, [billingCycle, planTier]);

    // Show if open AND (user is not premium OR user is gifted)
    if (!isOpen || (isPremium && !isGifted)) return null;

    const getPlanFeatures = () => {
        if (planTier === 'professional') {
            return [
                'Up to 2 Instagram Accounts',
                'Unlimited Automations & DMs',
                'Ask to follow - Growth Tool',
                'Carousel & Post automation',
                'Lead Manager (Full CRM)',
                'Follow up automation',
                '1:1 Appointment System',
                'Custom Integrations'
            ];
        }
        if (planTier === 'try_me_out') {
            return [
                '1 Instagram Account',
                '10 Automations',
                '10,000 DMs / month',
                'Ask to follow - Growth Tool',
                'Carousel & Lead Manager',
                'Follow ups & 1:1 Appts',
                'Perfect for testing all features'
            ];
        }
        // Premium
        return [
            '1 Instagram Account',
            'Unlimited Automations',
            'Unlimited DMs',
            'Ask to follow - Growth Tool',
            'Live & Story automation',
            'Analytics dashboard',
            'Priority Support'
        ];
    };

    const getBaseTotal = () => {
        if (planTier === 'try_me_out') return 199;
        if (planTier === 'premium') return billingCycle === 'annual' ? 4199 : 1199;
        if (planTier === 'professional') return billingCycle === 'annual' ? 5999 : 1799;
        return 0;
    };

    const getMonthlyPrice = () => {
        if (planTier === 'try_me_out') return 199;
        if (planTier === 'premium') return billingCycle === 'annual' ? 349 : 399;
        if (planTier === 'professional') return billingCycle === 'annual' ? 499 : 599;
        return 0;
    };

    const getDisplayTotal = () => {
        if (coupon.status === 'valid') return coupon.finalAmount;
        return getBaseTotal();
    };

    const validateCoupon = async (code: string) => {
        if (!code.trim()) {
            setCoupon({ status: 'idle', message: '', discountAmount: 0, finalAmount: getBaseTotal(), isFree: false });
            return;
        }

        setCoupon(prev => ({ ...prev, status: 'validating' }));

        try {
            const { data, error } = await supabase.functions.invoke('validate-coupon', {
                body: { 
                    couponCode: code.trim(), 
                    planType: billingCycle,
                    planTier: planTier
                }
            });

            if (error || !data.valid) {
                 setCoupon({
                    status: 'invalid',
                    message: error?.message || data?.message || 'Invalid coupon code.',
                    discountAmount: 0,
                    finalAmount: getBaseTotal(),
                    isFree: false,
                 });
                return;
            }

            setCoupon({
                status: 'valid',
                message: data.message,
                discountAmount: data.discountAmount,
                finalAmount: data.finalAmount,
                isFree: data.isFree,
            });
        } catch (err: any) {
            setCoupon({
                status: 'invalid',
                message: err.message || 'Could not validate coupon. Try again.',
                discountAmount: 0,
                finalAmount: getBaseTotal(),
                isFree: false,
            });
        }
    };

    const handleCouponChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setCouponCode(val);
        setCoupon({ status: 'idle', message: '', discountAmount: 0, finalAmount: getBaseTotal(), isFree: false });

        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (val.length >= 4) {
            debounceRef.current = setTimeout(() => validateCoupon(val), 800);
        }
    };

    const handleApplyCoupon = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        validateCoupon(couponCode);
    };

    const handleNextStep = () => setStep(2);
    const handleBackStep = () => setStep(1);

    const handleUpgrade = async () => {
        if (!instagramHandle.trim()) {
            toast.error("Please enter your Instagram ID.");
            return;
        }

        setLoading(true);
        try {
            const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
            const razorpayKey = (import.meta.env.VITE_RAZORPAY_KEY_ID || '').trim();

            if (!supabaseUrl || !razorpayKey) {
                toast.error("Configuration Error: Missing Environment Variables.");
                setLoading(false);
                return;
            }

            if (!session) {
                toast.error("Your session has expired. Please log in again.");
                setLoading(false);
                return;
            }

            // 1. Create Order
            const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
                body: {
                    planTier: planTier,
                    planType: billingCycle,
                    instagramHandle: instagramHandle,
                    couponCode: couponCode
                }
            });

            if (error) {
                const errorMsg = error.message || 'Failed to create order. Please try again.';
                setLoading(false);
                toast.error(`Order Failed: ${errorMsg}`);
                return;
            }
            if (data?.error) {
                setLoading(false);
                toast.error(`Order Failed: ${data.error}`);
                return;
            }

            if (data?.free) {
                const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment-new', {
                    body: {
                        isFree: true,
                        userId: user?.id,
                        planTier: planTier,
                        planType: billingCycle,
                        instagramHandle: instagramHandle,
                        couponCode: couponCode
                    }
                });

                if (verifyError || verifyData?.error) {
                    toast.error(`Upgrade failed: ${verifyError?.message || verifyData?.error}`);
                    setLoading(false);
                    return;
                }

                closeModal();
                openCelebration();
                return;
            }

            const options = {
                key: razorpayKey,
                amount: data.amount,
                currency: data.currency,
                name: "QuickRevert",
                description: `${planTier.toUpperCase()} Plan - ${billingCycle === 'annual' ? 'Annual' : 'Quarterly'}`,
                image: "/Logo.png",
                order_id: data.id,
                notes: {
                    plan_tier: planTier,
                    instagram_handle: instagramHandle,
                    coupon_code: couponCode
                },
                handler: async function (response: any) {
                    const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment-new', {
                        body: {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            userId: user?.id,
                            planTier: planTier,
                            planType: billingCycle,
                            instagramHandle: instagramHandle,
                            couponCode: couponCode
                        }
                    });

                    if (verifyError || verifyData?.error) {
                        toast.error(`Payment verification failed: ${verifyError?.message || verifyData?.error}`);
                        setLoading(false);
                        return;
                    }

                    closeModal();
                    openCelebration();
                },
                prefill: {
                    name: user?.user_metadata?.full_name,
                    email: user?.email,
                },
                theme: {
                    color: planTier === 'professional' ? "#9333EA" : "#2563EB"
                }
            };

            const rzp1 = new window.Razorpay(options);
            rzp1.open();

        } catch (error: any) {
            console.error('Payment failed:', error);
            toast.error(`Payment Failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-300 relative border border-gray-100">

                {/* Header */}
                <div className="p-8 pb-4 relative">
                    <button
                        onClick={closeModal}
                        className="absolute right-6 top-6 z-50 p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full transition-all"
                    >
                        <X size={20} />
                    </button>

                    {message && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-black animate-pulse flex items-center gap-2 uppercase tracking-widest">
                             <Tag className="w-4 h-4" />
                             {message}
                        </div>
                    )}

                    <div className="flex items-center gap-4 mb-2">
                        <div className={`p-3 rounded-2xl ${
                            planTier === 'professional' ? 'bg-purple-100 text-purple-600' : 
                            planTier === 'try_me_out' ? 'bg-orange-100 text-orange-600' : 
                            'bg-blue-100 text-blue-600'
                        }`}>
                            {planTier === 'professional' ? <Trophy className="w-6 h-6" /> : 
                             planTier === 'try_me_out' ? <Zap className="w-6 h-6" /> : 
                             <Sparkles className="w-6 h-6" />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                                Upgrade to <span className={
                                    planTier === 'professional' ? 'text-purple-600' : 
                                    planTier === 'try_me_out' ? 'text-orange-500' : 
                                    'text-blue-600'
                                }>{planTier.replace(/_/g, ' ')}</span>
                            </h2>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-0.5">Scale your Instagram Automation</p>
                        </div>
                    </div>
                </div>

                <div className="px-8 pb-10">
                    {/* STEP 1: Plan Selection */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Tier Selector inside modal */}
                            <div className="grid grid-cols-3 gap-2 mb-6 p-1 bg-gray-50 rounded-2xl border border-gray-100">
                                {(['try_me_out', 'premium', 'professional'] as const).map((tier) => (
                                    <button
                                        key={tier}
                                        onClick={() => setPlanTier(tier)}
                                        className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            planTier === tier 
                                            ? 'bg-white shadow-md text-gray-900 ring-1 ring-gray-100' 
                                            : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        {tier.replace(/_/g, ' ')}
                                    </button>
                                ))}
                            </div>

                            {/* Features Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mb-8 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                                {getPlanFeatures().map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-2.5">
                                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                                            planTier === 'professional' ? 'text-purple-500' : 
                                            planTier === 'try_me_out' ? 'text-orange-500' : 
                                            'text-blue-500'
                                        }`} />
                                        <span className="text-gray-700 font-bold text-[10px] uppercase tracking-tight leading-tight">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Billing Cycle Toggle (Hidden for try_me_out) */}
                            {planTier !== 'try_me_out' && (
                                <div className="bg-gray-100/80 p-1.5 rounded-2xl flex items-center mb-6">
                                    <button
                                        onClick={() => setBillingCycle('annual')}
                                        className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 text-[11px] font-black uppercase tracking-widest ${billingCycle === 'annual'
                                            ? 'bg-white text-gray-900 shadow-lg'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        Annual
                                        <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">BEST VALUE</span>
                                    </button>
                                    <button
                                        onClick={() => setBillingCycle('quarterly')}
                                        className={`flex-1 py-3 rounded-xl transition-all duration-300 text-[11px] font-black uppercase tracking-widest ${billingCycle === 'quarterly'
                                            ? 'bg-white text-gray-900 shadow-lg'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        Quarterly
                                    </button>
                                </div>
                            )}

                            {/* Pricing Display */}
                            <div className={`rounded-3xl p-8 text-center mb-8 border transition-colors ${
                                planTier === 'professional' ? 'bg-purple-50/50 border-purple-100' : 
                                planTier === 'try_me_out' ? 'bg-orange-50/50 border-orange-100' : 
                                'bg-blue-50/50 border-blue-100'
                            }`}>
                                <p className="text-gray-400 font-black text-[10px] mb-2 uppercase tracking-widest">
                                    {planTier === 'try_me_out' ? 'SINGLE SAMPLER PACK' : 
                                     billingCycle === 'annual' ? 'ANNUAL PLAN' : 'QUARTERLY ACCESS'}
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-5xl font-black text-gray-900 tracking-tighter">
                                        ₹{getMonthlyPrice().toFixed(0)}
                                    </span>
                                    <span className="text-lg text-gray-400 font-bold uppercase tracking-tight">/mo*</span>
                                </div>
                                <div className={`inline-block mt-4 px-6 py-1.5 rounded-full font-black text-xs uppercase tracking-widest ${
                                    planTier === 'professional' ? 'bg-purple-600 text-white' : 
                                    planTier === 'try_me_out' ? 'bg-orange-500 text-white' : 
                                    'bg-blue-600 text-white'
                                }`}>
                                    Total Payable: ₹{getBaseTotal().toLocaleString()}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-3 font-bold uppercase tracking-tighter">
                                    *Effective monthly price. Billed {planTier === 'try_me_out' ? 'Monthly' : billingCycle === 'quarterly' ? 'Quarterly' : 'Annually'}.
                                </p>
                            </div>

                            <button
                                onClick={handleNextStep}
                                className={`w-full text-white text-sm font-black py-5 rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-[0.2em] ${
                                    planTier === 'professional' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20' : 
                                    planTier === 'try_me_out' ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20' : 
                                    'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                                }`}
                            >
                                Continue to Checkout
                            </button>
                        </div>
                    )}

                    {/* STEP 2: Checkout Details */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">
                                        Instagram Username <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative group">
                                        <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black transition-colors ${loading ? 'text-gray-300' : 'text-gray-400 group-focus-within:text-blue-600'}`}>@</span>
                                        <input
                                            type="text"
                                            value={instagramHandle}
                                            onChange={(e) => setInstagramHandle(e.target.value)}
                                            placeholder="creators_username"
                                            className="w-full pl-10 pr-4 py-4 rounded-2xl border border-gray-100 bg-gray-50 focus:outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all font-bold text-sm placeholder:font-bold placeholder:text-gray-300 shadow-sm"
                                        />
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-2 uppercase tracking-widest font-black flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3" /> Secure Account Linking
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">
                                        Promo Code
                                    </label>
                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={couponCode}
                                                onChange={handleCouponChange}
                                                placeholder="OPTIONAL"
                                                className={`w-full pl-10 pr-4 py-4 rounded-2xl border transition-all uppercase placeholder:normal-case font-black text-sm focus:outline-none focus:ring-4
                                                    ${coupon.status === 'valid'
                                                        ? 'border-green-400 bg-green-50 focus:ring-green-500/10'
                                                        : coupon.status === 'invalid'
                                                            ? 'border-red-400 bg-red-50 focus:ring-red-500/10'
                                                            : 'border-gray-100 bg-gray-50 focus:ring-blue-600/5'
                                                    }`}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleApplyCoupon}
                                            disabled={coupon.status === 'validating' || !couponCode.trim() || loading}
                                            className="px-6 py-4 rounded-2xl bg-blue-600 text-white shadow-xl text-[10px] font-black hover:bg-blue-700 transition-all disabled:opacity-30 uppercase tracking-widest min-w-[100px] z-10"
                                        >
                                            {coupon.status === 'validating' ? '...' : 'Apply'}
                                        </button>
                                    </div>

                                    {/* Coupon Feedback */}
                                    {coupon.status === 'valid' && (
                                        <p className="mt-2 text-[10px] font-black text-green-600 flex items-center gap-1 uppercase tracking-tight">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            {coupon.message}
                                        </p>
                                    )}
                                    {coupon.status === 'invalid' && (
                                        <p className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-tight">
                                            ✗ {coupon.message}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Order Summary */}
                            <div className="rounded-3xl bg-gray-50/80 border border-gray-100 p-6 space-y-3">
                                <div className="flex justify-between text-[10px] text-gray-400 font-black uppercase tracking-widest">
                                    <span>{planTier === 'try_me_out' ? 'Monthly Sampler' : `${planTier.replace(/_/g, ' ')} / ${billingCycle}`}</span>
                                    <span className="text-gray-900">₹{getBaseTotal().toLocaleString()}</span>
                                </div>
                                {coupon.status === 'valid' && coupon.discountAmount > 0 && (
                                    <div className="flex justify-between text-[10px] text-green-600 font-black uppercase tracking-widest">
                                        <span>Discount Applied</span>
                                        <span>- ₹{coupon.discountAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Amount Due</span>
                                        {coupon.status === 'valid' && (
                                            <span className="text-[9px] font-black text-green-600 uppercase tracking-tighter">
                                                {coupon.message.replace('✅ Coupon applied! ', '')} SAVED
                                            </span>
                                        )}
                                    </div>
                                    <span className={`text-xl font-black ${coupon.isFree ? 'text-green-600 animate-bounce' : 'text-gray-900'}`}>
                                        {coupon.isFree ? '₹0.00' : `₹${getDisplayTotal().toLocaleString()}`}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-2 flex gap-4">
                                <button
                                    onClick={handleBackStep}
                                    className="px-8 py-5 rounded-2xl border border-gray-100 text-[10px] font-black text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-all uppercase tracking-[0.2em]"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleUpgrade}
                                    disabled={loading}
                                    className={`flex-1 text-white text-sm font-black py-5 rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 uppercase tracking-[0.2em] ${
                                        planTier === 'professional' ? 'bg-purple-600 shadow-purple-600/20' : 
                                        planTier === 'try_me_out' ? 'bg-orange-500 shadow-orange-500/20' : 
                                        'bg-blue-600 shadow-blue-600/20'
                                    }`}
                                >
                                    {loading ? 'Processing...' : coupon.isFree ? 'Unlock Now 🎉' : 'Purchase Access'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
