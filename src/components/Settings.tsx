import { useState, useEffect } from 'react';
import { User, Trash2, Save, Shield, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

export default function Settings() {
  const { user } = useAuth();
  const theme = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, [user]);

  async function loadUserProfile() {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setDisplayName(data.display_name || '');
      } else {
        setDisplayName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  async function handleSaveSettings() {
    if (!user) return;

    setLoading(true);
    setSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      theme.setDisplayName(displayName);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;

    setDeleteLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('delete-account');

      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert(`Failed to delete account: ${error.message || JSON.stringify(error)}`);
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 tracking-tight">Settings</h1>
          <p className="text-gray-500 font-medium">Manage your profile and account preferences</p>
        </div>

        <div className="space-y-8">
          {/* Profile Section */}
          <div className="backdrop-blur-xl bg-white/40 border border-white/20 rounded-3xl p-8 shadow-2xl shadow-blue-500/5">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Profile Settings</h2>
                <p className="text-sm text-gray-500 font-medium">How other users see you</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 ml-1">
                  <User className="w-4 h-4 text-blue-500" />
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="w-full px-5 py-4 backdrop-blur-md bg-white/50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none font-medium"
                />
                <p className="text-[10px] text-gray-400 ml-2 font-medium">
                  Visible throughout the dashboard and automations
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 ml-1">
                  <Mail className="w-4 h-4 text-purple-500" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-5 py-4 backdrop-blur-md bg-gray-100/50 border border-gray-200 rounded-2xl text-gray-400 italic cursor-not-allowed font-medium"
                />
                <p className="text-[10px] text-gray-400 ml-2 font-medium">
                  Registered email address (cannot be modified)
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="group relative flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-2xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all active:scale-95 disabled:opacity-50"
              >
                <Save className="w-5 h-5 group-hover:animate-pulse" />
                {loading ? 'Saving...' : 'Save Profile'}
              </button>

              {saveSuccess && (
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-2xl border border-emerald-100 animate-in fade-in slide-in-from-left-4 duration-300">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                    <Save className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Changes Saved!</span>
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="backdrop-blur-xl bg-rose-50/30 border border-rose-200 rounded-3xl p-8 transition-all hover:bg-rose-50/50">
            <div className="flex items-start gap-4 mb-8">
              <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/30 flex-shrink-0">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-rose-900 tracking-tight">Danger Zone</h2>
                <p className="text-sm text-rose-700/70 font-medium">
                  Irreversible actions for your account
                </p>
              </div>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-rose-200 text-rose-600 font-bold rounded-2xl hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all active:scale-95 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </button>
            ) : (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                <div className="bg-white/80 border border-rose-200 rounded-2xl p-6">
                  <p className="text-sm font-bold text-rose-900 mb-2">
                    Are you absolutely sure?
                  </p>
                  <p className="text-xs text-rose-700/80 leading-relaxed font-medium">
                    Wait! This action **cannot be undone**. All your automations, triggers, contacts, and historical analytics will be permanently wiped from our servers.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteLoading}
                    className="px-8 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 shadow-lg shadow-rose-500/30 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {deleteLoading ? 'Processing...' : 'Yes, Delete Everything'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-8 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-2xl hover:bg-gray-50 transition-all active:scale-95"
                  >
                    I've changed my mind
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
