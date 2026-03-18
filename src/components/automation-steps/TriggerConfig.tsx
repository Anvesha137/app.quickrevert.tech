import { useState, useEffect } from 'react';
import { toast } from 'sonner';
<<<<<<< HEAD
import { Grid, Globe, Target, Tag, Search, X, Loader2, CheckCircle2, Clock } from 'lucide-react';
=======
import { X, Image as ImageIcon, CheckCircle2, Search, Loader2, MessageSquare, Mail, Languages, Pencil } from 'lucide-react';
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
import { motion, AnimatePresence } from "motion/react";
import { TriggerType, TriggerConfig, PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig } from '../../types/automation';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';
<<<<<<< HEAD
=======
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e

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
<<<<<<< HEAD
  readOnly?: boolean;
}

function OptionCard({ icon: Icon, title, description, selected, onClick, disabled }: any) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left p-3.5 md:p-4 rounded-xl md:rounded-2xl border-2 transition-all flex items-center gap-3 md:gap-4 mb-2.5 group
        ${selected ? 'border-purple-500 bg-purple-50/30 shadow-sm ring-2 ring-purple-50 scale-[1.01]' : 'border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/10'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`w-9 h-9 md:w-11 md:h-11 shrink-0 rounded-full flex items-center justify-center text-white transition-all
        ${selected ? 'bg-purple-600 scale-105' : 'bg-gray-100 group-hover:bg-purple-100'}`}>
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${selected ? 'text-white' : 'text-gray-400 group-hover:text-purple-500'}`} />
      </div>
      <div className="flex-1">
        <h3 className={`font-bold text-[13px] md:text-[15px] mb-0.5 transition-colors ${selected ? 'text-purple-900 font-extrabold' : 'text-gray-900 group-hover:text-purple-900'}`}>{title}</h3>
        <p className={`text-[11px] md:text-[13px] font-medium leading-snug transition-colors ${selected ? 'text-purple-700/80': 'text-gray-400 group-hover:text-gray-500'}`}>{description}</p>
      </div>
      <div className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-all
        ${selected ? 'border-purple-600 bg-purple-50 shadow-inner scale-110' : 'border-gray-200 group-hover:border-purple-300'}`}>
        {selected && <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-purple-600 rounded-full shadow-sm" />}
      </div>
    </button>
  );
}

export default function TriggerConfigStep({ triggerType, config, onConfigChange, readOnly }: TriggerConfigProps) {
=======
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
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
  const { isPremium } = useSubscription();
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
<<<<<<< HEAD

  const getConfig = (): TriggerConfig => {
    if (config) return config;
    if (triggerType === 'post_comment') return { postsType: 'all', commentsType: 'all' } as PostCommentTriggerConfig;
    if (triggerType === 'story_reply') return { storiesType: 'all', replyType: 'all' } as StoryReplyTriggerConfig;
    return { messageType: 'all' } as UserDirectMessageTriggerConfig;
  };

  const currentConfig = getConfig();

  useEffect(() => {
    if (triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === 'specific') {
      fetchMedia('posts');
    } else if (triggerType === 'story_reply' && (currentConfig as StoryReplyTriggerConfig).storiesType === 'specific') {
      fetchMedia('stories');
    }
  }, [triggerType, (currentConfig as PostCommentTriggerConfig).postsType, (currentConfig as StoryReplyTriggerConfig).storiesType]);
=======
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [editingPostScope, setEditingPostScope] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState(false);

  useEffect(() => {
    if (triggerType === 'post_comment' && (config as PostCommentTriggerConfig)?.postsType === 'specific') {
      fetchMedia('posts');
    } else if (triggerType === 'story_reply' && (config as StoryReplyTriggerConfig)?.storiesType === 'specific') {
      fetchMedia('stories');
    }
  }, [triggerType, (config as PostCommentTriggerConfig)?.postsType, (config as StoryReplyTriggerConfig)?.storiesType]);

  // Fetch media in readOnly mode too
  useEffect(() => {
    if (readOnly) {
      if (triggerType === 'post_comment' && (config as PostCommentTriggerConfig)?.postsType === 'specific') {
        fetchMedia('posts');
      } else if (triggerType === 'story_reply' && (config as StoryReplyTriggerConfig)?.storiesType === 'specific') {
        fetchMedia('stories');
      }
    }
  }, [readOnly]);
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e

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
    } catch (error: any) {
      console.error(`Error fetching ${type}:`, error);
<<<<<<< HEAD
      toast.error(`Failed to fetch Instagram ${type}`);
=======
      toast.error(`Failed to fetch Instagram ${type}: ` + (error.message || 'Unknown error'));
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    } finally {
      setLoadingMedia(false);
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    if (readOnly) return;
    const isPostComment = triggerType === 'post_comment';
    const currentSpecific = isPostComment
      ? (currentConfig as PostCommentTriggerConfig).specificPosts || []
      : (currentConfig as StoryReplyTriggerConfig).specificStories || [];

    const newSelection = currentSpecific.includes(mediaId)
      ? currentSpecific.filter(id => id !== mediaId)
      : [...currentSpecific, mediaId];

    if (isPostComment) {
      onConfigChange({ ...currentConfig, specificPosts: newSelection } as PostCommentTriggerConfig);
    } else {
      onConfigChange({ ...currentConfig, specificStories: newSelection } as StoryReplyTriggerConfig);
    }
  };

