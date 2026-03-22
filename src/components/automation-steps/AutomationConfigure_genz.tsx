import { useState } from 'react';

import { MessageSquare, Mail, Image as ImageIcon, X, Pencil, Globe, Target, Tag, Search, Send, Loader2, CheckCircle2, Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AutomationFormData, TriggerConfig,
  PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig,
  Action, ReplyToCommentAction, SendDmAction
} from '../../types/automation';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
import { motion, AnimatePresence } from 'motion/react';

const DEFAULT_TEASER_MESSAGE = "Hey there! I'm so happy you're here... Click below and I'll send you the link in just a sec ✨";
const DEFAULT_NOT_FOLLOWING_MESSAGE = "Oops! Looks like you haven't followed me yet 👀...";
const DEFAULT_TEASER_BTN_TEXT = "Send Access";
const DEFAULT_VERIFY_BTN_TEXT = "I've Followed! ✅";

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
const GradientLine = () => (
  <div className="w-full h-[3px] bg-gradient-to-r from-purple-500 via-blue-400 to-orange-400 rounded-full my-6" />
);

export default function AutomationConfigureGenz({ formData, setFormData, onSave, saving, readOnly, onBack }: AutomationConfigureGenzProps) {
  const { isPremium, canUseAskToFollow } = useSubscription();
  const { openModal } = useUpgradeModal();

  const [editingPosts, setEditingPosts] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const triggerType = formData.triggerType!;
  const triggerConfig = formData.triggerConfig;
  const actions = formData.actions;

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
    if (triggerType === 'post_comment') return (triggerConfig as PostCommentTriggerConfig)?.postsType || 'all';
    if (triggerType === 'story_reply') return (triggerConfig as StoryReplyTriggerConfig)?.storiesType || 'all';
    return 'all';
  };

  const getPostsLabel = () => {
    const t = getPostsType();
    if (triggerType === 'post_comment') return t === 'all' ? 'All Posts and Reels' : 'Specific Posts';
    if (triggerType === 'story_reply') return t === 'all' ? 'All Stories' : 'Specific Stories';
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
    const isPost = triggerType === 'post_comment';
    const key = isPost ? 'specificPosts' : 'specificStories';
    const current = isPost
      ? (triggerConfig as PostCommentTriggerConfig)?.specificPosts || []
      : (triggerConfig as StoryReplyTriggerConfig)?.specificStories || [];
    const updated = current.includes(mediaId) ? current.filter(id => id !== mediaId) : [...current, mediaId];
    updateConfig({ [key]: updated } as any);
  };

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
    else updateActions([...actions, { type: 'reply_to_comment', replyTemplates: [''], actionButtons: [] } as ReplyToCommentAction]);
  };

  const addDmFlow = () => {
    if (readOnly || hasDm) return;
    updateActions([...actions, { type: 'send_dm', title: '', imageUrl: '', subtitle: 'Powered By Quickrevert.tech', messageTemplate: '', actionButtons: [], askToFollow: false } as SendDmAction]);
  };

  const removeDmFlow = () => {
    if (readOnly) return;
    updateActions(actions.filter(a => a.type !== 'send_dm'));
  };

  const toggleFollowGate = () => {
    if (readOnly) return;
    if (!canUseAskToFollow) { openModal(); return; }
    if (!hasDm) {
      updateActions([...actions, { type: 'send_dm', title: '', imageUrl: '', subtitle: 'Powered By Quickrevert.tech', messageTemplate: '', actionButtons: [], askToFollow: true, teaserMessage: DEFAULT_TEASER_MESSAGE, askToFollowMessage: DEFAULT_NOT_FOLLOWING_MESSAGE, teaserBtnText: DEFAULT_TEASER_BTN_TEXT, askToFollowBtnText: DEFAULT_VERIFY_BTN_TEXT } as SendDmAction]);
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

  const canSave = actions.length > 0;
  const TriggerIcon = getTriggerIcon();

  return (
    <div className="max-w-4xl mx-auto pb-32">

      {/* ===== TRIGGER HEADER ===== */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-200">
          <TriggerIcon className="w-5 h-5 text-white" />
        </div>
        <span className="text-base font-semibold text-gray-700 flex-1">{getTriggerLabel()}</span>
        {!readOnly && onBack && (
          <button onClick={onBack} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      <GradientLine />

      {/* ===== SECTION: Which Post/Reel (post_comment / story_reply only) ===== */}
      {(triggerType === 'post_comment' || triggerType === 'story_reply') && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">
              {triggerType === 'post_comment' ? 'Which Post or Reel do you want to use?' : 'Which Story do you want to use?'}
            </h3>
            {!readOnly && (
              <button onClick={() => { setEditingPosts(!editingPosts); if (!editingPosts && getPostsType() === 'specific') fetchMedia(triggerType === 'post_comment' ? 'posts' : 'stories'); }} className="text-purple-600 font-semibold text-sm flex items-center gap-1 hover:text-purple-700">
                Edit <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {editingPosts ? (
            <div className="space-y-3 mb-2">
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => setPostsType('all')} className={`flex-1 p-4 rounded-xl border-2 text-sm font-bold transition-all ${getPostsType() === 'all' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-200'}`}>
                  <Globe className="w-5 h-5 mx-auto mb-2" />
                  {triggerType === 'post_comment' ? 'All Posts & Reels' : 'All Stories'}
                </button>
                <button onClick={() => { setPostsType('specific'); fetchMedia(triggerType === 'post_comment' ? 'posts' : 'stories'); }} className={`flex-1 p-4 rounded-xl border-2 text-sm font-bold transition-all ${getPostsType() === 'specific' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-200'}`}>
                  <Target className="w-5 h-5 mx-auto mb-2" />
                  Specific Posts
                </button>
              </div>
              {getPostsType() === 'specific' && (
                <div className="border-2 border-gray-100 rounded-xl p-3 md:p-4 bg-gray-50/50">
                  {loadingMedia ? (
                    <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
                  ) : (
                    <div className="max-h-[310px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-2 gap-2 auto-rows-[1fr]">
                        {posts.map(post => {
                          const specificIds = triggerType === 'post_comment' ? (triggerConfig as PostCommentTriggerConfig)?.specificPosts || [] : (triggerConfig as StoryReplyTriggerConfig)?.specificStories || [];
                          const isSelected = specificIds.includes(post.id);
                          return (
                            <div key={post.id} onClick={() => toggleMediaSelection(post.id)} className={`relative w-full overflow-hidden cursor-pointer rounded-xl border-2 transition-all ${isSelected ? 'border-purple-600' : 'border-transparent hover:border-purple-200'}`} style={{ WebkitTransform: 'translateZ(0)' }}>
                              <div className="w-full relative">
                                <div className="pt-[100%]" />
                                <div className="absolute inset-0">
                                  {post.media_type === 'VIDEO' ? <video src={post.media_url} poster={post.thumbnail_url} autoPlay loop muted playsInline className="w-full h-full object-cover" /> : <img src={post.media_url} alt="" className="w-full h-full object-cover" />}
                                  {isSelected && <div className="absolute top-1 right-1 bg-purple-600 text-white p-0.5 rounded-md z-10"><CheckCircle2 size={12} /></div>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-5 text-center mb-2 cursor-pointer hover:border-purple-300 hover:bg-purple-50/20 transition-all" onClick={() => setEditingPosts(true)}>
              <span className="text-sm font-semibold text-gray-500">{getPostsLabel()}</span>
            </div>
          )}

          <GradientLine />
        </>
      )}

      {/* ===== SECTION: Keywords ===== */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-gray-900">What keywords will start your automation?</h3>
        {!readOnly && (
          <button onClick={() => setEditingKeywords(!editingKeywords)} className="text-purple-600 font-semibold text-sm flex items-center gap-1 hover:text-purple-700">
            Edit <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {editingKeywords ? (
        <div className="space-y-4 mb-2">
          <div className="flex gap-3">
            <button onClick={() => setKeywordType('all')} className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all ${getKeywordType() === 'all' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-200'}`}>Any message works</button>
            <button onClick={() => setKeywordType('keywords')} className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all ${getKeywordType() === 'keywords' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-200'}`}>Only specific keywords</button>
          </div>
          {getKeywordType() === 'keywords' && (
            <div className="space-y-3 p-4 border-2 border-gray-100 rounded-xl bg-gray-50/50">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }} placeholder="Add a keyword (e.g. LINK)" className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white focus:border-purple-500 text-base text-gray-800 outline-none font-medium" />
                </div>
                <button onClick={addKeyword} className="px-4 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-md">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {getKeywords().map((kw, i) => (
                  <span key={i} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-purple-100 border border-purple-200 rounded-full text-xs font-bold text-purple-700">
                    {kw}
                    {!readOnly && <button onClick={() => removeKeyword(i)} className="p-0.5 rounded-full text-purple-400 hover:text-red-500"><X size={12} strokeWidth={3} /></button>}
                  </span>
                ))}
                {getKeywords().length === 0 && <span className="text-xs text-gray-400 italic">No keywords added yet</span>}
              </div>
            </div>
          )}
          {/* Cooldown (DM triggers only) */}
          {triggerType === 'user_directed_messages' && (
            <div className="p-4 border-2 border-gray-100 rounded-xl bg-gray-50/50 space-y-3">
              <div className="flex items-center justify-between cursor-pointer" onClick={handleCooldownToggle}>
                <div>
                  <h4 className="font-bold text-sm text-gray-900">Cooldown Period</h4>
                  <p className="text-xs text-gray-400">Wait before replying to the same user again</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={dmTriggerConfig?.cooldownEnabled || false} readOnly />
                  <div className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
                </label>
              </div>
              {dmTriggerConfig?.cooldownEnabled && (
                <select value={dmTriggerConfig?.cooldownDuration || 3600000} onChange={(e) => updateConfig({ cooldownDuration: Number(e.target.value) } as any)} className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-semibold text-sm appearance-none bg-white">
                  {COOLDOWN_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-300 hover:bg-purple-50/20 transition-all mb-2" onClick={() => setEditingKeywords(true)}>
          <Tag className="w-7 h-7 text-gray-300" />
          <span className="text-sm font-semibold text-gray-400">Setup Keywords</span>
        </div>
      )}

      <GradientLine />

      {/* ===== SECTION: What do you want to reply? (always visible for post_comment) ===== */}
      {triggerType === 'post_comment' && (
        <>
          <h3 className="text-base font-bold text-gray-900 mb-3">What do you want to reply to those comments?</h3>

          {/* Comment Reply Templates — always visible card */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden mb-4">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-purple-600" />
              </div>
              <span className="font-bold text-sm text-gray-900 flex-1">Comment Reply Templates</span>
              {hasReply && !readOnly && (
                <button onClick={toggleReply} className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            {hasReply && replyAction ? (
              <div className="px-5 py-4 space-y-3">
                {replyAction.replyTemplates.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={t} onChange={(e) => { const n = [...replyAction.replyTemplates]; n[i] = e.target.value; updateReplyAction({ replyTemplates: n }); }} disabled={readOnly} className="flex-1 border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-base bg-gray-50 focus:bg-white transition-all" placeholder="e.g., Check your DMs for the link! 👆" />
                    {replyAction.replyTemplates.length > 1 && !readOnly && <button onClick={() => updateReplyAction({ replyTemplates: replyAction.replyTemplates.filter((_, idx) => idx !== i) })} className="text-gray-300 hover:text-red-400 transition-colors"><X size={18} /></button>}
                  </div>
                ))}
                {!readOnly && replyAction.replyTemplates.length < 5 && (
                  <button onClick={() => updateReplyAction({ replyTemplates: [...replyAction.replyTemplates, ''] })} className="text-purple-600 font-bold text-sm flex items-center gap-1 hover:text-purple-700"><Plus size={14} /> Add variation</button>
                )}
              </div>
            ) : (
              <div className="px-5 py-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors" onClick={toggleReply}>
                <MessageSquare className="w-6 h-6 text-gray-300" />
                <span className="text-sm font-semibold text-gray-400">Setup Comment Replies</span>
              </div>
            )}
          </div>

        </>
      )}

      {/* Follow Gate — inline toggle */}
      {triggerType !== 'user_directed_messages' && (
        <>
          <div className={`rounded-2xl border transition-all overflow-hidden mb-4 ${hasFollowGate ? 'border-purple-200 bg-purple-50/10' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-3 py-4 px-5 cursor-pointer hover:bg-gray-50 transition-colors" onClick={toggleFollowGate}>
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              </div>
              <div className="flex-1 pointer-events-none">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-gray-900">Ask To Follow</span>
                  <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">Recommended</span>
                  {!canUseAskToFollow && <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">Premium</span>}
                </div>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Require users to follow you before they can access your automation</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasFollowGate} readOnly />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
              </label>
            </div>

            {/* Follow Gate Expanded config */}
            <AnimatePresence>
              {hasFollowGate && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                     <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-gray-600">Initial Teaser Message</label>
                       <textarea
                         value={dmAction?.teaserMessage || ''}
                         onChange={(e) => updateDmAction({ teaserMessage: e.target.value })}
                         disabled={readOnly}
                         rows={2}
                         className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-base bg-gray-50 focus:bg-white transition-all resize-none"
                       />
                       <label className="text-xs font-semibold text-gray-600 block mt-2">Teaser Button Text</label>
                       <input
                         type="text"
                         value={dmAction?.teaserBtnText || ''}
                         onChange={(e) => updateDmAction({ teaserBtnText: e.target.value })}
                         disabled={readOnly}
                         placeholder="e.g. Verify Follow 🔗"
                         className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-base bg-gray-50 focus:bg-white transition-all"
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-xs font-semibold text-gray-600">Verification Failed (Not Following)</label>
                       <textarea
                         value={dmAction?.askToFollowMessage || ''}
                         onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })}
                         disabled={readOnly}
                         rows={2}
                         className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-base bg-gray-50 focus:bg-white transition-all resize-none"
                       />
                       <label className="text-xs font-semibold text-gray-600 block mt-2">Verification Button Text</label>
                       <input
                         type="text"
                         value={dmAction?.askToFollowBtnText || ''}
                         onChange={(e) => updateDmAction({ askToFollowBtnText: e.target.value })}
                         disabled={readOnly}
                         placeholder="e.g. I've Followed! ✅"
                         className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-base bg-gray-50 focus:bg-white transition-all"
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
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-300 hover:bg-purple-50/20 transition-all" onClick={addDmFlow}>
            <Send className="w-7 h-7 text-gray-300" />
            <span className="text-sm font-semibold text-gray-400">Setup Response Flow</span>
            <span className="text-xs text-gray-300 font-medium">Configure automated DM responses</span>
          </div>
        ) : (
          <>
            {/* Response Flow Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200">
                <Send className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Response Flow</h3>
                <p className="text-xs text-gray-400 font-medium">Configure automated DM responses</p>
              </div>
            </div>

            {/* DM Card — always expanded */}
            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-5 space-y-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Message</p>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Simple Text Message</label>
                  <textarea
                    value={dmAction?.title || ''}
                    onChange={(e) => updateDmAction({ title: e.target.value })}
                    disabled={readOnly}
                    rows={4}
                    placeholder="Hey! Thanks for your comment so much. Here is the link you asked for..."
                    className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-3 outline-none text-gray-900 font-medium text-base bg-gray-50 focus:bg-white transition-all resize-none"
                  />
                  <p className="text-right text-[11px] text-gray-400 font-bold">{(dmAction?.title || '').length}/640</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Image URL (optional)</label>
                  <input
                    type="url"
                    value={dmAction?.imageUrl || ''}
                    onChange={(e) => updateDmAction({ imageUrl: e.target.value })}
                    disabled={readOnly}
                    placeholder="https://example.com/promo.jpg"
                    className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm bg-gray-50 focus:bg-white transition-all"
                  />
                </div>

                {/* Buttons */}
                {dmAction?.actionButtons && dmAction.actionButtons.length > 0 && (
                  <div className="space-y-2">
                    {dmAction.actionButtons.map((btn, i) => (
                      <div key={i} className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-gray-500">Button {i + 1}</span>
                          {!readOnly && <button onClick={() => updateDmAction({ actionButtons: dmAction.actionButtons.filter((_, idx) => idx !== i) })} className="text-gray-400 hover:text-red-500"><X size={14} /></button>}
                        </div>
                        <input type="text" placeholder="Button Text" value={btn.text} onChange={(e) => { const btns = [...dmAction.actionButtons]; btns[i].text = e.target.value; updateDmAction({ actionButtons: btns }); }} className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-3 py-1.5 outline-none text-gray-900 font-medium text-base" />
                        <input type="url" placeholder="URL Link" value={btn.url} onChange={(e) => { const btns = [...dmAction.actionButtons]; btns[i].url = e.target.value; updateDmAction({ actionButtons: btns }); }} className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-3 py-1.5 outline-none text-gray-900 font-medium text-base" />
                      </div>
                    ))}
                  </div>
                )}

                {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                  <button onClick={() => updateDmAction({ actionButtons: [...(dmAction?.actionButtons || []), { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-semibold text-sm hover:border-purple-300 hover:text-purple-500 hover:bg-purple-50/30 transition-all flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Button (Optional)
                  </button>
                )}

                <p className="text-center text-[10px] font-bold text-gray-300 uppercase tracking-widest pt-2">Powered by QuickRevert.tech</p>
              </div>
            </div>

            {/* Remove Response Flow */}
            {!readOnly && (
              <button onClick={removeDmFlow} className="flex items-center gap-1.5 mt-3 text-gray-400 hover:text-red-400 font-medium text-xs transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Remove Response Flow
              </button>
            )}
          </>
        )}
      </div>

      {/* ===== BOTTOM BAR ===== */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-6 py-4 z-20 flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-gray-500 font-semibold text-sm hover:text-gray-700 flex items-center gap-1">← Back</button>
        ) : <div />}

        <div className="flex items-center gap-4">
          {!canSave && (
            <div className="flex items-center gap-1.5 text-orange-500">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Complete all required fields</span>
            </div>
          )}
          <button
            onClick={onSave}
            disabled={!canSave || saving || readOnly}
            className={`px-8 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg ${canSave && !readOnly ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white hover:shadow-xl hover:-translate-y-0.5' : 'bg-gray-100 text-gray-400 shadow-none'}`}
          >
            {saving ? 'Saving...' : 'Launch Automation'} 💾
          </button>
        </div>
      </div>
    </div>
  );
}
