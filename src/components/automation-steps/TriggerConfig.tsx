import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Image as ImageIcon, Video, Filter, CheckCircle2, Search, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { TriggerType, TriggerConfig, PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig } from '../../types/automation';
import { supabase } from '../../lib/supabase';
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
  onNext: () => void | Promise<void>;
  onBack: () => void | Promise<void>;
  isCondensed?: boolean;
}

const getTriggerName = (type: TriggerType): string => {
  switch (type) {
    case 'post_comment':
      return 'Post Comment';
    case 'story_reply':
      return 'Story Reply';
    case 'user_directed_messages':
      return 'User Direct Message';
  }
};

export default function TriggerConfigStep({ triggerType, config, onConfigChange, onNext, onBack, isCondensed }: TriggerConfigProps) {
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);

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
        headers: {
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
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
    const newSelection = selectedPosts.includes(postId)
      ? selectedPosts.filter(id => id !== postId)
      : [...selectedPosts, postId];

    setSelectedPosts(newSelection);
    onConfigChange({
      ...currentConfig,
      specificPosts: newSelection,
    } as PostCommentTriggerConfig);
  };

  const getConfig = (): TriggerConfig => {
    if (config) return config;

    if (triggerType === 'post_comment') {
      return { postsType: 'all', commentsType: 'all' } as PostCommentTriggerConfig;
    } else if (triggerType === 'story_reply') {
      return { storiesType: 'all' } as StoryReplyTriggerConfig;
    } else {
      return { messageType: 'all' } as UserDirectMessageTriggerConfig;
    }
  };

  const currentConfig = getConfig();

  const handlePostsTypeChange = (postsType: 'all' | 'specific') => {
    const newConfig = { ...currentConfig, postsType } as PostCommentTriggerConfig;
    if (postsType === 'all') {
      delete newConfig.specificPosts;
    } else {
      newConfig.specificPosts = [];
    }
    onConfigChange(newConfig);
  };

  const handleCommentsTypeChange = (commentsType: 'all' | 'keywords') => {
    const newConfig = { ...currentConfig, commentsType } as PostCommentTriggerConfig;
    if (commentsType === 'all') {
      delete newConfig.keywords;
    } else {
      newConfig.keywords = [];
    }
    onConfigChange(newConfig);
  };

  const handleStoriesTypeChange = (storiesType: 'all' | 'keywords') => {
    const newConfig = { ...currentConfig, storiesType } as StoryReplyTriggerConfig;
    if (storiesType === 'all') {
      delete newConfig.keywords;
    } else {
      newConfig.keywords = [];
    }
    onConfigChange(newConfig);
  };

  const handleMessageTypeChange = (messageType: 'all' | 'keywords') => {
    const newConfig = { ...currentConfig, messageType } as UserDirectMessageTriggerConfig;
    if (messageType === 'all') {
      delete newConfig.keywords;
    } else {
      newConfig.keywords = [];
    }
    onConfigChange(newConfig);
  };

  const getKeywords = (): string[] => {
    if (triggerType === 'post_comment') {
      return (currentConfig as PostCommentTriggerConfig).keywords || [];
    } else if (triggerType === 'user_directed_messages') {
      return (currentConfig as UserDirectMessageTriggerConfig).keywords || [];
    } else if (triggerType === 'story_reply') {
      return (currentConfig as StoryReplyTriggerConfig).keywords || [];
    }
    return [];
  };

  const addKeyword = () => {
    if (!keyword.trim()) return;

    if (getKeywords().length >= 2) {
      toast.error("You can only add up to 2 keywords.");
      return;
    }

    if (triggerType === 'post_comment') {
      const cfg = currentConfig as PostCommentTriggerConfig;
      onConfigChange({
        ...cfg,
        keywords: [...(cfg.keywords || []), keyword.trim()],
      });
    } else if (triggerType === 'user_directed_messages') {
      const cfg = currentConfig as UserDirectMessageTriggerConfig;
      onConfigChange({
        ...cfg,
        keywords: [...(cfg.keywords || []), keyword.trim()],
      });
    } else if (triggerType === 'story_reply') {
      const cfg = currentConfig as StoryReplyTriggerConfig;
      onConfigChange({
        ...cfg,
        keywords: [...(cfg.keywords || []), keyword.trim()],
      });
    }
    setKeyword('');
  };

  const removeKeyword = (index: number) => {
    if (triggerType === 'post_comment') {
      const cfg = currentConfig as PostCommentTriggerConfig;
      onConfigChange({
        ...cfg,
        keywords: cfg.keywords?.filter((_, i) => i !== index) || [],
      });
    } else if (triggerType === 'user_directed_messages') {
      const cfg = currentConfig as UserDirectMessageTriggerConfig;
      onConfigChange({
        ...cfg,
        keywords: cfg.keywords?.filter((_, i) => i !== index) || [],
      });
    } else if (triggerType === 'story_reply') {
      const cfg = currentConfig as StoryReplyTriggerConfig;
      onConfigChange({
        ...cfg,
        keywords: cfg.keywords?.filter((_, i) => i !== index) || [],
      });
    }
  };

  return (
    <div className="space-y-10">
      {!isCondensed && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-1 font-outfit">Configure Logic</h2>
            <p className="text-slate-400 font-normal font-outfit text-sm">Fine-tune exactly when your automation should fire.</p>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 shrink-0 self-start">
            <Filter className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-widest leading-none">
              {getTriggerName(triggerType)}
            </span>
          </div>
        </div>
      )}

      {isCondensed && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500 flex items-center justify-center text-white shadow-lg">
              <Filter size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Step 1: Configure Logic</h2>
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Define your trigger conditions</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {triggerType === 'post_comment' && (
          <>
            {/* Posts monitor section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-extrabold text-xs">A</div>
                <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-tight">Scope: Which posts?</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'all', label: 'Monitor All Posts', desc: 'Every comment on any post will trigger it.' },
                  { id: 'specific', label: 'Select Specific Posts', desc: 'Choose exactly which posts to monitor.' }
                ].map((option) => (
                  <label key={option.id} className={cn(
                    "relative flex flex-col p-6 rounded-3xl border-2 transition-all cursor-pointer group",
                    (currentConfig as PostCommentTriggerConfig).postsType === option.id
                      ? "bg-blue-50/50 border-blue-500 shadow-lg shadow-blue-500/10"
                      : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/30"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "font-bold text-base transition-colors",
                        (currentConfig as PostCommentTriggerConfig).postsType === option.id ? "text-blue-700" : "text-slate-800"
                      )}>
                        {option.label}
                      </span>
                      <input
                        type="radio"
                        name="postsType"
                        checked={(currentConfig as PostCommentTriggerConfig).postsType === option.id}
                        onChange={() => handlePostsTypeChange(option.id as any)}
                        className="w-5 h-5 text-blue-600 border-slate-300 focus:ring-blue-500 rounded-full"
                      />
                    </div>
                    <p className="text-sm font-normal text-slate-500 leading-relaxed group-hover:text-slate-600">
                      {option.desc}
                    </p>
                  </label>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {(currentConfig as PostCommentTriggerConfig).postsType === 'specific' && (
                  <motion.div
                    key="specific-posts"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden bg-slate-50/50 rounded-3xl border border-slate-100 p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-widest">Available Media</h4>
                      {loadingMedia && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    </div>

                    {posts.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {posts.map((post) => (
                          <motion.div
                            key={post.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => togglePostSelection(post.id)}
                            className={cn(
                              "relative cursor-pointer aspect-square rounded-2xl overflow-hidden border-4 transition-all group",
                              selectedPosts.includes(post.id) ? "border-blue-500 shadow-lg" : "border-transparent hover:border-blue-200"
                            )}
                          >
                            <img
                              src={post.media_type === 'VIDEO' ? (post.thumbnail_url || post.media_url) : post.media_url}
                              alt={post.caption || 'Instagram Post'}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            {post.media_type === 'VIDEO' && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Video className="w-8 h-8 text-white drop-shadow-lg" />
                              </div>
                            )}
                            <div className={cn(
                              "absolute inset-0 transition-opacity duration-300",
                              selectedPosts.includes(post.id) ? "bg-blue-600/20" : "bg-black/0 group-hover:bg-black/10"
                            )} />

                            {selectedPosts.includes(post.id) && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-lg shadow-lg">
                                <CheckCircle2 size={16} />
                              </div>
                            )}
                            {post.caption && (
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform">
                                <p className="text-[10px] text-white font-medium truncate">{post.caption}</p>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    ) : !loadingMedia && (
                      <div className="text-center py-12 space-y-3">
                        <ImageIcon className="h-10 w-10 text-slate-300 mx-auto" />
                        <p className="text-slate-400 font-medium text-sm">No recent posts found to monitor.</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Comments monitor section */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-extrabold text-xs">B</div>
                <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-tight">Logic: Which comments?</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'all', label: 'Every Comment', desc: 'Respond to absolutely every comment posted.' },
                  { id: 'keywords', label: 'Keyword Filter', desc: 'Only trigger when specific words are used.' }
                ].map((option) => (
                  <label key={option.id} className={cn(
                    "relative flex flex-col p-6 rounded-3xl border-2 transition-all cursor-pointer group",
                    (currentConfig as PostCommentTriggerConfig).commentsType === option.id
                      ? "bg-indigo-50/50 border-indigo-500 shadow-lg shadow-indigo-500/10"
                      : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/30"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "font-bold text-base transition-colors",
                        (currentConfig as PostCommentTriggerConfig).commentsType === option.id ? "text-indigo-700" : "text-slate-800"
                      )}>
                        {option.label}
                      </span>
                      <input
                        type="radio"
                        name="commentsType"
                        checked={(currentConfig as PostCommentTriggerConfig).commentsType === option.id}
                        onChange={() => handleCommentsTypeChange(option.id as any)}
                        className="w-5 h-5 text-indigo-600 border-slate-300 focus:ring-indigo-500 rounded-full"
                      />
                    </div>
                    <p className="text-sm font-normal text-slate-500 leading-relaxed group-hover:text-slate-600">
                      {option.desc}
                    </p>
                  </label>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {(currentConfig as PostCommentTriggerConfig).commentsType === 'keywords' && (
                  <motion.div
                    key="comment-keywords"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="bg-indigo-50/30 rounded-3xl border border-indigo-100 p-8 space-y-6"
                  >
                    <div className="space-y-4">
                      <label className="block text-sm font-semibold text-indigo-700 uppercase tracking-widest pl-1">
                        Active Keywords <span className="text-xs text-indigo-400 font-medium">(Max 2)</span>
                      </label>
                      <div className="flex gap-3">
                        <div className="relative flex-1 group">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-300 group-focus-within:text-indigo-500 transition-colors" />
                          <input
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                            placeholder="Add a magic keyword..."
                            className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-100 bg-white shadow-inner focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-semibold text-slate-800 transition-all placeholder:text-slate-300"
                          />
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={addKeyword}
                          className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-semibold text-sm uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:brightness-110 transition-all"
                        >
                          Add
                        </motion.button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {getKeywords().map((kw, index) => (
                        <motion.span
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3 pl-4 pr-1 py-1.5 bg-white border border-indigo-200 rounded-xl shadow-sm group/kw"
                        >
                          <span className="text-sm font-semibold text-slate-700">{kw}</span>
                          <button
                            onClick={() => removeKeyword(index)}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <X size={14} />
                          </button>
                        </motion.span>
                      ))}
                      {getKeywords().length === 0 && (
                        <span className="text-sm font-medium text-slate-400 italic py-2">Add your first keyword above...</span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {triggerType === 'story_reply' && (
          <div className="space-y-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 font-extrabold text-xs">S</div>
                <h3 className="text-lg font-extrabold text-slate-800 uppercase tracking-tight">Trigger Logic</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'all', label: 'All Story Replies', desc: 'Never miss a beat, respond to every reaction.' },
                  { id: 'keywords', label: 'Keyword Filter', desc: 'Target specific reactions or conversations.' }
                ].map((option) => (
                  <label key={option.id} className={cn(
                    "relative flex flex-col p-6 rounded-3xl border-2 transition-all cursor-pointer group",
                    (currentConfig as StoryReplyTriggerConfig).storiesType === option.id
                      ? "bg-violet-50/50 border-violet-500 shadow-lg shadow-violet-500/10"
                      : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/30"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "font-bold text-lg transition-colors",
                        (currentConfig as StoryReplyTriggerConfig).storiesType === option.id ? "text-violet-700" : "text-slate-800"
                      )}>
                        {option.label}
                      </span>
                      <input
                        type="radio"
                        name="storiesType"
                        checked={(currentConfig as StoryReplyTriggerConfig).storiesType === option.id}
                        onChange={() => handleStoriesTypeChange(option.id as any)}
                        className="w-5 h-5 text-violet-600 border-slate-300 focus:ring-violet-500 rounded-full"
                      />
                    </div>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed group-hover:text-slate-600">
                      {option.desc}
                    </p>
                  </label>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {(currentConfig as StoryReplyTriggerConfig).storiesType === 'keywords' && (
                  <motion.div
                    key="story-keywords"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-violet-50/30 rounded-3xl border border-violet-100 p-8 space-y-6"
                  >
                    <div className="space-y-4">
                      <label className="block text-sm font-semibold text-violet-700 uppercase tracking-widest pl-1">Keywords</label>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                          placeholder="Type and press enter..."
                          className="flex-1 px-6 py-4 rounded-2xl border-2 border-slate-100 bg-white font-semibold text-slate-800 transition-all focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500"
                        />
                        <button onClick={addKeyword} className="bg-violet-600 text-white px-8 rounded-2xl font-semibold text-sm uppercase tracking-widest">Add</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getKeywords().map((kw, index) => (
                        <span key={index} className="px-4 py-2 bg-white border border-violet-200 rounded-xl flex items-center gap-2 shadow-sm font-semibold text-slate-700">
                          {kw} <X size={14} className="cursor-pointer text-slate-400 hover:text-red-500" onClick={() => removeKeyword(index)} />
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {triggerType === 'user_directed_messages' && (
          <div className="space-y-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-extrabold text-xs">D</div>
                <h3 className="text-lg font-extrabold text-slate-800 uppercase tracking-tight">Conversation Flow</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'all', label: 'All DMs', desc: 'Greet everyone who messages you instantly.' },
                  { id: 'keywords', label: 'Keyword Filter', desc: 'Automate responses based on intents.' }
                ].map((option) => (
                  <label key={option.id} className={cn(
                    "relative flex flex-col p-6 rounded-3xl border-2 transition-all cursor-pointer group",
                    (currentConfig as UserDirectMessageTriggerConfig).messageType === option.id
                      ? "bg-emerald-50/50 border-emerald-500 shadow-lg shadow-emerald-500/10"
                      : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/30"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "font-bold text-lg transition-colors",
                        (currentConfig as UserDirectMessageTriggerConfig).messageType === option.id ? "text-emerald-700" : "text-slate-800"
                      )}>
                        {option.label}
                      </span>
                      <input
                        type="radio"
                        name="messageType"
                        checked={(currentConfig as UserDirectMessageTriggerConfig).messageType === option.id}
                        onChange={() => handleMessageTypeChange(option.id as any)}
                        className="w-5 h-5 text-emerald-600 border-slate-300 focus:ring-emerald-500 rounded-full"
                      />
                    </div>
                    <p className="text-sm font-normal text-slate-500 leading-relaxed group-hover:text-slate-600">
                      {option.desc}
                    </p>
                  </label>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {(currentConfig as UserDirectMessageTriggerConfig).messageType === 'keywords' && (
                  <motion.div
                    key="dm-keywords"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-emerald-50/30 rounded-3xl border border-emerald-100 p-8 space-y-6"
                  >
                    <div className="space-y-4">
                      <label className="block text-sm font-semibold text-emerald-700 uppercase tracking-widest pl-1">Keywords</label>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                          placeholder="Type and press enter..."
                          className="flex-1 px-6 py-4 rounded-2xl border-2 border-slate-100 bg-white font-semibold text-slate-800 transition-all focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500"
                        />
                        <button onClick={addKeyword} className="bg-emerald-600 text-white px-8 rounded-2xl font-semibold text-sm uppercase tracking-widest">Add</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getKeywords().map((kw, index) => (
                        <span key={index} className="px-4 py-2 bg-white border border-emerald-200 rounded-xl flex items-center gap-2 shadow-sm font-semibold text-slate-700">
                          {kw} <X size={14} className="cursor-pointer text-slate-400 hover:text-red-500" onClick={() => removeKeyword(index)} />
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {!isCondensed && (
        <div className="flex justify-between items-center pt-8 border-t border-slate-100">
          <button
            onClick={onBack}
            className="px-8 py-3.5 text-slate-500 hover:text-slate-800 font-semibold text-sm uppercase tracking-widest transition-all"
          >
            Back
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onNext}
            className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl hover:shadow-xl hover:shadow-blue-500/20 transition-all font-semibold text-sm uppercase tracking-widest shadow-lg flex items-center gap-3"
          >
            Define Actions <ArrowRight size={18} />
          </motion.button>
        </div>
      )}
    </div>
  );
}
