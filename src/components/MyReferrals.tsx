import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { supabase } from '../lib/supabase';
import { Gift, Copy, CheckCircle, Clock, Sparkles, ArrowRight, Zap } from 'lucide-react';

interface PromoCode {
  promo_code: string;
  discount_percentage: number;
  discount_amount: number;
  discount_type: string;
  package: string;
  expiry_date: string;
  terms_and_conditions?: string;
}

interface ReferralUsage {
  promo_code: string;
  user_email: string;
  paid_at: string;
  package_name?: string;
}

export default function MyReferrals() {
  const { session } = useAuth();
  const { darkMode } = useTheme();
  const { uiStyle } = useUIStyle();
  const isGenZ = uiStyle === 'genz';
  
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [usages, setUsages] = useState<ReferralUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedTerms, setSelectedTerms] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      fetchReferralStats();
    }
  }, [session?.user?.id]);

  const fetchReferralStats = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('get-referral-stats');
      
      if (error) throw error;
      
      setPromoCodes(data.promoCodes || []);
      setUsages(data.usages || []);
    } catch (error) {
      console.error('Failed to fetch referral stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDateIST = (dateString: string) => {
    // The backend artificially adds 5.5 hours to the timestamp before saving to Neon
    // We reverse this shift to get the true UTC time, then format it natively to IST
    const isZ = dateString.endsWith('Z');
    const parseableString = isZ ? dateString : dateString + 'Z';
    const date = new Date(parseableString);
    
    date.setMinutes(date.getMinutes() - 330);

    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className={`p-8 w-full max-w-4xl mx-auto ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 md:p-8 w-full max-w-5xl mx-auto space-y-8 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Gift className={`w-8 h-8 ${isGenZ ? 'text-fuchsia-500' : 'text-indigo-500'}`} />
            My Referrals
          </h1>
          <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Track and manage your assigned promo codes and referral sign-ups.
          </p>
        </div>
      </div>

      {promoCodes.length === 0 ? (
        <div className={`relative overflow-hidden rounded-3xl border ${darkMode ? 'border-indigo-500/20 bg-indigo-500/[0.03]' : 'border-indigo-100 bg-indigo-50/30'} p-8 md:p-12 transition-all`}>
          {/* Background decorations */}
          <div className={`absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br ${isGenZ ? 'from-fuchsia-500/20 to-pink-500/20' : 'from-indigo-500/20 to-purple-500/20'} rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none`} />
          <div className={`absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr ${isGenZ ? 'from-orange-500/10 to-fuchsia-500/10' : 'from-blue-500/10 to-indigo-500/10'} rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none`} />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <div className="flex-1 text-center md:text-left">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-6 ${isGenZ ? 'bg-fuchsia-500/10 text-fuchsia-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                <Sparkles className="w-3.5 h-3.5" /> Collab Program
              </div>
              <h2 className={`text-3xl md:text-4xl font-black mb-4 tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Get <span className={`text-transparent bg-clip-text bg-gradient-to-r ${isGenZ ? 'from-fuchsia-500 to-pink-500' : 'from-indigo-500 to-purple-500'}`}>2 Months Free</span> Premium
              </h2>
              <p className={`text-base md:text-lg mb-8 leading-relaxed font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Join the QuickRevert partner program. Get your own custom referral code, share it with your audience, and unlock full access.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
                <a
                  href="https://quickrevert.tech/collab"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-sm text-white transition-all shadow-xl hover:scale-105 active:scale-95 ${
                    isGenZ
                      ? 'bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:shadow-fuchsia-500/30'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-indigo-500/30'
                  }`}
                >
                  Apply Now <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
                <p className={`text-xs font-bold uppercase tracking-widest mt-2 sm:mt-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  Takes 2 minutes
                </p>
              </div>
            </div>

            <div className="hidden md:flex w-72 h-72 relative shrink-0">
               {/* 3D-like floating cards */}
               <div className={`absolute top-4 right-4 w-48 h-56 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shadow-2xl rotate-6 p-4 flex flex-col justify-between transition-transform hover:rotate-12 hover:-translate-y-2 duration-500`}>
                 <div>
                   <div className={`w-8 h-8 rounded-full mb-3 flex items-center justify-center ${isGenZ ? 'bg-fuchsia-500/10' : 'bg-indigo-500/10'}`}>
                      <Zap className={`w-4 h-4 ${isGenZ ? 'text-fuchsia-500' : 'text-indigo-500'}`} />
                   </div>
                   <div className={`h-2 w-24 rounded mb-2 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />
                   <div className={`h-2 w-16 rounded ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />
                 </div>
                 <div className={`h-8 w-full rounded-lg ${isGenZ ? 'bg-fuchsia-500/10' : 'bg-indigo-500/10'}`} />
               </div>
               
               <div className={`absolute bottom-4 left-4 w-48 h-56 rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'} shadow-2xl -rotate-6 p-4 z-10 flex flex-col items-center justify-center text-center transition-transform hover:-rotate-12 hover:-translate-y-2 duration-500`}>
                  <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Your Code</div>
                  <div className={`text-xl font-black font-mono mb-4 ${isGenZ ? 'text-fuchsia-500' : 'text-indigo-500'}`}>GET2FREE</div>
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                    Active Status
                  </div>
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Promo Codes Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {promoCodes.map((pc) => (
              <div 
                key={pc.promo_code}
                onClick={() => pc.terms_and_conditions && setSelectedTerms(pc.terms_and_conditions)}
                className={`p-5 rounded-2xl border transition-all ${
                  pc.terms_and_conditions ? 'cursor-pointer hover:border-indigo-500/50' : ''
                } ${
                  isGenZ 
                    ? `bg-gradient-to-br ${darkMode ? 'from-purple-900/40 to-fuchsia-900/40 border-fuchsia-500/20' : 'from-purple-50 to-fuchsia-50 border-fuchsia-200'} shadow-lg shadow-fuchsia-500/5`
                    : `${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shadow-sm hover:shadow-md`
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Your Code
                    </div>
                    <div className="text-2xl font-black font-mono tracking-tight">
                      {pc.promo_code}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(pc.promo_code);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      copiedCode === pc.promo_code 
                        ? 'bg-green-100 text-green-600' 
                        : darkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {copiedCode === pc.promo_code ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Discount Value:</span>
                    <span className="font-bold">
                      {pc.discount_type === 'flat' ? `₹${pc.discount_amount}` : `${pc.discount_percentage}% OFF`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Applicable Package:</span>
                    <span className="font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">
                      {pc.package}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Expires On:</span>
                    <span className="font-medium">
                      {new Date(pc.expiry_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
                {pc.terms_and_conditions && (
                  <div className={`mt-4 pt-3 border-t border-dashed ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                    <button
                      onClick={() => setSelectedTerms(pc.terms_and_conditions || null)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                        isGenZ
                          ? 'bg-fuchsia-500/10 text-fuchsia-500 hover:bg-fuchsia-500/20'
                          : 'bg-indigo-500/10 text-indigo-650 hover:bg-indigo-500/20'
                      }`}
                    >
                      Show Terms & Conditions
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Usages Table */}
          <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-100 bg-slate-50'}`}>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Referral Sign-ups
              </h3>
            </div>
            
            {usages.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                  No one has used your promo codes yet. Share them with your audience to get started!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`border-b text-xs font-bold uppercase tracking-wider ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                      <th className="px-6 py-4">User Email</th>
                      <th className="px-6 py-4">Promo Code Used</th>
                      <th className="px-6 py-4">Package</th>
                      <th className="px-6 py-4 text-right">Date & Time (IST)</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {usages.map((usage, idx) => (
                      <tr key={idx} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}>
                        <td className="px-6 py-4">
                          <div className="font-medium">{usage.user_email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                            isGenZ 
                              ? (darkMode ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'bg-fuchsia-50 text-fuchsia-600')
                              : (darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600')
                          }`}>
                            {usage.promo_code}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {usage.package_name ? usage.package_name.replace(/Monthly Sampler.*/i, 'TRY ME OUT') : '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                            {formatDateIST(usage.paid_at)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terms and Conditions Dialog Modal */}
      {selectedTerms && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-150"
          onClick={() => setSelectedTerms(null)}
        >
          <div
            className={`rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border animate-in zoom-in-95 duration-150 flex flex-col ${
              darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`flex justify-between items-center mb-4 pb-3 border-b ${
              darkMode ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Gift className={`w-5 h-5 ${isGenZ ? 'text-fuchsia-500' : 'text-indigo-500'}`} />
                Terms & Conditions
              </h3>
              <button
                onClick={() => setSelectedTerms(null)}
                className={`p-1.5 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className={`text-sm leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap ${
              darkMode ? 'text-slate-300' : 'text-slate-600'
            }`}>
              {selectedTerms}
            </div>

            {/* Close Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedTerms(null)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isGenZ
                    ? 'bg-fuchsia-500 hover:bg-fuchsia-600 text-white'
                    : 'bg-indigo-650 hover:bg-indigo-750 text-white'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
