import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Calendar, ChevronRight, Crown } from 'lucide-react';
import { useUpgradeModal } from '../contexts/UpgradeModalContext';
import { useSubscription } from '../contexts/SubscriptionContext';

const Billing = () => {
  const { 
    subscription, 
    usage, 
    loading, 
    isPremium, 
    isGifted, 
    giftedSettings, 
    dmLimit, 
    automationLimit,
    invoices
  } = useSubscription();

  const { openModal: openUpgradeModal } = useUpgradeModal();
  const navigate = useNavigate();
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
    if (isGifted) return 'GIFTED PREMIUM';
    if (!isPremium) return 'BASIC';
    if (!id || id === 'basic') return 'BASIC';
    const lowerId = id.toLowerCase();
    if (lowerId.includes('enterprise')) return 'ENTERPRISE';
    if (lowerId.includes('professional')) return 'PROFESSIONAL';
    if (lowerId.includes('try_me_out')) return 'TRY ME OUT';
    if (lowerId.includes('premium')) return 'PREMIUM';
    return lowerId.toUpperCase();
  };

  const getRawPlanName = (id?: string) => {
    if (!id || id === 'basic') return 'BASIC';
    const lowerId = id.toLowerCase();
    if (lowerId.includes('enterprise')) return 'ENTERPRISE';
    if (lowerId.includes('professional')) return 'PROFESSIONAL';
    if (lowerId.includes('try_me_out')) return 'TRY ME OUT';
    if (lowerId.includes('premium')) return 'PREMIUM';
    return lowerId.toUpperCase();
  };

  const getPlanPrice = (id?: string, amount?: number) => {
    if (isGifted) return '₹0';
    if (!isPremium) return '₹0';
    if (!id || id === 'basic') return '₹0';
    if (amount !== undefined && amount !== null) return `₹${amount}`;
    
    const lowerId = id.toLowerCase();
    if (lowerId.includes('try_me_out')) return '₹199';
    if (lowerId.includes('premium')) {
      return lowerId.includes('annual') ? '₹4,199' : '₹1,199';
    }
    if (lowerId.includes('professional')) {
      return lowerId.includes('annual') ? '₹5,999' : '₹1,799';
    }
    return '₹0';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const planLimit = dmLimit;
  const autoLimit = automationLimit;
  const expiryDate = isGifted ? giftedSettings?.expiry_date : subscription?.current_period_end;


  return (
    <div className="max-w-6xl mx-auto p-6 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-screen flex flex-col">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tight text-white leading-none">
          <span className="text-blue-600">Billing & Subscription</span>
        </h1>
      </div>

      {/* Main Two-Section Layout */}
      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* Left Section: Current Plan */}
        <div className="flex-1 bg-[#0F0F12] border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/5 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 flex flex-col h-full">
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-[9px] font-black uppercase tracking-widest mb-4">
                  {isGifted ? (
                    <>
                      <Crown className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500/20" />
                      Special Assignment
                    </>
                  ) : 'Active Plan'}
                </div>
                <h3 className="text-5xl font-black text-white tracking-tighter uppercase mb-2">
                  {getPlanName(subscription?.plan_id)}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white tracking-tight">
                    {getPlanPrice(subscription?.plan_id, subscription?.amount_paid)}
                  </span>
                  {!isGifted && (
                    <span className="text-sm text-gray-500 font-medium uppercase">
                      {!isPremium 
                        ? '/ free'
                        : subscription?.plan_id?.toLowerCase().includes('try_me_out') 
                        ? '/ ONE-TIME' 
                        : subscription?.plan_id?.includes('annual') 
                          ? '/ annual' 
                          : '/ quarterly'}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center backdrop-blur-xl shrink-0">
                <Bot className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 py-6 border-y border-white/[0.05] mb-8">
              <div className="space-y-1">
                <p className="text-gray-600 text-[9px] font-black uppercase tracking-widest">
                  {isGifted || isPremium ? 'Expiry Date' : 'Last Expired On'}
                </p>
                <p className="text-white text-lg font-bold">{expiryDate ? formatDate(expiryDate) : 'N/A'}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-gray-600 text-[9px] font-black uppercase tracking-widest">Status</p>
                <p className={`text-lg font-bold uppercase tracking-tighter ${isPremium || isGifted ? 'text-green-500' : 'text-gray-500'}`}>
                  {isPremium || isGifted ? 'Active' : 'Basic (Free)'}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-4">
              {(!isPremium || (!subscription?.plan_id?.toLowerCase().includes('professional') && !subscription?.plan_id?.toLowerCase().includes('enterprise') && !isGifted)) ? (
                <button
                  onClick={() => navigate('/pricing')}
                  className="w-full py-4 bg-white text-black font-black text-xs tracking-widest rounded-xl hover:bg-gray-100 transition-all uppercase flex items-center justify-center gap-2"
                >
                  Upgrade Plan
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : null}
              
              {isPremium && (
                <div className="w-full py-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center gap-2">
                  <span className="text-blue-400 font-black text-xs tracking-widest uppercase">
                    {isGifted ? 'Gifted Premium Active' : `${getPlanName(subscription?.plan_id)} Active`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Usage & History Tabs */}
        <div className="lg:w-1/3 flex flex-col gap-6">
          {/* Operational Usage Card */}
          <div className="bg-[#0F0F12] border border-white/10 rounded-[2.5rem] p-8 flex-1 flex flex-col justify-center">
            <h4 className="text-lg font-black text-white tracking-tight mb-6 uppercase">Operational Usage</h4>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest">
                  <span className="text-gray-500">DMs Delivered</span>
                  <span className="text-blue-500">{usage.dms.toLocaleString()} / {planLimit.toLocaleString()}</span>
                </div>
                <div className="h-2.5 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                    style={{ width: planLimit === 'Unlimited' ? '100%' : `${Math.min((usage.dms / (typeof planLimit === 'number' ? planLimit : 1000)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Contacts</p>
                  <p className="text-xl font-black text-white">{usage.contacts.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Automations</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-xl font-black text-white">{usage.automations}</p>
                    {planLimit !== 'Unlimited' && <span className="text-xs text-gray-500 font-bold">/ {autoLimit}</span>}
                  </div>
                </div>
                {!isPremium && (
                  <div className="col-span-2 p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Keyword Triggers</p>
                      <p className="text-sm font-bold text-gray-400">2 per post</p>
                    </div>
                    <div className="px-2 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Basic Limit</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            onClick={() => setActiveTab('invoices')}
            className={`cursor-pointer p-6 rounded-[2rem] border transition-all ${activeTab === 'invoices' ? 'bg-white/10 border-white/20' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05]'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <span className="text-xs font-black uppercase tracking-widest text-[#666]">Billing History</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </div>
          </div>
        </div>
      </div>

      {/* History Modal-like View if Active */}
      {activeTab === 'invoices' && (
        <div className="mt-8 bg-[#0F0F12] border border-white/10 rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="p-6 border-b border-white/[0.03] flex justify-between items-center bg-white/[0.01]">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Invoice Records</h3>
            <button
              onClick={() => setActiveTab('overview')}
              className="text-[10px] font-black text-gray-400 hover:text-white transition-colors uppercase tracking-widest"
            >
              Close History
            </button>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] border-b border-white/5">
                  <th className="pb-4">Reference</th>
                  <th className="pb-4">Date</th>
                  <th className="pb-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="text-white">
                {(() => {
                  const allInvoices = [...(invoices || [])];
                  if (isGifted || giftedSettings) {
                    allInvoices.unshift({
                      id: 'gifted-special',
                      plan_id: 'gifted',
                      amount_paid: 0,
                      created_at: new Date().toISOString(), // Current session view
                      status: isGifted ? 'active' : 'expired'
                    } as any);
                  }

                  if (allInvoices.length > 0) {
                    return allInvoices.map((inv, idx) => {
                      const isGiftedRow = inv.id === 'gifted-special';
                      return (
                        <tr key={inv.id} className="border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 font-bold flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${isGiftedRow ? 'bg-yellow-500' : (idx === 0 && !isGifted ? 'bg-blue-600' : 'bg-gray-600')}`}></div>
                              {isGiftedRow ? 'Special Assignment - GIFTED' : `INV-${new Date(inv.created_at || new Date()).getFullYear()}-${(invoices.length - ((isGifted || giftedSettings) ? idx - 1 : idx)).toString().padStart(3, '0')}`}
                            </div>
                            <span className="text-[9px] text-gray-500 uppercase tracking-widest ml-3.5 mt-1">
                              {isGiftedRow 
                                ? (giftedSettings?.expiry_date ? `${isGifted ? 'VALID UNTIL' : 'EXPIRED ON'} ${formatDate(giftedSettings.expiry_date)}` : 'LIFETIME')
                                : getRawPlanName(inv.plan_id)}
                            </span>
                          </td>
                          <td className="py-4 text-gray-500">{isGiftedRow ? (isGifted ? 'Current Plan' : 'Expired') : formatDate(inv.created_at)}</td>
                          <td className="py-4 text-right font-black text-green-400">₹{inv.amount_paid || 0}</td>
                        </tr>
                      );
                    });
                  }

                  return (
                    <tr>
                      <td colSpan={3} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Calendar className="w-8 h-8 text-gray-700 mx-auto" />
                          <p className="text-gray-600 font-bold uppercase tracking-widest text-[10px]">No billing records found</p>
                        </div>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
