import { useState, useEffect } from "react";
import {
  User, Save, Type, MapPin, Camera, Phone, Loader2, Briefcase, ChevronDown, Shield, Trash2, Mail
} from "lucide-react";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Reusable Glass Components ---

const GlassCard = ({ children, className, delay = 0, noPadding = false }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: delay, ease: "easeOut" }}
    className={cn(
      "relative rounded-3xl border border-white/60 bg-white/40 shadow-xl backdrop-blur-2xl transition-all hover:border-white/80 hover:shadow-2xl hover:shadow-blue-500/5 group",
      !noPadding && "p-8",
      className
    )}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-transparent pointer-events-none opacity-50 group-hover:opacity-70 transition-opacity" />
    <div className="relative z-10 h-full">{children}</div>
  </motion.div>
);

const GlassInput = ({ label, icon: Icon, placeholder, value, onChange, type = "text", subLabel, disabled = false }: any) => (
  <div className="space-y-2 group">
    <div className="flex justify-between items-baseline">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors group-focus-within:text-blue-600">
        {Icon && <Icon className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />}
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
          "w-full rounded-xl border border-slate-200/60 bg-white/50 px-4 py-3 text-slate-800 placeholder-slate-400 shadow-sm backdrop-blur-sm transition-all",
          "focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10",
          "hover:bg-white/70 hover:border-slate-300",
          disabled && "cursor-not-allowed bg-slate-100/50 text-slate-500 hover:bg-slate-100/50 hover:border-slate-200/60"
        )}
        placeholder={placeholder}
      />
    </div>
    {subLabel && <p className="text-xs text-slate-400 pl-1">{subLabel}</p>}
  </div>
);

const GlassSelect = ({ label, icon: Icon, value, onChange, options, placeholder }: any) => (
  <div className="space-y-2 group">
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors group-focus-within:text-blue-600">
      {Icon && <Icon className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />}
      {label}
    </label>
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={cn(
          "w-full appearance-none rounded-xl border border-slate-200/60 bg-white/50 px-4 py-3 text-slate-800 shadow-sm backdrop-blur-sm transition-all cursor-pointer",
          "focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10",
          "hover:bg-white/70 hover:border-slate-300",
          value === "" && "text-slate-400"
        )}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option: string) => (
          <option key={option} value={option} className="text-slate-800">
            {option}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-4 top-3.5 h-4 w-4 text-slate-400 pointer-events-none group-focus-within:text-blue-500 transition-colors" />
    </div>
  </div>
);

const GlassButton = ({ children, variant = "primary", className, icon: Icon, onClick, loading = false, type = "button", disabled = false }: any) => {
  const variants = {
    primary: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:brightness-110 border-transparent",
    secondary: "bg-white/60 text-slate-700 hover:bg-white/90 border-slate-200/50 shadow-sm hover:shadow-md",
    danger: "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700 hover:border-red-200 shadow-sm",
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
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  );
};

const PREBUILT_AVATARS = [
  "1c369b9f-5b2f-41c8-94e0-ed96a1e13bb9.jpg",
  "62424a3e-9cdc-422f-a2c8-5cce272934e2.jpg",
  "68f0932f-a411-4b7d-b82e-bff250a88f4b.jpg",
  "a39c74b4-2bfe-4404-97d5-daca5a22b51d.jpg",
  "bc110031-06a7-460a-bf9c-545e5e896824.jpg",
  "bc666226-d3cf-43ef-91dd-47c2b21d3eec.jpg",
  "bc9fd4bd-de9b-4555-976c-8360576c6708.jpg",
  "e67eb556-f125-4e24-95ad-8aff21b9926a.jpg"
];

