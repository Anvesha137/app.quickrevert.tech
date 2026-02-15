import { useState, useEffect } from 'react';
import { Palette, User, Trash2, Save, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

const colorPalettes = [
  {
    id: 'default',
    name: 'Ocean Blue',
    primary: '#3b82f6',
    secondary: '#06b6d4',
    gradient: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'sunset',
    name: 'Sunset Orange',
    primary: '#f97316',
    secondary: '#fb923c',
    gradient: 'from-orange-500 to-amber-500'
  },
  {
    id: 'forest',
    name: 'Forest Green',
    primary: '#10b981',
    secondary: '#34d399',
    gradient: 'from-emerald-500 to-green-500'
  },
  {
    id: 'lavender',
    name: 'Lavender Dream',
    primary: '#8b5cf6',
    secondary: '#a78bfa',
    gradient: 'from-violet-500 to-purple-500'
  },
  {
    id: 'rose',
    name: 'Rose Pink',
    primary: '#ec4899',
    secondary: '#f472b6',
    gradient: 'from-pink-500 to-rose-500'
  },
  {
    id: 'slate',
    name: 'Modern Slate',
    primary: '#64748b',
    secondary: '#94a3b8',
    gradient: 'from-slate-500 to-gray-500'
  },
];

export default function Settings() {
  const { user } = useAuth();
  const theme = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [selectedPalette, setSelectedPalette] = useState('default');
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
        .select('display_name, color_palette')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setDisplayName(data.display_name || '');
        setSelectedPalette(data.color_palette || 'default');
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
          color_palette: selectedPalette,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      theme.setDisplayName(displayName);
      theme.setColorPalette(selectedPalette);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;

    setDeleteLoading(true);

    try {
      // Invoke Edge Function for safe deletion (Neon DB + Supabase Auth)
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
    <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 via-white to-blue-50/30 ml-64">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">Settings</h1>
          <p className="text-lg text-gray-600">Customize your QuickRevert experience</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Profile Settings</h2>
                <p className="text-sm text-gray-600">Update your display name</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 mt-2">
                  This name will be displayed throughout the application
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Email cannot be changed
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Color Palette</h2>
                <p className="text-sm text-gray-600">Choose your preferred theme</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {colorPalettes.map((palette) => (
                <button
                  key={palette.id}
                  onClick={() => setSelectedPalette(palette.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all hover:scale-105 ${selectedPalette === palette.id
                    ? 'border-gray-900 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className={`w-full h-20 rounded-lg bg-gradient-to-r ${palette.gradient} mb-3 shadow-md`}></div>
                  <p className="text-sm font-semibold text-gray-900">{palette.name}</p>
                  {selectedPalette === palette.id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSaveSettings}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>

            {saveSuccess && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">Settings saved successfully!</span>
              </div>
            )}
          </div>



          <div className="bg-red-50 rounded-xl border-2 border-red-200 p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-red-900">Danger Zone</h2>
                <p className="text-sm text-red-700 mt-1">
                  Permanently delete your account and all associated data
                </p>
              </div>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-red-300 text-red-600 font-semibold rounded-lg hover:bg-red-50 hover:border-red-400 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border-2 border-red-300">
                  <p className="text-sm font-semibold text-red-900 mb-2">
                    Are you absolutely sure?
                  </p>
                  <p className="text-sm text-red-700">
                    This action cannot be undone. All your automations, contacts, and activity history will be permanently deleted.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteLoading}
                    className="px-4 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all disabled:opacity-50"
                  >
                    {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2.5 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all"
                  >
                    Cancel
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
