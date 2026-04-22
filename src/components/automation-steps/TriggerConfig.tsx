import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Grid, Globe, Target, Tag, Search, X, CheckCircle2, Clock, ChevronDown, Info, Image as ImageIcon, FileSpreadsheet, Lock } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { TriggerType, TriggerConfig, PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig, LeadManagerTriggerConfig } from '../../types/automation';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Skeleton } from '../ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

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

interface TriggerConfigProps {
  triggerType: TriggerType;
  config: TriggerConfig | null;
  onConfigChange: (config: TriggerConfig) => void;
  readOnly?: boolean;
}

function OptionCard({ icon: Icon, title, description, selected, onClick, disabled }: any) {
  const { darkMode } = useTheme();
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left p-3.5 md:p-4 rounded-2xl border-2 transition-all flex items-center gap-3 md:gap-4 mb-2.5 group
        ${selected
          ? (darkMode ? 'border-purple-500 bg-transparent shadow-none scale-[1.01]' : 'border-purple-500 bg-purple-50/30 shadow-sm ring-2 ring-purple-50 scale-[1.01]')
          : (darkMode ? 'border-white/10 bg-transparent hover:border-white/20' : 'border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/10')}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`w-9 h-9 md:w-11 md:h-11 shrink-0 rounded-full flex items-center justify-center text-white transition-all
        ${selected ? 'bg-purple-600 scale-105' : (darkMode ? 'bg-white/10 group-hover:bg-white/15' : 'bg-gray-100 group-hover:bg-purple-100')}`}>
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${selected ? 'text-white' : (darkMode ? 'text-white/40 group-hover:text-white/80' : 'text-gray-400 group-hover:text-purple-500')}`} />
      </div>
      <div className="flex-1">
        <h3 className={`font-bold text-[13px] md:text-[15px] mb-0.5 transition-colors ${selected ? (darkMode ? 'text-white font-black' : 'text-purple-900 font-extrabold') : (darkMode ? 'text-white/80 group-hover:text-white' : 'text-gray-900 group-hover:text-purple-900')}`}>{title}</h3>
        <p className={`text-[11px] md:text-[13px] font-medium leading-snug transition-colors ${selected ? (darkMode ? 'text-white/60' : 'text-purple-700/80') : (darkMode ? 'text-white/40 group-hover:text-white/50' : 'text-gray-400 group-hover:text-gray-500')}`}>{description}</p>
      </div>
      <div className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-all
        ${selected ? (darkMode ? 'border-purple-400 bg-transparent' : 'border-purple-600 bg-purple-50 shadow-inner scale-110') : (darkMode ? 'border-white/20 group-hover:border-white/40' : 'border-gray-200 group-hover:border-purple-300')}`}>
        {selected && <div className={`w-2 h-2 md:w-2.5 md:h-2.5 ${darkMode ? 'bg-purple-400' : 'bg-purple-600'} rounded-full shadow-sm`} />}
      </div>
    </button>
  );
}

