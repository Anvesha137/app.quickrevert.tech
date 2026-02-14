import { useState, useEffect } from 'react';
import { X, Instagram, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InstagramConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

const InstagramConnectModal = ({ isOpen, onClose, onConnect }: InstagramConnectModalProps) => {
  const [oauthUrl, setOauthUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in transform transition-all">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all z-10"
        >
          <X size={24} />
        </button>

        <div className="p-8 pt-12 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-bold text-gray-900">Connect Instagram Account</h2>
            <span className="text-2xl">✨</span>
          </div>

          <p className="text-gray-500 mb-8 font-medium">Only a few steps away to go Viral!</p>

          <div className="bg-blue-50/50 rounded-2xl p-6 w-full mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="text-blue-600">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <span className="text-blue-600 font-bold text-lg">We're a Meta-verified business</span>
            </div>

            <p className="text-center text-gray-500 text-sm mb-6 leading-relaxed">
              We only use official Instagram APIs and processes. Your Instagram account is secure, and you stay in full control.
            </p>

            <div className="space-y-3 pl-2">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 rounded-full p-0.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                <span className="text-gray-600 font-medium text-sm">Official Meta OAuth login</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-green-100 rounded-full p-0.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                <span className="text-gray-600 font-medium text-sm">Safe and Secure</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-green-100 rounded-full p-0.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                <span className="text-gray-600 font-medium text-sm">Used by 1000+ creators</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={loading || !oauthUrl}
            className="w-full bg-gradient-to-r from-purple-600 to-orange-400 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-8"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Instagram className="w-5 h-5" />
                <span>Login with Instagram</span>
              </>
            )}
          </button>

          <div className="text-center space-y-2">
            <p className="text-xs text-gray-400">
              By continuing, you agree to QuickRevert's
            </p>
            <div className="flex items-center justify-center gap-1 text-xs text-blue-500">
              <a href="#" className="hover:underline">Terms of Service</a>
              <span className="text-gray-300">and</span>
              <a href="#" className="hover:underline">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default InstagramConnectModal;

