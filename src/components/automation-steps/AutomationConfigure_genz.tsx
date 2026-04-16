import { useState, useEffect } from 'react';

import { MessageSquare, Mail, Image as ImageIcon, X, Pencil, Tag, Search, Send, CheckCircle2, Plus, AlertCircle, ChevronDown, ChevronUp, Info, FileSpreadsheet, Lock, Globe, Smartphone, RotateCcw, User, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '../ui/skeleton';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  AutomationFormData, TriggerConfig,
  PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig,
  Action, ReplyToCommentAction, SendDmAction, SaveLeadAction, FollowUpAction, LeadMessages, DEFAULT_LEAD_MESSAGES
} from '../../types/automation';
import { CAPABILITIES } from '../../constants/capabilities';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
import { useTheme } from '../../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { MediaUpload } from '../ui/MediaUpload';


const DEFAULT_TEASER_MESSAGE = "Hey! Glad you’re here... Tap below and I’ll send you a message shortly 👀";
const DEFAULT_NOT_FOLLOWING_MESSAGE = "Oops! Looks like you haven't followed me yet 👀...";
const DEFAULT_TEASER_BTN_TEXT = "Send Access";
const DEFAULT_VERIFY_BTN_TEXT = "I've Followed! ✅";

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
}

interface AutomationConfigureGenzProps {
  formData: AutomationFormData;
  setFormData: (data: AutomationFormData) => void;
  onSave: () => void;
  saving: boolean;
  readOnly?: boolean;
  onBack?: () => void;
}

const COOLDOWN_OPTIONS = [
  { value: 60000, label: '1 min' },
  { value: 300000, label: '5 min' },
  { value: 900000, label: '15 min' },
  { value: 1800000, label: '30 min' },
  { value: 3600000, label: '1 hr' },
  { value: 18000000, label: '5 hr' },
  { value: 36000000, label: '10 hr' },
  { value: 86400000, label: '1 day' },
  { value: 604800000, label: '7 days' },
];

// Gradient separator
const GradientLine = () => {
  const { darkMode } = useTheme();
  return (
    <div className={cn(
      "w-full h-[3px] rounded-full my-6",
      darkMode ? "bg-white/10" : "bg-gradient-to-r from-purple-500 via-blue-400 to-orange-400"
    )} />
  );
};

