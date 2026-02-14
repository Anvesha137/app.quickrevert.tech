import { createClient } from '@supabase/supabase-js';

// ...

// 1. Create Order
console.log("Initializing local Supabase client with key:", supabaseAnonKey?.substring(0, 10) + "...");
const localSupabase = createClient(supabaseUrl, supabaseAnonKey);

const { data, error } = await localSupabase.functions.invoke('create-razorpay-order', {
    body: { planType: billingCycle }
});
import { X, CheckCircle2, Sparkles } from 'lucide-react';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
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
    const [billingCycle, setBillingCycle] = useState<'annual' | 'monthly'>('annual');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const features = [
        'Unlimited Automation',
        'Collect & Export Leads',
        'Comment Re-triggers',
        'Follower Growth Tools',
    ];

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            console.log("Checking environment variables...");
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;

            if (!supabaseUrl || supabaseUrl.includes('placeholder') ||
                !supabaseAnonKey || supabaseAnonKey.includes('placeholder') ||
                !razorpayKey) {
                alert(`Configuration Error: Missing Environment Variables.\n\nURL: ${supabaseUrl}\nKey: ${supabaseAnonKey ? '...present' : 'MISSING'}\nRazorpay: ${razorpayKey ? '...present' : 'MISSING'}`);
                setLoading(false);
                return;
            }

            // 1. Create Order
            console.log("Initializing local Supabase client with key:", supabaseAnonKey?.substring(0, 10) + "...");
            const localSupabase = createClient(supabaseUrl, supabaseAnonKey);

            const { data, error } = await localSupabase.functions.invoke('create-razorpay-order', {
                body: { planType: billingCycle }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Enter the Key ID generated from the Dashboard
                amount: data.amount,
                currency: data.currency,
                name: "QuickRevert",
                description: `Pro Plan - ${billingCycle === 'annual' ? 'Annual' : 'Monthly'}`,
                image: "/Logo.png",
                order_id: data.id,
                handler: async function (response: any) {
                    // 2. Verify Payment
                    const { error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
                        body: {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            userId: user?.id,
                            planType: billingCycle
                        }
                    });

                    if (verifyError) {
                        alert("Payment verification failed. Please contact support.");
                        return;
                    }

                    alert("Upgrade successful! Welcome to Pro.");
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
                        Upgrade to <span className="text-violet-600">Pro</span>
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Unlock specific pro features & remove limits</p>
                </div>

                <div className="px-8 py-4">
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
                                Save 40%
                            </span>
                        </button>
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={`flex-1 py-3 px-4 rounded-lg transition-all duration-300 ${billingCycle === 'monthly'
                                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Monthly
                        </button>
                    </div>

                    {/* Savings Banner */}
                    {billingCycle === 'annual' && (
                        <div className="bg-green-50 border border-green-100 rounded-lg py-2.5 px-4 text-center mb-6">
                            <p className="text-green-700 text-sm font-semibold flex items-center justify-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                You save <span className="underline decoration-green-300 decoration-2">₹2,400</span> per year with this plan!
                            </p>
                        </div>
                    )}

                    {/* Pricing Card */}
                    <div className="bg-violet-50/50 border border-violet-100 rounded-2xl p-6 text-center mb-6">
                        <p className="text-gray-500 font-medium text-sm mb-1">
                            Billed {billingCycle === 'annual' ? 'Annually' : 'Monthly'}
                        </p>
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-5xl font-extrabold text-gray-900">
                                ₹{billingCycle === 'annual' ? '599' : '999'}
                            </span>
                            {billingCycle === 'annual' && (
                                <span className="text-xl text-gray-400 font-semibold line-through decoration-2">
                                    ₹999
                                </span>
                            )}
                            <span className="text-xl text-gray-500 font-medium">/mo</span>
                        </div>
                        {billingCycle === 'annual' && (
                            <p className="text-violet-600 font-medium text-sm mt-2">
                                Total payable: ₹7,188
                            </p>
                        )}
                    </div>

                    {/* CTA Button */}
                    <button
                        onClick={handleUpgrade}
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Processing...' : 'Upgrade Now'}
                    </button>

                    {/* Footer */}
                    <p className="text-center text-xs text-gray-500 mt-6 font-medium">
                        <span className="font-bold text-gray-700">Price Lock Guarantee:</span> You will keep paying this price as long as you remain subscribed.
                    </p>
                </div>
            </div>
        </div>
    );
}
