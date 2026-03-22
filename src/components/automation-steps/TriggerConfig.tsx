import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Grid, Globe, Target, Tag, Search, X, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { TriggerType, TriggerConfig, PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig } from '../../types/automation';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';

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
  const { isPremium } = useSubscription();
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

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
      toast.error(`Failed to fetch Instagram ${type}`);
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
  };

  const getKeywords = (): string[] => {
    if (triggerType === 'post_comment') return (currentConfig as PostCommentTriggerConfig).keywords || [];
    if (triggerType === 'user_directed_messages') return (currentConfig as UserDirectMessageTriggerConfig).keywords || [];
    if (triggerType === 'story_reply') return (currentConfig as StoryReplyTriggerConfig).keywords || [];
    return [];
  };

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
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-2 border-gray-100 mt-2 bg-gray-50/50 rounded-xl p-3 md:p-4">
        {loadingMedia ? (
          <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : (
          <div className="grid grid-cols-2 auto-rows-max gap-2 max-h-[310px] overflow-y-auto pr-1">
            {posts.map((post) => {
              const isSelected = specificIds.includes(post.id);
              return (
                <div
                  key={post.id}
                  onClick={() => toggleMediaSelection(post.id)}
                  className={`relative w-full pb-[100%] cursor-pointer rounded-xl overflow-hidden border-2 transition-all
                    ${isSelected ? "border-purple-600" : "border-transparent hover:border-purple-200"}`}
                >
                  {post.media_type === 'VIDEO' ? (
                    <video src={post.media_url} poster={post.thumbnail_url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <img src={post.media_url} alt={post.caption || 'Post'} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-purple-600 text-white p-0.5 rounded-md z-10">
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
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-2 border-gray-100 mt-2 bg-gray-50/50 rounded-xl p-3 md:p-4 space-y-3">
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
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white focus:border-purple-500 text-base text-gray-800 transition-all placeholder:text-gray-400 outline-none font-medium"
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

    </div>
  );
}
