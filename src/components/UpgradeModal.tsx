
import { X, CheckCircle2, Sparkles } from 'lucide-react';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

declare global {
    interface Window {
        Razorpay: any;
    }
}

export default function UpgradeModal() {
    const { isOpen, closeModal } = useUpgradeModal();
    const { user } = useAuth();
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>('annual');
    const [loading, setLoading] = useState(false);

    // Step 1: Select Plan
    // Step 2: Enter Details (Insta ID, Coupon)
    const [step, setStep] = useState<1 | 2>(1);
    const [instagramHandle, setInstagramHandle] = useState('');
    const [couponCode, setCouponCode] = useState('');

    if (!isOpen) return null;

    const features = [
        'Unlimited Auto DM',
        'Unlimited Comment automation',
        'Unlimited keyword triggers / post',
        'Live* & Story automation',
        'Analytics dashboard',
        'Ask to follow'
    ];

    const handleNextStep = () => {
        setStep(2);
    };

    const handleBackStep = () => {
        setStep(1);
    };

    const handleUpgrade = async () => {
        if (!instagramHandle.trim()) {
            alert("Please enter your Instagram ID.");
            return;
        }

        setLoading(true);
        try {
            console.log("Checking environment variables...");
            const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
            const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
            const razorpayKey = (import.meta.env.VITE_RAZORPAY_KEY_ID || '').trim();

            console.log(`Debug - Key Length: ${supabaseAnonKey.length}`);

            if (!supabaseUrl || supabaseUrl.includes('placeholder') ||
                !supabaseAnonKey || supabaseAnonKey.includes('placeholder') ||
                !razorpayKey) {
                alert(`Configuration Error: Missing Environment Variables.\n\nURL: ${supabaseUrl}\nKey: ${supabaseAnonKey ? '...present' : 'MISSING'}\nRazorpay: ${razorpayKey ? '...present' : 'MISSING'}`);
                setLoading(false);
                return;
            }

            // 1. Create Order
            console.log("Initiating Request via Fetch...");
            const response = await fetch(`${supabaseUrl}/functions/v1/create-razorpay-order`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    planType: billingCycle,
                    instagramHandle: instagramHandle,
                    couponCode: couponCode
                })
            });

            const responseText = await response.text();
            console.log("Response Status:", response.status);
            console.log("Response Body:", responseText);

            if (!response.ok) {
                // If not 2xx, throw with status and body
                throw new Error(`HTTP Error ${response.status}: ${responseText}`);
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`Invalid JSON Response: ${responseText}`);
            }

            if (data?.error) throw new Error(data.error);

            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Enter the Key ID generated from the Dashboard
                amount: data.amount,
                currency: data.currency,
                name: "QuickRevert",
                description: `Premium Plan - ${billingCycle === 'annual' ? 'Annual' : 'Quarterly'}`,
                image: "/Logo.png",
                order_id: data.id,
                notes: {
                    instagram_handle: instagramHandle,
                    coupon_code: couponCode
                },
                handler: async function (response: any) {
                    // 2. Verify Payment
                    const { error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
                        body: {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            userId: user?.id,
                            planType: billingCycle,
                            instagramHandle: instagramHandle,
                            couponCode: couponCode
                        }
                    });

                    if (verifyError) {
                        alert("Payment verification failed. Please contact support.");
                        return;
                    }

                    alert("Upgrade successful! Welcome to Premium.");
                    closeModal();
                    window.location.reload(); // Refresh to update limits
                },
                prefill: {
                    name: user?.user_metadata?.full_name,
                    email: user?.email,
                },
                theme: {
                    color: "#2563EB"
                }
            };

            const rzp1 = new window.Razorpay(options);
            rzp1.open();

        } catch (error) {
            console.error('Payment failed:', error);
            const keyUsed = import.meta.env.VITE_SUPABASE_ANON_KEY || 'N/A';
            const urlUsed = import.meta.env.VITE_SUPABASE_URL || 'N/A';
            alert(`Payment Failed.\n\nError: ${error.message || JSON.stringify(error)}\n\nDebug Info:\nURL: ${urlUsed}\nKey (first 20 chars): ${keyUsed.substring(0, 20)}...`);
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
                        Upgrade to <span className="text-violet-600">Premium</span>
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">For creators and brands ready to scale.</p>
                </div>

                <div className="px-8 py-4">
                    {/* STEP 1: Plan Selection */}
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Features Grid */}
                            <div className="grid grid-cols-2 gap-y-3 gap-x-6 mb-8">
                                {features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2.5">
                                        <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50 flex-shrink-0" />
                                        <span className="text-gray-700 font-medium text-sm">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Billing Toggle */}
                            <div className="bg-gray-100/80 p-1.5 rounded-xl flex items-center mb-6 font-medium text-sm relative">
                                <button
                                    onClick={() => setBillingCycle('annual')}
                                    className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${billingCycle === 'annual'
                                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Annual
                                    <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                        Save 33%
                                    </span>
                                </button>
                                <button
                                    onClick={() => setBillingCycle('quarterly')}
                                    className={`flex-1 py-3 px-4 rounded-lg transition-all duration-300 ${billingCycle === 'quarterly'
                                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Quarterly
                                </button>
                            </div>

                            {/* Savings Banner */}
                            {billingCycle === 'annual' && (
                                <div className="bg-green-50 border border-green-100 rounded-lg py-2.5 px-4 text-center mb-6">
                                    <p className="text-green-700 text-sm font-semibold flex items-center justify-center gap-2">
                                        <Sparkles className="w-4 h-4" />
                                        You save <span className="underline decoration-green-300 decoration-2">₹3,600</span> per year with this plan!
                                    </p>
                                </div>
                            )}

                            {/* Pricing Card */}
                            <div className="bg-violet-50/50 border border-violet-100 rounded-2xl p-6 text-center mb-6">
                                <p className="text-gray-500 font-medium text-sm mb-1">
                                    Billed {billingCycle === 'annual' ? 'Annually' : 'Quarterly'}
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-5xl font-extrabold text-gray-900">
                                        ₹{billingCycle === 'annual' ? '599' : '1'}
                                    </span>
                                    {billingCycle === 'annual' && (
                                        <span className="text-xl text-gray-400 font-semibold line-through decoration-2">
                                            ₹899
                                        </span>
                                    )}
                                    <span className="text-xl text-gray-500 font-medium">/mo</span>
                                </div>
                                <p className="text-violet-600 font-medium text-sm mt-2">
                                    Total payable: ₹{billingCycle === 'annual' ? '7,188' : '1'}
                                </p>
                            </div>

                            {/* CTA Button */}
                            <button
                                onClick={handleNextStep}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Next
                            </button>
                        </div>
                    )}

                    {/* STEP 2: Details */}
                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">

                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                                Try <strong>QuickRevert Pro</strong> for accessing unlimited automations.
                            </div>

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
                                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">We need this to verify your automated account.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Coupon Code <span className="text-gray-400 font-normal">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value)}
                                        placeholder="ENTER CODE"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase placeholder:normal-case"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    onClick={handleBackStep}
                                    className="px-6 py-4 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleUpgrade}
                                    disabled={loading}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Processing...' : 'Proceed to Pay'}
                                </button>
                            </div>

                        </div>
                    )}

                    {/* Footer */}
                    <p className="text-center text-xs text-gray-500 mt-6 font-medium">
                        <span className="font-bold text-gray-700">Price Lock Guarantee:</span> You will keep paying this price as long as you remain subscribed.
                    </p>
                </div>
            </div>
        </div>
    );
}
