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

  interface BillingHistoryItem {
    id: string;
    date: string;
    description: string;
    amount: string;
    status: 'paid' | 'pending' | 'failed';
    invoiceUrl?: string;
  }

  const billingHistory: BillingHistoryItem[] = [
    // Empty for now
  ];

  return (
    <div className="ml-64 min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-gray-900 mb-3 tracking-tight">Plan & Billing</h1>
          <p className="text-xl text-gray-600">Choose the perfect plan to grow your Instagram automation</p>
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