<<<<<<< HEAD
  const addKeyword = () => {
    if (!keyword.trim() || readOnly) return;
    if (!isPremium && getKeywords().length >= 2) {
      toast.error("You can only add up to 2 keywords on the basic plan. Upgrade to Premium for unlimited keywords.");
      return;
    }
    const keywords = getKeywords();
    if (triggerType === 'post_comment') {
      onConfigChange({ ...currentConfig, keywords: [...keywords, keyword.trim()] } as PostCommentTriggerConfig);
    } else if (triggerType === 'user_directed_messages') {
      onConfigChange({ ...currentConfig, keywords: [...keywords, keyword.trim()] } as UserDirectMessageTriggerConfig);
    } else if (triggerType === 'story_reply') {
      onConfigChange({ ...currentConfig, keywords: [...keywords, keyword.trim()] } as StoryReplyTriggerConfig);
    }
    setKeyword('');
  };

  const removeKeyword = (index: number) => {
    if (readOnly) return;
    const keywords = getKeywords();
    const newKeywords = keywords.filter((_, i) => i !== index);
    if (triggerType === 'post_comment') {
      onConfigChange({ ...currentConfig, keywords: newKeywords } as PostCommentTriggerConfig);
    } else if (triggerType === 'user_directed_messages') {
      onConfigChange({ ...currentConfig, keywords: newKeywords } as UserDirectMessageTriggerConfig);
    } else if (triggerType === 'story_reply') {
      onConfigChange({ ...currentConfig, keywords: newKeywords } as StoryReplyTriggerConfig);
    }
=======
  const getConfig = (): TriggerConfig => {
    if (config) return config;
    if (triggerType === 'post_comment') return { postsType: 'all', commentsType: 'all' } as PostCommentTriggerConfig;
    if (triggerType === 'story_reply') return { storiesType: 'all', replyType: 'all' } as StoryReplyTriggerConfig;
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

  const handleStoriesTypeChange = (storiesType: 'all' | 'specific') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, storiesType } as StoryReplyTriggerConfig;
    if (storiesType === 'all') { delete newConfig.specificStories; } else { newConfig.specificStories = []; }
    onConfigChange(newConfig);
  };

  const handleStoriesReplyTypeChange = (replyType: 'all' | 'keywords') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, replyType } as StoryReplyTriggerConfig;
    if (replyType === 'all') { delete newConfig.keywords; } else { newConfig.keywords = []; }
    onConfigChange(newConfig);
  };

  const handleMessageTypeChange = (messageType: 'all' | 'keywords') => {
    if (readOnly) return;
    const newConfig = { ...currentConfig, messageType } as UserDirectMessageTriggerConfig;
    if (messageType === 'all') { delete newConfig.keywords; } else { newConfig.keywords = []; }
    onConfigChange(newConfig);
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
  };

  const getKeywords = (): string[] => {
    if (triggerType === 'post_comment') return (currentConfig as PostCommentTriggerConfig).keywords || [];
    if (triggerType === 'user_directed_messages') return (currentConfig as UserDirectMessageTriggerConfig).keywords || [];
    if (triggerType === 'story_reply') return (currentConfig as StoryReplyTriggerConfig).keywords || [];
    return [];
  };

