import { useState } from 'react';
import { Check, Sparkles, Bot, Zap, Globe, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useSubscription } from '../contexts/SubscriptionContext';

export default function Pricing() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const { openModal } = useUpgradeModal();
    const { hasUsedSampler, subscription, isPremium, isGiftedActive, giftedSettings } = useSubscription();
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>('annual');

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const expiryDate = isGiftedActive ? giftedSettings?.expiry_date : subscription?.current_period_end;

    const activePlanId = subscription?.plan_id || 'basic';

    const allPlans = [
        {
            name: 'FREE',
            id: 'basic',
            description: 'Best for getting started.',
            price: '₹0',
            period: '',
            cta: 'Start Free',
            features: ['1 Instagram Account', '5 Automations', '2,000 DMs / month'],
            icon: <Bot className="w-5 h-5 text-gray-400" />,
            buttonStyle: 'bg-gray-100 text-gray-900 hover:bg-gray-200 font-bold',
            type: 'free'
        },
        {
            name: 'TRY ME OUT',
            id: 'try_me_out',
            description: 'Test the core experience quickly.',
            price: '₹199',
            period: '/ one-time',
            cta: 'Try Now',
            features: [
                '1 Instagram Account',
                '10 Automations',
                '10,000 DMs',
                'Growth Tool (Ask to follow)',
                'Carousel msgs',
                'Lead Manager',
                'Follow up msgs',
                '1:1 appointment manager*'
            ],
            icon: <Zap className="w-5 h-5 text-orange-500" />,
            buttonStyle: 'bg-orange-500 text-white hover:bg-orange-600 font-bold',
            type: 'paid'
        },
        {
            name: 'PREMIUM',
            id: 'premium',
            description: 'For creators ready to scale.',
            price: billingCycle === 'annual' ? '₹349' : '₹399',
            totalPrice: billingCycle === 'annual' ? '₹4199 billed yearly' : '₹1199 billed quarterly',
            period: '/ mo',
            cta: 'Start Premium',
            features: [
                '1 Instagram Account',
                'Unlimited automations',
                'Unlimited DMs',
                'Growth Tool (Ask to follow)'
            ],
            icon: <Sparkles className="w-5 h-5 text-blue-500" />,
            buttonStyle: 'bg-blue-600 text-white hover:bg-blue-700 font-bold',
            type: 'paid'
        },
        {
            name: 'PROFESSIONAL',
            id: 'professional',
            description: 'Advanced tools for high-growth accounts.',
            price: billingCycle === 'annual' ? '₹499' : '₹599',
            totalPrice: billingCycle === 'annual' ? '₹5999 billed yearly' : '₹1799 billed quarterly',
            period: '/ mo',
            cta: 'Go Professional',
            features: [
                'Unlimited automations',
                'Unlimited DMs',
                'Growth Tool (Ask to follow)',
                'Carousel msgs',
                'Lead Manager',
                'Follow up msgs',
                '1:1 appointment manager*'
            ],
            highlighted: true,
            icon: <Zap className="w-5 h-5 text-purple-500" />,
            buttonStyle: 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg font-black',
            type: 'paid'
        },
        {
            name: 'ENTERPRISE',
            id: 'enterprise',
            description: 'For agencies and teams.',
            price: 'Contact',
            period: 'Sales',
            cta: 'Contact Sales',
            features: [
                'Multiple Instagram Accounts',
                'Unlimited automations',
                'Unlimited DMs',
                'Growth Tool (Ask to follow)',
                'Carousel msgs',
                'Lead Manager',
                'Follow up msgs',
                '1:1 appointment manager*'
            ],
            icon: <Globe className="w-5 h-5 text-emerald-500" />,
            buttonStyle: 'bg-emerald-600 text-white hover:bg-emerald-700 font-bold',
            type: 'paid'
        },
    ];

    const isActivePlan = (planId: string) => {
        if (isGiftedActive && planId === 'premium') return true;
        if (isGiftedActive && planId === 'basic') return false; // Basic is never active if gifted
        return planId === activePlanId;
    };

    const activePlan = allPlans.find(p => isActivePlan(p.id)) || allPlans[0];

    const gridPlans = allPlans.filter(p => {
        if (p.id === activePlan.id) return false;
        const isSamplerAndUsed = p.id === 'try_me_out' && hasUsedSampler && activePlanId !== 'try_me_out';
        return !isSamplerAndUsed;
    }).slice(0, 4);

    return (
        <div className="min-h-screen w-full bg-white text-gray-900 font-sans flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
            {/* Left Column / Top Section on Mobile */}
            <div className="w-full md:w-[32%] md:min-w-[340px] border-b md:border-b-0 md:border-r border-gray-100 p-6 md:p-8 flex flex-col justify-between relative bg-slate-50/50">
                <div className="space-y-6 md:space-y-8">
                    {/* Branding */}
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/dashboard')}>
                        <div className="p-2 rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
                            <img src="/Logo_optimized.png" alt="Logo" className="w-5 h-5 object-contain invert" />
                        </div>
                        <span className="text-xl font-black tracking-tighter">QuickRevert</span>
                    </div>

                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-gray-900 leading-tight mb-1 tracking-tight">
                            {isPremium ? 'Your Growth Plan' : 'Choose your \ngrowth plan'}
                        </h1>
                        {isPremium ? (
                            <div className="flex items-center gap-1.5 mt-1">
                                <Crown className="w-3 h-3 text-amber-500" />
                                <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest">Active Subscription</p>
                            </div>
                        ) : (
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Intelligent Responses 24x7</p>
                        )}
                    </div>

                    {/* Active Plan Card */}
                    <div className={`bg-white rounded-3xl p-4 md:p-5 border transition-all relative group ${isActivePlan(activePlan.id)
                            ? 'border-blue-400 shadow-[0_15px_40px_-12px_rgba(59,130,246,0.25)] ring-1 ring-blue-400/20'
                            : 'border-gray-100 shadow-sm'
                        }`}>
                        <div className="absolute -top-2.5 left-0 right-0 mx-auto w-fit z-20">
                            <span className="bg-blue-600 text-[8px] text-white font-black uppercase tracking-widest px-4 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5" /> {isGiftedActive && activePlan.id === 'premium' ? 'Gifted Premium' : 'Your Plan'}
                            </span>
                        </div>

                        <div className="flex justify-between items-start mb-3">
                            <div className="p-1.5 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">{activePlan.icon}</div>
                            <div className="text-right">
                                <span className="text-xl font-black block leading-none">{activePlan.name}</span>
                                <span className="text-[8px] text-gray-400 font-bold uppercase">{activePlan.id === 'basic' ? 'forever' : activePlan.period}</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium mb-3">{activePlan.description}</p>

                        {(isPremium || isGiftedActive) && expiryDate && (
                            <div className="mb-3 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100 flex items-center justify-between">
                                <span className="text-[8px] text-amber-800 font-black uppercase tracking-widest">Valid Until</span>
                                <span className="text-[9px] text-amber-900 font-bold">{formatDate(expiryDate)}</span>
                            </div>
                        )}

                        <ul className="space-y-1.5 mb-4">
                            {activePlan.features.slice(0, 4).map((f, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                                    <span className="text-[9px] font-bold text-gray-700 uppercase tracking-tight line-clamp-1">{f}</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>

                <div className="space-y-3 pt-6 md:pt-0">
                    <p className="text-[9px] text-gray-400 font-bold text-center leading-relaxed">Trusted by 10,000+ creators and businesses worldwide</p>
                    <button onClick={() => signOut()} className="w-full text-center text-[9px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest">
                        Log out
                    </button>
                </div>
            </div>

            {/* Right Side: Paid Plans Grid */}
            <div className="flex-1 flex flex-col p-6 md:p-8 bg-white overflow-y-auto">
                <div className="flex flex-col items-center justify-start h-fit max-w-5xl mx-auto w-full">
                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-4 mb-4 md:mb-6 bg-gray-50 px-5 py-2 rounded-full border border-gray-100 shadow-sm mt-2 md:mt-0">
                        <span className={`text-[10px] font-black transition-colors uppercase tracking-widest ${billingCycle === 'quarterly' ? 'text-gray-900' : 'text-gray-400'}`}>Quarterly</span>
                        <button onClick={() => setBillingCycle(billingCycle === 'annual' ? 'quarterly' : 'annual')} className="w-10 h-5 bg-gray-200 rounded-full p-1 relative transition-colors shadow-inner">
                            <div className={`w-3 h-3 bg-blue-600 rounded-full transition-all duration-300 shadow-md ${billingCycle === 'annual' ? 'ml-5' : 'ml-0'}`} />
                        </button>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black transition-colors uppercase tracking-widest ${billingCycle === 'annual' ? 'text-gray-900' : 'text-gray-400'}`}>Yearly</span>

                        </div>
                    </div>

                    {/* Paid Plans Grid */}
                    <div className={`grid gap-4 w-full h-fit py-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 max-w-4xl`}>
                        {gridPlans.map((plan) => {
                            const isCurrent = isActivePlan(plan.id);
                            return (
                                <div key={plan.id} className={`group relative rounded-3xl bg-white border p-6 flex flex-col transition-all duration-300 ${isCurrent
                                        ? 'border-blue-400 shadow-[0_15px_40px_-12px_rgba(59,130,246,0.25)] ring-1 ring-blue-400/20'
                                        : plan.highlighted
                                            ? 'border-purple-500 shadow-[0_15px_40px_-12px_rgba(168,85,247,0.25)] ring-1 ring-purple-500/20'
                                            : 'border-gray-100 hover:border-gray-300 hover:shadow-lg'
                                    }`}>
                                    {/* Badge */}
                                    {isCurrent ? (
                                        <div className="absolute -top-3 left-0 right-0 mx-auto w-fit z-20">
                                            <span className="bg-blue-600 text-[8px] text-white font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg flex items-center gap-1">
                                                <Crown className="w-2.5 h-2.5" /> {isGiftedActive && plan.id === 'premium' ? 'Gifted Premium' : 'Your Plan'}
                                            </span>
                                        </div>
                                    ) : plan.highlighted && (
                                        <div className="absolute -top-3 left-0 right-0 mx-auto w-fit z-20">
                                            <span className="bg-purple-600 text-[8px] text-white font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">Recommended</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-3">
                                        <div className={`p-1.5 rounded-xl ${isCurrent ? 'bg-blue-50' : plan.highlighted ? 'bg-purple-50' : 'bg-gray-50'}`}>{plan.icon}</div>
                                        <div className="text-right">
                                            <div className="flex flex-col items-end">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-lg font-black text-gray-900">{plan.price}</span>
                                                    <span className="text-[8px] text-gray-400 font-bold uppercase">{plan.period}</span>
                                                </div>
                                                {plan.totalPrice && (
                                                    <span className="text-[7px] text-blue-600 font-black uppercase tracking-tighter whitespace-nowrap">{plan.totalPrice}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-tight mb-0.5">{plan.name}</h3>
                                    <p className="text-[9px] text-gray-500 font-medium mb-3 line-clamp-1">{plan.description}</p>

                                    <ul className="grid grid-cols-2 gap-x-2 gap-y-1 mb-4 flex-1">
                                        {plan.features.slice(0, 6).map((feature, i) => (
                                            <li key={i} className="flex items-start gap-1.5">
                                                <Check className={`w-2.5 h-2.5 mt-0.5 shrink-0 ${isCurrent ? 'text-blue-600' : plan.highlighted ? 'text-purple-600' : 'text-blue-500'}`} />
                                                <span className="text-[8px] text-gray-700 font-bold tracking-tight uppercase line-clamp-1">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {isCurrent ? (
                                        <button onClick={() => navigate('/dashboard')} className="w-full py-2 rounded-xl text-[8px] font-black transition-all uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700">
                                            Go to Dashboard
                                        </button>
                                    ) : (() => {
                                        const planHierarchy = ['basic', 'try_me_out', 'premium', 'professional', 'enterprise'];
                                        const currentLevel = planHierarchy.indexOf(activePlan.id);
                                        const targetLevel = planHierarchy.indexOf(plan.id);
                                        const isUpgrade = targetLevel > currentLevel;

                                        return (
                                            <button
                                                disabled={isPremium && !isUpgrade}
                                                onClick={() => {
                                                    if (plan.id === 'enterprise') window.open('https://quickrevert.tech/contact', '_blank');
                                                    else openModal(billingCycle as any, undefined, plan.id as any);
                                                }}
                                                className={`w-full py-2 rounded-xl text-[8px] font-black transition-all uppercase tracking-widest ${plan.buttonStyle} ${plan.highlighted ? 'hover:scale-105 shadow-md shadow-purple-600/20' : ''} ${isPremium && !isUpgrade ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                                            >
                                                {isPremium && !isUpgrade ? 'Subscription Active' : isUpgrade && isPremium ? `Upgrade to ${plan.name} →` : plan.cta}
                                            </button>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
