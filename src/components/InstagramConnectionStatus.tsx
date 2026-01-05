import { useState, useEffect } from 'react';
import { Instagram, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

interface InstagramAccount {
  id: string;
  username: string;
  profile_picture_url: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export default function InstagramConnectionStatus() {
  const { user } = useAuth();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAndVerifyAccount();
    }
  }, [user]);

  const fetchAndVerifyAccount = async () => {
    try {
      setLoading(true);

      const { data: accounts } = await supabase
        .from('instagram_accounts')
        .select('id, username, profile_picture_url, status')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('connected_at', { ascending: false })
        .limit(1);

      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        await verifyConnection();
      } else {
        setAccount(null);
        setVerified(null);
      }
    } catch (error) {
      console.error('Error fetching Instagram account:', error);
      setAccount(null);
      setVerified(null);
    } finally {
      setLoading(false);
    }
  };

  const verifyConnection = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setVerified(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-instagram-profile`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setVerified(response.ok);
    } catch (error) {
      console.error('Error verifying Instagram connection:', error);
      setVerified(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-600"></div>
          <span className="text-sm text-gray-600 font-medium">Checking Instagram connection...</span>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 rounded-2xl shadow-xl border-2 border-pink-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-orange-400 rounded-xl flex items-center justify-center shadow-lg">
              <Instagram size={24} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Instagram Not Connected</h3>
              <p className="text-sm text-gray-600">Connect your account to start automating</p>
            </div>
          </div>
          <Link
            to="/connect-accounts"
            className="px-6 py-3 bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white rounded-xl hover:from-pink-600 hover:via-rose-600 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl font-semibold text-sm"
          >
            Connect Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {account.profile_picture_url ? (
            <img
              src={account.profile_picture_url}
              alt={account.username}
              className="w-12 h-12 rounded-full ring-2 ring-pink-200 shadow-md"
            />
          ) : (
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
              <Instagram size={24} className="text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-gray-900 text-lg">@{account.username}</h3>
              {verified === true && (
                <CheckCircle size={18} className="text-green-600" title="Connection verified" />
              )}
              {verified === false && (
                <XCircle size={18} className="text-red-600" title="Connection failed" />
              )}
              {verified === null && (
                <AlertTriangle size={18} className="text-yellow-600" title="Verification pending" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md">
                Connected
              </span>
              {verified === true && (
                <span className="text-xs text-green-700 font-semibold bg-green-100 px-2 py-1 rounded-md">
                  API Verified
                </span>
              )}
              {verified === false && (
                <span className="text-xs text-red-700 font-semibold bg-red-100 px-2 py-1 rounded-md">
                  Needs Reauth
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          to="/connect-accounts"
          className="px-5 py-2.5 text-gray-700 border-2 border-gray-300 rounded-xl hover:border-pink-400 hover:text-pink-600 hover:bg-pink-50 transition-all font-semibold text-sm"
        >
          Manage
        </Link>
      </div>
    </div>
  );
}
