import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TermsOfServiceModal, PrivacyPolicyModal } from './LegalModals';

export default function Login() {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email login states
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Modal States
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showBannedPopup, setShowBannedPopup] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('quickrevert_banned') === 'true') {
      setShowBannedPopup(true);
    }
  }, []);

  const handleCloseBannedPopup = () => {
    setShowBannedPopup(false);
    localStorage.removeItem('quickrevert_banned');
  };

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

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setLoading('email');
      setError(null);
      await signInWithEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with email. Please check your credentials.');
      setLoading(null);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    try {
      setLoading('email');
      setError(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      const msg = err?.message || '';
      // Supabase server config error — SMTP likely not set up
      if (msg.toLowerCase().includes('unmarshaling') || msg.toLowerCase().includes('json')) {
        setError('Password reset is not configured yet. Please contact support or use Google Sign-In.');
      } else {
        setError(msg || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(null);
    }
  };

  const carouselImages = [
    '/1.png',
    '/2.jpeg',
    '/3.png',
    '/4.png',
    '/5.png'
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-white font-outfit flex">
      {/* Left Side: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 md:px-12 py-6 bg-[#fafbff]">
        <div className="max-w-[480px] mx-auto w-full">
          <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="mb-8 flex flex-col items-center text-center">
              <img
                src="/Logo_optimized.png"
                alt="QuickRevert Logo"
                className="h-28 mb-8 object-contain mx-auto"
              />
              <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
                Welcome Back
              </h1>
              <p className="text-base text-slate-500 font-medium">
                Start automating your Instagram today.
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
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
                  <span>Continue with Google</span>
                </button>

                {!showEmailLogin ? (
                  <button
                    onClick={() => setShowEmailLogin(true)}
                    className="w-full text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors py-2"
                  >
                    Continue via email
                  </button>
                ) : showForgotPassword ? (
                  <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
                    {resetSent ? (
                      <div className="text-center space-y-3 py-4">
                        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">Check your email</h3>
                        <p className="text-sm text-slate-500">We've sent a password reset link to <strong>{email}</strong></p>
                        <button
                          type="button"
                          onClick={() => { setShowForgotPassword(false); setResetSent(false); }}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                        >
                          Back to Sign In
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-3">
                        <p className="text-sm text-slate-500 text-center mb-2">Enter your email and we'll send you a link to reset your password.</p>
                        <input
                          type="email"
                          placeholder="Email address"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                          required
                        />
                        <button
                          type="submit"
                          disabled={loading !== null}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 text-sm h-[48px] flex items-center justify-center"
                        >
                          {loading === 'email' ? (
                            <div className="w-5 h-5 border-2 border-indigo-200 border-t-white rounded-full animate-spin" />
                          ) : (
                            'Send Reset Link'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowForgotPassword(false); setError(null); }}
                          className="w-full text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors pt-1"
                        >
                          Back
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleEmailSignIn} className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                      required
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(true); setError(null); }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading !== null}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 text-sm h-[48px] flex items-center justify-center"
                    >
                      {loading === 'email' ? (
                        <div className="w-5 h-5 border-2 border-indigo-200 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Sign In'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailLogin(false)}
                      className="w-full text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors pt-1"
                    >
                      Back
                    </button>
                  </form>
                )}
              </div>

              {error && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <p className="text-sm text-rose-700 font-bold leading-tight">{error}</p>
                </div>
              )}

              <div className="pt-6 flex flex-col items-center gap-4">
                <p className="text-[11px] text-slate-400 font-medium text-center leading-relaxed max-w-[280px]">
                  By signing in, you agree to our{' '}
                  <button onClick={() => setShowTerms(true)} className="text-slate-900 font-bold">Terms</button>
                  {' '}and{' '}
                  <button onClick={() => setShowPrivacy(true)} className="text-slate-900 font-bold">Privacy Policy</button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Carousel */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center h-full p-10">
        <div className="relative w-full h-full max-h-[800px] overflow-hidden group">

          {carouselImages.map((src, index) => (
            <div
              key={src}
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-1000 ease-in-out ${index === currentImageIndex ? 'opacity-100 z-0' : 'opacity-0 -z-10'
                }`}
            >
              <img
                src={src}
                alt={`Slide ${index + 1}`}
                className={`max-w-full max-h-full object-contain rounded-[2.5rem] transition-transform duration-[5000ms] linear ${index === currentImageIndex ? 'scale-110' : 'scale-100'
                  }`}
              />
            </div>
          ))}

          {/* Carousel Indicators */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {carouselImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`h-1.5 transition-all duration-300 rounded-full ${index === currentImageIndex ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'
                  }`}
              />
            ))}
          </div>


        </div>
      </div>

      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />

      {/* Banned User Popup */}
      {showBannedPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative animate-in zoom-in-95 duration-500 border border-slate-100">
            <div className="w-20 h-20 mx-auto bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-6 shadow-inner ring-8 ring-rose-50/50">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-center text-slate-900 mb-3 tracking-tight">Access Denied</h2>
            <p className="text-center text-slate-500 font-medium leading-relaxed mb-8 text-sm">
              Due to abnormal activities from ur end, you are banned from this site. If you think this is not correct drop a email on <br/><a href="mailto:sales@quickrevert.tech" className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors mt-1 inline-block">sales@quickrevert.tech</a>
            </p>
            <button
              onClick={handleCloseBannedPopup}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg shadow-slate-900/20"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
