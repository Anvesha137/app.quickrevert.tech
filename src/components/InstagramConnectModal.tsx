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

const InstagramConnectModal = ({ isOpen, onClose }: Omit<InstagramConnectModalProps, 'onConnect'>) => {
  // const { signOut } = useAuth(); // Not needed anymore
  // const { user } = useAuth(); // If needed later
  // Or just empty if only signOut was there
  const { } = useAuth();
  const [oauthUrl, setOauthUrl] = useState<string>('');
  const [directRedirectUrl, setDirectRedirectUrl] = useState<string>('');
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

        const { data: result, error: invokeError } = await supabase.functions.invoke('instagram-oauth-init', {
          method: 'GET'
        });

        if (invokeError) {
          throw new Error(invokeError.message || 'Failed to initialize OAuth');
        }

        if (result?.error) {
          throw new Error(result.error);
        }

        if (!result.authUrl) {
          throw new Error('No authorization URL received from server');
        }

        setOauthUrl(result.authUrl);
        setDirectRedirectUrl(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-init?redirect=true&token=${session.access_token}`);
      } catch (err: any) {
        console.error('Error fetching OAuth URL:', err);
        setError(err.message || 'Failed to initialize connection');
      } finally {
        setLoading(false);
      }
    };

    fetchOAuthUrl();
  }, [isOpen]);


  const handleConnect = (e: React.MouseEvent) => {
    if (loading || (!oauthUrl && !directRedirectUrl)) {
      e.preventDefault();
      return;
    }
    // We let the default <a> behavior take over if possible, 
    // but we can also force it for consistency
    if (directRedirectUrl) {
      window.location.href = directRedirectUrl;
      e.preventDefault();
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

        <div className="p-6 pt-8 flex flex-col items-center">
          {/* Logo Branding */}
          <div className="flex items-center gap-1 justify-center mb-6">
            <img src="/Logo_optimized.png" alt="QuickRevert Logo" className="w-12 h-12 object-contain" />
            <h1 className="font-bold text-gray-800 text-3xl tracking-tighter">QuickRevert</h1>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
              Connect Instagram Account ✨
            </h2>
            <p className="text-gray-500 font-medium">Only a few steps away to go Viral!</p>
          </div>



          {/* Balanced Meta API Info Block */}
          <div className="w-full p-3 rounded-xl bg-[#FDF4FF] border border-purple-100 mb-6 text-left">
            <div className="flex items-center gap-2 mb-1">
              <Infinity className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-purple-600 text-sm italic">Official Meta API Integration</h3>
            </div>
            <p className="text-gray-600 text-[11px] leading-snug mb-2 opacity-90">
              We only use official Instagram APIs and processes. Your account is secure.
            </p>
            <div className="flex flex-col gap-2 pt-2 border-t border-purple-100/30">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-bold text-gray-700">Official Meta OAuth</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-bold text-gray-700">Safe and Secure</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="w-full p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium mb-6 text-center">
              {error}
            </div>
          )}

          <a
            href={directRedirectUrl || oauthUrl || '#'}
            onClick={handleConnect}
            className={`w-full bg-gradient-to-r from-orange-500 to-purple-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 mb-4 ${
              loading || (!oauthUrl && !directRedirectUrl) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
            }`}
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
          </a>

          {!loading && (
            <div className="w-full p-4 rounded-xl bg-blue-50 border border-blue-100 mb-4 flex gap-3 text-left">
              <span className="text-xl">💡</span>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                <strong>iPhone Users:</strong> If clicking "Login" opens the Instagram app automatically, please <strong>long-press</strong> the button above and select <strong>"Open in New Tab"</strong> to successfully connect.
              </p>
            </div>
          )}

          <div className="text-center w-full">
            <p className="text-xs text-gray-400 mb-4">
              By continuing, you agree to QuickRevert's{' '}
              <button onClick={() => setShowTerms(true)} className="font-medium text-blue-500 hover:underline">Terms of Service</button>
              {' '}and{' '}
              <button onClick={() => setShowPrivacy(true)} className="font-medium text-blue-500 hover:underline">Privacy Policy</button>
            </p>

            <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-xl">
              <p className="text-[10px] text-orange-800 font-medium leading-tight text-center">
                <strong>Note:</strong> Connecting a <strong>Creator</strong> or <strong>Business</strong> account is required.
              </p>
            </div>
          </div>
        </div>
      </div>

      <TermsOfServiceModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
};

export default InstagramConnectModal;

