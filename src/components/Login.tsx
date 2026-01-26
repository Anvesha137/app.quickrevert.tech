import { useState } from 'react';
import { Zap, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TermsOfServiceModal, PrivacyPolicyModal } from './LegalModals';

export default function Login() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false); // Default to Sign In
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

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

    if (isSignUp && !fullName) {
      setError('Please enter your full name');
      return;
    }

    try {
      setLoading('email');
      setError(null);

      if (isSignUp) {
        await signUpWithEmail(email, password, fullName);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      const errorMessage = err.message || err.error_description || `Failed to ${isSignUp ? 'sign up' : 'sign in'}. Please try again.`;
      setError(errorMessage);
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mb-4 shadow-lg">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to QuickRevert</h1>
          <p className="text-gray-600">Sign in to access your automation dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  disabled={loading !== null}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading !== null}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading !== null}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-blue-600 border-2 border-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 hover:border-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'email' ? (
                <div className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
              ) : (
                <Mail className="w-5 h-5" />
              )}
              <span>{isSignUp ? 'Sign Up' : 'Sign In'} with Email</span>
            </button>

            {/* Removed Sign Up Toggle as per request */}
          </form>

          {/* Google Sign In Removed as per request */}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              By signing in, you agree to our{' '}
              <button
                onClick={() => setShowTerms(true)}
                className="text-blue-600 hover:text-blue-800 hover:underline font-medium focus:outline-none"
              >
                Terms of Service
              </button>
              {' '}and{' '}
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-blue-600 hover:text-blue-800 hover:underline font-medium focus:outline-none"
              >
                Privacy Policy
              </button>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Need help? <a href="https://quickrevert.tech/contact" className="text-blue-600 hover:text-blue-700 font-medium">Contact support</a>
          </p>
        </div>
      </div>

      {/* Modals */}
      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
