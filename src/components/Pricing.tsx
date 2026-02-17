import { useState } from 'react';
import { Check, Sparkles, Zap, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';

export default function Pricing() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const { openModal } = useUpgradeModal();
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>('quarterly');

    const plans = [
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
            buttonStyle: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30 font-extrabold',
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
            buttonStyle: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white hover:from-amber-600 hover:to-yellow-600 shadow-lg shadow-amber-500/30 font-extrabold',
        },
    ];

    return (
        <div className="min-h-screen bg-white text-gray-900 flex flex-col md:flex-row overflow-hidden font-sans">
            {/* Left Side: Logo and Branding */}
            <div className="w-full md:w-1/3 bg-gray-50 flex flex-col items-center justify-center p-8 border-r border-gray-100">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="p-6 rounded-[2.5rem] bg-white shadow-xl shadow-blue-500/5 border border-gray-100 mb-4 transition-transform hover:scale-105 duration-500">
                        <img src="/Logo.png" alt="QuickRevert Logo" className="w-32 h-32 object-contain" />
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter text-gray-900">QuickRevert</h1>
                    <p className="text-sm text-gray-500 font-medium tracking-wide max-w-[200px] leading-relaxed">
                        Intelligent Responses | Zero Wait Time | 24x7
                    </p>
                    <div className="mt-12 space-y-4">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="text-gray-400 hover:text-gray-900 transition-colors text-sm font-bold underline-offset-4 hover:underline flex items-center justify-center gap-2 mx-auto"
                        >
                            <span>Start with free plan</span>
                            <Zap className="w-3 h-3 fill-current" />
                        </button>
                        <button
                            onClick={() => navigate('/')}
                            className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-all px-4 py-2 rounded-full border border-gray-200 hover:border-gray-300"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Side: Pricing Plans */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto custom-scrollbar">
                <div className="w-full max-w-4xl">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-black mb-3 text-gray-900 tracking-tight">Choose your growth plan</h2>

                        {/* Compact Billing Toggle */}
                        <div className="flex items-center justify-center gap-3">
                            <span className={`text-xs font-bold ${billingCycle === 'quarterly' ? 'text-gray-900' : 'text-gray-400'}`}>Quarterly</span>
                            <button
                                onClick={() => setBillingCycle(billingCycle === 'annual' ? 'quarterly' : 'annual')}
                                className="w-10 h-5 bg-gray-100 rounded-full p-0.5 relative transition-colors border border-gray-200"
                            >
                                <div className={`w-3.5 h-3.5 bg-blue-600 rounded-full transition-all duration-300 ${billingCycle === 'annual' ? 'ml-5' : 'ml-0'}`} />
                            </button>
                            <span className={`text-xs font-bold ${billingCycle === 'annual' ? 'text-gray-900' : 'text-gray-400'}`}>
                                Yearly <span className="text-green-600 font-black ml-1">SAVE 33%</span>
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`relative rounded-[2rem] bg-white border transition-all duration-500 flex flex-col group ${plan.highlighted
                                    ? 'border-blue-500 shadow-[0_0_30px_-10px_rgba(59,130,246,0.2)] z-10 scale-[1.02]'
                                    : 'border-gray-100 hover:border-gray-200 shadow-sm'
                                    }`}
                            >
                                {plan.highlighted && (
                                    <div className="absolute -top-3 left-0 right-0 mx-auto w-fit">
                                        <span className="bg-blue-600 text-[10px] text-white font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">
                                            MOST POPULAR
                                        </span>
                                    </div>
                                )}

                                <div className="p-6 md:p-8 flex-1">
                                    <div className="mb-4 flex items-center justify-between">
                                        <div className={`p-2 rounded-xl ${plan.highlighted ? 'bg-blue-500/10' : 'bg-gray-50'}`}>
                                            {plan.icon}
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-3xl font-black text-gray-900">{plan.price}</span>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{plan.period}</span>
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-black mb-1 text-gray-900">{plan.name}</h3>
                                    <p className="text-xs text-gray-400 mb-6 font-medium leading-tight">{plan.description}</p>

                                    <ul className="space-y-3 mb-6">
                                        {plan.features.map((feature, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${plan.highlighted ? 'bg-blue-500/20' : 'bg-gray-100'}`}>
                                                    <Check className={`w-2.5 h-2.5 ${plan.highlighted ? 'text-blue-600' : 'text-gray-400'}`} />
                                                </div>
                                                <p className="text-[11px] text-gray-700 font-bold leading-tight">{feature}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="p-6 md:p-8 pt-0">
                                    <button
                                        onClick={openModal}
                                        className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all duration-300 transform group-hover:scale-[1.02] active:scale-[0.98] uppercase tracking-wider ${plan.buttonStyle}`}
                                    >
                                        {plan.cta}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 py-6 border-t border-gray-100 mt-12">
                        <div className="flex items-center gap-6 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            <a href="#" className="hover:text-blue-600 transition-colors">Terms</a>
                            <a href="#" className="hover:text-blue-600 transition-colors">Privacy</a>
                            <a href="#" className="hover:text-blue-600 transition-colors">Refund</a>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                        >
                            Log out Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
    );
}
