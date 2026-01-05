import { useState, useEffect } from 'react';
import { Instagram, Trash2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import InstagramConnectModal from './InstagramConnectModal';

interface InstagramAccount {
  id: string;
  instagram_user_id: string;
  username: string;
  profile_picture_url: string | null;
  status: 'active' | 'expired' | 'revoked';
  connected_at: string;
  last_synced_at: string | null;
}

export default function ConnectedAccounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      const username = params.get('username');
      const usernameText = username ? `@${username}` : 'Your Instagram account';
      setSuccessMessage(`${usernameText} connected successfully! Verifying connection...`);
      
      // Redirect to home page after a short delay to show success message
      setTimeout(() => {
        window.location.href = 'https://app.quickrevert.tech/automation';
      }, 2000); // 2 seconds to show the success message before redirecting

      setTimeout(async () => {
        await fetchAccounts();
        setSuccessMessage(`${usernameText} has been connected and verified!`);
      }, 500);
    }

    const errorParam = params.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      window.history.replaceState({}, '', '/connect-accounts');
    }

    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('connected_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError('Failed to load connected accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectInstagram = () => {
    if (!user) return;
    setShowConnectModal(true);
  };

  const handleModalConnect = () => {
    setShowConnectModal(false);
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect this Instagram account?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      setAccounts(accounts.filter(acc => acc.id !== accountId));
    } catch (err) {
      console.error('Error disconnecting account:', err);
      setError('Failed to disconnect account');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto p-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Connected Accounts</h2>
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 via-white to-pink-50/20">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">Connected Accounts</h1>
          <p className="text-gray-600 text-lg">Manage your Instagram account connections</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Instagram Accounts</h2>
        <button
          onClick={handleConnectInstagram}
          className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white rounded-xl hover:from-pink-600 hover:via-rose-600 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-semibold"
        >
          <Instagram size={20} />
          Connect Instagram
        </button>
      </div>

      {successMessage && (
        <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl flex items-start gap-4 shadow-md">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-green-900 mb-1">Success</p>
            <p className="text-sm text-green-700 font-medium">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-800 transition-colors flex-shrink-0"
            title="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-5 bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-xl flex items-start gap-4 shadow-md">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={22} />
          <div className="flex-1">
            <p className="text-base font-bold text-red-900 mb-1">Error</p>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 transition-colors flex-shrink-0"
            title="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-pink-100 via-rose-100 to-orange-100 rounded-3xl mb-6 shadow-lg">
            <Instagram size={48} className="text-pink-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">No accounts connected</h3>
          <p className="text-gray-600 mb-8 text-lg">Connect your Instagram account to start automating</p>
          <button
            onClick={handleConnectInstagram}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white rounded-xl hover:from-pink-600 hover:via-rose-600 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-lg"
          >
            <Instagram size={24} />
            Connect Instagram Account
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="group flex items-center justify-between p-6 border-2 border-gray-200 rounded-2xl hover:border-pink-300 hover:shadow-lg transition-all bg-gradient-to-br from-white to-pink-50/30"
            >
              <div className="flex items-center gap-5">
                {account.profile_picture_url ? (
                  <img
                    src={account.profile_picture_url}
                    alt={account.username}
                    className="w-16 h-16 rounded-full ring-4 ring-pink-200 group-hover:ring-pink-300 transition-all"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                    <Instagram size={32} className="text-white" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-gray-900 text-lg mb-1">@{account.username}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                        account.status === 'active'
                          ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md'
                          : account.status === 'expired'
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md'
                          : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-md'
                      }`}
                    >
                      {account.status}
                    </span>
                    <span className="text-sm text-gray-600 font-medium px-2 py-1 bg-gray-100 rounded-md">
                      Connected {formatDate(account.connected_at)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(account.id)}
                className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-200"
                title="Disconnect account"
              >
                <Trash2 size={22} />
              </button>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

      <InstagramConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnect={handleModalConnect}
      />
    </div>
  );
}
