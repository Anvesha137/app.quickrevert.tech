import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Supabase sends the user here with an access token in the URL hash.
  // The supabase client automatically picks it up via onAuthStateChange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('is_recovering_password', 'true');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      
      // Sign out immediately so they have to log in manually with the new password
      await supabase.auth.signOut();
      sessionStorage.removeItem('is_recovering_password');
      
      setSuccess(true);
      setTimeout(() => navigate('/'), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#fafbff] font-outfit px-4">
      <div className="w-full max-w-md">
        <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="h-20 mb-6 object-contain" />
            {success ? (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1 className="text-2xl font-black text-slate-900 mb-2">Password Updated!</h1>
                <p className="text-sm text-slate-500 font-medium">Your password has been reset successfully. Redirecting you to the login page...</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black text-slate-900 mb-2">Set New Password</h1>
                <p className="text-sm text-slate-500 font-medium">Enter your new password below.</p>
              </>
            )}
          </div>

          {!success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">New Password</label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                  required
                />
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <p className="text-sm text-rose-700 font-bold leading-tight">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 text-sm h-[48px] flex items-center justify-center mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-white rounded-full animate-spin" />
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
