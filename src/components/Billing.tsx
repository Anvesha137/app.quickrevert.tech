import { useState, useEffect } from 'react';
import { Zap, Calendar, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';

interface SubscriptionData {
  plan_id: string;
  status: string;
  current_period_end: string;
  amount_paid?: number;
  discount_amount?: number;
  coupon_code?: string;
  created_at?: string;
}

interface BillingUsage {
  dms: number;
  contacts: number;
  automations: number;
}

const useSubscriptionData = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<BillingUsage>({ dms: 0, contacts: 0, automations: 0 });

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(sub);

      const { data: activities } = await supabase
        .from('automation_activities')
        .select('activity_type')
        .eq('user_id', user.id);

      const dms = activities?.filter(a => ['dm', 'dm_sent', 'send_dm', 'user_directed_messages'].includes(a.activity_type)).length || 0;

      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const { count: automationsCount } = await supabase
        .from('automations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'active');

      setUsage({
        dms,
        contacts: contactsCount || 0,
        automations: automationsCount || 0
      });
    } catch (err) {
      console.error('Error fetching billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  return { subscription, usage, loading, refresh: fetchData };
};

const Billing = () => {
  const { subscription, usage, loading } = useSubscriptionData();
  const { openModal: openUpgradeModal } = useUpgradeModal();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices'>('overview');

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getPlanName = (id?: string) => {
    if (!id || id === 'basic') return 'BASIC';
    const lowerId = id.toLowerCase();
    if (lowerId.includes('enterprise')) return 'ENTERPRISE';
    if (lowerId.includes('premium') || lowerId.includes('quarterly')) return 'PREMIUM';
    return lowerId.toUpperCase(); // Fallback for things like 'QUARTERLY'
  };

  const getPlanPrice = (id?: string, amount?: number) => {
    if (!id || id === 'basic') return '₹0';
    if (amount !== undefined && amount !== null) return `₹${amount}`;
    if (id.includes('annual')) return '₹7,188';
    return '₹2,697';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#5a5f85]">
        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  const planId = (subscription?.plan_id || 'basic').toLowerCase();
  const isPremium = planId !== 'basic' && (
    planId.includes('premium') ||
    planId.includes('enterprise') ||
    planId.includes('quarterly') ||
    planId.includes('annual')
  );
  const planLimit = isPremium ? 'Unlimited' : 1000;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-screen flex flex-col">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight text-white leading-none">
          Billing & Subscription
        </h1>
      </div>

      {/* Main Two-Section Layout */}
      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* Left Section: Current Plan */}
        <div className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 flex flex-col h-full">
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-[9px] font-black uppercase tracking-widest mb-4">
                  Active Plan
                </div>
                <h3 className="text-5xl font-black text-white tracking-tighter uppercase mb-2">
                  {getPlanName(subscription?.plan_id)}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white tracking-tight">
                    {getPlanPrice(subscription?.plan_id, subscription?.amount_paid)}
                  </span>
                  <span className="text-sm text-indigo-100 font-medium uppercase">{subscription?.plan_id?.includes('annual') ? '/ annual' : '/ quarterly'}</span>
                </div>
              </div>
              <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center backdrop-blur-xl shrink-0">
                <Zap className="w-8 h-8 text-blue-500 fill-blue-500/20" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 py-6 border-y border-white/[0.05] mb-8">
              <div className="space-y-1">
                <p className="text-indigo-100 text-[9px] font-black uppercase tracking-widest">Next Billing Date</p>
                <p className="text-white text-lg font-bold">{formatDate(subscription?.current_period_end)}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-indigo-100 text-[9px] font-black uppercase tracking-widest">Status</p>
                <p className="text-green-500 text-lg font-bold uppercase tracking-tighter">Active</p>
              </div>
            </div>

            <div className="mt-auto flex flex-col sm:flex-row gap-4">
              {!isPremium ? (
                <button
                  onClick={() => openUpgradeModal()}
                  className="flex-1 py-4 bg-white text-black font-black text-xs tracking-widest rounded-xl hover:bg-gray-100 transition-all uppercase flex items-center justify-center gap-2"
                >
                  Upgrade Plan
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex-1 py-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center gap-2">
                  <span className="text-blue-400 font-black text-xs tracking-widest uppercase">Premium Plan Active</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Usage & History Tabs */}
        <div className="lg:w-1/3 flex flex-col gap-6">
          {/* Operational Usage Card */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 flex-1 flex flex-col justify-center">
            <h4 className="text-lg font-black text-white tracking-tight mb-6 uppercase">Operational Usage</h4>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest">
                  <span className="text-indigo-100 uppercase">DMs Delivered</span>
                  <span className="text-white font-bold">{usage.dms.toLocaleString()} / {planLimit.toLocaleString()}</span>
                </div>
                <div className="h-2.5 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                    style={{ width: planLimit === 'Unlimited' ? '100%' : `${Math.min((usage.dms / 1000) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-1">Contacts</p>
                  <p className="text-xl font-black text-white">{usage.contacts.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-1">Automations</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-xl font-black text-white">{usage.automations}</p>
                    {!isPremium && <span className="text-xs text-indigo-100 font-bold">/ 3</span>}
                  </div>
                </div>
                {!isPremium && (
                  <div className="col-span-2 p-4 bg-white/5 border border-white/5 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-1">Keyword Triggers</p>
                      <p className="text-sm font-bold text-indigo-200">2 per post</p>
                    </div>
                    <div className="px-2 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Basic Limit</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Compact Billing History Access */}
          <div
            onClick={() => setActiveTab('invoices')}
            className={`cursor-pointer p-6 rounded-[2rem] border transition-all ${activeTab === 'invoices' ? 'bg-white/10 border-white/20' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05]'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-indigo-100" />
                <span className="text-xs font-black uppercase tracking-widest text-white">Billing History</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </div>
          </div>
        </div>
      </div>

      {/* History Modal-like View if Active */}
      {activeTab === 'invoices' && (
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Invoice Records</h3>
            <button
              onClick={() => setActiveTab('overview')}
              className="text-[10px] font-black text-indigo-100 hover:text-white transition-colors uppercase tracking-widest"
            >
              Close History
            </button>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] font-black text-indigo-100 uppercase tracking-[0.2em] border-b border-white/10">
                  <th className="pb-4">Reference</th>
                  <th className="pb-4">Date</th>
                  <th className="pb-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="text-white">
                {subscription ? (
                  <tr className="border-b border-white/[0.02] last:border-0">
                    <td className="py-4 font-bold flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                      INV-{new Date(subscription.created_at || '').getFullYear()}-001
                    </td>
                    <td className="py-4 text-gray-500">{formatDate(subscription.created_at)}</td>
                    <td className="py-4 text-right font-black text-green-400">₹{subscription.amount_paid || 0}</td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-indigo-100 font-bold uppercase tracking-widest">No records found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
