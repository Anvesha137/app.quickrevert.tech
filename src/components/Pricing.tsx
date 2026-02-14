import { Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Pricing() {
    const { signOut } = useAuth();
    const navigate = useNavigate();

    const plans = [
        {
            name: 'PREMIUM',
            description: 'For creators and brands ready to scale.',
            price: '₹899',
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
            buttonStyle: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30',
        },
        {
            name: 'GOLD',
            description: 'For serious brands running revenue via IG.',
            price: '₹4999',
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
            buttonStyle: 'bg-gradient-to-r from-yellow-500 to-amber-600 text-white hover:from-yellow-600 hover:to-amber-700 shadow-lg shadow-amber-500/30',
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-5xl">
                        Choose your growth plan
                    </h2>
                    <p className="mt-4 text-xl text-gray-500">
                        Scale your Instagram automation with the perfect plan for your needs.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-8 items-start">
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`relative rounded-3xl bg-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl flex flex-col h-full ${plan.highlighted ? 'border-2 border-blue-600 ring-4 ring-blue-50/50 scale-105 z-10' : 'border border-gray-100'
                                }`}
                        >
                            {plan.highlighted && (
                                <div className="absolute -top-5 left-0 right-0 mx-auto w-fit">
                                    <span className="bg-blue-600 text-white text-sm font-bold px-4 py-1 rounded-full shadow-md">
                                        MOST POPULAR
                                    </span>
                                </div>
                            )}

                            <div className="p-8 flex-1">
                                <h3 className="text-xl font-bold text-gray-900 tracking-tight uppercase">{plan.name}</h3>
                                <p className="mt-2 text-sm text-gray-500 h-10">{plan.description}</p>

                                <div className="mt-6 flex items-baseline">
                                    <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                                    <span className="ml-1 text-xl font-medium text-gray-500">{plan.period}</span>
                                </div>

                                <ul className="mt-8 space-y-4">
                                    {plan.features.map((feature, index) => (
                                        <li key={index} className="flex items-start">
                                            <div className="flex-shrink-0">
                                                <Check className="h-5 w-5 text-green-500" />
                                            </div>
                                            <p className="ml-3 text-sm text-gray-700 leading-tight">{feature}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="p-8 pt-0 mt-auto">
                                <button
                                    onClick={() => {
                                        // Handle payment logic
                                        console.log(`Selected ${plan.name}`);
                                    }}
                                    className={`w-full block rounded-xl py-3.5 px-6 text-center text-sm font-semibold transition-all duration-200 ${plan.buttonStyle}`}
                                >
                                    {plan.cta}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-12 text-center">
                    <button
                        onClick={() => navigate('/')}
                        className="text-base font-medium text-gray-600 hover:text-gray-900 hover:underline transition-colors"
                    >
                        Start with Free Plan
                    </button>
                </div>

                <div className="mt-8 text-center pt-8 border-t border-gray-200/60">
                    <p className="text-sm text-gray-500 mb-4">
                        By continuing, you agree to our <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
                    </p>
                    <button
                        onClick={() => signOut()}
                        className="inline-flex items-center justify-center px-6 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
