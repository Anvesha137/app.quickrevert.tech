import { useState } from 'react';
import { Check, Sparkles, Bot, X, Headset, Zap, Globe, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useSubscription } from '../contexts/SubscriptionContext';

export default function Pricing() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const { openModal } = useUpgradeModal();
    const { hasUsedSampler } = useSubscription();
    const [billingCycle, setBillingCycle] = useState<'annual' | 'quarterly'>('annual');

    const allPlans = [
        {
            name: 'FREE',
            id: 'basic',
            description: 'Essential tools to get started.',
            price: '₹0',
            period: '',
            cta: 'Start Free',
            features: [
                '1 Instagram Account',
                '5 Automations',
                '2000 DMs / month',
                'Keyword triggers',
            ],
            icon: <Bot className="w-5 h-5 text-gray-400" />,
            buttonStyle: 'bg-gray-100 text-gray-900 hover:bg-gray-200 font-bold',
            type: 'free'
        },
        {
            name: 'TRY ME OUT',
            id: 'try_me_out',
            description: 'Full feature sampler.',
            price: '₹199',
            period: '/ mo',
            cta: 'Try It Out',
            features: [
                '1 Account | 10 Autos',
                '10,000 DMs / mo',
                'Growth Tool (Ask to follow)',
                'Carousel & Post Auto',
                'Lead Manager (CRM)',
                'Follow-ups & Appointments',
            ],
            icon: <Zap className="w-5 h-5 text-orange-500" />,
            buttonStyle: 'bg-orange-500 text-white hover:bg-orange-600 font-bold',
            type: 'paid'
        },
        {
            name: 'PREMIUM',
            id: 'premium',
            description: 'Unlimited auto-DMs.',
            price: billingCycle === 'annual' ? '₹349' : '₹399',
            period: '/ mo',
            cta: 'Get Premium',
            features: [
                '1 Instagram Account',
                'Unlimited Automations',
                'Unlimited DMs',
                'Growth Tool (Ask to follow)',
                'Live & Story automation',
                'Analytics | Priority Support',
            ],
            icon: <Sparkles className="w-5 h-5 text-blue-500" />,
            buttonStyle: 'bg-blue-600 text-white hover:bg-blue-700 font-bold',
            type: 'paid'
        },
        {
            name: 'PROFESSIONAL',
            id: 'professional',
            description: 'For power users.',
            price: billingCycle === 'annual' ? '₹499' : '₹599',
            period: '/ mo',
            cta: 'Go Pro',
            features: [
                'Up to 2 Accounts',
                'Unlimited Scale',
                'All Premium Features',
                'Lead Manager (Full CRM)',
                'Carousel & Follow-ups',
                'Appointment System',
            ],
            highlighted: true,
            icon: <Zap className="w-5 h-5 text-purple-500" />,
            buttonStyle: 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg font-black',
            type: 'paid'
        },
        {
            name: 'ENTERPRISE',
            id: 'enterprise',
            description: 'Bespoke solutions.',
            price: 'Custom',
            period: '',
            cta: 'Contact Sales',
            features: [
                'Multiple Accounts',
                'Dedicated Manager',
                'White-label options',
                'SLA & Priority Support',
                'Custom Integrations',
            ],
            icon: <Globe className="w-5 h-5 text-emerald-500" />,
            buttonStyle: 'bg-emerald-600 text-white hover:bg-emerald-700 font-bold',
            type: 'paid'
        },
    ];

    const freePlan = allPlans.find(p => p.type === 'free')!;
    const paidPlans = allPlans.filter(p => {
        const isSelectedCycle = billingCycle === 'quarterly' || !p.hideOnAnnual;
        const isSamplerAndUsed = p.id === 'try_me_out' && hasUsedSampler;
        return p.type === 'paid' && isSelectedCycle && !isSamplerAndUsed;
    });

    return (
        <div className="h-screen w-full bg-white text-gray-900 font-sans flex overflow-hidden">
            {/* Left Column: Branding & Free Plan */}
            <div className="w-[32%] min-w-[340px] border-r border-gray-100 p-8 flex flex-col justify-between relative bg-slate-50/50">
                <div className="space-y-8">
                    {/* Branding */}
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/dashboard')}>
                        <div className="p-2 rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
                            <img src="/Logo_optimized.png" alt="Logo" className="w-5 h-5 object-contain invert" />
                        </div>
                        <span className="text-xl font-black tracking-tighter">QuickRevert</span>
                    </div>

                    <div>
                        <h1 className="text-3xl font-black text-gray-900 leading-tight mb-2 tracking-tight">Choose your <br/>growth plan</h1>
                        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Intelligent Responses 24x7</p>
                    </div>

                    {/* Free Plan Card */}
                    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                                {freePlan.icon}
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-black block leading-none">FREE</span>
                                <span className="text-[10px] text-gray-400 font-bold">forever</span>
                            </div>
                        </div>
                        
                        <p className="text-[11px] text-gray-500 font-medium mb-4">{freePlan.description}</p>
                        
                        <ul className="space-y-2 mb-6">
                            {freePlan.features.map((f, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                                    <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tight">{f}</span>
                                </li>
                            ))}
                        </ul>

                        <button 
                            onClick={() => navigate('/dashboard')}
                            className="w-full py-3 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors"
                        >
                            Start with free plan
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-[10px] text-gray-400 font-bold text-center leading-relaxed">
                        Trusted by 10,000+ creators and businesses worldwide
                    </p>
                    <button
                        onClick={() => signOut()}
                        className="w-full text-center text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                    >
                        Log out
                    </button>
                </div>
            </div>

            {/* Right Side: Paid Plans Grid */}
            <div className="flex-1 flex flex-col p-8 bg-white">
                <div className="flex flex-col items-center justify-center h-full max-w-5xl mx-auto w-full">
                    {/* Billing Toggle (Horizontal & Compact) */}
                    <div className="flex items-center justify-center gap-6 mb-8 bg-gray-50 px-6 py-3 rounded-full border border-gray-100 shadow-sm">
                        <span className={`text-[11px] font-black transition-colors uppercase tracking-widest ${billingCycle === 'quarterly' ? 'text-gray-900' : 'text-gray-400'}`}>Quarterly</span>
                        <button
                            onClick={() => setBillingCycle(billingCycle === 'annual' ? 'quarterly' : 'annual')}
                            className="w-12 h-6 bg-gray-200 rounded-full p-1 relative transition-colors shadow-inner"
                        >
                            <div className={`w-4 h-4 bg-blue-600 rounded-full transition-all duration-300 shadow-md ${billingCycle === 'annual' ? 'ml-6' : 'ml-0'}`} />
                        </button>
                        <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-black transition-colors uppercase tracking-widest ${billingCycle === 'annual' ? 'text-gray-900' : 'text-gray-400'}`}>Yearly</span>
                            <span className="bg-green-100 text-green-700 text-[8px] font-black px-2 py-0.5 rounded-full border border-green-200 uppercase">Save 40%</span>
                        </div>
                    </div>

                    {/* Paid Plans Grid */}
                    <div className={`grid gap-4 w-full h-fit py-2 ${paidPlans.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {paidPlans.map((plan) => (
                            <div
                                key={plan.id}
                                className={`group relative rounded-3xl bg-white border p-6 flex flex-col transition-all duration-300 ${plan.highlighted
                                    ? 'border-purple-500 shadow-[0_15px_40px_-12px_rgba(168,85,247,0.25)] ring-1 ring-purple-500/20'
                                    : 'border-gray-100 hover:border-gray-300 hover:shadow-lg'
                                    }`}
                            >
                                {plan.highlighted && (
                                    <div className="absolute -top-3 left-0 right-0 mx-auto w-fit z-20">
                                        <span className="bg-purple-600 text-[8px] text-white font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">
                                            Recommended
                                        </span>
                                    </div>
                                )}

                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-2 rounded-xl ${plan.highlighted ? 'bg-purple-50' : 'bg-gray-50'}`}>
                                        {plan.icon}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black text-gray-900">{plan.price}</div>
                                        <div className="text-[8px] text-gray-400 font-bold uppercase">{plan.period}</div>
                                    </div>
                                </div>

                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight mb-1">{plan.name}</h3>
                                <p className="text-[10px] text-gray-500 font-medium mb-4 line-clamp-1">{plan.description}</p>

                                <ul className="space-y-2 mb-6 flex-1">
                                    {plan.features.slice(0, 6).map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <Check className={`w-3 h-3 mt-0.5 shrink-0 ${plan.highlighted ? 'text-purple-600' : 'text-blue-500'}`} />
                                            <span className="text-[10px] text-gray-700 font-bold tracking-tight uppercase">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => {
                                        if (plan.id === 'enterprise') window.open('https://wa.me/91XXXXXXXXXX', '_blank');
                                        else openModal(billingCycle as any, undefined, plan.id as any);
                                    }}
                                    className={`w-full py-3 rounded-xl text-[9px] font-black transition-all uppercase tracking-widest ${plan.buttonStyle} ${plan.highlighted ? 'hover:scale-105 shadow-md shadow-purple-600/20' : ''}`}
                                >
                                    {plan.cta}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
