import { useState, useEffect } from 'react';
import { Instagram, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface InstagramAccount {
  id: string;
  instagram_user_id: string;
  username: string;
  profile_picture_url: string | null;
  status: 'active' | 'expired' | 'revoked';
  connected_at: string;
  last_synced_at: string | null;
}

export default function InstagramConnectionStatus() {
  const { user } = useAuth();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInstagramAccount();
  }, [user]);

  const fetchInstagramAccount = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('connected_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      setAccount(data?.[0] || null);
    } catch (err) {
      console.error('Error fetching Instagram account:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Checking connection status...</span>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <XCircle className="text-red-600" size={24} />
          <div>
            <h3 className="font-bold text-gray-900">Instagram Not Connected</h3>
            <p className="text-gray-600 text-sm">Connect your Instagram account to enable automations</p>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = {
    active: {
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      borderColor: 'border-green-200',
      bgGradient: 'from-green-50 to-emerald-50',
      title: `@${account.username} is active and ready for automations`,
      message: ''
    },
    expired: {
      icon: AlertCircle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      borderColor: 'border-yellow-200',
      bgGradient: 'from-yellow-50 to-amber-50',
      title: 'Instagram Connection Expired',
      message: `@${account.username} needs reconnection to continue automations`
    },
    revoked: {
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      borderColor: 'border-red-200',
      bgGradient: 'from-red-50 to-rose-50',
      title: 'Instagram Connection Revoked',
      message: `@${account.username} access has been revoked`
    }
  };

  const status = statusConfig[account.status] || statusConfig.revoked; // Default to revoked status if unknown status
  const Icon = status.icon;

  return (
    <div className={`bg-gradient-to-r ${status.bgGradient} border-2 ${status.borderColor} rounded-2xl p-6 shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${status.bgColor}`}>
          <Icon className={status.color} size={24} />
        </div>

        <div className="flex items-center gap-2 mr-2">
          <Instagram className="text-pink-600" size={20} />
          <span className="font-medium text-gray-800">@{account.username}</span>
        </div>

        <div>
          <h3 className="font-bold text-gray-900">{status.title}</h3>
          {status.message && <p className="text-gray-600 text-sm">{status.message}</p>}
        </div>
      </div>
    </div>
  );
}