export default function Settings() {
  const { user } = useAuth();
  const theme = useTheme();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    bio: "",
    location: "",
    phone: "",
    category: "",
    avatarUrl: ""
  });

  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, [user]);

  async function loadUserProfile() {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setFormData({
          firstName: data.first_name || "",
          lastName: data.last_name || "",
          username: data.username || "",
          bio: data.bio || "",
          location: data.location || "",
          phone: data.phone || "",
          category: data.business_category || "",
          avatarUrl: data.avatar_url || ""
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      const file = event.target.files?.[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const filePath = `${user?.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, avatarUrl: publicUrl }));
      theme.setAvatarUrl(publicUrl);
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      alert(`Error uploading avatar: ${error.message || 'Unknown error'}. Make sure you have run the storage migration.`);
    } finally {
      setUploading(false);
    }
  };

  const selectAvatar = (filename: string) => {
    const url = `/${filename}`;
    setFormData(prev => ({ ...prev, avatarUrl: url }));
    theme.setAvatarUrl(url);
    setShowAvatarPicker(false);
  };

  async function handleSaveSettings() {
    if (!user) return;

    setLoading(true);
    setSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          username: formData.username,
          bio: formData.bio,
          phone: formData.phone,
          location: formData.location,
          business_category: formData.category,
          avatar_url: formData.avatarUrl,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      theme.setDisplayName(`${formData.firstName} ${formData.lastName}`.trim() || formData.username);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please verify if you have run the database migrations.');
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

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 scroll-smooth h-full">
      <div className="mx-auto max-w-4xl pb-20 space-y-6">

        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Profile Settings</h2>
          <p className="text-slate-500 font-medium">Manage your public profile and business details.</p>
        </motion.div>

        {/* Avatar Selection Section */}
        <GlassCard
          className={cn(
            "relative",
            showAvatarPicker ? "z-[60]" : "z-10"
          )}
          delay={0.1}
        >
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div
              className="relative group cursor-pointer shrink-0"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            >
              <div className="h-40 w-40 rounded-full bg-white/50 p-1 shadow-2xl transition-transform hover:scale-105 border border-white/60 backdrop-blur-sm">
                <div className="h-full w-full rounded-full bg-white overflow-hidden relative border border-slate-200/50">
                  {uploading ? (
                    <div className="h-full w-full flex items-center justify-center bg-slate-50">
                      <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                    </div>
                  ) : (
                    <img
                      src={formData.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`}
                      alt="Avatar"
                      className="h-full w-full object-contain p-1"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                    <Camera className="h-10 w-10 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 text-center sm:text-left flex-1">
              <h2 className="text-2xl font-bold text-slate-800">Profile Picture</h2>
              <p className="text-sm text-slate-500 max-w-md font-medium leading-relaxed">
                Choose a pre-built character or upload your own image to represent yourself or your business.
              </p>

              <div className="flex flex-wrap gap-3 pt-2 justify-center sm:justify-start">
                <GlassButton
                  variant="secondary"
                  className="px-6"
                  onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                >
                  Selection Grid
                </GlassButton>

                <label className="relative">
                  <span className="flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 font-semibold transition-all border border-slate-200/50 text-sm cursor-pointer bg-white/60 text-slate-700 hover:bg-white/90 shadow-sm hover:shadow-md">
                    <Save className="h-4 w-4" />
                    Upload Image
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Avatar Selection Grid */}
          {showAvatarPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="absolute top-full left-0 right-0 mt-4 z-50 p-6 rounded-3xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur-2xl grid grid-cols-4 gap-6 justify-items-center"
            >
              <div className="col-span-4 flex justify-between items-center mb-2 w-full px-2">
                <h3 className="font-bold text-slate-800">Choose your look</h3>
                <button onClick={() => setShowAvatarPicker(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <ChevronDown className="h-5 w-5 rotate-180" />
                </button>
              </div>
              {PREBUILT_AVATARS.map((seed) => (
                <button
                  key={seed}
                  onClick={() => selectAvatar(seed)}
                  className="group relative h-28 w-28 rounded-2xl bg-slate-50 border-2 border-transparent hover:border-blue-500 hover:bg-blue-50 transition-all p-2 overflow-hidden shadow-sm"
                >
                  <img
                    src={`/${seed}`}
                    alt={seed}
                    className="h-full w-full object-contain transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </motion.div>
          )}
        </GlassCard>

        {/* Inputs Grid */}
        <GlassCard delay={0.2} className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          <div className="col-span-2 pb-2 border-b border-slate-200/50 mb-2">
            <h3 className="text-lg font-bold text-slate-800">Personal & Business Details</h3>
          </div>

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

          <div className="col-span-2">
            <div className="space-y-2 group">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Type className="h-4 w-4 text-slate-400" /> Bio
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-200/60 bg-white/50 px-4 py-3 text-slate-800 placeholder-slate-400 shadow-sm backdrop-blur-sm transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 min-h-[120px] font-medium"
                placeholder="Tell us a little about yourself or your business..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                maxLength={500}
              />
              <p className="text-xs text-slate-400 text-right font-medium">{formData.bio.length}/500 characters</p>
            </div>
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
        </GlassCard>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex justify-end gap-4 pt-4 sticky bottom-6 z-20"
        >
          <div className="flex items-center gap-4">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50/80 backdrop-blur-md px-4 py-2 rounded-xl border border-emerald-100 animate-in fade-in slide-in-from-right-4 duration-300">
                <Save className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Saved!</span>
              </div>
            )}
            <GlassButton
              variant="primary"
              icon={Save}
              className="shadow-xl shadow-blue-500/20 px-8"
              onClick={handleSaveSettings}
              loading={loading}
            >
              Save Profile
            </GlassButton>
          </div>
        </motion.div>

        {/* Danger Zone */}
        <GlassCard className="border-rose-200/50 bg-rose-50/20" delay={0.5}>
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
            <GlassButton
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-white hover:bg-rose-600 hover:text-white transition-colors"
              icon={Trash2}
            >
              Delete Account
            </GlassButton>
          ) : (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="bg-white/80 border border-rose-200 rounded-2xl p-6">
                <p className="text-sm font-bold text-rose-900 mb-2">
                  Are you absolutely sure?
                </p>
                <p className="text-xs text-rose-700/80 leading-relaxed font-medium">
                  This action **cannot be undone**. All your automations, triggers, contacts, and historical analytics will be permanently wiped.
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <GlassButton
                  variant="danger"
                  className="bg-rose-600 text-white hover:bg-rose-700"
                  onClick={handleDeleteAccount}
                  loading={deleteLoading}
                >
                  Yes, Delete Everything
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </GlassButton>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
