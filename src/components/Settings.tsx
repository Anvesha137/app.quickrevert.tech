import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Mail,
  User,
  MapPin,
  Phone,
  Briefcase,
  ChevronDown,
  Save,
  Shield,
  Trash2,
  Camera,
  Settings as LucideSettings,
  AlertTriangle
} from 'lucide-react';
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import { Skeleton } from "./ui/skeleton";

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Reusable Glass Components ---

const GlassCard = ({ children, className, delay = 0, noPadding = false }: any) => {
  const { darkMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay, ease: "easeOut" }}
      className={cn(
        "relative rounded-3xl transition-all duration-500",
        darkMode
          ? "bg-transparent border-none shadow-none"
          : "border border-white/60 bg-white/40 shadow-xl backdrop-blur-2xl hover:border-white/80 hover:shadow-2xl hover:shadow-blue-500/5 group",
        !noPadding && "p-8",
        className
      )}
    >
      {!darkMode && <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-transparent pointer-events-none opacity-50 group-hover:opacity-70 transition-opacity" />}
      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
};

const GlassInput = ({ label, icon: Icon, placeholder, value, onChange, type = "text", subLabel, disabled = false }: any) => {
  const { darkMode } = useTheme();
  return (
    <div className="space-y-2 group">
      <div className="flex justify-between items-baseline">
        <label className={cn(
          "flex items-center gap-2 text-sm font-semibold transition-colors",
          darkMode ? "text-white" : "text-slate-700 group-focus-within:text-blue-600"
        )}>
          {Icon && <Icon className={cn("h-4 w-4 transition-colors", darkMode ? "text-white/60" : "text-slate-400 group-focus-within:text-blue-500")} />}
          {label}
        </label>
      </div>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full rounded-xl transition-all duration-300",
            darkMode
              ? "bg-white/5 border border-white/5 text-white placeholder-white/20 focus:border-white/20 focus:bg-white/[0.08] focus:outline-none"
              : "border border-slate-200/60 bg-white/50 px-4 py-3 text-slate-800 placeholder-slate-400 shadow-sm backdrop-blur-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 hover:bg-white/70 hover:border-slate-300",
            darkMode ? "px-4 py-3" : "",
            disabled && (darkMode ? "opacity-30 cursor-not-allowed" : "cursor-not-allowed bg-slate-100/50 text-slate-500 hover:bg-slate-100/50 hover:border-slate-200/60")
          )}
          placeholder={placeholder}
        />
      </div>
      {subLabel && <p className={cn("text-[10px] font-bold uppercase tracking-widest pl-1", darkMode ? "text-white/60" : "text-slate-400")}>{subLabel}</p>}
    </div>
  );
};

