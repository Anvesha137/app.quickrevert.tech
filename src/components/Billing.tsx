import { useState, useEffect } from 'react';
import { Check, MessageCircle, CreditCard, Calendar, Zap, Users, Crown, ChevronDown, Plus, TrendingUp, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';

interface SubscriptionData {
  plan_id: string;
  status: string;
  current_period_end: string;
}

interface BillingStats {
  dmsSent: number;
  contactsEngaged: number;
  automationsActive: number;
}

export default function Billing() {
  const { user } = useAuth();
  const { openModal } = useUpgradeModal();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [stats, setStats] = useState<BillingStats>({
    dmsSent: 0,
    contactsEngaged: 0,
    automationsActive: 0
  });

  useEffect(() => {
    if (user) {
      fetchBillingData();
    }
  }, [user]);

  const fetchBillingData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Subscription
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(subData);

      // 2. Fetch Usage Stats
      const { data: activities } = await supabase
        .from('automation_activities')
        .select('activity_type')
        .eq('user_id', user!.id);

      const dms = activities?.filter(a => ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'].includes(a.activity_type)) || [];

      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      // Also check unique target_usernames in activities as a fallback/sync check
      const { data: activityContacts } = await supabase
        .from('automation_activities')
        .select('target_username')
        .eq('user_id', user!.id);

      const uniqueFromActivities = new Set(
        activityContacts
          ?.map(a => a.target_username)
          .filter(u => u && u !== 'Unknown' && !u.includes('undefined'))
      ).size;

      const { count: automationsCount } = await supabase
        .from('automations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('status', 'active');

      setStats({
        dmsSent: dms.length,
        contactsEngaged: Math.max(contactsCount || 0, uniqueFromActivities),
        automationsActive: automationsCount || 0
      });

    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPlanName = (id?: string) => {
    if (!id) return 'Basic';
    if (id.startsWith('premium')) return 'Premium';
    if (id.startsWith('gold')) return 'Gold';
    return id.toUpperCase();
  };

  const getPlanPrice = (id?: string) => {
    if (!id) return '₹0';
    if (id === 'premium_annual') return '₹599';
    if (id === 'premium_quarterly') return '₹899';
    if (id === 'gold_annual') return '₹3499';
    if (id === 'gold_quarterly') return '₹4999';
    return 'Custom';
  };

  const getPlanLimit = (id?: string) => {
    if (!id || id === 'basic') return 1000;
    return 'Unlimited';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="ml-0 md:ml-64 min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="ml-0 md:ml-64 min-h-screen bg-[#0a0a0c] text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Plan & Subscription</h1>
            <p className="text-gray-400">Manage your subscription, payment methods, and invoices.</p>
          </div>
          <button
            onClick={openModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            Upgrade Plan
          </button>
        </div>

        {/* Section 1: Growth Plan Card */}
        <div className="mb-8">
          <div className="bg-[#141417] border border-gray-800 rounded-3xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[80px] rounded-full -mr-20 -mt-20"></div>

            <div className="flex items-start justify-between mb-6 relative">
              <div className="flex gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-2xl flex items-center justify-center border border-green-500/20">
                  <Zap className="w-7 h-7 text-green-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{getPlanName(subscription?.plan_id)}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold">{getPlanPrice(subscription?.plan_id)}</span>
                    <span className="text-gray-400">/month</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-sm font-semibold">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Active
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8 relative">
              <div>
                <p className="text-gray-500 text-sm mb-1">Next billing date</p>
                <p className="font-semibold">{formatDate(subscription?.current_period_end)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm mb-1">Billing Cycle</p>
                <p className="font-semibold capitalize">{subscription?.plan_id?.replace('_', ' ') || 'None'}</p>
              </div>
            </div>

            <div className="flex gap-4 relative">
              <button onClick={openModal} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors font-semibold shadow-lg shadow-blue-600/20">Upgrade Plan</button>
              <button className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors font-semibold">Contact Billing</button>
            </div>
          </div>
        </div>

        {/* Section 2: Usage Stats */}
        <div className="mb-8">
          <div className="bg-[#141417] border border-gray-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Usage This Month</h3>
              <div className="flex gap-4 text-xs font-medium text-gray-500">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-800/50 rounded-lg">Filter: All <ChevronDown className="w-3 h-3" /></div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-800/50 rounded-lg">Year: 2026 <ChevronDown className="w-3 h-3" /></div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm text-gray-400">DMs Sent: <span className="text-white font-medium">{stats.dmsSent.toLocaleString()} / {getPlanLimit(subscription?.plan_id)}</span></span>
                  <span className="text-lg font-bold">{getPlanPrice(subscription?.plan_id)} <Check className="inline-block w-4 h-4 text-green-500 ml-1" /></span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{
                      width: getPlanLimit(subscription?.plan_id) === 'Unlimited'
                        ? '100%'
                        : `${Math.min((stats.dmsSent / (getPlanLimit(subscription?.plan_id) as number)) * 100, 100)}%`
                    }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-800">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Contacts Engaged</p>
                  <p className="text-xl font-bold">{stats.contactsEngaged.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Automations Active</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold">{stats.automationsActive}</span>
                    <Check className="w-5 h-5 p-1 bg-green-500/20 text-green-500 rounded-full" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 pt-2 italic">Usage resets on {formatDate(subscription?.current_period_end)}</p>
            </div>
          </div>
        </div>

        {/* Section 3: Invoices & Plan Options */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Invoices List */}
          <div className="bg-[#141417] border border-gray-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold mb-6">Invoice History</h3>
            <div className="space-y-1">
              <div className="grid grid-cols-4 text-xs font-bold text-gray-500 px-4 py-2 border-b border-gray-800 mb-2">
                <span>INVOICE</span>
                <span>DATE</span>
                <span>PLAN</span>
                <span className="text-right">STATUS</span>
              </div>
              {[1, 2, 0].map(i => (
                <div key={i} className="grid grid-cols-4 items-center px-4 py-3 hover:bg-gray-800/30 rounded-xl transition-colors text-sm">
                  <span className="font-medium text-gray-300">INV-2026-00{i}</span>
                  <span className="text-gray-500">28 Feb 2026</span>
                  <span className="text-gray-400">Growth</span>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-0.5 rounded text-xs font-bold">
                      <Check className="w-3 h-3" /> ₹999
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs text-gray-500 text-center">Questions about your billing? <a href="#" className="text-blue-500 hover:underline">Contact support</a></p>
          </div>

          {/* Plan Options Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#141417] border border-gray-800 rounded-3xl p-6 flex flex-col justify-between group">
              <div>
                <h4 className="text-xl font-bold mb-1">Basic</h4>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-bold">₹0</span>
                  <span className="text-gray-500 text-sm">/month</span>
                </div>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> 1K DMs / mo</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Basic Automations</li>
                </ul>
              </div>
              <button className={`w-full mt-6 py-2.5 rounded-xl text-sm font-bold ${!subscription?.plan_id ? 'bg-blue-600 text-white' : 'bg-gray-800 opacity-50 cursor-not-allowed'}`}>
                {!subscription?.plan_id ? 'Current Plan' : 'Free Forever'}
              </button>
            </div>

            <div className="bg-amber-600 border border-amber-500 rounded-3xl p-6 flex flex-col justify-between shadow-xl shadow-amber-600/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full -mr-10 -mt-10"></div>
              <div className="relative">
                <div className="bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded w-fit mb-3">Enterprise</div>
                <h4 className="text-xl font-bold mb-1">Gold</h4>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-bold">₹3499</span>
                  <span className="text-amber-100 text-sm">/month</span>
                </div>
                <ul className="space-y-2 text-sm text-amber-50">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-white" /> 2 IG Accounts</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-white" /> Dedicated Expert</li>
                </ul>
              </div>
              <button onClick={openModal} className="w-full mt-6 py-2.5 bg-white text-amber-600 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors relative z-10">Upgrade</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
