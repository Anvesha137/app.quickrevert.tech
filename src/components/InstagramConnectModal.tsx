import { useState, useEffect } from 'react';
import { X, Instagram, CheckCircle, Infinity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TermsOfServiceModal, PrivacyPolicyModal } from './LegalModals';

interface InstagramConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

const InstagramConnectModal = ({ isOpen, onClose, onConnect }: InstagramConnectModalProps) => {
  const { signOut } = useAuth();
  const [oauthUrl, setOauthUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setLoading(true);
      setError(null);
      return;
    }

    const fetchOAuthUrl = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Please log in to connect Instagram');
          return;
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-init`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          const result = await response.json();
          const errorMsg = result.details
            ? `${result.error || 'Error'}: ${result.details}`
            : (result.error || `HTTP ${response.status}: Failed to initialize OAuth`);
          throw new Error(errorMsg);
        }

        const result = await response.json();

        if (!result.authUrl) {
          throw new Error('No authorization URL received from server');
        }

        setOauthUrl(result.authUrl);
      } catch (err: any) {
        console.error('Error fetching OAuth URL:', err);
        setError(err.message || 'Failed to initialize connection');
      } finally {
        setLoading(false);
      }
    };

    fetchOAuthUrl();
  }, [isOpen]);

  const handleConnect = () => {
    if (oauthUrl) window.location.href = oauthUrl;
  };

  const handleLogout = async () => {
    try {
      await signOut();
      onClose();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative backdrop-blur-2xl bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-white/40 animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 hover:bg-slate-100 rounded-full transition-all z-10"
        >
          <X size={20} />
        </button>

        <div className="p-8 pt-10 flex flex-col items-center">
          {/* Logo Branding */}
          <div className="flex items-center gap-1 justify-center mb-8">
            <img src="/Logo.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain" />
            <h1 className="font-bold text-gray-800 text-3xl tracking-tighter">QuickRevert</h1>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
              Connect Instagram Account ✨
            </h2>
            <p className="text-gray-500 font-medium">Only a few steps away to go Viral!</p>
          </div>

          {/* Meta Logo */}
          <div className="flex items-center justify-center mb-6">
            <img src="/meta_logo.png" alt="Meta Logo" className="h-8 object-contain" />
          </div>

          {/* Info Block */}
          <div className="w-full p-6 rounded-2xl bg-[#FDF4FF] border border-purple-100 mb-8 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Infinity className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-purple-600 text-lg">Official Meta API Integration</h3>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              We only use official Instagram APIs and processes. Your Instagram account is secure, and you stay in full control.
            </p>
          </div>

          <div className="w-full space-y-4 mb-8 pl-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-base font-medium text-gray-700">Official Meta OAuth login</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-base font-medium text-gray-700">Safe and Secure</span>
            </div>
          </div>

          {error && (
            <div className="w-full p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium mb-6 text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={loading || !oauthUrl}
            className="w-full bg-gradient-to-r from-orange-500 to-purple-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 mb-8"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <div className="p-1 border-2 border-white rounded-lg">
                  <Instagram className="w-5 h-5" />
                </div>
                <span className="text-lg">Continue to Instagram Login</span>
              </>
            )}
          </button>

          <div className="text-center w-full">
            <p className="text-xs text-gray-400 mb-4">
              By continuing, you agree to QuickRevert's{' '}
              <button onClick={() => setShowTerms(true)} className="font-medium text-blue-500 hover:underline">Terms of Service</button>
              {' '}and{' '}
              <button onClick={() => setShowPrivacy(true)} className="font-medium text-blue-500 hover:underline">Privacy Policy</button>
            </p>

            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-800 font-bold transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
};

export default InstagramConnectModal;