<<<<<<< HEAD
  const handleCooldownToggle = () => {
    if (readOnly || triggerType !== 'user_directed_messages') return;
    const dmConfig = currentConfig as UserDirectMessageTriggerConfig;
    onConfigChange({ 
      ...dmConfig, 
      cooldownEnabled: !dmConfig.cooldownEnabled,
      cooldownDuration: dmConfig.cooldownEnabled ? undefined : (dmConfig.cooldownDuration || 3600000) // Default 1 hour
    } as UserDirectMessageTriggerConfig);
  };

  const handleCooldownDurationChange = (duration: number) => {
    if (readOnly || triggerType !== 'user_directed_messages') return;
    onConfigChange({ 
      ...currentConfig, 
      cooldownDuration: duration
    } as UserDirectMessageTriggerConfig);
  };


  const handlePostsTypeChange = (type: 'all' | 'specific') => {
    if (readOnly) return;
    if (triggerType === 'post_comment') {
      onConfigChange({ ...currentConfig, postsType: type } as PostCommentTriggerConfig);
    } else if (triggerType === 'story_reply') {
      onConfigChange({ ...currentConfig, storiesType: type } as StoryReplyTriggerConfig);
    }
  };

  const handleCommentsTypeChange = (type: 'all' | 'keywords') => {
    if (readOnly) return;
    if (triggerType === 'post_comment') {
      onConfigChange({ ...currentConfig, commentsType: type } as PostCommentTriggerConfig);
    } else if (triggerType === 'story_reply') {
      onConfigChange({ ...currentConfig, replyType: type } as StoryReplyTriggerConfig);
    } else if (triggerType === 'user_directed_messages') {
      onConfigChange({ ...currentConfig, messageType: type } as UserDirectMessageTriggerConfig);
    }
  };

  const renderMediaSelector = () => {
    const specificIds = triggerType === 'post_comment'
      ? (currentConfig as PostCommentTriggerConfig).specificPosts || []
      : (currentConfig as StoryReplyTriggerConfig).specificStories || [];

    return (
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t-2 border-l-2 border-r-2 border-b-2 border-gray-100 -mt-2 bg-gray-50/50 rounded-b-xl p-4">
        {loadingMedia ? (
          <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {posts.map((post) => {
              const isSelected = specificIds.includes(post.id);
              return (
                <div
                  key={post.id}
                  onClick={() => toggleMediaSelection(post.id)}
                  className={`relative cursor-pointer aspect-square rounded-xl overflow-hidden border-2 transition-all
                    ${isSelected ? "border-purple-600" : "border-transparent hover:border-purple-200"}`}
                >
                  {post.media_type === 'VIDEO' ? (
                    <video src={post.media_url} poster={post.thumbnail_url} muted className="w-full h-full object-cover" />
                  ) : (
                    <img src={post.media_url} alt={post.caption || 'Post'} className="w-full h-full object-cover" />
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-purple-600 text-white p-0.5 rounded-md">
                      <CheckCircle2 size={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  };

  const renderKeywordInput = () => {
    return (
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t-2 border-l-2 border-r-2 border-b-2 border-gray-100 -mt-2 bg-gray-50/50 rounded-b-xl p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
              placeholder="Add a keyword (e.g. LINK)"
              disabled={readOnly}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white focus:border-purple-500 text-sm text-gray-800 transition-all placeholder:text-gray-400 outline-none font-medium"
            />
          </div>
          <button
            type="button"
            onClick={addKeyword}
            disabled={readOnly}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-md shadow-purple-200"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {getKeywords().map((kw, index) => (
            <span key={index} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-purple-100 border border-purple-200 rounded-full text-xs font-bold text-purple-700">
              {kw}
              {!readOnly && (
                <button onClick={() => removeKeyword(index)} className="p-0.5 rounded-full text-purple-400 hover:text-red-500 hover:bg-red-50 transition-all">
                  <X size={12} strokeWidth={3} />
                </button>
              )}
            </span>
          ))}
          {getKeywords().length === 0 && (
            <span className="text-xs text-gray-400 italic font-medium">No keywords added yet</span>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-10 md:space-y-14 pb-8">
      
      {/* Scope Section */}
      {(triggerType === 'post_comment' || triggerType === 'story_reply') && (
        <div className="w-full">
          <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
              <Grid className="w-5 h-5 md:w-6 md:h-6 fill-purple-200 text-purple-200" />
            </div>
            <div className="pt-0.5 md:pt-1">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Which posts should trigger this?</h2>
              <p className="text-xs md:text-sm text-gray-400 font-medium mt-0.5">Apply to all posts, or pick specific ones.</p>
            </div>
          </div>

          <div className="pl-0">
            <div className="px-4 md:px-5 py-3 md:py-4 border-2 border-purple-100 rounded-2xl md:rounded-[1.5rem] bg-white space-y-2.5">
              <OptionCard
                icon={Globe}
                title={triggerType === 'post_comment' ? "All my posts & reels" : "All my stories"}
                description={triggerType === 'post_comment' ? "Every post you publish will trigger this." : "Every story you publish will trigger this."}
                selected={(triggerType === 'post_comment' ? (currentConfig as PostCommentTriggerConfig).postsType : (currentConfig as StoryReplyTriggerConfig).storiesType) === 'all'}
                onClick={() => handlePostsTypeChange('all')}
                disabled={readOnly}
              />
              <OptionCard
                icon={Target}
                title="Just specific posts"
                description="Pick exactly which posts you want this to work on."
                selected={(triggerType === 'post_comment' ? (currentConfig as PostCommentTriggerConfig).postsType : (currentConfig as StoryReplyTriggerConfig).storiesType) === 'specific'}
                onClick={() => handlePostsTypeChange('specific')}
                disabled={readOnly}
              />
              <AnimatePresence>
                {((triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === 'specific') || 
                  (triggerType === 'story_reply' && (currentConfig as StoryReplyTriggerConfig).storiesType === 'specific')) && renderMediaSelector()}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Keywords Section */}
      <div className="w-full">
        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
            <Tag className="w-5 h-5 md:w-6 md:h-6 fill-purple-200 text-purple-200" />
          </div>
          <div className="pt-0.5 md:pt-1">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Should only certain keywords trigger this?</h2>
            <p className="text-xs md:text-sm text-gray-400 font-medium leading-relaxed mt-0.5">e.g. only when someone says "LINK" or "INFO" - or leave as any message.</p>
          </div>
        </div>

        <div className="pl-0">
          <div className="px-4 md:px-5 py-3 md:py-4 border-2 border-purple-100 rounded-2xl md:rounded-[1.5rem] bg-white space-y-2.5">
            <OptionCard
              icon={Globe}
              title="Any message works"
              description="Runs no matter what they write."
              selected={(triggerType === 'post_comment' ? (currentConfig as PostCommentTriggerConfig).commentsType : triggerType === 'story_reply' ? (currentConfig as StoryReplyTriggerConfig).replyType : (currentConfig as UserDirectMessageTriggerConfig).messageType) === 'all'}
              onClick={() => handleCommentsTypeChange('all')}
              disabled={readOnly}
            />
            <OptionCard
              icon={Target}
              title="Only specific keywords"
              description="Only runs when they write certain words."
              selected={(triggerType === 'post_comment' ? (currentConfig as PostCommentTriggerConfig).commentsType : triggerType === 'story_reply' ? (currentConfig as StoryReplyTriggerConfig).replyType : (currentConfig as UserDirectMessageTriggerConfig).messageType) === 'keywords'}
              onClick={() => handleCommentsTypeChange('keywords')}
              disabled={readOnly}
            />
            <AnimatePresence>
              {((triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).commentsType === 'keywords') || 
                (triggerType === 'story_reply' && (currentConfig as StoryReplyTriggerConfig).replyType === 'keywords') ||
                (triggerType === 'user_directed_messages' && (currentConfig as UserDirectMessageTriggerConfig).messageType === 'keywords')) && renderKeywordInput()}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Cooldown Section */}
      {triggerType === 'user_directed_messages' && (
        <div className="w-full">
          <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
              <Clock className="w-5 h-5 md:w-6 md:h-6 fill-purple-200 text-purple-200" />
            </div>
            <div className="pt-0.5 md:pt-1">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Cooldown Period?</h2>
              <p className="text-xs md:text-sm text-gray-400 font-medium leading-relaxed mt-0.5">Prevent sending multiple DMs to the same user consecutively.</p>
            </div>
          </div>

          <div className="pl-0">
            <div className="px-4 md:px-5 py-3 md:py-4 border-2 border-purple-100 rounded-2xl md:rounded-[1.5rem] bg-white space-y-2.5">
              <div className={`rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${(currentConfig as UserDirectMessageTriggerConfig).cooldownEnabled ? 'border-purple-200 bg-purple-50/30' : 'border-transparent bg-white hover:bg-gray-50'}`}>
                <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={handleCooldownToggle}>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-[14px] md:text-[15px] mb-0.5 md:mb-1">Enable Cooldown</h3>
                    <p className="text-[11px] md:text-xs text-gray-400 font-medium">Wait before replying to the same user again</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                    <input type="checkbox" className="sr-only peer" checked={(currentConfig as UserDirectMessageTriggerConfig).cooldownEnabled || false} readOnly />
                    <div className="w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
                  </label>
                </div>

                <AnimatePresence>
                  {(currentConfig as UserDirectMessageTriggerConfig).cooldownEnabled && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                      <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm space-y-3">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Select Cooldown Duration</label>
                        <select
                          value={(currentConfig as UserDirectMessageTriggerConfig).cooldownDuration || 3600000}
                          onChange={(e) => handleCooldownDurationChange(Number(e.target.value))}
                          disabled={readOnly}
                          className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-semibold text-sm transition-all appearance-none bg-white cursor-pointer"
                        >
                          <option value={60000}>1 min</option>
                          <option value={300000}>5 min</option>
                          <option value={900000}>15 min</option>
                          <option value={1800000}>30 min</option>
                          <option value={3600000}>1 hr</option>
                          <option value={18000000}>5 hr</option>
                          <option value={36000000}>10 hr</option>
                          <option value={86400000}>1 day</option>
                          <option value={604800000}>7 days</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}

=======
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
      ? (currentConfig as StoryReplyTriggerConfig).replyType === 'keywords'
      : (currentConfig as UserDirectMessageTriggerConfig).messageType === 'keywords';

  const postScopeLabel = triggerType === 'post_comment'
    ? ((currentConfig as PostCommentTriggerConfig).postsType === 'specific' ? 'Specific Posts' : 'All Posts and Reels')
    : triggerType === 'story_reply'
      ? ((currentConfig as StoryReplyTriggerConfig).storiesType === 'specific' ? 'Specific Stories' : 'All Stories')
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
              <p className="text-slate-800 font-semibold text-base">
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
                >
                  {/* In readOnly + specific mode, show which posts are selected */}
                  {readOnly && ((triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === 'specific') || (triggerType === 'story_reply' && (currentConfig as StoryReplyTriggerConfig).storiesType === 'specific')) ? (
                    <div className="space-y-2">
                      <div className="w-full border border-slate-200 bg-white rounded-xl py-2 px-4 text-center font-semibold text-slate-700 text-sm">
                        {triggerType === 'post_comment' ? 'Specific Posts' : 'Specific Stories'}
                        {triggerType === 'post_comment'
                          ? ((currentConfig as PostCommentTriggerConfig).specificPosts?.length ? ` · ${(currentConfig as PostCommentTriggerConfig).specificPosts!.length} selected` : '')
                          : ((currentConfig as StoryReplyTriggerConfig).specificStories?.length ? ` · ${(currentConfig as StoryReplyTriggerConfig).specificStories!.length} selected` : '')}
                      </div>
                      {loadingMedia ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                        </div>
                      ) : (() => {
                        const specificIds = triggerType === 'post_comment'
                          ? (currentConfig as PostCommentTriggerConfig).specificPosts || []
                          : (currentConfig as StoryReplyTriggerConfig).specificStories || [];
                        const selectedPostObjs = posts.filter(p => specificIds.includes(p.id));
                        return selectedPostObjs.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2">
                            {selectedPostObjs.map((post) => (
                              <div key={post.id} className="relative aspect-square rounded-xl overflow-hidden border-2 border-purple-500">
                                {post.media_type === 'VIDEO' ? (
                                  <video src={post.media_url} poster={post.thumbnail_url} muted className="w-full h-full object-cover" />
                                ) : (
                                  <img src={post.media_url} alt={post.caption || 'Post'} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute top-1 right-1 bg-purple-500 text-white p-0.5 rounded-md">
                                  <CheckCircle2 size={12} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : specificIds.length > 0 ? (
                          <p className="text-xs text-slate-400 text-center py-2">{specificIds.length} post{specificIds.length > 1 ? 's' : ''} selected</p>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                    <button
                      onClick={() => !readOnly && setEditingPostScope(true)}
                      disabled={readOnly}
                      className={cn(
                        "w-full border border-slate-200 bg-white rounded-xl py-3 px-4 text-center font-semibold text-slate-700 text-sm transition-all",
                        !readOnly && "hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer"
                      )}
                    >
                      {postScopeLabel}
                    </button>
                  )}
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
                    {['all', 'specific'].map((option) => {
                      const isActive = triggerType === 'post_comment'
                        ? (currentConfig as PostCommentTriggerConfig).postsType === option
                        : (currentConfig as StoryReplyTriggerConfig).storiesType === option;
                      return (
                        <button
                          key={option}
                          onClick={() => {
                            if (triggerType === 'post_comment') handlePostsTypeChange(option as any);
                            else if (triggerType === 'story_reply') handleStoriesTypeChange(option as any);
                          }}
                          className={cn(
                            "py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all",
                            isActive
                              ? "border-purple-500 bg-purple-50 text-purple-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          )}
                        >
                          {option === 'all'
                            ? (triggerType === 'post_comment' ? 'All Posts and Reels' : 'All Stories')
                            : (triggerType === 'post_comment' ? 'Specific Posts' : 'Specific Stories')}
                        </button>
                      );
                    })}
                  </div>
                  {((triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === 'specific') || (triggerType === 'story_reply' && (currentConfig as StoryReplyTriggerConfig).storiesType === 'specific')) && (
                    <div className="border border-slate-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Available Media</h4>
                        {loadingMedia && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
                      </div>
                      {posts.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                          {posts.map((post) => {
                            const specificIds = triggerType === 'post_comment'
                              ? (currentConfig as PostCommentTriggerConfig).specificPosts || []
                              : (currentConfig as StoryReplyTriggerConfig).specificStories || [];
                            const isSelected = specificIds.includes(post.id);
                            return (
                              <div
                                key={post.id}
                                onClick={() => toggleMediaSelection(post.id)}
                                className={cn(
                                  "relative cursor-pointer aspect-square rounded-xl overflow-hidden border-2 transition-all",
                                  isSelected ? "border-purple-500" : "border-transparent hover:border-purple-200"
                                )}
                              >
                                {post.media_type === 'VIDEO' ? (
                                  <video src={post.media_url} poster={post.thumbnail_url} muted className="w-full h-full object-cover" />
                                ) : (
                                  <img src={post.media_url} alt={post.caption || 'Post'} className="w-full h-full object-cover" />
                                )}
                                {isSelected && (
                                  <div className="absolute top-1 right-1 bg-purple-500 text-white p-0.5 rounded-md">
                                    <CheckCircle2 size={12} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
            <p className="text-slate-800 font-semibold text-base">
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
                        ? (currentConfig as StoryReplyTriggerConfig).replyType === opt
                        : (currentConfig as UserDirectMessageTriggerConfig).messageType === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => {
                          if (triggerType === 'post_comment') handleCommentsTypeChange(opt as any);
                          else if (triggerType === 'story_reply') handleStoriesReplyTypeChange(opt as any);
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
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    </div>
  );
}