function ConnectGoogleButton({ isConnected, email, onConnect, onDisconnect, readOnly }: any) {
  const { darkMode } = useTheme();
  
  if (isConnected) {
    return (
      <div className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", darkMode ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200")}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <p className={cn("text-[11px] font-bold uppercase tracking-wider", darkMode ? "text-emerald-400" : "text-emerald-700")}>Connected to Google</p>
            <p className={cn("text-xs font-medium opacity-70", darkMode ? "text-white" : "text-gray-900")}>{email}</p>
          </div>
        </div>
        {!readOnly && (
          <button 
            onClick={onDisconnect}
            className={cn("text-[10px] font-bold py-1 px-2 rounded-lg transition-all", darkMode ? "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white" : "bg-white border text-gray-500 hover:text-red-600 hover:border-red-100")}
          >
            Disconnect
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={readOnly}
      className={cn(
        "w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all group",
        darkMode 
          ? "border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-blue-500/10 text-white" 
          : "border-blue-100 bg-blue-50/30 hover:border-blue-500 hover:bg-blue-50 text-blue-700"
      )}
    >
      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center transition-transform group-hover:scale-110", darkMode ? "bg-white/10" : "bg-white shadow-sm")}>
        <Globe className={cn("w-3.5 h-3.5", darkMode ? "text-blue-400" : "text-blue-600")} />
      </div>
      Connect Google Account
    </button>
  );
}

export default function TriggerConfigStep({ triggerType, config, onConfigChange, readOnly }: TriggerConfigProps) {
  const { darkMode } = useTheme();
  const { isPremium } = useSubscription();
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [usedMediaIds, setUsedMediaIds] = useState<Set<string>>(new Set());
  const { user } = useSubscription() as any; // Access user from context if available
  
  // 🔥 UX: Initialize selection states from the existing config if present
  const initialSavedPosts = (config as PostCommentTriggerConfig)?.specificPosts || [];
  const initialSavedStories = (config as StoryReplyTriggerConfig)?.specificStories || [];
  const initialSelection = (initialSavedPosts[0] || initialSavedStories[0] || null);

  const [pendingMediaId, setPendingMediaId] = useState<string | null>(initialSelection);
  const [isSelectingMedia, setIsSelectingMedia] = useState<boolean>(!initialSelection);

  const getConfig = (): TriggerConfig => {
    if (config) return config;
    if (triggerType === 'post_comment') return { postsType: 'specific', commentsType: 'all' } as PostCommentTriggerConfig;
    if (triggerType === 'story_reply') return { storiesType: 'specific', replyType: 'all' } as StoryReplyTriggerConfig;
    if (triggerType === 'conversation_flow') return {} as any;
    if (triggerType === 'lead_manager') return { googleSheetUrl: '' } as LeadManagerTriggerConfig;
    return { messageType: 'all', cooldownEnabled: true, cooldownDuration: 3600000 } as UserDirectMessageTriggerConfig;
  };

  const currentConfig = getConfig();

  // 🔥 FETCH USED MEDIA: Prevent 2 automations for same post
  useEffect(() => {
    const fetchUsedMedia = async () => {
      try {
        const { data: automations, error } = await supabase
          .from('automations')
          .select('id, trigger_type, trigger_config, status')
          .eq('status', 'active');
        
        if (error) throw error;
        
        const usedIds = new Set<string>();
        automations?.forEach(auto => {
          // If we are editing an automation, don't count its own posts as "used"
          if (config && (config as any).id === auto.id) return;
          
          const tConfig = auto.trigger_config;
          if (auto.trigger_type === 'post_comment' && tConfig?.postsType === 'specific') {
            tConfig.specificPosts?.forEach((id: string) => usedIds.add(id));
          } else if (auto.trigger_type === 'story_reply' && tConfig?.storiesType === 'specific') {
            tConfig.specificStories?.forEach((id: string) => usedIds.add(id));
          }
        });
        setUsedMediaIds(usedIds);
      } catch (err) {
        console.error("Error fetching used media:", err);
      }
    };

    fetchUsedMedia();
  }, [triggerType]);

  // 🔥 PERCEIVED PERFORMANCE: Synchronize state with config changes (e.g. after fetchAutomation)
  useEffect(() => {
    const savedPosts = (currentConfig as PostCommentTriggerConfig).specificPosts || [];
    const savedStories = (currentConfig as StoryReplyTriggerConfig).specificStories || [];
    const dbSelection = savedPosts[0] || savedStories[0] || null;

    if (dbSelection) {
      setPendingMediaId(dbSelection);
      // Only hide the selector if we have a selection and we aren't currently "changing" it
      setIsSelectingMedia(false);
    }

    if (triggerType === 'post_comment' && (currentConfig as PostCommentTriggerConfig).postsType === 'specific') {
      fetchMedia('posts');
    } else if (triggerType === 'story_reply' && (currentConfig as StoryReplyTriggerConfig).storiesType === 'specific') {
      fetchMedia('stories');
    }
  }, [
    triggerType, 
    (currentConfig as PostCommentTriggerConfig).postsType, 
    (currentConfig as StoryReplyTriggerConfig).storiesType,
    JSON.stringify((currentConfig as PostCommentTriggerConfig).specificPosts),
    JSON.stringify((currentConfig as StoryReplyTriggerConfig).specificStories)
  ]);

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
    setPendingMediaId(prev => prev === mediaId ? null : mediaId);
  };

  const confirmMediaSelection = () => {
    if (!pendingMediaId) return;
    
    // Find the selected media to get its thumbnail/media URL
    const selectedMedia = posts.find(p => p.id === pendingMediaId);
    const thumbnail_url = selectedMedia?.media_type === 'VIDEO' ? selectedMedia.thumbnail_url : selectedMedia?.media_url;

    const isPostComment = triggerType === 'post_comment';
    if (isPostComment) {
      onConfigChange({ 
        ...currentConfig, 
        specificPosts: [pendingMediaId],
        thumbnail_url
      } as any);
    } else {
      onConfigChange({ 
        ...currentConfig, 
        specificStories: [pendingMediaId],
        thumbnail_url
      } as any);
    }
    setIsSelectingMedia(false);
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
    return (
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className={`border-2 mt-2 rounded-xl overflow-hidden ${darkMode ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/50'}`}>
        {!isSelectingMedia && pendingMediaId ? (
          <div className="p-3 md:p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {(() => {
                const p = posts.find(p => p.id === pendingMediaId);
                if (!p && loadingMedia) return <div className={`w-12 h-12 rounded-lg animate-pulse ${darkMode ? 'bg-white/10' : 'bg-gray-200'}`} />;
                if (!p) return <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${darkMode ? 'bg-white/5' : 'bg-gray-100'}`}><ImageIcon className="w-5 h-5 opacity-50" /></div>;
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
                <span className="text-[11px] md:text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1 mb-0.5"><CheckCircle2 size={12} strokeWidth={3} /> Confirmed</span>
                <p className={`text-[13px] md:text-sm font-medium line-clamp-1 ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>Tied to a specific post</p>
              </div>
            </div>
            <button onClick={() => setIsSelectingMedia(true)} disabled={readOnly} className={`px-3 py-1.5 md:px-4 md:py-2 shrink-0 rounded-lg text-[11px] md:text-xs font-bold transition-all ${darkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>
              Change Post
            </button>
          </div>
        ) : (
          <div className="p-3 md:p-4">
            {loadingMedia ? (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                {/* Action Bar */}
                {pendingMediaId && !loadingMedia && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`mb-4 pb-4 border-b flex flex-col md:flex-row items-center justify-between gap-3 ${darkMode ? 'border-white/10' : 'border-purple-100'}`}>
                    <p className={`text-[11px] md:text-sm font-bold ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>1 Post selected</p>
                    <button onClick={confirmMediaSelection} disabled={readOnly} className={`w-full md:w-auto px-6 py-2.5 rounded-xl font-bold text-[13px] md:text-sm text-white shadow-lg transition-all flex justify-center items-center gap-2 ${darkMode ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 shadow-purple-500/20' : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shadow-purple-200 hover:shadow-xl hover:-translate-y-0.5'}`}>
                      Confirm Selection <CheckCircle2 size={16} />
                    </button>
                  </motion.div>
                )}
              <div className="max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {posts.map((post) => {
                    const isSelected = post.id === pendingMediaId;
                    return (
                      <div
                        key={post.id}
                        onClick={() => !usedMediaIds.has(post.id) && toggleMediaSelection(post.id)}
                        className={cn(
                          "relative aspect-square min-w-0 min-h-0 w-full cursor-pointer rounded-xl overflow-hidden border-2 transition-all",
                          post.id === pendingMediaId ? "border-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.3)] ring-2 ring-purple-600/50 scale-[0.98]" : "border-transparent hover:border-purple-200",
                          usedMediaIds.has(post.id) && "opacity-40 grayscale cursor-not-allowed"
                        )}
                      >
                        {post.media_type === 'VIDEO' ? (
                          <video src={post.media_url} poster={post.thumbnail_url} autoPlay loop muted playsInline className={`w-full h-full object-cover transition-transform ${post.id === pendingMediaId ? 'scale-110' : ''}`} />
                        ) : (
                          <img src={post.media_url} alt={post.caption || 'Post'} className={`w-full h-full object-cover transition-transform ${post.id === pendingMediaId ? 'scale-110' : ''}`} />
                        )}
                        {post.id === pendingMediaId && (
                          <div className="absolute inset-0 bg-purple-600/20 backdrop-blur-[1px] flex items-center justify-center transition-all">
                            <div className="bg-purple-600 text-white p-1.5 rounded-full shadow-lg scale-110">
                              <CheckCircle2 size={16} strokeWidth={3} />
                            </div>
                          </div>
                        )}
                        {usedMediaIds.has(post.id) && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-2 text-center">
                            <Lock size={16} className="text-white/60 mb-1" />
                            <span className="text-[8px] font-black uppercase text-white/80 leading-tight">Already<br/>Automated</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  const renderKeywordInput = () => {
    return (
      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className={`border-2 mt-2 rounded-xl p-3 md:p-4 space-y-3 ${darkMode ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/50'}`}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${darkMode ? 'text-white/40' : 'text-gray-400'}`} />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
              placeholder="Type a keyword (e.g. LINK) and press Enter ↵"
              disabled={readOnly}
              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 transition-all outline-none font-medium text-base ${darkMode ? 'border-white/10 bg-transparent focus:border-purple-500/50 text-white placeholder:text-white/20' : 'border-gray-200 bg-white focus:border-purple-500 text-gray-800 placeholder:text-gray-400'}`}
            />
          </div>
          <button
            type="button"
            onClick={addKeyword}
            disabled={readOnly}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${darkMode ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-purple-500/10' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200'}`}
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {getKeywords().map((kw, index) => (
            <span key={index} className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1 border rounded-full text-xs font-bold ${darkMode ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'bg-purple-100 border-purple-200 text-purple-700'}`}>
              {kw}
              {!readOnly && (
                <button onClick={() => removeKeyword(index)} className={`p-0.5 rounded-full transition-all ${darkMode ? 'text-purple-400 hover:text-red-400 hover:bg-red-500/10' : 'text-purple-400 hover:text-red-500 hover:bg-red-50'}`}>
                  <X size={12} strokeWidth={3} />
                </button>
              )}
            </span>
          ))}
          {getKeywords().length === 0 && (
            <span className={`text-xs italic font-medium ${darkMode ? 'text-white/20' : 'text-gray-400'}`}>No keywords added yet</span>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-10 md:space-y-14 pb-8">


      {/* ===== SECTION: Which Post/Reel (post_comment / story_reply only) ===== */}
      {(triggerType === 'post_comment' || triggerType === 'story_reply') && (
        <div id="post-selection-section" className="w-full">
          <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
            <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl flex items-center justify-center text-white shadow-lg ${darkMode ? 'bg-purple-600/20' : 'bg-purple-600 shadow-purple-200'}`}>
              <Grid className={`w-5 h-5 md:w-6 md:h-6 ${darkMode ? 'text-purple-400 fill-purple-400' : 'fill-purple-200 text-purple-200'}`} />
            </div>
            <div className="pt-0.5 md:pt-1">
              <h2 className={`text-lg md:text-xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {triggerType === 'post_comment' ? 'Which Post or Reel?' : 'Which Story?'}
              </h2>
              <p className={`text-xs md:text-sm font-medium leading-relaxed mt-0.5 ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>
                {triggerType === 'post_comment' ? 'Pick a post or reel to trigger the automation.' : 'Pick a story to trigger the automation.'}
              </p>
            </div>
          </div>

          <div className="pl-0">
            <div className={`px-4 md:px-5 py-3 md:py-4 space-y-2.5 transition-colors duration-300 ${darkMode ? '' : 'bg-white border-2 border-purple-100 rounded-2xl md:rounded-[1.5rem]'}`}>
              <OptionCard
                icon={Target}
                title={triggerType === 'post_comment' ? 'Select your post or reel' : 'Select your story'}
                description={triggerType === 'post_comment' ? 'Pick exactly which posts you want this to work on.' : 'Pick exactly which stories you want this to work on.'}
                selected={triggerType === 'post_comment' ? (currentConfig as PostCommentTriggerConfig).postsType === 'specific' : (currentConfig as StoryReplyTriggerConfig).storiesType === 'specific'}
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
      <div id="keyword-selection-section" className="w-full">
        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
          <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl flex items-center justify-center text-white shadow-lg ${darkMode ? 'bg-purple-600/20' : 'bg-purple-600 shadow-purple-200'}`}>
            <Tag className={`w-5 h-5 md:w-6 md:h-6 ${darkMode ? 'text-purple-400 fill-purple-400' : 'fill-purple-200 text-purple-200'}`} />
          </div>
          <div className="pt-0.5 md:pt-1">
            <h2 className={`text-lg md:text-xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Should only certain keywords trigger this?</h2>
            <p className={`text-xs md:text-sm font-medium leading-relaxed mt-0.5 ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>e.g. only when someone says "LINK" or "INFO" - or leave as any message.</p>
          </div>
        </div>

        <div className="pl-0">
          <div className={`px-4 md:px-5 py-3 md:py-4 space-y-2.5 transition-colors duration-300 ${darkMode ? '' : 'bg-white border-2 border-purple-100 rounded-2xl md:rounded-[1.5rem]'}`}>
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
            <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl flex items-center justify-center text-white shadow-lg ${darkMode ? 'bg-purple-600/20' : 'bg-purple-600 shadow-purple-200'}`}>
              <Clock className={`w-5 h-5 md:w-6 md:h-6 ${darkMode ? 'text-purple-400 fill-purple-400' : 'fill-purple-200 text-purple-200'}`} />
            </div>
            <div className="pt-0.5 md:pt-1">
              <h2 className={`text-lg md:text-xl font-bold leading-tight flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Cooldown Period
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className={cn("w-4 h-4 cursor-help transition-colors", darkMode ? "text-white/40 hover:text-white/60" : "text-slate-400 hover:text-slate-600")} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-center">
                    To avoid repeated DMs and reduce spam, this feature enables you to re-send this msg again after the mentioned time.
                  </TooltipContent>
                </Tooltip>
              </h2>
              <p className={`text-xs md:text-sm font-medium leading-relaxed mt-0.5 ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Prevent sending multiple DMs to the same user consecutively.</p>
            </div>
          </div>

          <div className="pl-0">
            <div className={`px-4 md:px-5 py-3 md:py-4 space-y-2.5 transition-colors duration-300 ${darkMode ? '' : 'bg-white border-2 border-purple-100 rounded-2xl md:rounded-[1.5rem]'}`}>
              <div className={`rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${darkMode ? 'border-purple-500/20 bg-transparent' : 'border-purple-200 bg-purple-50/30'}`}>
                <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                  <div className="flex-1">
                    <h3 className={`font-bold text-[14px] md:text-[15px] mb-0.5 md:mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Enable Cooldown</h3>
                    <p className={`text-[11px] md:text-xs font-medium ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Wait before replying to the same user again</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-not-allowed pointer-events-none">
                    <input type="checkbox" className="sr-only peer" checked={true} readOnly />
                    <div className={`w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner ${darkMode ? 'bg-white/10' : ''}`}></div>
                  </label>
                </div>

                <div className="px-5 pb-5 pt-0">
                  <div className={`p-4 rounded-xl border shadow-sm space-y-3 ${darkMode ? 'bg-white/5 border-white/5' : 'bg-white border-purple-100'}`}>
                    <label className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Select Cooldown Duration</label>
                    <div className="relative">
                      <select
                        value={(currentConfig as UserDirectMessageTriggerConfig).cooldownDuration || 3600000}
                        onChange={(e) => handleCooldownDurationChange(Number(e.target.value))}
                        disabled={readOnly}
                        className={`w-full border-2 rounded-xl px-4 py-2.5 pr-10 outline-none font-semibold text-sm transition-all appearance-none cursor-pointer ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20' : 'border-gray-200 bg-white text-gray-900 focus:border-purple-500'}`}
                      >
                        <option value={60000} className={darkMode ? 'bg-gray-900' : ''}>1 min</option>
                        <option value={300000} className={darkMode ? 'bg-gray-900' : ''}>5 min</option>
                        <option value={3600000} className={darkMode ? 'bg-gray-900' : ''}>1 hr</option>
                        <option value={21600000} className={darkMode ? 'bg-gray-900' : ''}>6 hr</option>
                        <option value={86400000} className={darkMode ? 'bg-gray-900' : ''}>24 hr</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
