import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TermsOfServiceModal, PrivacyPolicyModal } from './LegalModals';

export default function Login() {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Modal States
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading('google');
      setError(null);
      await signInWithGoogle();
    } catch (err) {
      setError('Failed to sign in with Google. Please try again.');
      setLoading(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading('email');
      setError(null);
      await signInWithEmail(email, password);
    } catch (err: any) {
      console.error('Auth error:', err);
      const errorMessage = err.message || err.error_description || 'Failed to sign in. Please try again.';
      setError(errorMessage);
      setLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-outfit">
      {/* Left Side: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 md:px-12 py-12 bg-[#fafbff]">
        <div className="max-w-[480px] mx-auto w-full">
          <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="mb-10 flex flex-col items-center text-center">
              <img
                src="/Logo_optimized.png"
                alt="QuickRevert Logo"
                className="h-32 mb-10 object-contain mx-auto"
              />
              <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">
                Welcome Back
              </h1>
              <p className="text-base text-slate-500 font-medium">
                Start automating your Instagram today.
              </p>
            </div>

            <div className="space-y-6">
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-bold text-slate-700 ml-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={loading !== null}
                    className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label htmlFor="password" className="block text-sm font-bold text-slate-700">
                      Password
                    </label>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading !== null}
                    className="w-full px-5 py-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all outline-none text-slate-900 placeholder:text-slate-400 font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4.5 bg-slate-900 rounded-2xl text-white font-black hover:bg-slate-800 active:transform active:scale-[0.98] transition-all shadow-xl shadow-slate-200 disabled:opacity-50 disabled:cursor-not-allowed group h-[60px]"
                >
                  {loading === 'email' ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Mail className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  <span className="tracking-tight">Continue with Email</span>
                </button>
              </form>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.3em] font-black">
                  <span className="px-6 bg-white text-slate-400">Or</span>
                </div>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-4 px-6 py-4.5 bg-white border-2 border-slate-100 rounded-2xl text-slate-700 font-bold hover:bg-slate-50 hover:border-slate-200 transition-all active:transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group h-[60px]"
              >
                {loading === 'google' ? (
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                <span>Sign in with Google</span>
              </button>

              {error && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <p className="text-sm text-rose-700 font-bold leading-tight">{error}</p>
                </div>
              )}

              <div className="pt-8 flex flex-col items-center gap-4">
                <p className="text-[11px] text-slate-400 font-medium text-center leading-relaxed max-w-[280px]">
                  By signing in, you agree to our{' '}
                  <button onClick={() => setShowTerms(true)} className="text-slate-900 font-bold">Terms</button>
                  {' '}and{' '}
                  <button onClick={() => setShowPrivacy(true)} className="text-slate-900 font-bold">Privacy Policy</button>
                </p>
                <p className="text-sm text-slate-500 font-bold">
                  Already have an account? <span className="text-indigo-600 cursor-pointer hover:underline underline-offset-4">Log in</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Hero Image */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-end py-8 pl-8 bg-slate-50">
        <div className="relative w-full h-full rounded-l-[2.5rem] overflow-hidden shadow-2xl border-y border-l border-gray-200">
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/5 to-purple-600/5 z-10 pointer-events-none" />
          <img
            src="/login.png"
            alt="QuickRevert Login"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