export default function AutomationConfigureGenz({ formData, setFormData, onSave, saving, readOnly, onBack }: AutomationConfigureGenzProps) {
  const { isPremium, canUseAskToFollow } = useSubscription();
  const { openModal } = useUpgradeModal();
  const { darkMode } = useTheme();

  const [editingPosts, setEditingPosts] = useState(true);
  const [editingKeywords, setEditingKeywords] = useState(true);
  const [showLeadMessages, setShowLeadMessages] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [pendingMediaId, setPendingMediaId] = useState<string | null>(null);

  const triggerType = formData.triggerType!;
  const triggerConfig = formData.triggerConfig;
  const actions = formData.actions;

  useEffect(() => {
    const isPost = triggerType === 'post_comment';
    const current = isPost
      ? (triggerConfig as PostCommentTriggerConfig)?.specificPosts || []
      : (triggerConfig as StoryReplyTriggerConfig)?.specificStories || [];
    if (current.length > 0) {
      setPendingMediaId(current[0]);
      setEditingPosts(false);
    }
  }, [triggerType, JSON.stringify((triggerConfig as PostCommentTriggerConfig)?.specificPosts), JSON.stringify((triggerConfig as StoryReplyTriggerConfig)?.specificStories)]);



  // --- Trigger helpers ---
  const getTriggerLabel = () => {
    switch (triggerType) {
      case 'post_comment': return 'User comments on your post or reel';
      case 'story_reply': return 'User replies to your story';
      case 'user_directed_messages': return 'User sends you a DM';
    }
  };

  const getTriggerIcon = () => {
    switch (triggerType) {
      case 'post_comment': return MessageSquare;
      case 'story_reply': return ImageIcon;
      case 'user_directed_messages': return Mail;
    }
  };

  // --- Config helpers ---
  const getPostsType = () => {
    if (triggerType === 'post_comment') return (triggerConfig as PostCommentTriggerConfig)?.postsType || 'specific';
    if (triggerType === 'story_reply') return (triggerConfig as StoryReplyTriggerConfig)?.storiesType || 'specific';
    return 'all';
  };

  const getPostsLabel = () => {
    const t = getPostsType();
    if (triggerType === 'post_comment') return t === 'all' ? 'All Posts and Reels' : 'Select your post or reel';
    if (triggerType === 'story_reply') return t === 'all' ? 'All Stories' : 'Select your story';
    return '';
  };

  const getKeywords = (): string[] => {
    if (triggerType === 'post_comment') return (triggerConfig as PostCommentTriggerConfig)?.keywords || [];
    if (triggerType === 'user_directed_messages') return (triggerConfig as UserDirectMessageTriggerConfig)?.keywords || [];
    if (triggerType === 'story_reply') return (triggerConfig as StoryReplyTriggerConfig)?.keywords || [];
    return [];
  };

  const getKeywordType = () => {
    if (triggerType === 'post_comment') return (triggerConfig as PostCommentTriggerConfig)?.commentsType || 'all';
    if (triggerType === 'story_reply') return (triggerConfig as StoryReplyTriggerConfig)?.replyType || 'all';
    if (triggerType === 'user_directed_messages') return (triggerConfig as UserDirectMessageTriggerConfig)?.messageType || 'all';
    return 'all';
  };

  // --- Setters ---
  const updateConfig = (updates: Partial<TriggerConfig>) => {
    if (readOnly) return;
    setFormData({ ...formData, triggerConfig: { ...triggerConfig!, ...updates } as TriggerConfig });
  };

  const setPostsType = (type: 'all' | 'specific') => {
    if (triggerType === 'post_comment') updateConfig({ postsType: type } as any);
    else if (triggerType === 'story_reply') updateConfig({ storiesType: type } as any);
  };

  const setKeywordType = (type: 'all' | 'keywords') => {
    if (triggerType === 'post_comment') updateConfig({ commentsType: type } as any);
    else if (triggerType === 'story_reply') updateConfig({ replyType: type } as any);
    else if (triggerType === 'user_directed_messages') updateConfig({ messageType: type } as any);
  };

  const addKeyword = () => {
    if (!keyword.trim() || readOnly) return;
    if (!isPremium && getKeywords().length >= 2) {
      toast.error("Upgrade to Premium for unlimited keywords.");
      return;
    }
    const kws = getKeywords();
    updateConfig({ keywords: [...kws, keyword.trim()] } as any);
    setKeyword('');
  };

  const removeKeyword = (index: number) => {
    if (readOnly) return;
    updateConfig({ keywords: getKeywords().filter((_, i) => i !== index) } as any);
  };

  // --- Media ---
  const fetchMedia = async (type: 'posts' | 'stories') => {
    try {
      setLoadingMedia(true);
      const session = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('fetch-instagram-media', {
        headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
        body: { type },
      });
      if (error) throw error;
      setPosts(data.media || []);
    } catch {
      toast.error(`Failed to fetch Instagram ${type}`);
    } finally {
      setLoadingMedia(false);
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    if (readOnly) return;
    setPendingMediaId(prev => prev === mediaId ? null : mediaId);
  };

  const confirmMediaSelection = () => {
    if (!pendingMediaId) return;

    // Find the selected media to get its thumbnail/media URL
    const selectedMedia = posts.find(p => p.id === pendingMediaId);
    const thumbUrl = selectedMedia?.media_type === 'VIDEO' ? selectedMedia.thumbnail_url : selectedMedia?.media_url;

    const isPost = triggerType === 'post_comment';
    const key = isPost ? 'specificPosts' : 'specificStories';
    const postsTypeKey = isPost ? 'postsType' : 'storiesType';
    updateConfig({
      [key]: [pendingMediaId],
      [postsTypeKey]: 'specific',
      thumbnail_url: thumbUrl
    } as any);
    setEditingPosts(false);
  };

  // --- Automated media fetching ---
  useEffect(() => {
    if (triggerType === 'post_comment' || triggerType === 'story_reply') {
      fetchMedia(triggerType === 'post_comment' ? 'posts' : 'stories');
    }
  }, [triggerType]); // Dependencies: trigger type

  // --- Actions ---
  const replyAction = actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;
  const dmAction = actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
  const leadAction = actions.find(a => a.type === 'save_lead') as SaveLeadAction | undefined;
  const followUpAction = actions.find(a => a.type === 'follow_up') as FollowUpAction | undefined;

  const caps = CAPABILITIES[triggerType];
  const hasReply = !!replyAction;
  const hasDm = !!dmAction;
  const hasFollowGate = dmAction?.askToFollow || false;
  const hasLeadManager = !!leadAction;
  const hasFollowUp = !!followUpAction && followUpAction.enabled;


  const updateActions = (newActions: Action[]) => {
    if (readOnly) return;
    setFormData({ ...formData, actions: newActions });
  };

  const toggleReply = () => {
    if (readOnly) return;
    if (hasReply) updateActions(actions.filter(a => a.type !== 'reply_to_comment'));
    else {
      if (triggerType === 'user_directed_messages' || triggerType === 'story_reply') {
        // Technically not allowed per new list, but keeping for now or blocking
      }
      updateActions([...actions, {
        type: 'reply_to_comment',
        replyTemplates: [
          'Check your DMs for the link! 👆',
          'Done! Please check your direct messages ✨',
          'Sent! You\'ll find the link in your DMs 📩',
          'Just sent you a DM with all the details! 🚀'
        ],
        actionButtons: []
      } as ReplyToCommentAction]);
    }
  };

  const toggleDm = () => {
    if (readOnly) return;
    if (hasDm) {
      updateActions(actions.filter(a => a.type !== 'send_dm'));
    } else {
      // Validation: Lead Manager cannot work with Conversation Flow
      // Note: toggleDm defaults to 'simple', which is allowed. 
      // But if we ever change default, we'd check here.

      updateActions([...actions, {
        type: 'send_dm',
        dmType: 'simple',
        title: 'Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨',
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech',
        messageTemplate: '',
        actionButtons: [],
        askToFollow: false,
        showImage: false
      } as SendDmAction]);
    }
  };

  const toggleLeadManager = () => {
    if (readOnly) return;

    if (!hasLeadManager) {
      if (triggerType === 'post_comment') {
        if (hasFollowGate) {
          toast.error("Ask to Follow + Lead Manager cannot be toggled on together");
          return;
        }
        if (hasDm && dmAction?.dmType === 'conversation_flow') {
          toast.error("Lead Manager + Conversation Flow cannot be toggled on together");
          return;
        }
      }
      // For DM and Story Reply, LM is generally allowed with things
    }

    if (hasLeadManager) {
      // Auto-disable follow-up if lead manager is turned off
      updateActions(actions.filter(a => a.type !== 'save_lead' && a.type !== 'follow_up'));
    } else {
      updateActions([...actions, {
        type: 'save_lead',
        enabled: true,
        tags: ['Offer Leads'],
        spreadsheetUrl: '',
        collectFields: ['name', 'email'],
        messages: { ...DEFAULT_LEAD_MESSAGES }
      } as SaveLeadAction]);
    }
  };

  const toggleFollowUp = () => {
    if (readOnly) return;
    
    if (!hasLeadManager) {
      toast.error("Follow Up messages can only be enabled when Lead Manager is ON");
      return;
    }

    if (hasFollowUp) {
      updateActions(actions.filter(a => a.type !== 'follow_up'));
    } else {
      updateActions([...actions, {
        type: 'follow_up',
        enabled: true,
        delayValue: 30,
        delayUnit: 'minutes',
        message: 'Hey! Just checking in to see if you had any other questions? 😊'
      } as FollowUpAction]);
    }
  };

  const addDmFlow = toggleDm; // Keep for backward compatibility until UI is refactored

  useEffect(() => {
    if (triggerType !== 'post_comment' && hasFollowGate) {
      updateActions(actions.map(a => a.type === 'send_dm' ? { ...a, askToFollow: false } : a));
    }
  }, [triggerType, hasFollowGate]);

  const toggleFollowGate = () => {
    if (readOnly) return;
    if (!canUseAskToFollow) { openModal(); return; }

    if (triggerType === 'user_directed_messages' || triggerType === 'story_reply') {
      toast.error("Ask to Follow is only available for Post Comment triggers");
      return;
    }

    // Validation: Ask to Follow cannot work with Lead Manager
    if (!hasFollowGate && hasLeadManager) {
      toast.error("Ask to Follow + Lead Manager cannot be toggled on together");
      return;
    }

    if (!hasDm) {
      updateActions([...actions, {
        type: 'send_dm',
        title: 'Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨',
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech',
        messageTemplate: '',
        actionButtons: [],
        askToFollow: true,
        teaserMessage: DEFAULT_TEASER_MESSAGE,
        askToFollowMessage: DEFAULT_NOT_FOLLOWING_MESSAGE,
        teaserBtnText: DEFAULT_TEASER_BTN_TEXT,
        askToFollowBtnText: DEFAULT_VERIFY_BTN_TEXT,
        showImage: false
      } as SendDmAction]);
      return;
    }
    const newActions = [...actions];
    const idx = newActions.findIndex(a => a.type === 'send_dm');
    if (idx >= 0) {
      newActions[idx] = { ...newActions[idx], askToFollow: !hasFollowGate, teaserMessage: !hasFollowGate ? DEFAULT_TEASER_MESSAGE : '', askToFollowMessage: !hasFollowGate ? DEFAULT_NOT_FOLLOWING_MESSAGE : '', teaserBtnText: !hasFollowGate ? DEFAULT_TEASER_BTN_TEXT : '', askToFollowBtnText: !hasFollowGate ? DEFAULT_VERIFY_BTN_TEXT : '' } as SendDmAction;
      updateActions(newActions);
    }
  };

  const updateDmAction = (updates: Partial<SendDmAction>) => {
    if (readOnly) return;

    // Validation: Switching to Conversation Flow while Lead Manager is on (Post Comment only)
    if (updates.dmType === 'conversation_flow' && triggerType === 'post_comment' && hasLeadManager) {
      toast.error("Lead Manager + Conversation Flow cannot be toggled on together");
      return;
    }

    const newActions = [...actions];
    const idx = newActions.findIndex(a => a.type === 'send_dm');
    if (idx >= 0) { newActions[idx] = { ...newActions[idx], ...updates } as SendDmAction; updateActions(newActions); }
  };

  const updateReplyAction = (updates: Partial<ReplyToCommentAction>) => {
    if (readOnly) return;
    const newActions = [...actions];
    const idx = newActions.findIndex(a => a.type === 'reply_to_comment');
    if (idx >= 0) { newActions[idx] = { ...newActions[idx], ...updates } as ReplyToCommentAction; updateActions(newActions); }
  };

  // Cooldown
  const dmTriggerConfig = triggerConfig as UserDirectMessageTriggerConfig;

  const handleCooldownToggle = () => {
    if (readOnly || triggerType !== 'user_directed_messages') return;
    updateConfig({
      cooldownEnabled: !dmTriggerConfig?.cooldownEnabled,
      cooldownDuration: dmTriggerConfig?.cooldownEnabled ? undefined : (dmTriggerConfig?.cooldownDuration || 3600000)
    } as any);
  };

  const isReplyValid = replyAction ? replyAction.replyTemplates.some(t => t.trim().length > 0) : true;
  const isDmValid = dmAction
    ? (dmAction.dmType === 'conversation_flow'
      ? (dmAction.title || '').trim().length > 0 &&
      (dmAction.actionButtons || []).every(btn => btn.text.trim().length > 0) &&
      (dmAction.conversationCards || []).every(card =>
        (card.title || '').trim().length > 0 &&
        (card.actionButtons || []).every(btn =>
          btn.text.trim().length > 0 &&
          (btn.buttonType === 'postback' || (btn.url && /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url)))
        )
      )
      : dmAction.dmType === 'carousel'
        ? (dmAction.carouselCards || []).length > 0 && (dmAction.carouselCards || []).every(card =>
          card.title.trim().length > 0 &&
          (card.buttons || []).every(btn => btn.text.trim().length > 0 && /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url || ''))
        )
        : (dmAction.title || '').trim().length > 0 && (dmAction.actionButtons || []).every(btn => 
            btn.text.trim().length > 0 && 
            (btn.buttonType === 'postback' || (btn.url && /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url)))
          )
    )
    : true;
  const isFollowUpValid = !hasFollowUp || (!!followUpAction && !!followUpAction.message && (followUpAction.delayValue || 0) > 0);
  const isLeadValid = true;
  const canSave = (hasReply || hasDm || hasLeadManager) && isReplyValid && isDmValid && isFollowUpValid && isLeadValid;
  const TriggerIcon = getTriggerIcon();

  return (
    <div className="max-w-4xl mx-auto pb-32 transition-colors duration-500">

      {/* ===== TRIGGER HEADER ===== */}
      <div className="flex items-center gap-3 mb-2">
        <div className={cn(
          "w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all",
          darkMode ? "bg-white text-black" : "bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-purple-200"
        )}>
          <TriggerIcon className="w-5 h-5" />
        </div>
        <span className={cn("text-base font-bold flex-1 transition-colors", darkMode ? "text-white" : "text-gray-700")}>{getTriggerLabel()}</span>
        {!readOnly && onBack && (
          <button onClick={onBack} className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-colors", darkMode ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200")}>
            <X className={cn("w-4 h-4", darkMode ? "text-white/40" : "text-gray-400")} />
          </button>
        )}
      </div>

      <GradientLine />

      {/* ===== SECTION: Which Post/Reel (post_comment / story_reply only) ===== */}
      {(triggerType === 'post_comment' || triggerType === 'story_reply') && (
        <div id="genz-post-selection">
          <div className="flex items-center justify-between mb-3">
            <h3 className={cn("text-base font-bold transition-colors", darkMode ? "text-white" : "text-gray-900")}>
              {triggerType === 'post_comment' ? 'Which Post or Reel do you wanna use?' : 'Which Story do you want to use?'}
            </h3>
            {!readOnly && (
              <button
                onClick={() => { setEditingPosts(!editingPosts); if (!editingPosts && getPostsType() === 'specific') fetchMedia(triggerType === 'post_comment' ? 'posts' : 'stories'); }}
                className={cn("font-bold text-sm flex items-center gap-1 transition-colors", darkMode ? "text-blue-400 hover:text-blue-300" : "text-purple-600 hover:text-purple-700")}
              >
                Edit <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {editingPosts ? (
            <div className="space-y-3 mb-2">
              <div className="flex flex-col sm:flex-row gap-3 hidden">
                {/* 
                <button onClick={() => setPostsType('all')}>All Posts & Reels</button>
                <button onClick={() => setPostsType('specific')}>Select your post or reel</button> 
                */}
              </div>
              <div className={cn("rounded-xl p-3 md:p-4 transition-colors", darkMode ? "bg-white/5 border border-white/5" : "border-2 border-gray-100 bg-gray-50/50")}>
                {pendingMediaId && !loadingMedia && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn("mb-4 pb-4 border-b flex flex-col md:flex-row items-center justify-between gap-3", darkMode ? 'border-white/10' : 'border-purple-100')}>
                    <p className={cn("text-[11px] md:text-sm font-bold", darkMode ? 'text-blue-300' : 'text-purple-700')}>1 Post selected</p>
                    <button onClick={confirmMediaSelection} disabled={readOnly} className={cn("w-full md:w-auto px-6 py-2.5 rounded-xl font-bold text-[13px] md:text-sm text-white shadow-lg transition-all flex justify-center items-center gap-2", darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-purple-600 hover:bg-purple-700 text-white")}>
                      Confirm Selection <CheckCircle2 size={16} />
                    </button>
                  </motion.div>
                )}
                <div className="max-h-[320px] overflow-y-auto custom-scrollbar pr-1 -mr-1">
                  {loadingMedia ? (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className={cn("aspect-square w-full rounded-xl", darkMode ? "animate-shimmer-dark border border-white/5" : "animate-shimmer border border-gray-100 bg-slate-100")} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {posts.map(post => {
                        const isSelected = post.id === pendingMediaId;
                        return (
                          <div key={post.id} onClick={() => toggleMediaSelection(post.id)} className={cn(
                            "relative aspect-square min-w-0 min-h-0 w-full cursor-pointer rounded-xl overflow-hidden border-2 transition-all",
                            isSelected
                              ? (darkMode ? "border-white ring-2 ring-white/20 scale-[0.98]" : "border-purple-600 ring-2 ring-purple-600/50 shadow-[0_0_15px_rgba(147,51,234,0.3)] scale-[0.98]")
                              : (darkMode ? "border-transparent hover:border-white/20" : "border-transparent hover:border-purple-200")
                          )}>
                            {post.media_type === 'VIDEO' ? <video src={post.media_url} poster={post.thumbnail_url} autoPlay loop muted playsInline className={`w-full h-full object-cover transition-transform ${isSelected ? 'scale-110' : ''}`} /> : <img src={post.media_url} alt="" className={`w-full h-full object-cover transition-transform ${isSelected ? 'scale-110' : ''}`} />}
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-600/20 backdrop-blur-[1px] flex items-center justify-center transition-all">
                                <div className={cn("text-white p-1.5 rounded-full shadow-lg scale-110", darkMode ? "bg-white/20" : "bg-purple-600")}>
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className={cn("p-3 md:p-4 rounded-2xl flex items-center justify-between gap-4 border-2 transition-all mb-2", darkMode ? "bg-white/5 border border-white/5" : "border-gray-100 bg-gray-50/50")}>
              <div className="flex items-center gap-3">
                {(() => {
                  const p = posts.find(p => p.id === pendingMediaId);
                  if (!p && loadingMedia) return <div className={cn("w-12 h-12 rounded-lg animate-pulse", darkMode ? "bg-white/10" : "bg-gray-200")} />;
                  if (!p) return <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center", darkMode ? "bg-white/5" : "bg-gray-100")}><ImageIcon className="w-5 h-5 opacity-50" /></div>;
                  return (
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
                      {p.media_type === 'VIDEO' ? (
                        <video src={p.media_url} poster={p.thumbnail_url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={p.media_url} className="w-full h-full object-cover" />
                      )}
                    </div>
                  );
                })()}
                <div>
                  <span className={cn("text-[11px] md:text-xs font-bold uppercase tracking-widest flex items-center gap-1 mb-0.5", darkMode ? "text-blue-400" : "text-emerald-500")}><CheckCircle2 size={12} strokeWidth={3} /> Confirmed</span>
                  <p className={cn("text-[13px] md:text-sm font-medium line-clamp-1", darkMode ? "text-white/60" : "text-gray-500")}>Tied to a specific post</p>
                </div>
              </div>
              <button onClick={() => setEditingPosts(true)} disabled={readOnly} className={cn("px-3 py-1.5 md:px-4 md:py-2 shrink-0 rounded-lg text-[11px] md:text-xs font-bold transition-all", darkMode ? "bg-white/10 text-white hover:bg-white/20" : "bg-white border text-gray-700 hover:bg-gray-50")}>
                Change Post
              </button>
            </div>
          )}

          <GradientLine />
        </div>
      )}

      {/* ===== SECTION: Keywords ===== */}
      <div id="genz-keyword-selection">
        <div className="flex items-center justify-between mb-3">
          <h3 className={cn("text-base font-bold transition-colors", darkMode ? "text-white" : "text-gray-900")}>What keywords will start your automation?</h3>
          {!readOnly && (
            <button
              onClick={() => setEditingKeywords(!editingKeywords)}
              className={cn("font-bold text-sm flex items-center gap-1 transition-colors", darkMode ? "text-blue-400 hover:text-blue-300" : "text-purple-600 hover:text-purple-700")}
            >
              Edit <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {editingKeywords ? (
          <div className="space-y-4 mb-2">
            <div className="flex gap-3">
              <button
                onClick={() => setKeywordType('all')}
                className={cn(
                  "flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all",
                  getKeywordType() === 'all'
                    ? (darkMode ? "border-purple-400 bg-white/10 text-white/80" : "border-purple-500 bg-purple-50 text-purple-700")
                    : (darkMode ? "border-white/5 bg-white/5 text-white/40 hover:border-white/20" : "border-gray-200 text-gray-500 hover:border-purple-200")
                )}
              >
                Any message works
              </button>
              <button
                onClick={() => setKeywordType('keywords')}
                className={cn(
                  "flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all",
                  getKeywordType() === 'keywords'
                    ? (darkMode ? "border-purple-400 bg-white/10 text-white/80" : "border-purple-500 bg-purple-50 text-purple-700")
                    : (darkMode ? "border-white/5 bg-white/5 text-white/40 hover:border-white/20" : "border-gray-200 text-gray-500 hover:border-purple-200")
                )}
              >
                Only specific keywords
              </button>
            </div>
            {getKeywordType() === 'keywords' && (
              <div className={cn("space-y-3 p-4 rounded-xl transition-colors", darkMode ? "bg-white/5 border border-white/5" : "border-2 border-gray-100 bg-gray-50/50")}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4", darkMode ? "text-white/20" : "text-gray-400")} />
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                      placeholder="Type a keyword (e.g. LINK) and press Enter ↵"
                      className={cn(
                        "w-full pl-10 pr-3 py-2.5 rounded-xl border-2 transition-all outline-none font-bold text-base",
                        darkMode
                          ? "bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/40"
                          : "border-gray-200 bg-white focus:border-purple-500 text-gray-800"
                      )}
                    />
                  </div>
                  <button
                    onClick={addKeyword}
                    className={cn(
                      "px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all",
                      darkMode ? "bg-white text-black" : "bg-purple-600 text-white"
                    )}
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {getKeywords().map((kw, i) => (
                    <span key={i} className={cn(
                      "flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-bold transition-colors",
                      darkMode
                        ? "bg-white/10 border border-white/10 text-white"
                        : "bg-purple-100 border border-purple-200 text-purple-700"
                    )}>
                      {kw}
                      {!readOnly && <button onClick={() => removeKeyword(i)} className={cn("p-0.5 rounded-full", darkMode ? "text-white/40 hover:text-white" : "text-purple-400 hover:text-red-500")}><X size={12} strokeWidth={3} /></button>}
                    </span>
                  ))}
                  {getKeywords().length === 0 && <span className={cn("text-xs italic transition-colors", darkMode ? "text-white/20" : "text-gray-400")}>No keywords added yet</span>}
                </div>
              </div>
            )}
            {/* Cooldown (DM triggers only) */}
            {triggerType === 'user_directed_messages' && (
              <div className={cn("p-4 rounded-xl space-y-3 transition-colors", darkMode ? "bg-white/5 border border-white/5" : "border-2 border-gray-100 bg-gray-50/50")}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className={cn("font-bold text-sm transition-colors", darkMode ? "text-white" : "text-gray-900")}>Cooldown Period</h4>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className={cn("w-4 h-4 cursor-help transition-colors", darkMode ? "text-white/40 hover:text-white/60" : "text-slate-400 hover:text-slate-600")} />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px] text-center">
                          To avoid repeated DMs and reduce spam, this feature enables you to re-send this msg again after the mentioned time.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className={cn("text-xs transition-colors", darkMode ? "text-white/20" : "text-gray-400")}>Wait before replying to the same user again</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-not-allowed pointer-events-none">
                    <input type="checkbox" className="sr-only peer" checked={true} readOnly />
                    <div className={cn(
                      "w-10 h-6 rounded-full transition-all peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all shadow-inner",
                      darkMode ? "bg-white/10 peer-checked:bg-white" : "bg-gray-200 peer-checked:bg-purple-600",
                      darkMode ? "after:bg-black" : ""
                    )}></div>
                  </label>
                </div>

                <div className="relative mt-2">
                  <select
                    value={dmTriggerConfig?.cooldownDuration || 3600000}
                    onChange={(e) => updateConfig({ cooldownDuration: Number(e.target.value) } as any)}
                    className={cn(
                      "w-full rounded-xl px-4 py-2.5 outline-none font-bold text-sm appearance-none transition-colors",
                      darkMode
                        ? "bg-white/5 border-2 border-white/5 text-white focus:border-white/20"
                        : "border-2 border-gray-200 focus:border-purple-500 bg-white text-gray-900"
                    )}
                  >
                    {COOLDOWN_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className={darkMode ? "bg-black text-white" : ""}>{opt.label}</option>)}
                  </select>
                  <ChevronDown className={cn("absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-colors", darkMode ? "text-white/20" : "text-gray-400")} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all mb-2",
              darkMode
                ? "bg-black border border-white/10 hover:bg-white/5"
                : "border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50/20"
            )}
            onClick={() => setEditingKeywords(true)}
          >
            <Tag className={cn("w-7 h-7 transition-colors", darkMode ? "text-white" : "text-gray-300")} />
            <span className={cn("text-sm font-bold transition-colors", darkMode ? "text-white" : "text-gray-400")}>Setup Keywords</span>
          </div>
        )}
      </div>

      <GradientLine />

      {/* ===== SECTION: ACTION LAYERS (3 CARDS) ===== */}
      <h3 className={cn("text-base font-bold mb-4 transition-colors", darkMode ? "text-white" : "text-gray-900")}>
        What should happen automatically?
      </h3>

      <div className="space-y-4">
        {/* CARD 1: Public Reply */}
        {caps?.publicReply && (
          <div className={cn(
            "rounded-2xl border-2 transition-all overflow-hidden",
            hasReply
              ? (darkMode ? "border-purple-500/30 bg-purple-500/5" : "border-purple-200 bg-purple-50/30")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-100 bg-white")
          )}>
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={toggleReply}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                darkMode ? "bg-white/10 border-white/10" : "bg-gray-50 border-gray-100"
              )}>
                <MessageSquare className={cn("w-5 h-5", darkMode ? "text-white/60" : "text-gray-500")} />
              </div>
              <div className="flex-1 text-left">
                <h3 className={cn("font-bold text-[14px] mb-0.5", darkMode ? "text-white" : "text-gray-900")}>Reply to the comment</h3>
                <p className={cn("text-[11px] font-medium leading-relaxed", darkMode ? "text-white/40" : "text-gray-400")}>QuickRevert will post a comment reply automatically</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasReply} readOnly />
                <div className={cn(
                  "w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner",
                  darkMode && "bg-white/10"
                )}></div>
              </label>
            </div>

            <AnimatePresence>
              {hasReply && replyAction && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-0">
                  <div className={cn("p-4 rounded-xl border space-y-3", darkMode ? "bg-black/20 border-white/5" : "bg-white border-purple-100")}>
                    <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>Comment Reply Templates</label>
                    {replyAction.replyTemplates.map((template, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={template}
                          onChange={(e) => {
                            const newT = [...replyAction.replyTemplates];
                            newT[i] = e.target.value;
                            updateReplyAction({ replyTemplates: newT });
                          }}
                          disabled={readOnly}
                          className={cn(
                            "w-full border-2 rounded-xl px-4 py-2 outline-none font-bold text-sm transition-all",
                            darkMode ? "border-white/10 bg-transparent text-white focus:border-purple-500/50" : "border-gray-100 focus:border-purple-500 text-gray-900"
                          )}
                          placeholder="e.g. Check your DMs for the link!"
                        />
                        {replyAction.replyTemplates.length > 1 && !readOnly && (
                          <button onClick={() => updateReplyAction({ replyTemplates: replyAction.replyTemplates.filter((_, idx) => idx !== i) })} className={cn("p-2 transition-all", darkMode ? "text-white/20 hover:text-red-400" : "text-gray-300 hover:text-red-500")}>
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    {!readOnly && replyAction.replyTemplates.length < 5 && (
                      <button onClick={() => updateReplyAction({ replyTemplates: [...replyAction.replyTemplates, ''] })} className={cn("font-bold text-[12px] flex items-center gap-1 transition-colors", darkMode ? "text-blue-400" : "text-purple-600")}>
                        <Plus size={14} /> Add variation
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* CARD 2: Ask to Follow (Follow Gate) */}
        {caps?.askToFollow && (
          <div className={cn(
            "rounded-2xl border-2 transition-all overflow-hidden",
            hasFollowGate
              ? (darkMode ? "border-purple-500/30 bg-purple-500/10" : "border-purple-200 bg-purple-50/50")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-100 bg-white")
          )}>
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={toggleFollowGate}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                darkMode ? "bg-white/10 border-white/10" : "bg-white border-gray-100 shadow-sm"
              )}>
                <Lock className={cn("w-5 h-5", darkMode ? "text-white/60" : "text-gray-500")} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={cn("font-bold text-[14px] md:text-[15px]", darkMode ? "text-white" : "text-gray-900")}>Ask to Follow First</h3>
                  {!canUseAskToFollow && (
                    <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">PREMIUM</span>
                  )}
                  <span className="bg-emerald-500 text-white text-[9px] font-black px-1 py-0.5 rounded uppercase tracking-tight">Recommended</span>
                </div>
                <p className={cn("text-[11px] md:text-xs font-medium leading-tight", darkMode ? "text-white/40" : "text-gray-500")}>Only send the DM after they follow your account</p>
              </div>
              <label className={cn("relative inline-flex items-center transition-opacity", (readOnly || (!hasFollowGate && hasLeadManager)) ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={hasFollowGate} 
                  onChange={toggleFollowGate}
                  disabled={readOnly || (!hasFollowGate && hasLeadManager)} 
                />
                <div className={cn(
                  "w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner",
                  darkMode && "bg-white/10"
                )}></div>
              </label>
            </div>

            <AnimatePresence>
              {hasFollowGate && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-0">
                  <div className={cn("p-4 rounded-xl border space-y-4", darkMode ? "bg-black/20 border-white/5" : "bg-white border-purple-100")}>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={cn("text-[9px] font-black uppercase text-gray-500", darkMode && "text-white/40")}>Initial Teaser Message</label>
                        <textarea value={dmAction?.teaserMessage || ''} onChange={(e) => updateDmAction({ teaserMessage: e.target.value })} disabled={readOnly} rows={2} className={cn("w-full border-2 rounded-xl px-3 py-2 outline-none font-bold text-sm resize-none", darkMode ? "bg-black/20 border-white/10 text-white focus:border-white/20" : "border-gray-100 bg-gray-50 focus:bg-white text-gray-900")} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={cn("text-[9px] font-black uppercase text-gray-500", darkMode && "text-white/40")}>Teaser Button Text</label>
                        <input type="text" value={dmAction?.teaserBtnText || ''} onChange={(e) => updateDmAction({ teaserBtnText: e.target.value })} disabled={readOnly} placeholder="e.g. Send Access" className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-bold text-sm transition-all", darkMode ? "bg-black/40 border-white/10 text-white focus:border-white/20" : "border-gray-100 bg-white focus:bg-white text-gray-900")} />
                      </div>
                    </div>

                    <div className={cn("pt-4 mt-4 border-t", darkMode ? "border-white/10" : "border-gray-100")}>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={cn("text-[9px] font-black uppercase text-gray-500", darkMode && "text-white/40")}>Verification Failed (Not Following)</label>
                          <textarea value={dmAction?.askToFollowMessage || ''} onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })} disabled={readOnly} rows={2} className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-bold text-sm resize-none", darkMode ? "bg-black/20 border-white/10 text-white focus:border-white/20" : "border-gray-100 bg-gray-50 focus:bg-white text-gray-900")} />
                        </div>
                        <div className="space-y-1.5">
                          <label className={cn("text-[9px] font-black uppercase text-gray-500", darkMode && "text-white/40")}>Verification Button Text</label>
                          <input type="text" value={dmAction?.askToFollowBtnText || ''} onChange={(e) => updateDmAction({ askToFollowBtnText: e.target.value })} disabled={readOnly} placeholder="e.g. I've Followed! ✅" className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-bold text-sm transition-all", darkMode ? "bg-black/40 border-white/10 text-white focus:border-white/20" : "border-gray-200 bg-white focus:bg-white text-gray-900")} />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* CARD 3: Send DM */}
        {caps?.dm && (
          <div className={cn(
            "rounded-2xl border-2 transition-all overflow-hidden",
            hasDm
              ? (darkMode ? "border-purple-500/30 bg-purple-500/5" : "border-purple-200 bg-purple-50/30")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-100 bg-white")
          )}>
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={toggleDm}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                darkMode ? "bg-white/10 border-white/10" : "bg-gray-50 border-gray-100"
              )}>
                <Send className={cn("w-5 h-5", darkMode ? "text-white/60" : "text-gray-500")} />
              </div>
              <div className="flex-1 text-left">
                <h3 className={cn("font-bold text-[14px] mb-0.5", darkMode ? "text-white" : "text-gray-900")}>Automated Direct Message</h3>
                <p className={cn("text-[11px] font-medium leading-relaxed", darkMode ? "text-white/40" : "text-gray-400")}>Send a DM instantly to anyone who interacts</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasDm} readOnly />
                <div className={cn(
                  "w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner",
                  darkMode && "bg-white/10"
                )}></div>
              </label>
            </div>

            <AnimatePresence>
              {hasDm && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-0">
                  <div className={cn("p-4 rounded-xl border space-y-4", darkMode ? "bg-black/20 border-white/5" : "bg-white border-purple-100")}>

                    {/* DM Format Selector */}
                    <div className="space-y-2">
                      <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>DM Format</label>
                      <div className="flex gap-2">
                        {['simple', 'carousel', 'conversation_flow'].map((type) => {
                          const isSelected = (dmAction?.dmType || 'simple') === type;
                          const isSupported = type === 'simple' ? caps?.dm : (type === 'carousel' ? caps?.carousel : caps?.convFlow);
                          if (!isSupported) return null;
                          return (
                            <button
                              key={type}
                              onClick={() => {
                                if (type === 'conversation_flow' && hasLeadManager) {
                                  toast.error("Lead Manager + Conversation Flow cannot be toggled on together");
                                  return;
                                }
                                updateDmAction({ dmType: type as any });
                              }}
                              disabled={readOnly || (type === 'conversation_flow' && hasLeadManager)}
                              className={cn(
                                "flex-1 py-1.5 px-2 rounded-lg border-2 font-bold text-[11px] transition-all",
                                isSelected
                                  ? (darkMode ? "border-purple-500 bg-purple-500/20 text-purple-300" : "border-purple-600 bg-purple-50 text-purple-700")
                                  : (darkMode ? "border-white/5 bg-white/5 text-white/40 hover:bg-white/10" : "border-gray-100 bg-gray-50 text-gray-400 hover:bg-gray-100"),
                                (type === 'conversation_flow' && hasLeadManager) && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {type === 'simple' && 'Simple'}
                              {type === 'carousel' && 'Carousel'}
                              {type === 'conversation_flow' && 'Flow'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {(dmAction?.dmType || 'simple') === 'simple' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className={cn("text-[10px] font-bold uppercase", darkMode ? "text-white/40" : "text-gray-600")}>Message Content</label>
                          <textarea
                            value={dmAction?.title || ''}
                            onChange={(e) => updateDmAction({ title: e.target.value })}
                            disabled={readOnly}
                            rows={3}
                            placeholder="Type your message..."
                            className={cn(
                              "w-full border-2 rounded-xl px-4 py-2 outline-none font-bold text-sm resize-none",
                              darkMode ? "border-white/10 bg-transparent text-white" : "border-gray-100 bg-gray-50 focus:bg-white text-gray-900"
                            )}
                          />
                          <p className={cn("text-right text-[10px] font-bold mt-1", darkMode ? "text-white/20" : "text-gray-400")}>{(dmAction?.title || '').length} / 1000</p>
                        </div>

                        <div className="flex items-center justify-between py-1 px-1">
                          <label className={cn("text-xs font-bold", darkMode ? "text-white/40" : "text-gray-600")}>Include Attachment</label>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={dmAction?.showImage || false} onChange={(e) => updateDmAction({ showImage: e.target.checked })} disabled={readOnly} />
                            <div className={cn("w-8 h-4 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600", darkMode && "bg-white/10")}></div>
                          </label>
                        </div>

                        {dmAction?.showImage && (
                          <div className="space-y-4">
                            {dmAction.imageUrl ? (
                              <div className="relative group">
                                <div className={cn(
                                  "w-full max-w-[280px] rounded-xl overflow-hidden border-2 transition-all relative flex items-center justify-center bg-black/5 mx-auto md:mx-0 group",
                                  darkMode ? "border-white/10" : "border-purple-100 shadow-sm"
                                )}>
                                  <img
                                    src={dmAction.imageUrl}
                                    className="w-full h-auto max-h-[350px] object-contain"
                                    alt="DM Attachment"
                                  />
                                  {/* Top-right Remove Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateDmAction({ imageUrl: '' });
                                    }}
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-all z-20 opacity-0 group-hover:opacity-100"
                                    title="Remove Image"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>

                                  {/* Bottom Replace Label (Optional but helpful) */}
                                  <div className="absolute inset-x-0 bottom-0 bg-black/40 py-1 text-[8px] font-black text-white text-center opacity-0 group-hover:opacity-100 transition-all uppercase tracking-widest">
                                    Click X to remove
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <MediaUpload
                                  onUploadSuccess={(url) => updateDmAction({ imageUrl: url })}
                                  readOnly={readOnly}
                                />
                                <div className="flex items-center gap-2">
                                  <div className="h-px flex-1 bg-gray-100 dark:bg-white/5" />
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">or paste URL</span>
                                  <div className="h-px flex-1 bg-gray-100 dark:bg-white/5" />
                                </div>
                                <input
                                  type="url"
                                  value={dmAction?.imageUrl || ''}
                                  onChange={(e) => updateDmAction({ imageUrl: e.target.value })}
                                  disabled={readOnly}
                                  placeholder="https://yourapp.com/image.jpg"
                                  className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-base transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus:border-purple-500'}`}
                                />
                              </>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className={cn("text-[10px] font-bold uppercase", darkMode ? "text-white/40" : "text-gray-500")}>Buttons (Max 3)</label>
                          {dmAction?.actionButtons.map((btn, i) => (
                            <div key={i} className={cn("p-2 rounded-lg border space-y-1.5", darkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100")}>
                              <div className="flex justify-between items-center"><span className="text-[9px] font-black text-gray-400 capitalize">Btn {i + 1}</span><X size={12} className="cursor-pointer" onClick={() => updateDmAction({ actionButtons: dmAction.actionButtons.filter((_, idx) => idx !== i) })} /></div>
                              <input type="text" value={btn.text} onChange={(e) => { const btns = [...dmAction.actionButtons]; btns[i].text = e.target.value; updateDmAction({ actionButtons: btns }); }} placeholder="Text" className="w-full bg-transparent border-b border-gray-300 dark:border-white/10 outline-none text-xs font-bold pb-1" />
                              <input type="url" value={btn.url} onChange={(e) => { const btns = [...dmAction.actionButtons]; btns[i].url = e.target.value; updateDmAction({ actionButtons: btns }); }} placeholder="URL" className="w-full bg-transparent border-b border-gray-300 dark:border-white/10 outline-none text-xs font-bold pb-1" />
                            </div>
                          ))}
                          {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                            <button onClick={() => updateDmAction({ actionButtons: [...dmAction.actionButtons, { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })} className={cn("w-full py-1.5 border border-dashed rounded-lg text-xs font-bold", darkMode ? "border-white/20 text-purple-400" : "border-gray-300 text-purple-600")}>+ Add Button</button>
                          )}
                        </div>
                      </div>
                    )}

                    {dmAction?.dmType === 'carousel' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>
                            Carousel Cards ({(dmAction?.carouselCards?.length || 0)}/10)
                          </label>
                          {!readOnly && (dmAction?.carouselCards?.length || 0) < 10 && (
                            <button
                              onClick={() => {
                                const currentCards = dmAction?.carouselCards || [];
                                updateDmAction({
                                  carouselCards: [
                                    ...currentCards,
                                    { id: Date.now().toString(), title: '', subtitle: '', imageUrl: '', buttons: [{ id: 'btn1', text: 'Action', url: '', buttonType: 'web_url' }] }
                                  ]
                                });
                              }}
                              className={cn("text-[11px] font-bold flex items-center gap-1 transition-colors", darkMode ? "text-blue-400 hover:text-blue-300" : "text-purple-600")}
                            >
                              <Plus size={14} /> Add Card
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <div className="flex gap-6 overflow-x-auto custom-scrollbar-hide pb-10 px-2 snap-x snap-mandatory scroll-smooth">
                            {(dmAction?.carouselCards || []).map((card, i) => (
                              <div key={card.id} className={cn(
                                "shrink-0 w-[240px] md:w-[300px] rounded-[2.5rem] border transition-all relative snap-start overflow-hidden flex flex-col shadow-2xl shadow-black/40",
                                darkMode ? "bg-black/90 border-white/10" : "bg-white border-purple-100"
                              )}>
                                {/* Square Image Area */}
                                <div className="aspect-square w-full relative bg-black overflow-hidden group/img">
                                  {card.imageUrl ? (
                                    <img src={card.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" alt="" />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-10">
                                      <ImageIcon className="w-10 h-10" />
                                      <span className="text-[10px] font-black uppercase tracking-[0.3em]">No Image</span>
                                    </div>
                                  )}

                                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col gap-3">
                                    <MediaUpload
                                      label={card.imageUrl ? "Replace Image" : "Upload Image"}
                                      onUploadSuccess={(url) => {
                                        const newCards = [...dmAction!.carouselCards!];
                                        newCards[i] = { ...newCards[i], imageUrl: url };
                                        updateDmAction({ carouselCards: newCards });
                                      }}
                                      readOnly={readOnly}
                                      className="w-full"
                                    />
                                    {!card.imageUrl && (
                                      <input
                                        type="url"
                                        value={card.imageUrl || ''}
                                        onChange={(e) => {
                                          const newCards = [...dmAction!.carouselCards!];
                                          newCards[i] = { ...newCards[i], imageUrl: e.target.value };
                                          updateDmAction({ carouselCards: newCards });
                                        }}
                                        placeholder="or paste URL..."
                                        className="w-full bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl px-4 py-2.5 text-[8px] text-white placeholder:text-white/30 outline-none focus:border-blue-400 transition-all font-black uppercase tracking-widest"
                                      />
                                    )}
                                  </div>

                                  {!readOnly && (
                                    <button
                                      onClick={() => {
                                        const newCards = dmAction!.carouselCards!.filter((_, idx) => idx !== i);
                                        updateDmAction({ carouselCards: newCards });
                                      }}
                                      className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center hover:bg-white hover:text-black transition-all"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                  <div className="absolute top-4 left-4 px-4 py-1.5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full">
                                    <span className="text-[9px] font-black text-white/50 tracking-[0.2em]">SLIDE {i + 1}</span>
                                  </div>
                                </div>

                                {/* Minimalist Form Below */}
                                <div className="p-6 space-y-5">
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30">Headline</label>
                                      <span className={cn("text-[8px] font-bold transition-all", (card.title || '').length > 400 ? (darkMode ? "text-white/20" : "text-black/20") : "opacity-30")}>{(card.title || '').length} / 400</span>
                                    </div>
                                    <input
                                      value={card.title}
                                      onChange={(e) => {
                                        const newCards = [...dmAction!.carouselCards!];
                                        newCards[i] = { ...newCards[i], title: e.target.value };
                                        updateDmAction({ carouselCards: newCards });
                                      }}
                                      placeholder="e.g. Claim Offer"
                                      className={cn("w-full bg-transparent border-b outline-none py-1.5 text-xs font-black uppercase tracking-widest transition-all", (card.title || '').length > 400 ? (darkMode ? "text-white/20 border-white/5" : "text-black/20 border-black/5") : (darkMode ? "border-white/10 focus:border-blue-400 text-white" : "border-gray-100 focus:border-purple-500 text-gray-900"))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30">Description</label>
                                      <span className={cn("text-[8px] font-bold transition-all", (card.subtitle || '').length > 400 ? (darkMode ? "text-white/20" : "text-black/20") : "opacity-30")}>{(card.subtitle || '').length} / 400</span>
                                    </div>
                                    <input
                                      value={card.subtitle || ''}
                                      onChange={(e) => {
                                        const newCards = [...dmAction!.carouselCards!];
                                        newCards[i] = { ...newCards[i], subtitle: e.target.value };
                                        updateDmAction({ carouselCards: newCards });
                                      }}
                                      placeholder="Small text below headline..."
                                      className={cn("w-full bg-transparent border-b outline-none py-1.5 text-[11px] font-bold transition-all", (card.subtitle || '').length > 400 ? (darkMode ? "text-white/10 border-white/5" : "text-black/10 border-black/5") : (darkMode ? "border-white/10 focus:border-blue-400 text-white" : "border-gray-100 focus:border-purple-500 text-gray-500"))}
                                    />
                                  </div>

                                  {/* Glassmorphism Button Manager */}
                                  <div className="pt-2 space-y-4">
                                    <div className="flex items-center justify-between px-1">
                                      <label className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30">Buttons ({card.buttons?.length || 0}/3)</label>
                                      {!readOnly && (card.buttons?.length || 0) < 3 && (
                                        <button
                                          onClick={() => {
                                            const newCards = [...dmAction!.carouselCards!];
                                            newCards[i].buttons = [...(newCards[i].buttons || []), { id: Date.now().toString(), text: 'New Button', url: '', buttonType: 'web_url' }];
                                            updateDmAction({ carouselCards: newCards });
                                          }}
                                          className="text-[9px] font-black text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                                        >
                                          <Plus size={10} /> ADD
                                        </button>
                                      )}
                                    </div>

                                    <div className="space-y-3">
                                      {(card.buttons || []).map((btn, btnIdx) => (
                                        <div key={btn.id} className={cn(
                                          "p-4 rounded-2xl border relative group/btn transition-all duration-300",
                                          darkMode ? "bg-white/[0.03] border-white/5 hover:bg-white/[0.05]" : "bg-gray-50/50 border-gray-100 hover:bg-gray-50"
                                        )}>
                                          {!readOnly && (
                                            <button
                                              onClick={() => {
                                                const newCards = [...dmAction!.carouselCards!];
                                                newCards[i].buttons = (newCards[i].buttons || []).filter((_, idx) => idx !== btnIdx);
                                                updateDmAction({ carouselCards: newCards });
                                              }}
                                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500/80 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-all duration-300 shadow-xl"
                                            >
                                              <X size={10} />
                                            </button>
                                          )}
                                          <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                              <label className="text-[7px] font-black uppercase tracking-widest opacity-20">Label</label>
                                              <input
                                                value={btn.text}
                                                onChange={(e) => {
                                                  const newCards = [...dmAction!.carouselCards!];
                                                  newCards[i].buttons[btnIdx].text = e.target.value;
                                                  updateDmAction({ carouselCards: newCards });
                                                }}
                                                placeholder="BUTTON TEXT"
                                                className={cn("w-full text-[10px] font-black uppercase tracking-widest bg-transparent border-b border-white/5 outline-none focus:border-blue-400/50 transition-all pb-1", darkMode ? "text-white" : "text-gray-900")}
                                              />
                                            </div>
                                            <div className="space-y-1.5">
                                              <label className="text-[7px] font-black uppercase tracking-widest opacity-20">Link</label>
                                              <input
                                                value={btn.url}
                                                onChange={(e) => {
                                                  const newCards = [...dmAction!.carouselCards!];
                                                  newCards[i].buttons[btnIdx].url = e.target.value;
                                                  updateDmAction({ carouselCards: newCards });
                                                }}
                                                placeholder="HTTPS://..."
                                                className="w-full text-[10px] font-black uppercase tracking-widest bg-transparent border-b border-white/5 outline-none focus:border-blue-400/50 transition-all pb-1 text-blue-400"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Add Slot */}
                            {!readOnly && (dmAction?.carouselCards?.length || 0) < 10 && (
                              <button
                                onClick={() => {
                                  const currentCards = dmAction?.carouselCards || [];
                                  updateDmAction({
                                    carouselCards: [
                                      ...currentCards,
                                      { id: Date.now().toString(), title: '', subtitle: '', imageUrl: '', buttons: [{ id: 'btn-' + Date.now(), text: 'Action', url: '', buttonType: 'web_url' }] }
                                    ]
                                  });
                                }}
                                className={cn(
                                  "shrink-0 w-[240px] aspect-square rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all hover:bg-blue-500/[0.05] hover:border-blue-400 group/add snap-start",
                                  darkMode ? "border-white/10 bg-white/[0.02] text-white/10" : "border-gray-200 bg-gray-50 text-gray-400"
                                )}
                              >
                                <div className="w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition-all group-hover/add:scale-110 group-hover/add:border-blue-400 group-hover/add:text-blue-400">
                                  <Plus size={28} />
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-[0.3em]">{(dmAction?.carouselCards?.length || 0) === 0 ? 'Create Deck' : 'Add Slide'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {dmAction?.dmType === 'conversation_flow' && (
                      <div className="space-y-8 pt-2">
                        {/* Modern Status Header */}
                        <div className={cn("flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-[2rem] border transition-all", darkMode ? "bg-white/5 border-white/10 shadow-2xl" : "bg-white border-purple-100 shadow-xl shadow-purple-500/5")}>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                              <Bot size={24} />
                            </div>
                            <div>
                              <h4 className={cn("text-base font-black tracking-tight", darkMode ? "text-white" : "text-gray-900")}>Menu Flow Engine</h4>
                              <div className="flex items-center gap-2">
                                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <p className={cn("text-[10px] font-bold uppercase tracking-wider opacity-40")}>Active • 2 Postbacks Max</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 p-2 rounded-2xl border border-gray-100 dark:border-white/5">
                            <div className="px-4 text-center border-r border-gray-200 dark:border-white/10">
                              <p className="text-[9px] font-black uppercase text-gray-400">Total Cards</p>
                              <p className={cn("text-sm font-black", (1 + (dmAction.conversationCards?.length || 0)) >= 11 ? "text-red-500" : "text-purple-600")}>
                                {1 + (dmAction.conversationCards?.length || 0)} <span className="opacity-30">/ 11</span>
                              </p>
                            </div>
                            <div className="px-4 text-center">
                              <p className="text-[9px] font-black uppercase text-gray-400">Routes</p>
                              <p className="text-sm font-black opacity-60">
                                {dmAction.actionButtons.filter(b => b.buttonType === 'postback').length +
                                  (dmAction.conversationCards?.reduce((acc, c) => acc + c.actionButtons.filter(b => b.buttonType === 'postback').length, 0) || 0)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Level 0: Global Opener (Always Visible) */}
                        <div className={cn("p-8 rounded-[2.5rem] border-2 transition-all relative", darkMode ? "bg-black/20 border-white/5" : "bg-white border-gray-100 shadow-sm")}>
                          <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center gap-3">
                              <div className="px-3 py-1 bg-purple-600 text-white text-[10px] font-black rounded-lg">LEVEL 0</div>
                              <h5 className={cn("text-sm font-black uppercase tracking-widest", darkMode ? "text-white/60" : "text-gray-400")}>Opening Message</h5>
                            </div>
                            <span className={cn("text-[9px] font-bold opacity-30")}>{(dmAction.title || '').length} / 1000</span>
                          </div>

                          <div className="space-y-8">
                            <div className="text-center space-y-4">
                              <textarea
                                value={dmAction.title || ''}
                                onChange={(e) => updateDmAction({ title: e.target.value })}
                                placeholder="Hey! Welcome 👋 How can we help you today?"
                                className={cn("w-full bg-transparent border-none outline-none text-center font-bold text-lg resize-none placeholder:opacity-20 mt-4", darkMode ? "text-white" : "text-gray-800")}
                                rows={2}
                              />
                              <div className="h-px w-24 bg-purple-200 dark:bg-white/10 mx-auto mt-4"></div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {dmAction.actionButtons.map((btn, i) => {
                              const postbackCount = dmAction.actionButtons.filter(b => b.buttonType === 'postback').length;
                              const canBePostback = btn.buttonType === 'postback' || postbackCount < 2;

                              return (
                                <div key={btn.id} className={cn("p-5 rounded-3xl border-2 transition-all relative group", darkMode ? "bg-white/5 border-white/5 hover:border-purple-500/50" : "bg-gray-50/50 border-gray-100 hover:border-purple-200 hover:bg-white")}>
                                  <button
                                    onClick={() => {
                                      const filteredBtns = dmAction.actionButtons.filter(b => b.id !== btn.id);
                                      const filteredCards = (dmAction.conversationCards || []).filter(c => c.id !== btn.payload);
                                      updateDmAction({
                                        actionButtons: filteredBtns,
                                        conversationCards: filteredCards
                                      });
                                    }}
                                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                  >
                                    <X size={14} />
                                  </button>

                                  <input
                                    value={btn.text}
                                    onChange={(e) => {
                                      const btns = [...dmAction.actionButtons];
                                      btns[i].text = e.target.value;
                                      updateDmAction({ actionButtons: btns });
                                    }}
                                    placeholder="Label"
                                    className={cn("w-full bg-transparent border-b border-gray-200 dark:border-white/10 outline-none text-sm font-black pb-2 mb-4 focus:border-purple-500 text-center", darkMode ? "text-white" : "text-gray-800")}
                                  />

                                  <div className="flex bg-gray-200/50 dark:bg-black/20 p-1 rounded-2xl mb-4 border border-gray-200 dark:border-white/5">
                                    <button
                                      onClick={() => {
                                        const btns = [...dmAction.actionButtons];
                                        const pbId = `PB_L1_${i + 1}_${Date.now()}`;
                                        btns[i].buttonType = 'postback';
                                        btns[i].payload = pbId;

                                        // Auto-add Card
                                        const currentCards = dmAction.conversationCards || [];
                                        if (!currentCards.find(c => c.id === pbId)) {
                                          updateDmAction({
                                            actionButtons: btns,
                                            conversationCards: [...currentCards, { id: pbId, title: btn.text, messageTemplate: '', actionButtons: [] }]
                                          });
                                        } else {
                                          updateDmAction({ actionButtons: btns });
                                        }
                                      }}
                                      disabled={!canBePostback}
                                      className={cn("flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all", btn.buttonType === 'postback' ? "bg-white text-purple-600 shadow-sm" : "text-gray-400 hover:bg-white/10 disabled:opacity-20")}
                                    >
                                      Step
                                    </button>
                                    <button
                                      onClick={() => {
                                        const btns = [...dmAction.actionButtons];
                                        const oldPayload = btns[i].payload;
                                        btns[i].buttonType = 'web_url';

                                        // Auto-remove Card
                                        const currentCards = (dmAction.conversationCards || []).filter(c => c.id !== oldPayload);
                                        updateDmAction({ actionButtons: btns, conversationCards: currentCards });
                                      }}
                                      className={cn("flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all", btn.buttonType === 'web_url' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:bg-white/10")}
                                    >
                                      Link
                                    </button>
                                  </div>

                                  {btn.buttonType === 'web_url' ? (
                                    <input
                                      value={btn.url}
                                      onChange={(e) => {
                                        const btns = [...dmAction.actionButtons];
                                        btns[i].url = e.target.value;
                                        updateDmAction({ actionButtons: btns });
                                      }}
                                      placeholder="https://..."
                                      className="w-full bg-transparent border-b border-gray-200 dark:border-white/10 outline-none text-[11px] font-medium text-blue-500 text-center"
                                    />
                                  ) : (
                                    <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-purple-500 animate-pulse">
                                      <Bot size={12} /> BRANCH {i + 1}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {dmAction.actionButtons.length < 3 && (
                              <button
                                onClick={() => updateDmAction({
                                  actionButtons: [...dmAction.actionButtons, { id: `BTN_${Date.now()}`, text: '', url: '', buttonType: 'web_url' }]
                                })}
                                className={cn("p-6 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:bg-purple-50 hover:border-purple-200", darkMode ? "border-white/10 hover:bg-white/5" : "border-gray-200 text-gray-300")}
                              >
                                <Plus size={20} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Add Item</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Response Cards Symmetrical Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                          {/* Vertical Line for Tree View */}
                          <div className="hidden md:block absolute -top-8 left-1/2 -ml-0.5 w-1 h-8 bg-purple-100 dark:bg-white/5"></div>

                          {(dmAction.conversationCards || []).map((card, cardIndex) => {
                            // Find which button triggers this card to show a clear label
                            const parentButton = [
                              ...dmAction.actionButtons,
                              ...(dmAction.conversationCards?.flatMap(c => c.actionButtons) || [])
                            ].find(b => b.payload === card.id);

                            return (
                              <div key={card.id} className="space-y-4">
                                <div className={cn("p-8 rounded-[2.5rem] border-2 transition-all relative group", darkMode ? "bg-black/40 border-white/10" : "bg-white border-purple-100 shadow-lg shadow-purple-500/5 hover:border-purple-300")}>
                                  <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black text-[10px] shadow-lg shadow-purple-500/20">BR</div>
                                      <div>
                                        <h4 className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white" : "text-gray-900")}>
                                          Branch: <span className="text-purple-500">{parentButton?.text || "Untitled"}</span>
                                        </h4>
                                        <p className="text-[9px] font-bold text-gray-400">Triggered by "{parentButton?.text || "New Button"}"</p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        // Find and toggle the parent button back to link
                                        const btns = [...dmAction.actionButtons];
                                        const l0Btn = btns.find(b => b.payload === card.id);
                                        if (l0Btn) {
                                          l0Btn.buttonType = 'web_url';
                                          const filteredCards = (dmAction.conversationCards || []).filter(c => c.id !== card.id);
                                          updateDmAction({ actionButtons: btns, conversationCards: filteredCards });
                                        } else {
                                          // Handle sub-card deletion via parent button toggle
                                          const newCards = [...(dmAction.conversationCards || [])];
                                          newCards.forEach(c => {
                                            const b = c.actionButtons.find(ab => ab.payload === card.id);
                                            if (b) b.buttonType = 'web_url';
                                          });
                                          const filteredCards = newCards.filter(c => c.id !== card.id);
                                          updateDmAction({ conversationCards: filteredCards });
                                        }
                                      }}
                                      className="text-red-400 hover:text-red-500 transition-colors bg-red-50 dark:bg-red-500/10 p-2 rounded-xl"
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>

                                  <div className="space-y-6">
                                    <div className="flex items-center justify-between mb-2 px-1">
                                      <label className={cn("text-[9px] font-black uppercase tracking-wider opacity-40")}>Response Message</label>
                                      <span className={cn("text-[9px] font-bold opacity-30")}>{(card.messageTemplate || '').length} / 1000</span>
                                    </div>
                                    <textarea
                                      value={card.messageTemplate || ''}
                                      onChange={(e) => {
                                        const newCards = [...(dmAction.conversationCards || [])];
                                        newCards[cardIndex] = { ...newCards[cardIndex], messageTemplate: e.target.value };
                                        updateDmAction({ conversationCards: newCards });
                                      }}
                                      placeholder="Reply message text..."
                                      className={cn("w-full p-4 rounded-2xl border-2 min-h-[100px] outline-none transition-all font-medium text-sm text-center", darkMode ? "bg-white/5 border-white/10 text-white focus:border-purple-500" : "bg-gray-50 border-gray-100 focus:bg-white focus:border-purple-500")}
                                    />

                                    {/* Branching Buttons (2 Postback Limit) */}
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                      {card.actionButtons.map((btn, btnIdx) => {
                                        const postbackCount = card.actionButtons.filter(b => b.buttonType === 'postback').length;
                                        const canBePostback = btn.buttonType === 'postback' || postbackCount < 2;

                                        return (
                                          <div key={btn.id} className={cn("p-4 rounded-2xl border-2 bg-gray-50/50", darkMode ? "bg-white/5 border-white/5" : "border-gray-50")}>
                                            <input
                                              value={btn.text}
                                              onChange={(e) => {
                                                const newCards = [...(dmAction.conversationCards || [])];
                                                newCards[cardIndex].actionButtons[btnIdx].text = e.target.value;
                                                updateDmAction({ conversationCards: newCards });
                                              }}
                                              className={cn("w-full bg-transparent border-b border-gray-200 dark:border-white/10 outline-none text-[11px] font-bold mb-3 text-center", darkMode ? "text-white" : "text-gray-800")}
                                              placeholder="LABEL"
                                            />
                                            <div className="flex bg-black/5 dark:bg-black/20 p-0.5 rounded-xl mb-2 relative group/btn">
                                              {/* Delete Button for sub-buttons */}
                                              <button
                                                onClick={() => {
                                                  const newCards = [...(dmAction.conversationCards || [])];
                                                  const deletedBtn = newCards[cardIndex].actionButtons[btnIdx];
                                                  newCards[cardIndex].actionButtons.splice(btnIdx, 1);
                                                  const filteredCards = newCards.filter(c => c.id !== deletedBtn.payload);
                                                  updateDmAction({ conversationCards: filteredCards });
                                                }}
                                                className="absolute -top-6 -right-1 w-5 h-5 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity"
                                              >
                                                <X size={10} />
                                              </button>

                                              <button
                                                disabled={!canBePostback || (dmAction.conversationCards?.length || 0) >= 10}
                                                onClick={() => {
                                                  const newCards = [...(dmAction.conversationCards || [])];
                                                  const pbId = `PB_SUB_${cardIndex}_${btnIdx}_${Date.now()}`;
                                                  newCards[cardIndex].actionButtons[btnIdx].buttonType = 'postback';
                                                  newCards[cardIndex].actionButtons[btnIdx].payload = pbId;

                                                  // Auto-spawn child card
                                                  if (!newCards.find(c => c.id === pbId)) {
                                                    updateDmAction({
                                                      conversationCards: [...newCards, { id: pbId, title: btn.text, messageTemplate: '', actionButtons: [] }]
                                                    });
                                                  } else {
                                                    updateDmAction({ conversationCards: newCards });
                                                  }
                                                }}
                                                className={cn("flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase transition-all", btn.buttonType === 'postback' ? "bg-white text-purple-600 shadow-sm" : "text-gray-400 hover:bg-white/20")}
                                              >
                                                Step
                                              </button>
                                              <button
                                                onClick={() => {
                                                  const newCards = [...(dmAction.conversationCards || [])];
                                                  const oldPayload = newCards[cardIndex].actionButtons[btnIdx].payload;
                                                  newCards[cardIndex].actionButtons[btnIdx].buttonType = 'web_url';

                                                  // Auto-remove child card
                                                  const filteredCards = newCards.filter(c => c.id !== oldPayload);
                                                  updateDmAction({ conversationCards: filteredCards });
                                                }}
                                                className={cn("flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase transition-all", btn.buttonType === 'web_url' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:bg-white/20")}
                                              >
                                                Link
                                              </button>
                                            </div>
                                            {btn.buttonType === 'web_url' ? (
                                              <input
                                                value={btn.url}
                                                onChange={(e) => {
                                                  const newCards = [...(dmAction.conversationCards || [])];
                                                  newCards[cardIndex].actionButtons[btnIdx].url = e.target.value;
                                                  updateDmAction({ conversationCards: newCards });
                                                }}
                                                placeholder="URL"
                                                className="w-full bg-transparent border-b border-gray-100 dark:border-white/10 outline-none text-[8px] text-center text-blue-500"
                                              />
                                            ) : (
                                              <div className="text-[9px] font-bold text-center text-emerald-500 italic">Adds Card</div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {card.actionButtons.length < 3 && (
                                        <button
                                          onClick={() => {
                                            const newCards = [...(dmAction.conversationCards || [])];
                                            newCards[cardIndex].actionButtons.push({ id: `CARD_BTN_${Date.now()}`, text: '', url: '', buttonType: 'web_url' });
                                            updateDmAction({ conversationCards: newCards });
                                          }}
                                          className="p-3 border-2 border-dashed rounded-2xl flex items-center justify-center text-gray-300 hover:text-purple-500 transition-colors"
                                        >
                                          <Plus size={16} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Global Message for capacity */}
                          {(dmAction.conversationCards?.length || 0) >= 10 && (
                            <div className="col-span-full p-6 rounded-3xl bg-red-500/10 border border-red-500/20 text-center">
                              <p className="text-xs font-black text-red-500 uppercase tracking-widest italic">11 Card Limit Active</p>
                              <p className="text-[10px] font-bold text-red-400/80">Remaining buttons must be Links to save space.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* CARD 3: Save Leads */}
        {caps?.leadManager && (
          <div className={cn(
            "rounded-2xl border-2 transition-all overflow-hidden",
            hasLeadManager
              ? (darkMode ? "border-orange-500/30 bg-orange-500/5" : "border-orange-200 bg-orange-50/30")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-100 bg-white")
          )}>
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={toggleLeadManager}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                darkMode ? "bg-white/10 border-white/10" : "bg-gray-50 border-gray-100"
              )}>
                <FileSpreadsheet className={cn("w-5 h-5", darkMode ? "text-white/60" : "text-gray-500")} />
              </div>
              <div className="flex-1 text-left">
                <h3 className={cn("font-bold text-[14px] mb-0.5", darkMode ? "text-white" : "text-gray-900")}>Save to Lead Manager</h3>
                <p className={cn("text-[11px] font-medium leading-relaxed", darkMode ? "text-white/40" : "text-gray-400")}>Automatically capture and store user details in your Lead Manager</p>
              </div>
              <label className={cn("relative inline-flex items-center transition-opacity", (readOnly || (!hasLeadManager && (hasFollowGate || (hasDm && dmAction?.dmType === 'conversation_flow')))) ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={hasLeadManager} 
                  onChange={toggleLeadManager}
                  disabled={readOnly || (!hasLeadManager && (hasFollowGate || (hasDm && dmAction?.dmType === 'conversation_flow')))} 
                />
                <div className={cn(
                  "w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner",
                  darkMode && "bg-white/10"
                )}></div>
              </label>
            </div>

            <AnimatePresence>
              {hasLeadManager && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-0">
                  <div className={cn("p-4 rounded-xl border space-y-4", darkMode ? "bg-black/20 border-white/5" : "bg-white border-orange-100")}>

                    <div className="space-y-1.5">
                      <label className={cn("text-[9px] font-black uppercase text-gray-500", darkMode && "text-white/40")}>Data to Collect</label>
                      <div className="flex flex-wrap gap-2 pt-1 pb-1">
                        {(['name', 'email', 'phone'] as const).map(field => {
                          const isSelected = (leadAction?.collectFields || ['name', 'email']).includes(field);
                          return (
                            <button
                              key={field}
                              disabled={readOnly}
                              onClick={() => {
                                if (!leadAction) return;
                                const newFields = new Set(leadAction.collectFields || ['name', 'email']);
                                if (isSelected) {
                                  if (newFields.size <= 1) {
                                    toast.error("At least one item must be selected");
                                    return;
                                  }
                                  newFields.delete(field);
                                }
                                else newFields.add(field);

                                const newActions = [...actions];
                                const idx = newActions.findIndex(a => a.type === 'save_lead');
                                if (idx >= 0) {
                                  newActions[idx] = { ...newActions[idx], collectFields: Array.from(newFields) } as SaveLeadAction;
                                  updateActions(newActions);
                                }
                              }}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5",
                                isSelected
                                  ? (darkMode ? "bg-orange-500/10 border-orange-500/20 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-600")
                                  : (darkMode ? "bg-transparent border-white/10 text-white/40 hover:bg-white/5" : "bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50")
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full transition-all", isSelected ? "bg-current" : "bg-transparent")} />
                              {field.charAt(0).toUpperCase() + field.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Editable Messages */}
                    <div className="pt-2">
                      <div
                        className={cn(
                          "p-3 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-between",
                          darkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-100"
                        )}
                        onClick={() => setShowLeadMessages(!showLeadMessages)}
                      >
                        <span className={cn("text-xs font-bold", darkMode ? "text-white" : "text-gray-900")}>Customize DM Messages</span>
                        {showLeadMessages ? (
                          <ChevronUp className={cn("w-4 h-4", darkMode ? "text-white/40" : "text-gray-400")} />
                        ) : (
                          <ChevronDown className={cn("w-4 h-4", darkMode ? "text-white/40" : "text-gray-400")} />
                        )}
                      </div>

                      <AnimatePresence>
                        {showLeadMessages && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-6 space-y-12">
                              {(() => {
                                const collected = leadAction?.collectFields || ['name', 'email'];
                                return (
                                  <>
                                    {(['name', 'email', 'phone'] as const).map(field => {
                                      if (!collected.includes(field)) return null;

                                      const fieldTitle = field.toUpperCase();
                                      const qKey = field === 'name' ? 'askName' : field === 'email' ? 'askEmail' : 'askPhone';
                                      const cKey = field === 'name' ? 'confirmName' : null;
                                      const rKey = field === 'name' ? 'askNameAgain' : field === 'email' ? 'askEmailAgain' : 'askPhoneAgain';
                                      const bKey = field === 'name' ? 'btnChangeName' : field === 'email' ? 'btnChangeEmail' : 'btnChangePhone';

                                      const Icon = field === 'name' ? User : field === 'email' ? Mail : Smartphone;

                                      return (
                                        <div key={field} className="space-y-4">
                                          <div className="flex items-center gap-2 px-1">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", darkMode ? "bg-white/5 text-white/60" : "bg-gray-100 text-gray-500")}>
                                              <Icon size={16} />
                                            </div>
                                            <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>{fieldTitle} COLLECTION</span>
                                          </div>

                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* LEFT: THE QUESTION */}
                                            <div className={cn("p-4 rounded-2xl border flex flex-col gap-3", darkMode ? "bg-white/[0.03] border-white/5" : "bg-gray-50/50 border-gray-100")}>
                                              <div className="flex items-center justify-between">
                                                <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/40" : "text-gray-500")}>The Question</label>
                                                <span className={cn("text-[8px] font-bold opacity-30")}>{((leadAction?.messages as any)?.[qKey] || (DEFAULT_LEAD_MESSAGES as any)[qKey] || '').length} / 1000</span>
                                              </div>
                                              <textarea
                                                value={leadAction?.messages?.[qKey] ?? DEFAULT_LEAD_MESSAGES[qKey]}
                                                onChange={(e) => {
                                                  const newActions = [...actions];
                                                  const i = newActions.findIndex(a => a.type === 'save_lead');
                                                  if (i >= 0) {
                                                    const currentItem = newActions[i] as SaveLeadAction;
                                                    const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                    newMsgs[qKey] = e.target.value;
                                                    newActions[i] = { ...currentItem, messages: newMsgs };
                                                    updateActions(newActions);
                                                  }
                                                }}
                                                rows={2}
                                                className={cn("bg-transparent outline-none text-xs font-semibold resize-none", darkMode ? "text-white" : "text-gray-800")}
                                                placeholder="What is your name?"
                                              />
                                            </div>

                                            {/* RIGHT: CONFIRMATION OR BUTTON LABEL */}
                                            <div className={cn("p-4 rounded-2xl border flex flex-col gap-3", darkMode ? "bg-white/[0.03] border-white/5" : "bg-gray-50/50 border-gray-100")}>
                                              <div className="flex items-center justify-between">
                                                <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/40" : "text-gray-500")}>Confirmation & Buttons</label>
                                                {cKey && <span className={cn("text-[8px] font-bold opacity-30")}>{((leadAction?.messages as any)?.[cKey!] || (DEFAULT_LEAD_MESSAGES as any)[cKey!] || '').length} / 1000</span>}
                                              </div>
                                              {cKey && (
                                                <textarea
                                                  value={leadAction?.messages?.[cKey] ?? DEFAULT_LEAD_MESSAGES[cKey]}
                                                  onChange={(e) => {
                                                    const newActions = [...actions];
                                                    const i = newActions.findIndex(a => a.type === 'save_lead');
                                                    if (i >= 0) {
                                                      const currentItem = newActions[i] as SaveLeadAction;
                                                      const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                      newMsgs[cKey] = e.target.value;
                                                      newActions[i] = { ...currentItem, messages: newMsgs };
                                                      updateActions(newActions);
                                                    }
                                                  }}
                                                  rows={2}
                                                  className={cn("bg-transparent outline-none text-[11px] font-medium resize-none opacity-80", darkMode ? "text-white" : "text-gray-800")}
                                                  placeholder="Confirmation message..."
                                                />
                                              )}
                                              <div className="flex items-center gap-2 mt-auto">
                                                <span className={cn("text-[8px] font-bold uppercase", darkMode ? "text-white/20" : "text-gray-300")}>BTN:</span>
                                                <input
                                                  type="text"
                                                  value={leadAction?.messages?.[bKey] ?? DEFAULT_LEAD_MESSAGES[bKey]}
                                                  onChange={(e) => {
                                                    const newActions = [...actions];
                                                    const i = newActions.findIndex(a => a.type === 'save_lead');
                                                    if (i >= 0) {
                                                      const currentItem = newActions[i] as SaveLeadAction;
                                                      const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                      newMsgs[bKey] = e.target.value;
                                                      newActions[i] = { ...currentItem, messages: newMsgs };
                                                      updateActions(newActions);
                                                    }
                                                  }}
                                                  className={cn("flex-1 bg-transparent border-b border-dashed outline-none text-[10px] font-black", darkMode ? "border-white/10 text-white/50 focus:text-white" : "border-gray-200 text-gray-400 focus:text-gray-900")}
                                                  placeholder="Change Button text..."
                                                />
                                              </div>
                                            </div>

                                            {/* BOTTOM: RETRY MESSAGE (FULL WIDTH) */}
                                            <div className={cn("md:col-span-2 p-4 rounded-2xl border flex flex-col gap-2", darkMode ? "bg-white/[0.01] border-white/10" : "bg-white/10 border-gray-100")}>
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                  <RotateCcw size={10} className="opacity-40" />
                                                  <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/30" : "text-gray-400")}>Correction / Reset Message</label>
                                                </div>
                                                <span className={cn("text-[8px] font-bold opacity-30")}>{((leadAction?.messages as any)?.[rKey] || (DEFAULT_LEAD_MESSAGES as any)[rKey] || '').length} / 1000</span>
                                              </div>
                                              <textarea
                                                value={leadAction?.messages?.[rKey] ?? DEFAULT_LEAD_MESSAGES[rKey]}
                                                onChange={(e) => {
                                                  const newActions = [...actions];
                                                  const i = newActions.findIndex(a => a.type === 'save_lead');
                                                  if (i >= 0) {
                                                    const currentItem = newActions[i] as SaveLeadAction;
                                                    const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                    newMsgs[rKey] = e.target.value;
                                                    newActions[i] = { ...currentItem, messages: newMsgs };
                                                    updateActions(newActions);
                                                  }
                                                }}
                                                rows={1}
                                                className={cn("bg-transparent outline-none text-xs font-medium resize-none opacity-60 italic", darkMode ? "text-white" : "text-gray-800")}
                                                placeholder="Retry message..."
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* SUMMARY & FINAL MESSAGE SECTION */}
                                    <div className="pt-8 border-t border-dashed border-white/10 space-y-8">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* SUMMARY CASE */}
                                        <div className="space-y-4">
                                          <div className="flex items-center gap-2">
                                            <FileSpreadsheet size={16} className="text-emerald-500" />
                                            <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>Final Confirmation</span>
                                          </div>
                                          <div className={cn("p-5 rounded-3xl border space-y-4", darkMode ? "bg-white/[0.03] border-emerald-500/20 shadow-2xl shadow-emerald-500/5" : "bg-emerald-50/30 border-emerald-100")}>
                                            <textarea
                                              value={leadAction?.messages?.confirmAll ?? DEFAULT_LEAD_MESSAGES.confirmAll?.replace(/\nPhone: {{phone}}/g, collected.includes('phone') ? '\nPhone: {{phone}}' : '')}
                                              onChange={(e) => {
                                                const newActions = [...actions];
                                                const i = newActions.findIndex(a => a.type === 'save_lead');
                                                if (i >= 0) {
                                                  const currentItem = newActions[i] as SaveLeadAction;
                                                  const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                  newMsgs.confirmAll = e.target.value;
                                                  newActions[i] = { ...currentItem, messages: newMsgs };
                                                  updateActions(newActions);
                                                }
                                              }}
                                              rows={4}
                                              className={cn("w-full bg-transparent outline-none text-sm font-bold resize-none", darkMode ? "text-white" : "text-gray-900")}
                                            />
                                            <div className="flex items-center gap-2 pt-2 border-t border-dashed border-emerald-500/20">
                                              <span className={cn("text-[9px] font-black tracking-widest uppercase", darkMode ? "text-emerald-500/60" : "text-emerald-600")}>Confirm BTN:</span>
                                              <input
                                                type="text"
                                                value={leadAction?.messages?.btnYesLooksGood ?? DEFAULT_LEAD_MESSAGES.btnYesLooksGood}
                                                onChange={(e) => {
                                                  const newActions = [...actions];
                                                  const i = newActions.findIndex(a => a.type === 'save_lead');
                                                  if (i >= 0) {
                                                    const currentItem = newActions[i] as SaveLeadAction;
                                                    const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                    newMsgs.btnYesLooksGood = e.target.value;
                                                    newActions[i] = { ...currentItem, messages: newMsgs };
                                                    updateActions(newActions);
                                                  }
                                                }}
                                                className={cn("flex-1 bg-transparent outline-none text-xs font-black", darkMode ? "text-white" : "text-emerald-700")}
                                                placeholder="Confirm Button..."
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        {/* FINAL MESSAGE */}
                                        <div className="space-y-4">
                                          <div className="flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-purple-500" />
                                            <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>Successful Finish</span>
                                          </div>
                                          <div className={cn("p-5 rounded-3xl border space-y-4", darkMode ? "bg-white/[0.03] border-purple-500/20 shadow-2xl shadow-purple-500/5" : "bg-purple-50/30 border-purple-100")}>
                                            <textarea
                                              value={leadAction?.messages?.finalMessage ?? DEFAULT_LEAD_MESSAGES.finalMessage}
                                              onChange={(e) => {
                                                const newActions = [...actions];
                                                const i = newActions.findIndex(a => a.type === 'save_lead');
                                                if (i >= 0) {
                                                  const currentItem = newActions[i] as SaveLeadAction;
                                                  const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                  newMsgs.finalMessage = e.target.value;
                                                  newActions[i] = { ...currentItem, messages: newMsgs };
                                                  updateActions(newActions);
                                                }
                                              }}
                                              rows={5}
                                              className={cn("w-full bg-transparent outline-none text-sm font-bold resize-none", darkMode ? "text-white" : "text-gray-900")}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* CARD 4: Follow Up Message */}
        {(triggerType === 'user_directed_messages' || (triggerType === 'post_comment' && hasLeadManager)) && (
          <div className={cn(
            "rounded-2xl border-2 transition-all overflow-hidden",
            hasFollowUp
              ? (darkMode ? "border-emerald-500/30 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50/30")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-100 bg-white")
          )}>
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={toggleFollowUp}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                darkMode ? "bg-white/10 border-white/10" : "bg-gray-50 border-gray-100"
              )}>
                <RotateCcw className={cn("w-5 h-5", darkMode ? "text-white/60" : "text-gray-500")} />
              </div>
              <div className="flex-1 text-left">
                <h3 className={cn("font-bold text-[14px] mb-0.5", darkMode ? "text-white" : "text-gray-900")}>Follow Up Message</h3>
                <p className={cn("text-[11px] font-medium leading-relaxed", darkMode ? "text-white/40" : "text-gray-400")}>Send a second message automatically after a delay to boost response rates</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasFollowUp} readOnly />
                <div className={cn(
                  "w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 shadow-inner",
                  darkMode && "bg-white/10"
                )}></div>
              </label>
            </div>

            <AnimatePresence>
              {hasFollowUp && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 pt-0">
                  <div className={cn("p-6 rounded-2xl border space-y-6", darkMode ? "bg-black/20 border-white/5" : "bg-white border-emerald-100 shadow-sm")}>
                    
                    <div className="flex flex-col md:flex-row gap-6 md:items-end">
                      <div className="flex-1 space-y-2">
                        <label className={cn("text-[10px] font-black uppercase tracking-wider text-gray-500", darkMode && "text-white/40")}>Send delay</label>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number"
                            min="1"
                            max="30"
                            value={followUpAction?.delayValue || 30}
                            onChange={(e) => {
                              const val = Math.min(30, Math.max(1, parseInt(e.target.value) || 1));
                              const newActions = [...actions];
                              const idx = newActions.findIndex(a => a.type === 'follow_up');
                              if (idx >= 0) {
                                newActions[idx] = { ...newActions[idx], delayValue: val, delayUnit: 'minutes' } as FollowUpAction;
                                updateActions(newActions);
                              }
                            }}
                            className={cn("w-20 px-4 py-2 rounded-xl border-2 font-black text-center outline-none transition-all", darkMode ? "bg-white/5 border-white/10 text-white focus:border-emerald-500" : "bg-gray-50 border-gray-100 focus:bg-white focus:border-emerald-500")}
                          />
                          <span className={cn("text-[11px] font-black uppercase tracking-widest opacity-40")}>Minutes</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className={cn("text-[10px] font-black uppercase tracking-wider text-gray-500", darkMode && "text-white/40")}>Follow Up Message</label>
                        <span className={cn("text-[9px] font-bold opacity-30")}>{(followUpAction?.message || '').length} / 1000</span>
                      </div>
                      <textarea
                        value={followUpAction?.message || ''}
                        onChange={(e) => {
                          const newActions = [...actions];
                          const idx = newActions.findIndex(a => a.type === 'follow_up');
                          if (idx >= 0) {
                            newActions[idx] = { ...newActions[idx], message: e.target.value } as FollowUpAction;
                            updateActions(newActions);
                          }
                        }}
                        placeholder="Hey! Just following up on my previous message... 😊"
                        rows={3}
                        className={cn("w-full p-4 rounded-xl border-2 font-medium text-sm outline-none transition-all", darkMode ? "bg-white/5 border-white/10 text-white focus:border-emerald-500" : "bg-gray-50 border-gray-100 focus:bg-white focus:border-emerald-500")}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <label className={cn("text-[10px] font-black uppercase tracking-wider text-gray-500", darkMode && "text-white/40")}>Buttons (Max 3, URLs only)</label>
                        <span className={cn("text-[9px] font-bold opacity-30")}>{(followUpAction?.actionButtons || []).length} / 3</span>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2">
                        {(followUpAction?.actionButtons || []).map((btn, bIdx) => (
                          <div key={btn.id} className={cn("p-3 rounded-xl border flex flex-col gap-2 transition-all", darkMode ? "bg-white/[0.03] border-white/5" : "bg-white border-gray-100 shadow-sm")}>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={btn.text}
                                placeholder="Button Label (e.g. Visit Website)"
                                onChange={(e) => {
                                  const newActions = [...actions];
                                  const idx = newActions.findIndex(a => a.type === 'follow_up');
                                  if (idx >= 0) {
                                    const followUp = { ...newActions[idx] } as FollowUpAction;
                                    const btns = [...(followUp.actionButtons || [])];
                                    btns[bIdx] = { ...btns[bIdx], text: e.target.value.substring(0, 20) };
                                    newActions[idx] = { ...followUp, actionButtons: btns };
                                    updateActions(newActions);
                                  }
                                }}
                                className={cn("flex-1 bg-transparent border-none outline-none text-[11px] font-black", darkMode ? "text-white placeholder:text-white/20" : "text-gray-900 placeholder:text-gray-300")}
                              />
                              <button
                                onClick={() => {
                                  const newActions = [...actions];
                                  const idx = newActions.findIndex(a => a.type === 'follow_up');
                                  if (idx >= 0) {
                                    const followUp = { ...newActions[idx] } as FollowUpAction;
                                    const btns = (followUp.actionButtons || []).filter((_, i) => i !== bIdx);
                                    newActions[idx] = { ...followUp, actionButtons: btns };
                                    updateActions(newActions);
                                  }
                                }}
                                className={cn("p-1.5 rounded-lg transition-colors", darkMode ? "hover:bg-red-500/20 text-red-400" : "hover:bg-red-50 text-red-500")}
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <div className="flex items-center gap-2 px-1 border-t border-dashed border-gray-500/10 pt-2">
                              <Globe size={10} className="opacity-30" />
                              <input
                                type="text"
                                value={btn.url || ''}
                                placeholder="https://example.com"
                                onChange={(e) => {
                                  const newActions = [...actions];
                                  const idx = newActions.findIndex(a => a.type === 'follow_up');
                                  if (idx >= 0) {
                                    const followUp = { ...newActions[idx] } as FollowUpAction;
                                    const btns = [...(followUp.actionButtons || [])];
                                    btns[bIdx] = { ...btns[bIdx], url: e.target.value, buttonType: 'web_url' };
                                    newActions[idx] = { ...followUp, actionButtons: btns };
                                    updateActions(newActions);
                                  }
                                }}
                                className={cn("flex-1 bg-transparent border-none outline-none text-[9px] font-medium", darkMode ? "text-emerald-400 placeholder:text-white/10" : "text-emerald-600 placeholder:text-gray-300")}
                              />
                            </div>
                          </div>
                        ))}
                        
                        {(followUpAction?.actionButtons || []).length < 3 && (
                          <button
                            onClick={() => {
                              const newActions = [...actions];
                              const idx = newActions.findIndex(a => a.type === 'follow_up');
                              if (idx >= 0) {
                                const followUp = { ...newActions[idx] } as FollowUpAction;
                                const btns = [...(followUp.actionButtons || []), { id: Math.random().toString(36).substr(2, 9), text: '', url: '', buttonType: 'web_url' } as ActionButton];
                                newActions[idx] = { ...followUp, actionButtons: btns };
                                updateActions(newActions);
                              }
                            }}
                            className={cn("p-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all group", darkMode ? "bg-white/[0.02] border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5" : "bg-gray-50/50 border-gray-100 hover:border-emerald-500/50 hover:bg-emerald-50/50")}
                          >
                            <Plus size={14} className={cn("transition-colors", darkMode ? "text-white/20 group-hover:text-emerald-400" : "text-gray-400 group-hover:text-emerald-500")} />
                            <span className={cn("text-[10px] font-black uppercase tracking-wider transition-colors", darkMode ? "text-white/20 group-hover:text-emerald-400" : "text-gray-400 group-hover:text-emerald-500")}>Add Button</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ===== BOTTOM BAR ===== */}
      <div className={cn(
        "mt-8 pt-6 pb-20 md:pb-0 flex items-center justify-between transition-all duration-500",
        darkMode ? "border-t border-white/10" : "border-t border-gray-100"
      )}>
        {onBack ? (
          <button
            onClick={onBack}
            className={cn("font-bold text-sm flex items-center gap-1 transition-colors", darkMode ? "text-white/40 hover:text-white" : "text-gray-500 hover:text-gray-700")}
          >
            ← Back
          </button>
        ) : <div />}

        <div className="flex items-center gap-4">
          {!canSave && (
            <div className="flex items-center gap-1.5 text-orange-500">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">Complete all required fields</span>
            </div>
          )}
          <button
            onClick={onSave}
            disabled={!canSave || saving || readOnly}
            className={cn(
              "px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-2 transition-all shadow-lg",
              canSave && !readOnly
                ? (darkMode ? `bg-gradient-to-r ${isPremium ? 'from-indigo-600 to-violet-700 shadow-indigo-500/50' : 'from-blue-500 to-purple-600 shadow-purple-500/50'} text-white hover:brightness-110 border-transparent` : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-md shadow-purple-500/20")
                : (darkMode ? "bg-white/5 text-white/20" : "bg-gray-100 text-gray-400")
            )}
          >
            {saving ? 'Saving...' : 'Launch Automation'}
          </button>
        </div>

        {!canSave && !saving && !readOnly && (
          <div className="flex justify-center -mt-4 mb-20">
            <p className={cn(
              "text-[10px] font-black uppercase tracking-[0.2em] animate-pulse px-4 py-1.5 rounded-full border shadow-sm",
              darkMode
                ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                : "bg-orange-50 text-orange-600 border-orange-200"
            )}>
              {!isReplyValid ? 'Add a reply template' :
                !isDmValid ? 'Finish DM configuration' :
                  !isFollowUpValid ? 'Complete follow up message' :
                    'Check action settings'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
