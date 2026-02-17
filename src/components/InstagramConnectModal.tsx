import { useState, useEffect } from 'react';
import { X, Instagram, CheckCircle, ShieldCheck, Sparkles } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative backdrop-blur-2xl bg-white/80 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-white/40 animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-full transition-all z-10"
        >
          <X size={20} />
        </button>

        <div className="p-8 pt-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center shadow-lg mb-6 transform -rotate-6">
            <Instagram className="w-10 h-10 text-white" />
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
              Connect Instagram <Sparkles className="w-5 h-5 text-amber-500" />
            </h2>
            <p className="text-gray-600 font-medium">Link your business account to go viral!</p>
          </div>

          <div className="w-full space-y-4 mb-8">
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h4 className="font-bold text-blue-900 text-sm">Meta-Verified Business</h4>
                <p className="text-blue-700/70 text-xs mt-0.5">Official Instagram API integration. Safe & Secure.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Official OAuth</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Secure Data</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="w-full p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium mb-6 text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={loading || !oauthUrl}
            className="w-full bg-gradient-to-r from-purple-600 to-orange-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Instagram className="w-6 h-6" />
                <span>Login with Instagram</span>
              </>
            )}
          </button>

          <div className="mt-8 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3">
              By continuing you agree to
            </p>
            <div className="flex items-center justify-center gap-3 text-xs">
              <a href="#" className="font-bold text-gray-600 hover:text-blue-600 hover:underline">Terms</a>
              <span className="w-1 h-1 rounded-full bg-gray-300"></span>
              <a href="#" className="font-bold text-gray-600 hover:text-blue-600 hover:underline">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstagramConnectModal;
