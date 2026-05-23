import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUIStyle } from '../contexts/UIStyleContext';
import { supabase } from '../lib/supabase';
import { Gift, Copy, CheckCircle, Clock } from 'lucide-react';

interface PromoCode {
  promo_code: string;
  discount_percentage: number;
  discount_amount: number;
  discount_type: string;
  package: string;
}

interface ReferralUsage {
  promo_code: string;
  user_email: string;
  paid_at: string;
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
        <div className={`text-center py-20 rounded-2xl border-2 border-dashed ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
          <Gift className={`w-12 h-12 mx-auto mb-4 opacity-50 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
          <h3 className="text-lg font-bold mb-2">No Promo Codes Assigned</h3>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
            You haven't been assigned any referral promo codes yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Promo Codes Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {promoCodes.map((pc) => (
              <div 
                key={pc.promo_code}
                className={`p-5 rounded-2xl border transition-all ${
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
                    onClick={() => copyToClipboard(pc.promo_code)}
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
                </div>
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
    </div>
  );
}
