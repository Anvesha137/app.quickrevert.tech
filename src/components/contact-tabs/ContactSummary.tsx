import { Calendar, MessageSquare, Mail, Image, TrendingUp } from 'lucide-react';

interface ContactStats {
  totalInteractions: number;
  firstContact: string;
  lastContact: string;
  commentCount: number;
  dmCount: number;
  storyReplyCount: number;
}

interface ContactSummaryProps {
  username: string;
  stats: ContactStats;
}

function formatTimeAgo(date: string) {
  const now = new Date();
  const contactDate = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - contactDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function ContactSummary({ username, stats }: ContactSummaryProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Contact Metrics</h2>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Total Interactions</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalInteractions}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">First Contact</p>
            <p className="text-lg font-semibold text-gray-900">{formatTimeAgo(stats.firstContact)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Last Contact</p>
            <p className="text-lg font-semibold text-gray-900">{formatTimeAgo(stats.lastContact)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center gap-2 mb-6">
          <MessageSquare className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Trigger Types</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Comments</p>
                <p className="text-xs text-gray-600">Post comments</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{stats.commentCount}</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Direct Messages</p>
                <p className="text-xs text-gray-600">Messages sent</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">{stats.dmCount}</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Image className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Story Replies</p>
                <p className="text-xs text-gray-600">Story interactions</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-600">{stats.storyReplyCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Account Age</span>
            <span className="font-medium text-gray-900">
              {Math.floor((new Date(stats.lastContact).getTime() - new Date(stats.firstContact).getTime()) / (1000 * 60 * 60 * 24))} days
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Interaction Frequency</span>
            <span className="font-medium text-gray-900">
              {(stats.totalInteractions / Math.max(1, Math.floor((new Date(stats.lastContact).getTime() - new Date(stats.firstContact).getTime()) / (1000 * 60 * 60 * 24)))).toFixed(1)} per day
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