const GlassSelect = ({ label, icon: Icon, value, onChange, options, placeholder }: any) => {
  const { darkMode } = useTheme();
  return (
    <div className="space-y-2 group">
      <label className={cn(
        "flex items-center gap-2 text-sm font-semibold transition-colors",
        darkMode ? "text-white" : "text-slate-700 group-focus-within:text-blue-600"
      )}>
        {Icon && <Icon className={cn("h-4 w-4 transition-colors", darkMode ? "text-white/60" : "text-slate-400 group-focus-within:text-blue-500")} />}
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className={cn(
            "w-full appearance-none rounded-xl transition-all duration-300 cursor-pointer px-4 py-3",
            darkMode
              ? "bg-white/5 border border-white/5 text-white focus:border-white/20 focus:bg-white/[0.08] focus:outline-none"
              : "border border-slate-200/60 bg-white/50 text-slate-800 shadow-sm backdrop-blur-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 hover:bg-white/70 hover:border-slate-300",
            value === "" && (darkMode ? "text-white/20" : "text-slate-400")
          )}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((option: string) => (
            <option key={option} value={option} className={darkMode ? "bg-black text-white" : "text-slate-800"}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className={cn(
          "absolute right-4 top-3.5 h-4 w-4 pointer-events-none transition-colors",
          darkMode ? "text-white/60" : "text-slate-400 group-focus-within:text-blue-500"
        )} />
      </div>
    </div>
  );
};

const GlassButton = ({ children, variant = "primary", className, icon: Icon, onClick, loading = false, type = "button", disabled = false }: any) => {
  const { darkMode } = useTheme();
  const { isPremium } = useSubscription();

  const activeGradient = isPremium
    ? "from-indigo-600 to-violet-700 shadow-indigo-500/50"
    : "from-blue-500 to-purple-600 shadow-purple-500/50";

  const variants = {
    primary: darkMode
      ? `bg-gradient-to-r ${activeGradient} text-white shadow-lg hover:brightness-110 border-transparent`
      : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:brightness-110 border-transparent",
    secondary: darkMode
      ? "bg-white/5 text-white/60 hover:bg-white/10 border-white/5"
      : "bg-white/60 text-slate-700 hover:bg-white/90 border-slate-200/50 shadow-sm hover:shadow-md",
    danger: darkMode
      ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
      : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700 hover:border-red-200 shadow-sm",
    ghost: "bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      type={type}
      disabled={loading || disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-semibold transition-all border text-sm cursor-pointer",
        variants[variant as keyof typeof variants],
        (loading || disabled) && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {loading ? <Skeleton className="h-4 w-4 rounded-full bg-white/20 animate-shimmer" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
};


export default function Settings({ isNested = false }: { isNested?: boolean }) {
  const { user } = useAuth();
  const theme = useTheme();

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    location: "",
    phone: "",
    category: ""
  });

  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    loadUserProfile();
  }, [user]);

  async function loadUserProfile() {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username, phone, location, business_category')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setFormData({
          firstName: data.first_name || "",
          lastName: data.last_name || "",
          username: data.username || "",
          location: data.location || "",
          phone: data.phone || "",
          category: data.business_category || ""
        });
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
    } finally {
      setProfileLoading(false);
    }
  }


  async function handleSaveSettings() {
    if (!user) return;

    setLoading(true);
    setSaveSuccess(false);

    try {
      // 1. Proactive Username Conflict Check
      const trimmedUsername = formData.username.trim();
      const usernameToSave = trimmedUsername || null;

      if (usernameToSave) {
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', usernameToSave)
          .neq('id', user.id)
          .maybeSingle();

        if (checkError) console.warn('Username check error:', checkError);

        if (existingUser) {
          throw new Error('This username is already taken by another user. Please choose a unique one.');
        }
      }

      // 2. Compute display name
      const computedDisplayName = `${formData.firstName} ${formData.lastName}`.trim() || trimmedUsername || user.email?.split('@')[0] || 'User';

      // 3. Perform Upsert
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          username: usernameToSave,
          phone: formData.phone,
          location: formData.location,
          business_category: formData.category,
          display_name: computedDisplayName,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      theme.setDisplayName(computedDisplayName);

      setSaveSuccess(true);
      toast.success('Settings saved successfully!');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Error saving settings:', error);

      let errorMsg = error.message || error.details || 'Unknown error';

      // Secondary check for constraint violations from DB
      if (errorMsg.includes('profiles_username_key')) {
        errorMsg = 'This username is already taken. Please choose another one.';
      }

      toast.error(`Save Failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;

    setDeleteLoading(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('delete-account');

      if (invokeError) {
        throw new Error(invokeError.message || 'Server connection failed');
      }

      // Check the success flag from my new function logic
      if (data && data.success === false) {
        const errorDetail = data.details ? JSON.stringify(data.details) : '';
        throw new Error(`${data.error}${errorDetail ? ': ' + errorDetail : ''}`);
      }

      toast.success('Account deleted successfully. Logging you out...');

      // Short delay for the toast to be seen
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/');
      }, 1500);

    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(`Deletion Failed: ${error.message || 'Please contact support.'}`);
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
      setConfirmText('');
    }
  }

  const categories = [
    "Fashion & Style",
    "Beauty & Makeup",
    "Travel & Adventure",
    "Fitness & Health",
    "Food & Drink",
    "Tech & Gadgets",
    "Lifestyle",
    "Parenting & Family",
    "Gaming",
    "Art & Design",
    "Photography",
    "Music & Dance",
    "Education",
    "Business & Entrepreneurship",
    "DIY & Crafts",
    "Other"
  ];

  const content = (
    <div className="w-full pb-20 space-y-8">
      {/* Header Section */}
      {!isNested && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center md:text-left"
        >
          <h2 className={cn("text-4xl font-black tracking-tighter transition-colors mb-2", theme.darkMode ? "text-white" : "text-slate-900")}>Profile Settings</h2>
          <p className={cn("text-lg font-medium transition-colors opacity-60", theme.darkMode ? "text-white" : "text-slate-600")}>Manage your digital identity and preferences.</p>
        </motion.div>
      )}

      <div className="w-full space-y-6">
        <GlassCard delay={0.2} className="p-8">
            <div className={cn("pb-4 border-b mb-8 flex items-center justify-between transition-colors", theme.darkMode ? "border-white/5" : "border-slate-100")}>
              <h3 className={cn("text-xl font-black transition-colors", theme.darkMode ? "text-white" : "text-slate-900")}>Account & Business Information</h3>
              <LucideSettings className="w-5 h-5 opacity-20" />
            </div>

            <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
              {profileLoading ? (
                <>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="space-y-4">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-14 w-full rounded-2xl" />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <GlassInput
                    label="First Name"
                    placeholder="Jane"
                    value={formData.firstName}
                    onChange={(e: any) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                  <GlassInput
                    label="Last Name"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e: any) => setFormData({ ...formData, lastName: e.target.value })}
                  />

                  <div className="col-span-2 md:col-span-1">
                    <GlassInput
                      label="Username"
                      icon={User}
                      placeholder="username"
                      value={formData.username}
                      subLabel="Must be unique"
                      onChange={(e: any) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <GlassInput
                      label="Phone Number"
                      icon={Phone}
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={formData.phone}
                      onChange={(e: any) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <GlassSelect
                      label="Business Category"
                      icon={Briefcase}
                      value={formData.category}
                      options={categories}
                      placeholder="Select a category"
                      onChange={(e: any) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <GlassInput
                      label="Location"
                      icon={MapPin}
                      placeholder="City, Country"
                      value={formData.location}
                      onChange={(e: any) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1 opacity-60">
                    <GlassInput
                      label="Account Email"
                      icon={Mail}
                      value={user?.email || ''}
                      disabled
                      subLabel="Primary identification email"
                    />
                  </div>

                  <div className="col-span-2 md:col-span-1 flex items-start pt-7">
                    <div className="w-full flex items-center gap-4">
                      <GlassButton
                        variant="primary"
                        icon={Save}
                        className="shadow-xl shadow-blue-500/20 w-full py-3.5 px-6 font-black text-sm uppercase tracking-widest"
                        onClick={handleSaveSettings}
                        loading={loading}
                      >
                        Save Profile Info
                      </GlassButton>
                      {saveSuccess && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20"
                        >
                          <Save className="w-5 h-5" />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </GlassCard>
        </div>

      {/* ── Danger Zone Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className={cn(
          "relative rounded-3xl border-2 p-8 transition-all duration-300",
          theme.darkMode
            ? "border-red-500/20 bg-red-500/[0.04] hover:border-red-500/30"
            : "border-red-100 bg-red-50/40 hover:border-red-200"
        )}
      >
        {/* Corner accent */}
        <div className="absolute top-0 right-0 w-32 h-32 overflow-hidden rounded-3xl pointer-events-none">
          <div className={cn("absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-10", theme.darkMode ? "bg-red-500" : "bg-red-300")} />
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className={cn("text-lg font-black tracking-tight", theme.darkMode ? "text-red-400" : "text-red-700")}>Danger Zone</h3>
            <p className={cn("text-xs font-medium mt-0.5", theme.darkMode ? "text-red-400/50" : "text-red-500/70")}>
              Permanent and irreversible actions
            </p>
          </div>
        </div>

        <div className={cn(
          "rounded-2xl border p-5 mb-5",
          theme.darkMode ? "bg-black/30 border-white/5" : "bg-white/60 border-red-100"
        )}>
          <p className={cn("text-sm font-bold mb-2", theme.darkMode ? "text-white" : "text-gray-900")}>Delete My Data</p>
          <p className={cn("text-[13px] leading-relaxed font-medium", theme.darkMode ? "text-white/40" : "text-gray-500")}>
            Permanently delete your account and erase all associated data including automations, contacts, analytics, and billing history.
            This cannot be undone.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { setShowDeleteConfirm(true); setConfirmText(''); }}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border transition-all",
            theme.darkMode
              ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50"
              : "border-red-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-300 shadow-sm"
          )}
        >
          <Trash2 className="w-4 h-4" />
          Delete My Data
        </motion.button>
      </motion.div>

      {/* ── Full-screen Delete Modal ── */}
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleteLoading) { setShowDeleteConfirm(false); setConfirmText(''); } }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-md rounded-3xl border overflow-hidden"
            style={{ background: theme.darkMode ? '#0d0d12' : '#fff', borderColor: theme.darkMode ? 'rgba(239,68,68,0.25)' : '#fecaca' }}
          >
            {/* Red top bar */}
            <div className="h-1 w-full bg-gradient-to-r from-red-600 via-rose-500 to-red-600" />

            <div className="p-8">
              {/* Icon */}
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>

              <h2 className={cn("text-xl font-black text-center mb-2", theme.darkMode ? "text-white" : "text-gray-900")}>
                Delete All My Data?
              </h2>
              <p className={cn("text-sm text-center leading-relaxed mb-6", theme.darkMode ? "text-white/40" : "text-gray-500")}>
                This will permanently erase your account, all automations, contacts, analytics, and billing history. <strong className={theme.darkMode ? 'text-white/60' : 'text-gray-700'}>This cannot be undone.</strong>
              </p>

              {/* What gets deleted */}
              <div className={cn("rounded-2xl border p-4 mb-6 space-y-2", theme.darkMode ? "bg-white/[0.03] border-white/5" : "bg-gray-50 border-gray-100")}>
                {[
                  'All automations and workflows',
                  'Instagram account connections',
                  'Contacts and lead data',
                  'Analytics and activity logs',
                  'Subscription and billing history',
                  'Your profile and account',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    <span className={cn("text-xs font-medium", theme.darkMode ? "text-white/40" : "text-gray-500")}>{item}</span>
                  </div>
                ))}
              </div>

              {/* Typed confirmation */}
              <div className="mb-6">
                <label className={cn("block text-xs font-black uppercase tracking-widest mb-2", theme.darkMode ? "text-white/40" : "text-gray-500")}>
                  Type <span className={theme.darkMode ? 'text-red-400' : 'text-red-600'}>DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  disabled={deleteLoading}
                  className={cn(
                    "w-full rounded-xl px-4 py-3 font-black text-sm outline-none border-2 transition-all tracking-widest",
                    theme.darkMode
                      ? "bg-white/5 text-white placeholder:text-white/20 border-white/10 focus:border-red-500/60"
                      : "bg-white text-gray-900 placeholder:text-gray-300 border-gray-200 focus:border-red-500"
                  )}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setConfirmText(''); }}
                  disabled={deleteLoading}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-sm border transition-all",
                    theme.darkMode
                      ? "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={confirmText !== 'DELETE' || deleteLoading}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2",
                    confirmText === 'DELETE' && !deleteLoading
                      ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/30"
                      : "bg-red-500/20 text-red-500/40 cursor-not-allowed"
                  )}
                >
                  {deleteLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Everything
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );

  if (isNested) return content;

  return (
    <div className={cn("flex-1 overflow-y-auto p-4 md:p-10 scroll-smooth h-full transition-colors duration-500", theme.darkMode ? "bg-black" : "bg-[#fafbff]")}>
      {content}
    </div>
  );
}
