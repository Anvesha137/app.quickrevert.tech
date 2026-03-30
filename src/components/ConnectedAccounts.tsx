import { useState, useEffect } from 'react';
import { Instagram, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import InstagramConnectModal from './InstagramConnectModal';
import ConfirmationModal from './ui/ConfirmationModal';
import { toast } from 'sonner';

interface InstagramAccount {
  id: string;
  instagram_user_id: string;
  username: string;
  profile_picture_url: string | null;
  status: 'active' | 'expired' | 'revoked';
  connected_at: string;
  last_synced_at: string | null;
}

export default function ConnectedAccounts({ isNested = false }: { isNested?: boolean }) {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      setCountdown(10);
      
      setTimeout(async () => {
        await fetchAccounts();
      }, 500);
    }

    const errorParam = params.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      window.history.replaceState({}, '', '/connect-accounts');
    }

    fetchAccounts();
  }, []);

  useEffect(() => {
    if (countdown === null) return;

    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');
    const usernameText = username ? `@${username}` : 'Your Instagram account';
    
    if (countdown === 0) {
      window.location.href = 'https://app.quickrevert.tech/automation';
      return;
    }

    setSuccessMessage(`${usernameText} connected successfully! Redirecting you to automations page in ${countdown} seconds...`);
    
    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  const fetchAccounts = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Select only the fields needed — exclude access_token and other sensitive data
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('id, instagram_user_id, username, profile_picture_url, status, connected_at, last_synced_at')
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

  const handleRefreshToken = async () => {
    if (!user) return;

    try {
      const { data: activeAutomations, error } = await supabase
        .from('automations')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) {
        console.error('Error checking active automations:', error);
        toast.error('Failed to check automation status');
        return;
      }

      if (activeAutomations && activeAutomations.length > 0) {
        toast.error(
          <div className="flex flex-col gap-1">
            <span>Deactivate automation ⏸️, refresh your token 🔄, then activate it again ✅</span>
            <span>Quick reset and you're good to go ✨</span>
          </div>,
          { duration: 5000 }
        );
        return;
      }

      setShowConnectModal(true);
    } catch (err) {
      console.error('Unexpected error checking automations:', err);
      toast.error('Failed to process token refresh');
    }
  };


  const handleDisconnect = (accountId: string) => {
    setAccountToDisconnect(accountId);
    setIsDisconnectModalOpen(true);
  };

  const confirmDisconnect = async () => {
    if (!accountToDisconnect) return;

    setIsDisconnecting(true);
    try {
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .eq('id', accountToDisconnect);

      if (error) throw error;

      setAccounts(accounts.filter(acc => acc.id !== accountToDisconnect));
      toast.success('Instagram account disconnected successfully');
      setIsDisconnectModalOpen(false);
    } catch (err) {
      console.error('Error disconnecting account:', err);
      setError('Failed to disconnect account');
      toast.error('Failed to disconnect account');
    } finally {
      setIsDisconnecting(false);
      setAccountToDisconnect(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString('en-US', {
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

  if (isNested) {
    return (
      <div className="w-full">
        {successMessage && (
           /* ... success message div ... */
           <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl flex items-start gap-4 shadow-md">
             <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md">
               <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
               </svg>
             </div>
             <div className="flex-1 text-sm font-medium text-green-700">{successMessage}</div>
           </div>
        )}
        {error && (
           <div className="mb-6 p-5 bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-xl flex items-start gap-4 shadow-md">
             <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={22} />
             <div className="flex-1 text-sm font-medium text-red-700">{error}</div>
           </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {accounts.map((account) => (
            <div 
              key={account.id} 
              className={`flex flex-col items-center p-8 border rounded-3xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                darkMode ? 'bg-white/5 border-white/10 hover:bg-white/[0.08]' : 'bg-white border-gray-100/50 hover:bg-white hover:border-blue-200 shadow-sm'
              }`}
            >
              <div className="relative mb-6">
                   {account.profile_picture_url ? (
                     <img 
                      src={account.profile_picture_url} 
                      className={`w-24 h-24 rounded-3xl shadow-lg ring-4 ${darkMode ? 'ring-white/5' : 'ring-white'}`} 
                     />
                   ) : (
                     <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-lg">
                       <Instagram size={40} />
                     </div>
                   )}
                   <div className="absolute -bottom-2 -right-2 px-3 py-1 bg-green-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg border-2 border-white dark:border-gray-900">
                     {account.status}
                   </div>
              </div>

              <div className="mb-8 text-center">
                 <p className={`font-black text-xl mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>@{account.username}</p>
                 <p className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>
                   Since {formatDate(account.connected_at)}
                 </p>
              </div>

              <div className="w-full flex flex-col gap-3">
                <button 
                  onClick={handleRefreshToken} 
                  className={`w-full py-3.5 px-4 flex items-center justify-center gap-2 text-sm font-black rounded-xl transition-all active:scale-95 ${
                    darkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  <RefreshCw size={16} />
                  Refresh Token
                </button>
                <button 
                  onClick={() => handleDisconnect(account.id)} 
                  className={`w-full py-3.5 px-4 flex items-center justify-center gap-2 text-sm font-black rounded-xl transition-all active:scale-95 ${
                    darkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  <Trash2 size={16} />
                  Disconnect
                </button>
              </div>
            </div>
          ))}
          
          {/* Empty State / Add New Card - Only show if no account connected */}
          {accounts.length === 0 && (
            <button
              onClick={handleConnectInstagram}
              className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl transition-all duration-300 hover:scale-[1.02] min-h-[350px] ${
                darkMode 
                  ? 'bg-gradient-to-br from-orange-500/5 to-purple-700/5 border-white/10 hover:border-white/20' 
                  : 'bg-gradient-to-br from-orange-500/10 via-pink-500/10 to-purple-700/10 border-orange-200 hover:border-orange-300 shadow-sm shadow-orange-500/5 font-bold'
              }`}
            >
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-4 transition-all ${
                darkMode ? 'bg-white/10 group-hover:bg-white/20' : 'bg-white shadow-md group-hover:shadow-lg'
              }`}>
                <Instagram size={32} className="text-orange-500" />
              </div>
              <p className={`text-lg font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Connect Account</p>
              <p className={`text-sm font-medium ${darkMode ? 'text-white/30' : 'text-gray-500'}`}>Connect your Instagram profile</p>
            </button>
          )}


        </div>
        <InstagramConnectModal isOpen={showConnectModal} onClose={() => setShowConnectModal(false)} />
        <ConfirmationModal isOpen={isDisconnectModalOpen} onClose={() => setIsDisconnectModalOpen(false)} onConfirm={confirmDisconnect} title="Disconnect" message="Are you sure?" confirmLabel="Disconnect" variant="danger" loading={isDisconnecting} />
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-auto transition-colors duration-500 ${darkMode ? 'bg-black' : 'bg-gradient-to-br from-gray-50 via-white to-pink-50/20'}`}>
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8">
          <h1 className={`text-4xl font-bold tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Connected Accounts</h1>
          <p className={`${darkMode ? 'text-white/40' : 'text-gray-600'} text-lg`}>Manage your Instagram account connections</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Instagram Accounts</h2>
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
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-700 text-white rounded-xl hover:scale-105 transition-all shadow-xl shadow-purple-500/20 hover:shadow-purple-500/40 font-bold text-lg"
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
                  className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 border-2 border-gray-200 rounded-2xl hover:border-pink-300 hover:shadow-lg transition-all bg-gradient-to-br from-white to-pink-50/30 gap-4 sm:gap-0"
                >
                  <div className="flex items-start sm:items-center gap-3 sm:gap-5 w-full sm:w-auto">
                    {account.profile_picture_url ? (
                      <img
                        src={account.profile_picture_url}
                        alt={account.username}
                        className="w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0 rounded-full ring-4 ring-pink-200 group-hover:ring-pink-300 transition-all"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0 bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                        <Instagram className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-1 truncate">@{account.username}</h3>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 sm:mt-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wide ${account.status === 'active'
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md'
                            : account.status === 'expired'
                              ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md'
                              : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-md'
                            }`}
                        >
                          {account.status}
                        </span>
                        <span className="text-xs sm:text-sm text-gray-600 font-medium px-2 py-1 bg-gray-100 rounded-md whitespace-nowrap">
                          Connected {formatDate(account.connected_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-pink-100 sm:border-0 justify-end sm:justify-start">
                    <button
                      onClick={handleRefreshToken}
                      className="flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 flex items-center gap-2 text-xs sm:text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                      title="Refresh access token"
                    >
                      <RefreshCw size={16} />
                      Refresh Token
                    </button>
                    <button
                      onClick={() => handleDisconnect(account.id)}
                      className="px-3 sm:px-4 py-2 flex items-center justify-center gap-0 sm:gap-2 text-xs sm:text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      title="Disconnect account"
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">Disconnect</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <InstagramConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />

      <ConfirmationModal
        isOpen={isDisconnectModalOpen}
        onClose={() => setIsDisconnectModalOpen(false)}
        onConfirm={confirmDisconnect}
        title="Disconnect Account"
        message="Are you sure you want to disconnect this Instagram account? You will need to re-authenticate to use it again."
        confirmLabel="Disconnect Now"
        variant="danger"
        loading={isDisconnecting}
      />
    </div>
  );
}
