import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TermsOfServiceModal, PrivacyPolicyModal } from './LegalModals';

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState<'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="hidden lg:flex lg:w-1/2 items-center justify-end py-8 pl-8 bg-slate-50 h-full">
        <div className="relative w-full h-full rounded-l-[2.5rem] overflow-hidden shadow-2xl border-y border-l border-gray-200 group">
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/5 to-purple-600/5 z-10 pointer-events-none" />

          {carouselImages.map((src, index) => (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentImageIndex ? 'opacity-100 z-0' : 'opacity-0 -z-10'
                }`}
            >
              <img
                src={src}
                alt={`Slide ${index + 1}`}
                className={`w-full h-full object-cover transition-transform duration-[5000ms] linear ${index === currentImageIndex ? 'scale-110' : 'scale-100'
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

          <div className="absolute inset-0 bg-black/10 z-[5] pointer-events-none" />
        </div>
      </div>

      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
