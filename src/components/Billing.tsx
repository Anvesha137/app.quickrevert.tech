import { Check, MessageCircle, CreditCard, Calendar } from 'lucide-react';
import { useThemeColors } from '../hooks/useThemeColors';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: string;
  billingNote: string;
  duration: string;
  features: string[];
  isCurrent?: boolean;
  isPopular?: boolean;
  ctaText: string;
  ctaAction?: () => void;
}

export default function Billing() {
  const { gradientClass } = useThemeColors();

  const plans: Plan[] = [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Core automation features to get started',
      price: '₹399',
      billingNote: 'Billed quarterly (₹1197)',
      duration: 'per month',
      features: [
        'Auto DM on Comment',
        'Keyword Triggers',
        'Story Reply DMs',
        'Smart Follow Request DMs',
        'Interactive DM Buttons',
        'CRM + Analytics Dashboard',
        'Unique Contact Tracking',
        'Activity Log with Filtering',
        'Button Click Analytics',
        'Engagement Metrics',
        'QR Code Connection',
        'Meta OAuth Connect',
        'Secure Account Linking',
        'Email Support',
      ],
      ctaText: 'Get Started',
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'All Standard features with custom solutions',
      price: '₹499',
      billingNote: 'Billed quarterly (₹1497)',
      duration: 'per month',
      features: [
        'All Starter features included',
        'Custom DM Workflow Design',
        'Tailored Automation Rules',
        'Custom Integration Development',
        'Dedicated Account Manager',
        'Priority Email Support',
        'Phone Support Available',
        'Custom Training Sessions',
      ],
      isPopular: true,
      ctaText: 'Get Started',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Tailored solutions for large organizations with complex requirements',
      price: 'Custom',
      billingNote: 'Contact us for pricing',
      duration: '',
      features: [
        'Unlimited interactions',
        'Dedicated account manager',
        'Custom integrations',
        'SLA guarantees',
        'On-premise deployment',
        'White-label options',
      ],
      ctaText: 'Contact Sales',
    },
  ];

  const billingHistory = [
    // Empty for now
  ];

  return (
    <div className="ml-64 min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-gray-900 mb-3 tracking-tight">Plan & Billing</h1>
          <p className="text-xl text-gray-600">Choose the perfect plan to grow your Instagram automation</p>
        </div>

        <div className="mb-16">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">Available Plans</h2>
              <p className="text-gray-600">Flexible pricing for businesses of all sizes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`group relative bg-white rounded-3xl border-2 shadow-xl transition-all hover:shadow-2xl hover:-translate-y-2 ${
                  plan.isCurrent
                    ? 'border-green-500 ring-4 ring-green-100 scale-105'
                    : plan.isPopular
                    ? 'border-blue-500 ring-4 ring-blue-100 scale-[1.02]'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {plan.isCurrent && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-2.5 rounded-full text-sm font-bold shadow-xl">
                      Current Plan
                    </span>
                  </div>
                )}

                {plan.isPopular && !plan.isCurrent && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                    <span className={`bg-gradient-to-r ${gradientClass} text-white px-8 py-2.5 rounded-full text-sm font-bold shadow-xl animate-pulse`}>
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-base text-gray-600 mb-8 min-h-[48px]">{plan.description}</p>

                  <div className="mb-8 pb-8 border-b-2 border-gray-100">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-6xl font-bold text-gray-900 tracking-tight">{plan.price}</span>
                      {plan.price !== 'Custom' && (
                        <span className="text-gray-600 font-medium">/{plan.duration}</span>
                      )}
                    </div>
                    {plan.billingNote && (
                      <p className="text-sm text-gray-500 font-medium">{plan.billingNote}</p>
                    )}
                  </div>

                  <ul className="space-y-4 mb-10">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
                          <Check className="w-4 h-4 text-white font-bold stroke-[3]" />
                        </div>
                        <span className="text-sm text-gray-700 leading-relaxed font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`w-full py-4 rounded-xl font-bold text-base transition-all shadow-lg hover:shadow-xl hover:scale-105 ${
                      plan.isCurrent
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90'
                        : plan.isPopular
                        ? `bg-gradient-to-r ${gradientClass} text-white hover:opacity-90`
                        : 'bg-gradient-to-r from-gray-900 to-gray-700 text-white hover:opacity-90'
                    }`}
                  >
                    {plan.id === 'enterprise' ? (
                      <span className="flex items-center justify-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        {plan.ctaText}
                      </span>
                    ) : (
                      plan.ctaText
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border-2 border-gray-200 shadow-xl p-10">
          <div className="flex items-center gap-4 mb-8">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center shadow-lg`}>
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">Billing History</h2>
              <p className="text-base text-gray-600">View your past transactions and invoices</p>
            </div>
          </div>

          {billingHistory.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Calendar className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">No billing history</h3>
              <p className="text-base text-gray-600 max-w-md mx-auto">
                Your billing history will appear here once you upgrade to a paid plan.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-4 text-sm font-bold text-gray-700">Date</th>
                    <th className="text-left py-4 px-4 text-sm font-bold text-gray-700">Description</th>
                    <th className="text-left py-4 px-4 text-sm font-bold text-gray-700">Amount</th>
                    <th className="text-left py-4 px-4 text-sm font-bold text-gray-700">Status</th>
                    <th className="text-left py-4 px-4 text-sm font-bold text-gray-700">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistory.map((item, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 text-sm text-gray-900">Date</td>
                      <td className="py-4 px-4 text-sm text-gray-900">Description</td>
                      <td className="py-4 px-4 text-sm text-gray-900">Amount</td>
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          Paid
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <button className="text-blue-600 hover:text-blue-700 text-sm font-semibold">
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
