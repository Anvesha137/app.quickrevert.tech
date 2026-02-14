import { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Pricing() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');

    const features = [
        'Unlimited Automation',
        'Collect Leads',
        'Re-Trigger on existing comments',
        'Ask for follow feature',
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">

                {/* Left Column - Features */}
                <div className="space-y-8">
                    <div className="space-y-4">
                        {features.map((feature, index) => (
                            <div key={index} className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-green-600" />
                                </div>
                                <span className="text-gray-600 font-medium">{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column - Pricing Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 relative overflow-hidden">

                    {/* Annual Plan */}
                    <div
                        className={`relative rounded-xl border-2 p-4 mb-4 cursor-pointer transition-all ${selectedPlan === 'annual'
                                ? 'border-green-500 bg-green-50/30'
                                : 'border-transparent hover:border-gray-200'
                            }`}
                        onClick={() => setSelectedPlan('annual')}
                    >
                        {selectedPlan === 'annual' && (
                            <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg">
                                SAVE 60%
                            </div>
                        )}
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPlan === 'annual' ? 'border-green-500' : 'border-gray-300'
                                    }`}>
                                    {selectedPlan === 'annual' && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                                </div>
                                <span className="font-bold text-lg text-gray-900">Annual Plan</span>
                                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                    BEST SELLER
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="flex items-end justify-end gap-1">
                                    <span className="text-2xl font-bold text-gray-900">$9.99</span>
                                    <span className="text-gray-500 mb-1">/mo</span>
                                </div>
                                <div className="text-sm text-gray-500 line-through">$24.99/mo</div>
                                <div className="text-xs text-gray-400">Billed $119.88 yearly</div>
                            </div>
                        </div>
                        {selectedPlan === 'annual' && (
                            <div className="bg-red-50 text-red-500 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 w-fit mt-2">
                                <span>PRICE AVAILABLE ONLY FOR:</span>
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>29:52</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Monthly Plan */}
                    <div
                        className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${selectedPlan === 'monthly'
                                ? 'border-green-500 bg-green-50/30'
                                : 'border-gray-100 hover:border-gray-200'
                            }`}
                        onClick={() => setSelectedPlan('monthly')}
                    >
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPlan === 'monthly' ? 'border-green-500' : 'border-gray-300'
                                    }`}>
                                    {selectedPlan === 'monthly' && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                                </div>
                                <div>
                                    <span className="font-bold text-lg text-gray-900 block">Monthly</span>
                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        ~20% OFF
                                    </span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="flex items-end justify-end gap-1">
                                    <span className="text-2xl font-bold text-gray-900">$19.99</span>
                                    <span className="text-gray-500 mb-1">/mo</span>
                                </div>
                                <div className="text-sm text-gray-500 line-through">$24.99/mo</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 mb-6">
                        <p className="text-xs text-center text-gray-500">
                            Price Lock Guarantee: You will keep paying this price as long as you remain subscribed.
                        </p>
                    </div>

                    <button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                        onClick={() => {
                            // Handle subscription logic here
                            console.log('Selected plan:', selectedPlan);
                        }}
                    >
                        Continue
                    </button>

                    <div className="mt-4 text-center">
                        <button
                            className="text-gray-500 hover:text-gray-700 underline text-sm"
                            onClick={() => navigate('/')}
                        >
                            Start with Free Plan
                        </button>
                    </div>

                </div>
            </div>

            <div className="fixed bottom-8 text-center w-full">
                <p className="text-xs text-gray-400 mb-2">
                    By signing up, you agree to LinkPlease's <br />
                    <a href="#" className="text-blue-500 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-500 hover:underline">Privacy Policy</a>
                </p>
                <button
                    onClick={() => signOut()}
                    className="text-sm text-gray-500 hover:text-gray-700"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}
