import { useState, useEffect } from 'react';

import { MessageSquare, Mail, Image as ImageIcon, X, Pencil, Tag, Search, Send, CheckCircle2, Plus, Trash2, AlertCircle, ChevronDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  AutomationFormData, TriggerConfig,
  PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig,
  Action, ReplyToCommentAction, SendDmAction
} from '../../types/automation';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
import { useTheme } from '../../contexts/ThemeContext';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';


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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerType]);

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
    const isPost = triggerType === 'post_comment';
    const key = isPost ? 'specificPosts' : 'specificStories';
    const postsTypeKey = isPost ? 'postsType' : 'storiesType';
    updateConfig({ [key]: [pendingMediaId], [postsTypeKey]: 'specific' } as any);
    setEditingPosts(false);
  };

  // --- Automated media fetching ---
  useEffect(() => {
    if (triggerType === 'post_comment' || triggerType === 'story_reply') {
      fetchMedia(triggerType === 'post_comment' ? 'posts' : 'stories');
    }
  }, [triggerType]); // Dependencies: trigger type

  // --- Actions ---
  const hasReply = actions.some(a => a.type === 'reply_to_comment');
  const hasDm = actions.some(a => a.type === 'send_dm');
  const dmAction = actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
  const replyAction = actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;
  const hasFollowGate = dmAction?.askToFollow || false;

  const updateActions = (newActions: Action[]) => {
    if (readOnly) return;
    setFormData({ ...formData, actions: newActions });
  };

  const toggleReply = () => {
    if (readOnly) return;
    if (hasReply) updateActions(actions.filter(a => a.type !== 'reply_to_comment'));
    else updateActions([...actions, {
      type: 'reply_to_comment',
      replyTemplates: [
        'Check your DMs for the link! 👆',
        'Done! Please check your direct messages ✨',
        'Sent! You\'ll find the link in your DMs 📩',
        'Just sent you a DM with all the details! 🚀'
      ],
      actionButtons: []
    } as ReplyToCommentAction]);
  };

  const addDmFlow = () => {
    if (readOnly || hasDm) return;
    updateActions([...actions, {
      type: 'send_dm',
      title: 'Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨',
      imageUrl: '',
      subtitle: 'Powered By Quickrevert.tech',
      messageTemplate: '',
      actionButtons: [],
      askToFollow: false,
      showImage: false
    } as SendDmAction]);
  };

  const removeDmFlow = () => {
    if (readOnly) return;
    updateActions(actions.filter(a => a.type !== 'send_dm'));
  };

  useEffect(() => {
    if (triggerType !== 'post_comment' && hasFollowGate) {
      updateActions(actions.map(a => a.type === 'send_dm' ? { ...a, askToFollow: false } : a));
    }
  }, [triggerType, hasFollowGate]);

  const toggleFollowGate = () => {
    if (readOnly) return;
    if (!canUseAskToFollow) { openModal(); return; }
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
    ? (dmAction.title || '').trim().length > 0 && 
      dmAction.actionButtons.every(btn => btn.text.trim().length > 0 && /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url || ''))
    : true;
  const canSave = actions.length > 0 && isReplyValid && isDmValid;
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

      {/* ===== SECTION: What do you want to reply? (always visible for post_comment) ===== */}
      {triggerType === 'post_comment' && (
        <>
          <h3 className={cn("text-base font-bold mb-3 transition-colors", darkMode ? "text-white" : "text-gray-900")}>What do you want to reply to those comments?</h3>

          {/* Comment Reply Templates — always visible card */}
          <div className={cn(
            "rounded-2xl overflow-hidden mb-4 transition-all duration-300",
            darkMode ? "bg-black border border-white/10" : "border border-gray-200"
          )}>
            <div className={cn(
              "flex items-center gap-3 px-5 py-4 transition-colors",
              darkMode ? "border-b border-white/5" : "border-b border-gray-100"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                darkMode ? "bg-white/10 text-white" : "bg-purple-100 text-purple-600"
              )}>
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className={cn("font-bold text-sm flex-1 transition-colors", darkMode ? "text-white" : "text-gray-900")}>Comment Reply Templates</span>
              {hasReply && !readOnly && (
                <button
                  onClick={toggleReply}
                  className={cn("transition-colors", darkMode ? "text-white/40 hover:text-red-400" : "text-gray-900 hover:text-red-500")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {hasReply && replyAction ? (
              <div className="px-5 py-4 space-y-3">
                {replyAction.replyTemplates.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={t}
                      onChange={(e) => { const n = [...replyAction.replyTemplates]; n[i] = e.target.value; updateReplyAction({ replyTemplates: n }); }}
                      disabled={readOnly}
                      className={cn(
                        "flex-1 rounded-xl px-4 py-2.5 outline-none font-bold text-base transition-all",
                        darkMode
                          ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                          : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-300"
                      )}
                      placeholder="e.g., Check your DMs for the link! 👆"
                    />
                    {replyAction.replyTemplates.length > 1 && !readOnly && (
                      <button
                        onClick={() => updateReplyAction({ replyTemplates: replyAction.replyTemplates.filter((_, idx) => idx !== i) })}
                        className={cn("transition-colors font-bold", darkMode ? "text-white/20 hover:text-red-400" : "text-gray-300 hover:text-red-400")}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && replyAction.replyTemplates.length < 5 && (
                  <button
                    onClick={() => updateReplyAction({ replyTemplates: [...replyAction.replyTemplates, ''] })}
                    className={cn("font-bold text-sm flex items-center gap-1 transition-colors", darkMode ? "text-blue-400 hover:text-blue-300" : "text-purple-600 hover:text-purple-700")}
                  >
                    <Plus size={14} /> Add variation
                  </button>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  "px-5 py-6 flex flex-col items-center gap-2 cursor-pointer transition-colors",
                  darkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
                )}
                onClick={toggleReply}
              >
                <MessageSquare className={cn("w-6 h-6 transition-colors", darkMode ? "text-white" : "text-gray-300")} />
                <span className={cn("text-sm font-bold transition-colors", darkMode ? "text-white" : "text-gray-400")}>Setup Comment Replies</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Follow Gate — inline toggle */}
      {triggerType === 'post_comment' && (
        <>
          <div className={cn(
            "rounded-2xl border transition-all overflow-hidden mb-4",
            hasFollowGate
              ? (darkMode ? "border-white/10 bg-white/5" : "border-purple-200 bg-purple-50/10")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-200 bg-white")
          )}>
            <div
              className={cn(
                "flex items-center gap-3 py-4 px-5 cursor-pointer transition-colors",
                darkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
              )}
              onClick={toggleFollowGate}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center pointer-events-none transition-colors",
                darkMode ? "bg-white/10" : "bg-gray-100"
              )}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={darkMode ? "text-white" : "text-gray-500"}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
              </div>
              <div className="flex-1 pointer-events-none">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("font-bold text-sm transition-colors", darkMode ? "text-white" : "text-gray-900")}>Ask To Follow</span>
                  <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase">Recommended</span>
                  {!canUseAskToFollow && <span className="bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase">Premium</span>}
                </div>
                <p className={cn("text-xs font-bold mt-0.5 transition-colors", darkMode ? "text-white/20" : "text-gray-400")}>Require users to follow you before they can access your automation</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasFollowGate} readOnly />
                <div className={cn(
                  "w-11 h-6 rounded-full transition-all peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all shadow-inner",
                  darkMode
                    ? "bg-white/10 peer-checked:bg-white"
                    : "bg-gray-200 peer-checked:bg-purple-600",
                  darkMode && (hasFollowGate ? "after:bg-black" : "")
                )}></div>
              </label>
            </div>

            {/* Follow Gate Expanded config */}
            <AnimatePresence>
              {hasFollowGate && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                  <div className={cn(
                    "p-4 rounded-xl space-y-4 transition-colors",
                    darkMode ? "bg-white/5 border border-white/5" : "bg-white border border-gray-100 shadow-sm"
                  )}>
                    <div className="space-y-1.5">
                      <label className={cn("text-xs font-bold transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Initial Teaser Message</label>
                      <textarea
                        value={dmAction?.teaserMessage || ''}
                        onChange={(e) => updateDmAction({ teaserMessage: e.target.value })}
                        disabled={readOnly}
                        rows={2}
                        className={cn(
                          "w-full rounded-xl px-4 py-2.5 outline-none font-bold text-base transition-all resize-none",
                          darkMode
                            ? "bg-black border-2 border-white/10 text-white focus:border-white/20"
                            : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900"
                        )}
                      />
                      <label className={cn("text-xs font-bold block mt-2 transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Teaser Button Text</label>
                      <input
                        type="text"
                        value={dmAction?.teaserBtnText || ''}
                        onChange={(e) => updateDmAction({ teaserBtnText: e.target.value })}
                        disabled={readOnly}
                        placeholder="e.g. Verify Follow 🔗"
                        className={cn(
                          "w-full rounded-xl px-4 py-2.5 outline-none font-bold text-base transition-all",
                          darkMode
                            ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                            : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900"
                        )}
                      />
                    </div>
                    <div className={cn("space-y-1.5 pt-6 mt-6 border-t border-dashed", darkMode ? "border-white/5" : "border-gray-100")}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <label className={cn("text-xs font-bold transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Verification Failed (Not Following)</label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className={cn("w-4 h-4 cursor-help transition-colors", darkMode ? "text-white/40 hover:text-white/60" : "text-slate-400 hover:text-slate-600")} />
                          </TooltipTrigger>
                          <TooltipContent side="right">This message is sent to users who click the button but aren't following you yet.</TooltipContent>
                        </Tooltip>
                      </div>
                      <textarea
                        value={dmAction?.askToFollowMessage || ''}
                        onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })}
                        disabled={readOnly}
                        rows={2}
                        className={cn(
                          "w-full rounded-xl px-4 py-2.5 outline-none font-bold text-base transition-all resize-none",
                          darkMode
                            ? "bg-black border-2 border-white/10 text-white focus:border-white/20"
                            : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900"
                        )}
                      />
                      <label className={cn("text-xs font-bold block mt-2 transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Verification Button Text</label>
                      <input
                        type="text"
                        value={dmAction?.askToFollowBtnText || ''}
                        onChange={(e) => updateDmAction({ askToFollowBtnText: e.target.value })}
                        disabled={readOnly}
                        placeholder="e.g. I've Followed! ✅"
                        className={cn(
                          "w-full rounded-xl px-4 py-2.5 outline-none font-bold text-base transition-all",
                          darkMode
                            ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                            : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900"
                        )}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <GradientLine />
        </>
      )}

      {/* ===== SECTION: Response Flow (DM config) ===== */}
      <div className="mb-6">
        {!hasDm ? (
          <div
            className={cn(
              "rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all",
              darkMode
                ? "bg-black border border-white/10 hover:bg-white/5"
                : "border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50/20"
            )}
            onClick={addDmFlow}
          >
            <Send className={cn("w-7 h-7 transition-colors", darkMode ? "text-white" : "text-gray-300")} />
            <span className={cn("text-sm font-bold transition-colors", darkMode ? "text-white" : "text-gray-400")}>Setup Response Flow</span>
            <span className={cn("text-xs font-bold transition-colors", darkMode ? "text-white/60" : "text-gray-300")}>Configure automated DM responses</span>
          </div>
        ) : (
          <>
            {/* Response Flow Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all",
                darkMode ? "bg-white text-black" : "bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-purple-200"
              )}>
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className={cn("text-base font-bold transition-colors", darkMode ? "text-white" : "text-gray-900")}>Response Flow</h3>
                <p className={cn("text-xs font-bold transition-colors", darkMode ? "text-white/20" : "text-gray-400")}>Configure automated DM responses</p>
              </div>
            </div>

            {/* DM Card — always expanded */}
            <div className={cn(
              "rounded-2xl overflow-hidden transition-all duration-300",
              darkMode ? "bg-white/5 border border-white/10" : "border border-gray-200"
            )}>
              <div className="px-5 py-5 space-y-5">
                <div className="flex items-center justify-between">
                  <p className={cn("text-xs font-black uppercase tracking-widest transition-colors", darkMode ? "text-white/40" : "text-gray-500")}>Message</p>
                  {!readOnly && (
                    <button
                      onClick={removeDmFlow}
                      className={cn("transition-colors", darkMode ? "text-white/40 hover:text-red-400" : "text-gray-900 hover:text-red-500")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className={cn("text-xs font-bold transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Simple Text Message</label>
                  <textarea
                    value={dmAction?.title || ''}
                    onChange={(e) => updateDmAction({ title: e.target.value })}
                    disabled={readOnly}
                    rows={4}
                    placeholder="e.g. Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨"
                    className={cn(
                      "w-full rounded-xl px-4 py-3 outline-none font-bold text-base transition-all resize-none",
                      darkMode
                        ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                        : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-300"
                    )}
                  />
                  <p className={cn("text-right text-[11px] font-black transition-colors", darkMode ? "text-white/20" : "text-gray-400")}>{(dmAction?.title || '').length}/640</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={cn("text-xs font-bold transition-colors", darkMode ? "text-white/40" : "text-gray-600")}>Include Image</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={dmAction?.showImage || false}
                        onChange={(e) => updateDmAction({ showImage: e.target.checked })}
                        disabled={readOnly}
                      />
                      <div className={cn(
                        "w-9 h-5 rounded-full transition-all peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all shadow-inner",
                        darkMode ? "bg-white/10 peer-checked:bg-white" : "bg-gray-200 peer-checked:bg-purple-600",
                        darkMode && (dmAction?.showImage ? "after:bg-black" : "")
                      )}></div>
                    </label>
                  </div>

                  <AnimatePresence>
                    {dmAction?.showImage && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="pt-1">
                          <input
                            type="url"
                            value={dmAction?.imageUrl || ''}
                            onChange={(e) => updateDmAction({ imageUrl: e.target.value })}
                            disabled={readOnly}
                            placeholder="https://example.com/promo.jpg"
                            className={cn(
                              "w-full rounded-xl px-4 py-2.5 outline-none font-bold text-sm transition-all",
                              darkMode
                                ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                                : "border-2 border-gray-100 focus:border-purple-400 bg-gray-50 focus:bg-white text-gray-900"
                            )}
                          />
                          <p className={cn("text-[10px] mt-1 font-bold italic transition-colors", darkMode ? "text-white/20" : "text-gray-400")}>Make sure the URL is public and ends in .jpg, .png, etc.</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Buttons */}
                {dmAction?.actionButtons && dmAction.actionButtons.length > 0 && (
                  <div className="space-y-2">
                    {dmAction.actionButtons.map((btn, i) => (
                      <div key={i} className={cn(
                        "flex flex-col gap-2 p-3 rounded-xl transition-colors",
                        darkMode ? "bg-black border border-white/10" : "bg-gray-50 border border-gray-200"
                      )}>
                        <div className="flex justify-between items-center">
                          <span className={cn("text-[10px] font-black transition-colors uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-500")}>Button {i + 1}</span>
                          {!readOnly && (
                            <button
                              onClick={() => updateDmAction({ actionButtons: dmAction.actionButtons.filter((_, idx) => idx !== i) })}
                              className={cn("transition-colors", darkMode ? "text-white/40 hover:text-red-400" : "text-gray-900 hover:text-red-500")}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Button Text"
                          value={btn.text}
                          onChange={(e) => { const btns = [...dmAction.actionButtons]; btns[i].text = e.target.value; updateDmAction({ actionButtons: btns }); }}
                          className={cn(
                            "w-full rounded-lg px-3 py-1.5 outline-none font-bold text-base transition-all",
                            darkMode
                              ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                              : "border-2 border-gray-200 focus:border-purple-500 text-gray-900"
                          )}
                        />
                        <div className="relative">
                          <input
                            type="url"
                            placeholder="URL Link"
                            value={btn.url}
                            onChange={(e) => { const btns = [...dmAction.actionButtons]; btns[i].url = e.target.value; updateDmAction({ actionButtons: btns }); }}
                            className={cn(
                              "w-full rounded-lg px-3 py-1.5 outline-none font-bold text-base transition-all",
                              darkMode
                                ? "bg-black border-2 border-white/10 text-white placeholder:text-white/20 focus:border-white/20"
                                : "border-2 border-gray-200 focus:border-purple-500 text-gray-900",
                              btn.url && !/^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url) ? '!border-red-500' : ''
                            )}
                          />
                          {btn.url && !/^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url) && (
                            <p className="text-[10px] text-red-500 font-bold mt-1">Invalid URL</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                  <button
                    onClick={() => updateDmAction({ actionButtons: [...(dmAction?.actionButtons || []), { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })}
                    className={cn(
                      "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                      darkMode
                        ? (isPremium ? "bg-black border-2 border-dashed border-indigo-500/50 text-white hover:border-indigo-400 hover:bg-indigo-500/10" : "bg-black border-2 border-dashed border-blue-500/50 text-white hover:border-blue-400 hover:bg-blue-500/10")
                        : "border-2 border-dotted border-gray-400 text-gray-400 hover:border-purple-300 hover:text-purple-500 hover:bg-purple-50/30"
                    )}
                  >
                    <Plus className="w-4 h-4" /> Add Button (Optional)
                  </button>
                )}

                <p className={cn("text-center text-[10px] font-black uppercase tracking-widest pt-2 transition-colors", darkMode ? "text-white/30" : "text-gray-300")}>Powered by QuickRevert.tech</p>
              </div>
            </div>
          </>
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
      </div>
    </div>
  );
}
