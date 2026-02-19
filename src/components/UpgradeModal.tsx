import { X, CheckCircle2, Sparkles, Zap, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSubscription } from '../contexts/SubscriptionContext';

declare global {
    interface Window {
        Razorpay: any;
    }
}

type PlanTier = 'premium' | 'gold';

export default function UpgradeModal() {
    const { isOpen, closeModal, openCelebration } = useUpgradeModal();
    const { user } = useAuth();
    const { isPremium, isGold } = useSubscription();
    const [planTier, setPlanTier] = useState<PlanTier>('premium');
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>('annual');
    const [loading, setLoading] = useState(false);

    // Default to Gold if already Premium
    useEffect(() => {
        if (isOpen) {
            if (isPremium && !isGold) {
                setPlanTier('gold');
            } else {
                setPlanTier('premium');
            }
            setStep(1);
        }
    }, [isOpen, isPremium, isGold]);

    // Step 1: Select Plan
    // Step 2: Enter Details (Insta ID, Coupon)
    const [step, setStep] = useState<1 | 2>(1);
    const [instagramHandle, setInstagramHandle] = useState('');
    const [couponCode, setCouponCode] = useState('');

    if (!isOpen) return null;

    const premiumFeatures = [
        'Unlimited Auto DM',
        'Unlimited Comment automation',
        '2 keyword triggers / post',
        'Live & Story automation',
        'Analytics dashboard',
        'Lead manager',
        'Ask to follow'
    ];

    const goldFeatures = [
        'Up to 2 IG accounts',
        'All features unlocked',
        'Dedicated Automation Expert',
        'Mailchimp (10k emails/mo)',
        'Advanced workflows'
    ];

    const getPrice = () => {
        if (planTier === 'premium') {
            return billingCycle === 'annual' ? 599 : 899;
        } else {
            return billingCycle === 'annual' ? 3499 : 4999;
        }
    };

    const getTotalPayable = () => {
        const monthly = getPrice();
        return billingCycle === 'annual' ? monthly * 12 : monthly * 3;
    };

    const handleNextStep = () => {
        setStep(2);
    };

    const handleBackStep = () => {
        setStep(1);
    };

    const handleUpgrade = async () => {
        if (!instagramHandle.trim()) {
            toast.error("Please enter your Instagram ID.");
            return;
        }

        setLoading(true);
        try {
            const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
            const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
            const razorpayKey = (import.meta.env.VITE_RAZORPAY_KEY_ID || '').trim();

            if (!supabaseUrl || !supabaseAnonKey || !razorpayKey) {
                toast.error("Configuration Error: Missing Environment Variables.");
                setLoading(false);
                return;
            }

            // 1. Create Order
            const response = await fetch(`${supabaseUrl}/functions/v1/create-razorpay-order`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    planTier: planTier,
                    planType: billingCycle,
                    instagramHandle: instagramHandle,
                    couponCode: couponCode
                })
            });

            const responseText = await response.text();
            if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${responseText}`);

            const data = JSON.parse(responseText);
            if (data?.error) throw new Error(data.error);

            if (data?.free) {
                const { error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
                    body: {
                        isFree: true,
                        userId: user?.id,
                        planTier: planTier,
                        planType: billingCycle,
                        instagramHandle: instagramHandle,
                        couponCode: couponCode
                    }
                });

                if (verifyError) {
                    toast.error(`Upgrade failed: ${verifyError.message || JSON.stringify(verifyError)}`);
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
                    const { error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
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

                    if (verifyError) {
                        toast.error(`Payment verification failed: ${verifyError.message || JSON.stringify(verifyError)}`);
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
                    color: planTier === 'gold' ? "#D97706" : "#2563EB"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-200 relative">

                {/* Header */}
                <div className="p-6 pb-2 relative">
                    <button
                        onClick={closeModal}
                        className="absolute right-6 top-6 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        Upgrade to <span className={planTier === 'gold' ? 'text-amber-600' : 'text-blue-600'}>
                            {planTier === 'gold' ? 'Gold' : 'Premium'}
                        </span>
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                        {planTier === 'gold'
                            ? 'For serious brands running revenue via IG.'
                            : 'For creators and brands ready to scale.'}
                    </p>
                </div>

                <div className="px-8 py-4">
                    {/* STEP 1: Plan Selection */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">

                            {/* Tier Selection */}
                            <div className="flex gap-2 mb-6">
                                <button
                                    onClick={() => setPlanTier('premium')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${planTier === 'premium'
                                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                                        : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                                        }`}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span className="font-bold">Premium</span>
                                </button>
                                <button
                                    onClick={() => setPlanTier('gold')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${planTier === 'gold'
                                        ? 'border-amber-600 bg-amber-50 text-amber-700'
                                        : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                                        }`}
                                >
                                    <Crown className="w-4 h-4" />
                                    <span className="font-bold">Gold</span>
                                </button>
                            </div>

                            {/* Features Grid */}
                            <div className="grid grid-cols-1 gap-y-2 mb-8 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                {(planTier === 'gold' ? goldFeatures : premiumFeatures).map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2.5">
                                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${planTier === 'gold' ? 'text-amber-500' : 'text-blue-500'}`} />
                                        <span className="text-gray-700 font-medium text-xs">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Billing Toggle */}
                            <div className="bg-gray-100/80 p-1 rounded-xl flex items-center mb-6 font-medium text-sm">
                                <button
                                    onClick={() => setBillingCycle('annual')}
                                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${billingCycle === 'annual'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    Yearly
                                    <span className="text-green-600 text-[10px] font-black uppercase">
                                        -33%
                                    </span>
                                </button>
                                <button
                                    onClick={() => setBillingCycle('quarterly')}
                                    className={`flex-1 py-2 rounded-lg transition-all duration-300 ${billingCycle === 'quarterly'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    Quarterly
                                </button>
                            </div>

                            {/* Pricing Card */}
                            <div className={`rounded-2xl p-6 text-center mb-6 border ${planTier === 'gold' ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
                                <p className="text-gray-500 font-medium text-sm mb-1 uppercase tracking-wider">
                                    {billingCycle === 'annual' ? 'ANNUAL BILLING' : 'QUARTERLY BILLING'}
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-5xl font-black text-gray-900">
                                        ₹{getPrice()}
                                    </span>
                                    <span className="text-xl text-gray-500 font-medium">/mo</span>
                                </div>
                                <p className={`font-bold text-sm mt-2 ${planTier === 'gold' ? 'text-amber-700' : 'text-blue-700'}`}>
                                    Total: ₹{getTotalPayable().toLocaleString()}
                                </p>
                            </div>

                            {/* CTA Button */}
                            <button
                                onClick={handleNextStep}
                                className={`w-full text-white text-lg font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] ${planTier === 'gold'
                                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                                    }`}
                            >
                                Next
                            </button>
                        </div>
                    )}

                    {/* STEP 2: Details */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Instagram Handle <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">@</span>
                                        <input
                                            type="text"
                                            value={instagramHandle}
                                            onChange={(e) => setInstagramHandle(e.target.value)}
                                            placeholder="your_username"
                                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-bold">Required for account verification</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Coupon Code <span className="text-gray-400 font-normal italic">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value)}
                                        placeholder="ENTER PROMO CODE"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase placeholder:normal-case font-bold"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    onClick={handleBackStep}
                                    className="px-6 py-4 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleUpgrade}
                                    disabled={loading}
                                    className={`flex-1 text-white text-lg font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed ${planTier === 'gold'
                                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                                        }`}
                                >
                                    {loading ? 'Processing...' : 'Proceed to Pay'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
