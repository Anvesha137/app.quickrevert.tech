import { useState, useEffect } from 'react';
import { Plus, X, Image as ImageIcon, Video } from 'lucide-react';
import { TriggerType, TriggerConfig, PostCommentTriggerConfig, StoryReplyTriggerConfig, UserDirectMessageTriggerConfig } from '../../types/automation';
import { supabase } from '../../lib/supabase';

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
  onNext: () => void;
  onBack: () => void;
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

export default function TriggerConfigStep({ triggerType, config, onConfigChange, onNext, onBack }: TriggerConfigProps) {
  const [keyword, setKeyword] = useState('');
  const [posts, setPosts] = useState<InstagramMedia[]>([]);
  const [stories, setStories] = useState<InstagramMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [selectedStories, setSelectedStories] = useState<string[]>([]);

  useEffect(() => {
    if (triggerType === 'post_comment' && (config as PostCommentTriggerConfig)?.postsType === 'specific') {
      fetchPosts();
    }
  }, [(config as PostCommentTriggerConfig)?.postsType]);

  useEffect(() => {
    if (triggerType === 'story_reply' && (config as StoryReplyTriggerConfig)?.storiesType === 'specific') {
      fetchStories();
    }
  }, [(config as StoryReplyTriggerConfig)?.storiesType]);

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
      console.log('Fetched posts:', data.media || []); // Debug log
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      let errorMessage = 'Failed to fetch Instagram posts';
      if (error.message) {
        errorMessage += ': ' + error.message;
      }
      alert(errorMessage); // Better error feedback
    } finally {
      setLoadingMedia(false);
    }
  };

  const fetchStories = async () => {
    try {
      setLoadingMedia(true);
      const session = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('fetch-instagram-media', {
        headers: {
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: { type: 'stories' },
      });

      if (error) throw error;
      setStories(data.media || []);
      console.log('Fetched stories:', data.media || []); // Debug log
    } catch (error: any) {
      console.error('Error fetching stories:', error);
      let errorMessage = 'Failed to fetch Instagram stories';
      if (error.message) {
        errorMessage += ': ' + error.message;
      }
      alert(errorMessage); // Better error feedback
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

  const toggleStorySelection = (storyId: string) => {
    const newSelection = selectedStories.includes(storyId)
      ? selectedStories.filter(id => id !== storyId)
      : [...selectedStories, storyId];

    setSelectedStories(newSelection);
    onConfigChange({
      ...currentConfig,
      specificStories: newSelection,
    } as StoryReplyTriggerConfig);
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

  const handleStoriesTypeChange = (storiesType: 'all' | 'specific') => {
    const newConfig = { ...currentConfig, storiesType } as StoryReplyTriggerConfig;
    if (storiesType === 'all') {
      delete newConfig.specificStories;
    } else {
      newConfig.specificStories = [];
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

  const addKeyword = () => {
    if (!keyword.trim()) return;

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
    }
  };

  const getKeywords = (): string[] => {
    if (triggerType === 'post_comment') {
      return (currentConfig as PostCommentTriggerConfig).keywords || [];
    } else if (triggerType === 'user_directed_messages') {
      return (currentConfig as UserDirectMessageTriggerConfig).keywords || [];
    }
    return [];
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900">
          <span className="font-semibold">{getTriggerName(triggerType)}</span> Trigger selected - Configure the settings below
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Configure {getTriggerName(triggerType)} Trigger
        </h2>
      </div>

      <div className="space-y-6">
        {triggerType === 'post_comment' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                a. Posts to monitor
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="postsType"
                    checked={(currentConfig as PostCommentTriggerConfig).postsType === 'all'}
                    onChange={() => handlePostsTypeChange('all')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-900">All my posts</span>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="postsType"
                    checked={(currentConfig as PostCommentTriggerConfig).postsType === 'specific'}
                    onChange={() => handlePostsTypeChange('specific')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-900">Specific posts</span>
                </label>
              </div>

              {(currentConfig as PostCommentTriggerConfig).postsType === 'specific' && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-900 mb-3">
                    Select posts to monitor
                  </label>
                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : posts.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                      {posts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => togglePostSelection(post.id)}
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                            selectedPosts.includes(post.id)
                              ? 'border-blue-500 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="aspect-square bg-gray-100">
                            {post.media_type === 'VIDEO' ? (
                              <div className="relative w-full h-full">
                                <img
                                  src={post.thumbnail_url || post.media_url}
                                  alt={post.caption || 'Instagram post'}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                                  <Video className="w-8 h-8 text-white" />
                                </div>
                              </div>
                            ) : (
                              <img
                                src={post.media_url}
                                alt={post.caption || 'Instagram post'}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          {selectedPosts.includes(post.id) && (
                            <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          {post.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
                              <p className="text-white text-xs truncate">{post.caption}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No posts found</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                b. Comments to monitor
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="commentsType"
                    checked={(currentConfig as PostCommentTriggerConfig).commentsType === 'all'}
                    onChange={() => handleCommentsTypeChange('all')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-900">All comments</span>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="commentsType"
                    checked={(currentConfig as PostCommentTriggerConfig).commentsType === 'keywords'}
                    onChange={() => handleCommentsTypeChange('keywords')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-900">Comments with keywords</span>
                </label>
              </div>

              {(currentConfig as PostCommentTriggerConfig).commentsType === 'keywords' && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Keywords
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                      placeholder="Enter keyword"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={addKeyword}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <Plus size={20} />
                      Add
                    </button>
                  </div>
                  {getKeywords().length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {getKeywords().map((kw, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() => removeKeyword(index)}
                            className="text-gray-500 hover:text-red-600"
                          >
                            <X size={16} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {triggerType === 'story_reply' && (
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">
              Stories to monitor
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="storiesType"
                  checked={(currentConfig as StoryReplyTriggerConfig).storiesType === 'all'}
                  onChange={() => handleStoriesTypeChange('all')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-900">All my stories</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="storiesType"
                  checked={(currentConfig as StoryReplyTriggerConfig).storiesType === 'specific'}
                  onChange={() => handleStoriesTypeChange('specific')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-900">Specific stories</span>
              </label>
            </div>

            {(currentConfig as StoryReplyTriggerConfig).storiesType === 'specific' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  Select stories to monitor
                </label>
                {loadingMedia ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : stories.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                    {stories.map((story) => (
                      <div
                        key={story.id}
                        onClick={() => toggleStorySelection(story.id)}
                        className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                          selectedStories.includes(story.id)
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="aspect-[9/16] bg-gray-100">
                          {story.media_type === 'VIDEO' ? (
                            <div className="relative w-full h-full">
                              <img
                                src={story.thumbnail_url || story.media_url}
                                alt="Instagram story"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                                <Video className="w-8 h-8 text-white" />
                              </div>
                            </div>
                          ) : (
                            <img
                              src={story.media_url}
                              alt="Instagram story"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        {selectedStories.includes(story.id) && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No stories found</p>
                    <p className="text-xs mt-1 text-gray-400">Stories are only available for 24 hours</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {triggerType === 'user_directed_messages' && (
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">
              Messages to monitor
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="messageType"
                  checked={(currentConfig as UserDirectMessageTriggerConfig).messageType === 'all'}
                  onChange={() => handleMessageTypeChange('all')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-900">All messages</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="messageType"
                  checked={(currentConfig as UserDirectMessageTriggerConfig).messageType === 'keywords'}
                  onChange={() => handleMessageTypeChange('keywords')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-900">Messages with keywords</span>
              </label>
            </div>

            {(currentConfig as UserDirectMessageTriggerConfig).messageType === 'keywords' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Keywords
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                    placeholder="Enter keyword"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Plus size={20} />
                    Add
                  </button>
                </div>
                {getKeywords().length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {getKeywords().map((kw, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm"
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => removeKeyword(index)}
                          className="text-gray-500 hover:text-red-600"
                        >
                          <X size={16} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Continue to Actions
        </button>
      </div>
    </div>
  );
}
