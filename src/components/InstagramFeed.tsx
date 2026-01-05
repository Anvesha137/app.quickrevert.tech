import { useState, useEffect } from 'react';
import { Instagram, Heart, MessageCircle, ExternalLink, Users, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  biography?: string;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

export default function InstagramFeed() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<InstagramProfile | null>(null);
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchInstagramData();
    }
  }, [user]);

  const fetchInstagramData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please log in to view Instagram data');
        return;
      }

      const [profileResponse, mediaResponse] = await Promise.all([
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-instagram-profile`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        ),
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-instagram-media?type=posts`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        ),
      ]);

      if (profileResponse.ok) {
        try {
          const text = await profileResponse.text();
          if (text) {
            const profileData = JSON.parse(text);
            setProfile(profileData.profile);
          }
        } catch (e) {
          console.error('Error parsing profile response:', e);
        }
      }

      if (mediaResponse.ok) {
        try {
          const text = await mediaResponse.text();
          if (text) {
            const mediaData = JSON.parse(text);
            setMedia(mediaData.media?.slice(0, 6) || []);
          }
        } catch (e) {
          console.error('Error parsing media response:', e);
        }
      }

      if (!profileResponse.ok && !mediaResponse.ok) {
        try {
          const text = await profileResponse.text();
          if (text) {
            const error = JSON.parse(text);
            if (error.error === 'No active Instagram account found') {
              setError(null);
            } else {
              setError('Failed to load Instagram data');
            }
          }
        } catch (e) {
          setError(null);
        }
      }
    } catch (err: any) {
      console.error('Error fetching Instagram data:', err);
      setError('Failed to load Instagram data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-8">
        <div className="text-center py-8">
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-8">
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-pink-100 via-rose-100 to-orange-100 rounded-3xl mb-6 shadow-lg">
            <Instagram size={40} className="text-pink-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">No Instagram Connected</h3>
          <p className="text-gray-600 mb-6 text-lg">Connect your Instagram account to see your posts and stats</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border-2 border-gray-200 p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Instagram Feed</h2>
        <a
          href={`https://instagram.com/${profile.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-pink-600 hover:text-pink-700 transition-colors"
        >
          <ExternalLink size={20} />
        </a>
      </div>

      <div className="mb-8 p-6 bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 rounded-2xl border-2 border-pink-200">
        <div className="flex items-center gap-4 mb-6">
          <img
            src={profile.profile_picture_url}
            alt={profile.username}
            className="w-20 h-20 rounded-full ring-4 ring-pink-200 shadow-lg"
          />
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">@{profile.username}</h3>
            {profile.name && <p className="text-gray-600 font-medium">{profile.name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ImageIcon size={20} className="text-pink-600" />
              <p className="text-2xl font-bold text-gray-900">{profile.media_count.toLocaleString()}</p>
            </div>
            <p className="text-sm text-gray-600 font-medium">Posts</p>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Users size={20} className="text-rose-600" />
              <p className="text-2xl font-bold text-gray-900">{profile.followers_count.toLocaleString()}</p>
            </div>
            <p className="text-sm text-gray-600 font-medium">Followers</p>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Users size={20} className="text-orange-600" />
              <p className="text-2xl font-bold text-gray-900">{profile.follows_count.toLocaleString()}</p>
            </div>
            <p className="text-sm text-gray-600 font-medium">Following</p>
          </div>
        </div>
      </div>

      {media.length > 0 ? (
        <>
          <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Posts</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {media.map((item) => (
              <a
                key={item.id}
                href={item.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square overflow-hidden rounded-xl border-2 border-gray-200 hover:border-pink-300 transition-all shadow-md hover:shadow-xl"
              >
                <img
                  src={item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url}
                  alt={item.caption || 'Instagram post'}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    {item.caption && (
                      <p className="text-white text-sm line-clamp-2 mb-2 font-medium">
                        {item.caption}
                      </p>
                    )}
                  </div>
                </div>
                {item.media_type === 'VIDEO' && (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-xs font-bold">
                    VIDEO
                  </div>
                )}
                {item.media_type === 'CAROUSEL_ALBUM' && (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-xs font-bold">
                    ALBUM
                  </div>
                )}
              </a>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-600">No posts found</p>
        </div>
      )}
    </div>
  );
}
