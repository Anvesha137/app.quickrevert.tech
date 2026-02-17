import { useState } from 'react';
import { Check, Sparkles, Zap, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Pricing() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>('quarterly');

    const plans = [
        {
            name: 'BASIC',
            id: 'basic',
            description: 'Perfect for early creators and experiments.',
            price: '₹0',
            period: '/ mo',
            cta: 'Start Free',
            features: [
                'Auto DM - upto 1000/mo',
                'Comment automation - upto 1000/mo',
                '2 keyword triggers / post',
                'Basic automation rules',
                'No credit card required',
            ],
            highlighted: false,
            icon: <Zap className="w-6 h-6 text-gray-400" />,
            buttonStyle: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        },
        {
            name: 'PREMIUM',
            id: 'premium',
            description: 'For creators and brands ready to scale.',
            price: billingCycle === 'annual' ? '₹599' : '₹899',
            period: '/ mo',
            cta: 'Start Premium',
            features: [
                'Unlimited Auto DM',
                'Unlimited Comment automation',
                '2 keyword triggers / post',
                'Live & Story automation',
                'Analytics dashboard',
                'Lead manager',
                'Ask to follow',
            ],
            highlighted: true,
            icon: <Sparkles className="w-6 h-6 text-blue-500" />,
            buttonStyle: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30',
        },
        {
            name: 'GOLD',
            id: 'gold',
            description: 'For serious brands running revenue via IG.',
            price: billingCycle === 'annual' ? '₹3499' : '₹4999',
            period: '/ mo',
            cta: 'Upgrade Gold',
            features: [
                'Up to 2 IG accounts',
                'All features unlocked',
                'Dedicated Automation Expert',
                'Mailchimp (10k emails/mo)',
                'Advanced workflows',
            ],
            highlighted: false,
            icon: <Crown className="w-6 h-6 text-amber-500" />,
            buttonStyle: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white hover:from-amber-600 hover:to-yellow-600 shadow-lg shadow-amber-500/30',
        },
        {
            name: 'ENTERPRISE',
            id: 'enterprise',
            description: 'For agencies and large teams with custom needs.',
            price: 'Custom',
            period: '',
            cta: 'Contact Sales',
            features: [
                'Unlimited IG accounts',
                'Custom Integrations',
                'White-label options',
                '24/7 Priority Support',
                'Custom SLA',
            ],
            highlighted: false,
            icon: <Sparkles className="w-6 h-6 text-purple-500" />,
            buttonStyle: 'bg-gray-900 text-white hover:bg-black',
        },
    ];

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-20 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-5xl font-extrabold mb-6 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        Choose your growth plan
                    </h2>
                    <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                        Scale your Instagram automation with the perfect plan for your needs.
                    </p>

                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-4">
                        <span className={`text-sm ${billingCycle === 'quarterly' ? 'text-white' : 'text-gray-500'}`}>Quarterly</span>
                        <button
                            onClick={() => setBillingCycle(billingCycle === 'annual' ? 'quarterly' : 'annual')}
                            className="w-14 h-7 bg-gray-800 rounded-full p-1 relative transition-colors border border-gray-700 hover:border-blue-500/50"
                        >
                            <div className={`w-5 h-5 bg-blue-600 rounded-full transition-all duration-300 ${billingCycle === 'annual' ? 'ml-7' : 'ml-0'}`} />
                        </button>
                        <span className={`text-sm ${billingCycle === 'annual' ? 'text-white' : 'text-gray-500'}`}>
                            Yearly <span className="text-green-500 font-bold ml-1">SAVE 33%</span>
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 items-stretch">
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`relative rounded-[2.5rem] bg-[#141417] border transition-all duration-500 flex flex-col h-full group ${plan.highlighted
                                ? 'border-blue-500 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)] z-10 scale-105'
                                : 'border-gray-800 hover:border-gray-700'
                                }`}
                        >
                            {plan.highlighted && (
                                <div className="absolute -top-5 left-0 right-0 mx-auto w-fit">
                                    <span className="bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-6 py-1.5 rounded-full shadow-xl">
                                        MOST POPULAR
                                    </span>
                                </div>
                            )}

                            <div className="p-10 flex-1">
                                <div className="mb-6 flex items-center justify-between">
                                    <div className={`p-3 rounded-2xl ${plan.highlighted ? 'bg-blue-500/10' : 'bg-gray-800/50'}`}>
                                        {plan.icon}
                                    </div>
                                </div>

                                <h3 className="text-2xl font-bold mb-2 tracking-tight">{plan.name}</h3>
                                <p className="text-sm text-gray-500 mb-8 min-h-[40px] leading-relaxed italic">{plan.description}</p>

                                <div className="mb-8 flex items-baseline">
                                    <span className="text-5xl font-black">{plan.price}</span>
                                    <span className="ml-2 text-gray-500 font-medium">{plan.period}</span>
                                </div>

                                <ul className="space-y-4 mb-10">
                                    {plan.features.map((feature, index) => (
                                        <li key={index} className="flex items-start gap-3">
                                            <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${plan.highlighted ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
                                                <Check className={`w-3 h-3 ${plan.highlighted ? 'text-blue-500' : 'text-gray-400'}`} />
                                            </div>
                                            <p className="text-sm text-gray-300 leading-tight font-medium">{feature}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="p-10 pt-0">
                                <button
                                    onClick={() => {
                                        if (plan.id === 'basic') {
                                            navigate('/dashboard');
                                        } else {
                                            // Trigger upgrade modal or logic
                                            console.log(`Selected ${plan.name} ${billingCycle}`);
                                        }
                                    }}
                                    className={`w-full py-4 px-6 rounded-2xl text-sm font-bold transition-all duration-300 transform group-hover:scale-[1.02] active:scale-[0.98] ${plan.buttonStyle}`}
                                >
                                    {plan.cta}
                                </button>
                                {plan.id !== 'basic' && (
                                    <p className="text-center text-[10px] text-gray-600 mt-4 uppercase tracking-[0.2em] font-bold">
                                        Secure payment with Razorpay
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-20 text-center space-y-8">
                    <button
                        onClick={() => navigate('/')}
                        className="text-gray-500 hover:text-white transition-colors text-sm font-medium underline-offset-4 hover:underline"
                    >
                        Back to Home
                    </button>

                    <div className="pt-12 border-t border-gray-900 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-8 text-xs text-gray-500 font-medium">
                            <a href="#" className="hover:text-blue-500 transition-colors">Terms of Service</a>
                            <a href="#" className="hover:text-blue-500 transition-colors">Privacy Policy</a>
                            <a href="#" className="hover:text-blue-500 transition-colors">Refund Policy</a>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="text-xs font-bold text-gray-500 hover:text-red-500 transition-colors border-b border-gray-800 pb-1"
                        >
                            Log out Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
