import { useState, useEffect } from 'react';
import { Check, Zap, Tag, Calendar, CreditCard, ChevronRight } from 'lucide-react';
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

const useSubscription = () => {
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
  const { subscription, usage, loading } = useSubscription();
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
    const name = id.split('_')[0];
    return name.toUpperCase();
  };

  const getPlanPrice = (id?: string, amount?: number) => {
    if (!id || id === 'basic') return '₹0';
    if (amount !== undefined && amount !== null) return `₹${amount}`;
    if (id.includes('annual')) return '₹7,188';
    return '₹2,697';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isGold = subscription?.plan_id?.startsWith('gold');
  const planLimit = isGold || subscription?.plan_id?.startsWith('premium') ? 'Unlimited' : 1000;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-0">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-none">
            Plan & <span className="text-blue-600">Subscription</span>
          </h1>
          <p className="text-gray-400 text-lg uppercase text-[10px] tracking-[0.2em] font-bold">
            Comprehensive control over your digital growth engine.
          </p>
        </div>
        <button
          onClick={openUpgradeModal}
          className="px-8 py-4 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black rounded-2xl transition-all hover:scale-[1.03] active:scale-[0.97] shadow-xl shadow-blue-500/20 flex items-center gap-3 group border border-blue-400/20"
        >
          <Zap className="w-5 h-5 group-hover:scale-125 transition-transform" />
          UPGRADE NOW
        </button>
      </div>

      {/* Tabs Layout */}
      <div className="flex gap-2 p-1.5 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-2xl w-fit mx-4 md:mx-0">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-8 py-3 rounded-xl transition-all text-xs font-black tracking-widest uppercase ${activeTab === 'overview' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
            }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-8 py-3 rounded-xl transition-all text-xs font-black tracking-widest uppercase ${activeTab === 'invoices' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
            }`}
        >
          Billing History
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4 md:px-0">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Plan Card */}
          <div className="relative overflow-hidden bg-[#0F0F12] border border-white/10 rounded-[2.5rem] p-10 group transition-all hover:border-blue-500/30">
            {/* Glass Background Elements */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none group-hover:bg-blue-600/20 transition-all duration-1000"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none group-hover:bg-indigo-600/20 transition-all duration-1000"></div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex justify-between items-start mb-12">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2.5 px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-[10px] font-black tracking-widest uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    Current Active Plan
                  </div>
                  <div>
                    <h3 className="text-6xl font-black text-white tracking-tighter leading-none mb-4 uppercase">
                      {getPlanName(subscription?.plan_id)}
                    </h3>
                    <div className="flex items-baseline gap-3">
                      <span className="text-5xl font-bold text-white tracking-tight">
                        {getPlanPrice(subscription?.plan_id, subscription?.amount_paid)}
                      </span>
                      {(!subscription?.plan_id || subscription?.plan_id === 'basic') && (
                        <span className="text-xl text-gray-500 font-medium">/month</span>
                      )}
                    </div>

                    {subscription?.coupon_code && (
                      <div className="mt-6 inline-flex items-center gap-2.5 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-2 rounded-2xl text-[11px] font-black tracking-wider shadow-lg shadow-green-500/5">
                        <Tag className="w-4 h-4" />
                        CODE: {subscription.coupon_code}
                        {subscription.discount_amount && (
                          <span className="ml-1 opacity-80 text-white/60">SAVE ₹{subscription.discount_amount}</span>
                        )}
                        {subscription.amount_paid === 0 && !subscription.discount_amount && (
                          <span className="ml-2 bg-green-500/20 px-2 py-0.5 rounded-lg text-[9px] text-green-300">100% DISCOUNT</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-20 h-20 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center backdrop-blur-xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                  <Zap className="w-10 h-10 text-blue-500 fill-blue-500/20" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12 py-10 border-y border-white/[0.05]">
                <div className="space-y-2">
                  <p className="text-gray-600 text-[9px] font-black uppercase tracking-[0.2em]">Next Automated Billing</p>
                  <p className="text-white text-xl font-bold">{formatDate(subscription?.current_period_end)}</p>
                </div>
                <div className="space-y-2 text-right">
                  <p className="text-gray-600 text-[9px] font-black uppercase tracking-[0.2em]">Cycle Interval</p>
                  <p className="text-white text-xl font-bold capitalize">
                    {subscription?.plan_id?.includes('annual') ? 'Annual' : 'Quarterly'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-12">
                <button
                  onClick={openUpgradeModal}
                  className="flex-1 px-8 py-5 bg-white text-black font-black text-xs tracking-widest rounded-2xl hover:bg-gray-100 transition-all uppercase shadow-2xl shadow-white/5 flex items-center justify-center gap-2"
                >
                  Manage Membership
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button className="px-8 py-5 bg-white/[0.03] hover:bg-white/[0.07] text-white font-black text-xs tracking-widest rounded-2xl border border-white/10 transition-all uppercase">
                  Download Receipt
                </button>
              </div>
            </div>
          </div>

          {/* Detailed Usage Area */}
          <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-10 space-y-10 group">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-2xl font-black text-white tracking-tight">Operational Usage</h4>
                <p className="text-gray-500 text-xs font-medium">Real-time tracking of your automation throughput.</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-gray-400 bg-white/5 px-4 py-2 rounded-xl border border-white/10 uppercase">
                <Calendar className="w-4 h-4 text-blue-500" />
                Cycle End: {formatDate(subscription?.current_period_end)}
              </div>
            </div>

            <div className="space-y-12">
              <div className="space-y-5">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">DMs Delivered This Period</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{usage.dms.toLocaleString()}</span>
                      <span className="text-gray-600 text-xl font-bold">/</span>
                      <span className="text-gray-400 text-xl font-bold">{planLimit.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black text-blue-500 mb-1 uppercase tracking-widest">
                      {planLimit === 'Unlimited' ? 'Full Access' : `${Math.round((usage.dms / 1000) * 100)}% Utilized`}
                    </div>
                  </div>
                </div>
                {/* Custom Progress Bar */}
                <div className="relative h-6 bg-white/[0.03] rounded-3xl overflow-hidden p-1.5 border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full transition-all duration-[1.5s] ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-[0_0_30px_rgba(37,99,235,0.3)] relative group-hover:brightness-110"
                    style={{
                      width: planLimit === 'Unlimited' ? '100%' : `${Math.min((usage.dms / 1000) * 100, 100)}%`
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 blur-sm opacity-50"></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="relative overflow-hidden p-8 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.04] transition-all hover:scale-[1.02] duration-500">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Zap className="w-16 h-16" />
                  </div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Audience Pool Growth</p>
                  <div className="flex items-center gap-3">
                    <p className="text-3xl font-black text-white">{usage.contacts.toLocaleString()}</p>
                    <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-lg">LIVE</span>
                  </div>
                </div>
                <div className="relative overflow-hidden p-8 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.04] transition-all hover:scale-[1.02] duration-500">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Check className="w-16 h-16" />
                  </div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Active Automations</p>
                  <div className="flex items-center gap-4">
                    <p className="text-3xl font-black text-white">{usage.automations}</p>
                    <div className="bg-green-500/20 p-1.5 rounded-full border border-green-500/20">
                      <Check className="w-5 h-5 text-green-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Sidebar */}
        <div className="space-y-8">
          <div className="p-10 bg-gradient-to-br from-indigo-700/20 via-blue-600/5 to-transparent border border-white/10 rounded-[3rem] space-y-8 relative overflow-hidden group">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-500/10 blur-2xl rounded-full"></div>
            <div className="space-y-4">
              <h4 className="text-2xl font-black text-white tracking-tight">Elite Support</h4>
              <p className="text-gray-400 text-sm leading-relaxed font-medium">
                Our specialized billing concierge is available 24/7 for account optimizations and enterprise inquiries.
              </p>
            </div>
            <button className="w-full py-5 bg-white text-black font-black text-[11px] tracking-widest rounded-2xl transition-all hover:bg-gray-200 active:scale-95 uppercase shadow-xl shadow-indigo-500/10">
              COMMUNICATE WITH US
            </button>
          </div>

          <div className="p-10 bg-white/[0.03] border border-white/5 rounded-[3rem] space-y-10 group hover:border-white/10 transition-colors">
            <div className="flex gap-6">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-500/10 transform rotate-3 group-hover:rotate-12 transition-transform">
                <CreditCard className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-black text-white uppercase tracking-tight">Auto-Renew</h4>
                <div className="inline-flex items-center gap-1.5 text-[9px] font-black bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md tracking-tighter">
                  <Check className="w-3 h-3" /> ENABLED
                </div>
              </div>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed font-medium">
              Seamlessly continue your growth. Subscriptions renew automatically using your primary vault method.
            </p>
            <div className="pt-6 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Vault Status</span>
              <span className="text-white text-[10px] font-bold">SECURE (SHA-256)</span>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'invoices' && (
        <div className="bg-[#0F0F12] border border-white/10 rounded-[3rem] overflow-hidden animate-in slide-in-from-bottom-8 duration-700 mx-4 md:mx-0 shadow-2xl">
          <div className="p-10 border-b border-white/[0.03] flex justify-between items-center bg-white/[0.01]">
            <div className="space-y-1">
              <h3 className="text-3xl font-black text-white tracking-tight leading-none uppercase">Billing History</h3>
              <p className="text-gray-500 text-[10px] font-black tracking-widest uppercase">Archived records of your financial throughput.</p>
            </div>
            <button className="text-[10px] font-black text-blue-500 hover:text-blue-400 transition-colors tracking-widest uppercase bg-blue-500/5 px-6 py-3 rounded-xl border border-blue-500/10">
              EXPORT ALL RECORDS
            </button>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-4 px-8 py-4 mb-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">
              <span>Reference</span>
              <span>Timestamp</span>
              <span>Asset Tier</span>
              <span className="text-right">Settlement</span>
            </div>
            <div className="space-y-3">
              {subscription ? (
                <div className="grid grid-cols-4 items-center px-8 py-6 bg-white/[0.03] border border-white/[0.03] rounded-3xl hover:bg-white/[0.05] hover:border-white/10 transition-all text-xs group cursor-default">
                  <span className="font-extrabold text-white flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]"></div>
                    INV-{new Date(subscription.created_at || '').getFullYear()}-001
                  </span>
                  <span className="text-gray-500 font-bold">{formatDate(subscription.created_at)}</span>
                  <span className="text-gray-400 font-extrabold uppercase tracking-tighter">{getPlanName(subscription.plan_id)}</span>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-2 text-green-400 font-black text-lg">
                      ₹{subscription.amount_paid || 0}
                      <Check className="w-5 h-5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center space-y-6">
                  <div className="w-20 h-20 bg-white/[0.03] rounded-[2rem] flex items-center justify-center mx-auto text-gray-700 border border-white/5 animate-pulse">
                    <Calendar className="w-10 h-10" />
                  </div>
                  <p className="text-gray-600 text-[10px] font-black tracking-[0.3em] uppercase">No transactional records detected.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
