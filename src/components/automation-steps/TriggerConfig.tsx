import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Image as ImageIcon, CheckCircle2, Search, Loader2, MessageSquare, Mail, Languages, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { TriggerType, TriggerConfig, PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig } from '../../types/automation';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

interface TriggerConfigProps {
  triggerType: TriggerType;
  config: TriggerConfig | null;
  onConfigChange: (config: TriggerConfig) => void;
  onNext?: () => void | Promise<void>;
  onBack: () => void | Promise<void>;
  isCondensed?: boolean;
  readOnly?: boolean;
}

const getTriggerLabel = (type: TriggerType): string => {
  switch (type) {
    case 'post_comment': return 'User comments on your post or reel';
    case 'story_reply': return 'User replies to your story';
    case 'user_directed_messages': return 'User sends you a DM';
  }
};

const getTriggerIcon = (type: TriggerType) => {
  switch (type) {
    case 'post_comment': return MessageSquare;
    case 'story_reply': return ImageIcon;
    case 'user_directed_messages': return Mail;
  }
};

export default function TriggerConfigStep({ triggerType, config, onConfigChange, onBack, readOnly }: TriggerConfigProps) {
  const { isPremium } = useSubscription();
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [editingPostScope, setEditingPostScope] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState(false);

  useEffect(() => {
    if (triggerType === 'post_comment' && (config as PostCommentTriggerConfig)?.postsType === 'specific') {
      fetchPosts();
    }
  }, [(config as PostCommentTriggerConfig)?.postsType]);

  const fetchPosts = async () => {
    try {
      setLoadingMedia(true);
      const session = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('fetch-instagram-media', {
        headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
        body: { type: 'posts' },
      });
      if (error) throw error;
      setPosts(data.media || []);
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      toast.error('Failed to fetch Instagram posts: ' + (error.message || 'Unknown error'));
    } finally {
      setLoadingMedia(false);
    }
  };

  const togglePostSelection = (postId: string) => {
    if (readOnly) return;
    const newSelection = selectedPosts.includes(postId)
      ? selectedPosts.filter(id => id !== postId)
      : [...selectedPosts, postId];
    setSelectedPosts(newSelection);
    onConfigChange({ ...currentConfig, specificPosts: newSelection } as PostCommentTriggerConfig);
  };

  const getConfig = (): TriggerConfig => {
    if (config) return config;
    if (triggerType === 'post_comment') return { postsType: 'all', commentsType: 'all' } as PostCommentTriggerConfig;
    if (triggerType === 'story_reply') return { storiesType: 'all' } as StoryReplyTriggerConfig;
    return { messageType: 'all' } as UserDirectMessageTriggerConfig;
  };
  const currentConfig = getConfig();

  const handlePostsTypeChange = (postsType: 'all' | 'specific') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, postsType } as PostCommentTriggerConfig;
    if (postsType === 'all') { delete newConfig.specificPosts; } else { newConfig.specificPosts = []; }
    onConfigChange(newConfig);
  };

  const handleCommentsTypeChange = (commentsType: 'all' | 'keywords') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, commentsType } as PostCommentTriggerConfig;
    if (commentsType === 'all') { delete newConfig.keywords; } else { newConfig.keywords = []; }
    onConfigChange(newConfig);
  };

  const handleStoriesTypeChange = (storiesType: 'all' | 'keywords') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, storiesType } as StoryReplyTriggerConfig;
    if (storiesType === 'all') { delete newConfig.keywords; } else { newConfig.keywords = []; }
    onConfigChange(newConfig);
  };

  const handleMessageTypeChange = (messageType: 'all' | 'keywords') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, messageType } as UserDirectMessageTriggerConfig;
    if (messageType === 'all') { delete newConfig.keywords; } else { newConfig.keywords = []; }
    onConfigChange(newConfig);
  };

  const getKeywords = (): string[] => {
    if (triggerType === 'post_comment') return (currentConfig as PostCommentTriggerConfig).keywords || [];
    if (triggerType === 'user_directed_messages') return (currentConfig as UserDirectMessageTriggerConfig).keywords || [];
    if (triggerType === 'story_reply') return (currentConfig as StoryReplyTriggerConfig).keywords || [];
    return [];
  };

  const addKeyword = () => {
    if (!keyword.trim() || readOnly) return;
    if (!isPremium && getKeywords().length >= 2) {
      toast.error("You can only add up to 2 keywords on the basic plan. Upgrade to Premium for unlimited keywords.");
      return;
    }
    if (triggerType === 'post_comment') {
      const cfg = currentConfig as PostCommentTriggerConfig;
      onConfigChange({ ...cfg, keywords: [...(cfg.keywords || []), keyword.trim()] });
    } else if (triggerType === 'user_directed_messages') {
      const cfg = currentConfig as UserDirectMessageTriggerConfig;
      onConfigChange({ ...cfg, keywords: [...(cfg.keywords || []), keyword.trim()] });
    } else if (triggerType === 'story_reply') {
      const cfg = currentConfig as StoryReplyTriggerConfig;
      onConfigChange({ ...cfg, keywords: [...(cfg.keywords || []), keyword.trim()] });
    }
    setKeyword('');
  };

  const removeKeyword = (index: number) => {
    if (readOnly) return;
    if (triggerType === 'post_comment') {
      const cfg = currentConfig as PostCommentTriggerConfig;
      onConfigChange({ ...cfg, keywords: cfg.keywords?.filter((_, i) => i !== index) || [] });
    } else if (triggerType === 'user_directed_messages') {
      const cfg = currentConfig as UserDirectMessageTriggerConfig;
      onConfigChange({ ...cfg, keywords: cfg.keywords?.filter((_, i) => i !== index) || [] });
    } else if (triggerType === 'story_reply') {
      const cfg = currentConfig as StoryReplyTriggerConfig;
      onConfigChange({ ...cfg, keywords: cfg.keywords?.filter((_, i) => i !== index) || [] });
    }
  };

  const TriggerIcon = getTriggerIcon(triggerType);
  const keywordsEnabled = triggerType === 'post_comment'
    ? (currentConfig as PostCommentTriggerConfig).commentsType === 'keywords'
    : triggerType === 'story_reply'
      ? (currentConfig as StoryReplyTriggerConfig).storiesType === 'keywords'
      : (currentConfig as UserDirectMessageTriggerConfig).messageType === 'keywords';

  const postScopeLabel = triggerType === 'post_comment'
    ? ((currentConfig as PostCommentTriggerConfig).postsType === 'specific' ? 'Specific Posts' : 'All Posts and Reels')
    : triggerType === 'story_reply'
      ? 'All Stories'
      : null;

  return (
    <div className="space-y-0">
      {/* Selected Trigger Chip */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-md">
          <TriggerIcon size={20} />
        </div>
        <span className="font-semibold text-slate-700 text-sm flex-1">{getTriggerLabel(triggerType)}</span>
        {!readOnly && (
          <button
            onClick={onBack}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            title="Change trigger"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Gradient progress bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-purple-500 via-blue-500 to-orange-400 rounded-full mb-6"></div>

      <div className="space-y-6">
        {/* Post/Story Scope */}
        {(triggerType === 'post_comment' || triggerType === 'story_reply') && postScopeLabel && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-slate-700 font-medium text-sm">
                {triggerType === 'post_comment' ? 'Which Post or Reel do you want to use?' : 'Which Story do you want to use?'}
              </p>
              {!readOnly && (
                <button
                  onClick={() => setEditingPostScope(!editingPostScope)}
                  className="flex items-center gap-1 text-purple-600 text-xs font-semibold hover:text-purple-700 transition-colors"
                >
                  Edit <Pencil size={12} />
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {!editingPostScope ? (
                <motion.div
                  key="scope-display"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full border border-slate-200 bg-white rounded-xl py-3 px-4 text-center font-semibold text-slate-700 text-sm"
                >
                  {postScopeLabel}
                </motion.div>
              ) : (
                <motion.div
                  key="scope-edit"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {['all', 'specific'].map((option) => (
                      <button
                        key={option}
                        onClick={() => { if (triggerType === 'post_comment') handlePostsTypeChange(option as any); }}
                        className={cn(
                          "py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all",
                          (triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === option)
                            ? "border-purple-500 bg-purple-50 text-purple-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {option === 'all' ? 'All Posts and Reels' : 'Specific Posts'}
                      </button>
                    ))}
                  </div>
                  {triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === 'specific' && (
                    <div className="border border-slate-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Available Media</h4>
                        {loadingMedia && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
                      </div>
                      {posts.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                          {posts.map((post) => (
                            <div
                              key={post.id}
                              onClick={() => togglePostSelection(post.id)}
                              className={cn(
                                "relative cursor-pointer aspect-square rounded-xl overflow-hidden border-2 transition-all",
                                selectedPosts.includes(post.id) ? "border-purple-500" : "border-transparent hover:border-purple-200"
                              )}
                            >
                              {post.media_type === 'VIDEO' ? (
                                <video src={post.media_url} poster={post.thumbnail_url} muted className="w-full h-full object-cover" />
                              ) : (
                                <img src={post.media_url} alt={post.caption || 'Post'} className="w-full h-full object-cover" />
                              )}
                              {selectedPosts.includes(post.id) && (
                                <div className="absolute top-1 right-1 bg-purple-500 text-white p-0.5 rounded-md">
                                  <CheckCircle2 size={12} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : !loadingMedia && (
                        <div className="text-center py-6">
                          <ImageIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-slate-400 text-xs">No recent posts found.</p>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setEditingPostScope(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Done
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Keywords */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-slate-700 font-medium text-sm">
              {triggerType === 'post_comment' ? 'What keywords will start your automation?' :
                triggerType === 'story_reply' ? 'What story keywords will trigger this?' :
                  'What keywords will start your automation?'}
            </p>
            {!readOnly && (
              <button
                onClick={() => setEditingKeywords(!editingKeywords)}
                className="flex items-center gap-1 text-purple-600 text-xs font-semibold hover:text-purple-700 transition-colors"
              >
                Edit <Pencil size={12} />
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!editingKeywords ? (
              <motion.button
                key="kw-placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !readOnly && setEditingKeywords(true)}
                disabled={readOnly}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl py-8 flex flex-col items-center gap-2 text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-purple-50 flex items-center justify-center transition-colors">
                  <Languages size={20} />
                </div>
                <span className="text-sm font-semibold">
                  {getKeywords().length > 0
                    ? `${getKeywords().length} keyword${getKeywords().length > 1 ? 's' : ''} set`
                    : 'Setup Keywords'}
                </span>
                {getKeywords().length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center px-4">
                    {getKeywords().map((kw, i) => (
                      <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{kw}</span>
                    ))}
                  </div>
                )}
              </motion.button>
            ) : (
              <motion.div
                key="kw-edit"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border border-slate-200 rounded-xl p-4 space-y-3"
              >
                {/* Toggle: All vs Keywords */}
                <div className="grid grid-cols-2 gap-2">
                  {['all', 'keywords'].map((opt) => {
                    const isActive = triggerType === 'post_comment'
                      ? (currentConfig as PostCommentTriggerConfig).commentsType === opt
                      : triggerType === 'story_reply'
                        ? (currentConfig as StoryReplyTriggerConfig).storiesType === opt
                        : (currentConfig as UserDirectMessageTriggerConfig).messageType === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => {
                          if (triggerType === 'post_comment') handleCommentsTypeChange(opt as any);
                          else if (triggerType === 'story_reply') handleStoriesTypeChange(opt as any);
                          else handleMessageTypeChange(opt as any);
                        }}
                        className={cn(
                          "py-2 px-3 rounded-xl border-2 text-xs font-semibold transition-all",
                          isActive ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {opt === 'all' ? 'All Comments' : 'Specific Keywords'}
                      </button>
                    );
                  })}
                </div>

                {keywordsEnabled && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                          placeholder="Add a keyword..."
                          className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm text-slate-800 transition-all placeholder:text-slate-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addKeyword}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold text-xs shadow-md"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getKeywords().map((kw, index) => (
                        <span key={index} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-purple-50 border border-purple-200 rounded-full text-xs font-semibold text-purple-700">
                          {kw}
                          <button onClick={() => removeKeyword(index)} className="p-0.5 rounded-full text-purple-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      {getKeywords().length === 0 && (
                        <span className="text-xs text-slate-400 italic">Add your first keyword above...</span>
                      )}
                    </div>
                  </div>
                )}
                <button onClick={() => setEditingKeywords(false)} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">Done</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
