import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, ChevronDown, Trash2, MessageCircle, Eye, Users, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { n8nService } from '../lib/n8nService';

interface Automation {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  trigger_type: 'post_comment' | 'story_reply' | 'user_directed_messages';
  created_at: string;
  updated_at: string;
}

interface AutomationMetrics {
  dmsTriggered: number;
  dmOpenRate: number;
  commentReplies: number;
  uniqueUsers: number;
  recentActivities: any[];
}

const triggerLabels = {
  post_comment: 'Post Comment',
  story_reply: 'Story Reply',
  user_directed_messages: 'User Directed Messages'
};

export default function Automations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { gradientClass } = useThemeColors();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [filteredAutomations, setFilteredAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'post_comment' | 'story_reply' | 'user_directed_messages'>('all');
  const [hasInstagramAccount, setHasInstagramAccount] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, AutomationMetrics>>({});
  const [topAutomations, setTopAutomations] = useState<Automation[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  useEffect(() => {
    fetchAutomations();
    checkInstagramAccount();
  }, [user]);

  useEffect(() => {
    if (user && automations.length > 0) {
      fetchAllMetrics();
    }
  }, [user, automations]);

  useEffect(() => {
    filterAndSortAutomations();
  }, [automations, searchQuery, sortBy, statusFilter, triggerFilter]);

  const fetchAutomations = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAutomations(data || []);
    } catch (error) {
      console.error('Error fetching automations:', error);
      alert('Failed to load automations. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllMetrics = async () => {
    if (!user) return;
    
    try {
      // Try to get metrics from N8N service
      let userMetrics;
      try {
        userMetrics = await n8nService.getWorkflowMetrics(user.id);
      } catch (n8nError) {
        console.error('Error fetching metrics from N8N:', n8nError);
        // Fallback: get metrics from Supabase
        const { data: activities, error } = await supabase
          .from('automation_activities')
          .select('*')
          .eq('user_id', user.id)
          .gte('executed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19));
        
        if (error) throw error;
        
        // Calculate metrics from Supabase data
        const dmsTriggered = activities?.filter(a => a.activity_type === 'dm_sent').length || 0;
        const commentReplies = activities?.filter(a => a.activity_type === 'reply').length || 0;
        const uniqueUsers = new Set(activities?.map(a => a.activity_data?.target_username)).size;
        
        // Calculate DM open rate if we have seen data
        const dms = activities?.filter(a => a.activity_type === 'dm_sent') || [];
        const seenDms = dms.filter(dm => dm.activity_data?.metadata?.seen === true).length;
        const dmOpenRate = dms.length > 0 ? Math.round((seenDms / dms.length) * 100) : 0;
        
        // Map activities to the expected format
        const mappedActivities = activities?.map(activity => ({
          workflowId: activity.automation_id,
          actionType: activity.activity_type,
          targetUsername: activity.activity_data?.target_username,
          timestamp: activity.executed_at,
          metadata: activity.activity_data?.metadata || {},
        })) || [];
        
        userMetrics = {
          dmsTriggered,
          dmOpenRate,
          commentReplies,
          uniqueUsers,
          recentActivities: mappedActivities.slice(0, 10),
        };
      }
      
      // Fetch metrics for each automation
      const metricsMap: Record<string, AutomationMetrics> = {};
      for (const automation of automations) {
        // For now, we'll aggregate the overall metrics to each automation
        // In a real implementation, we would fetch metrics per specific automation
        metricsMap[automation.id] = userMetrics;
      }
      
      setMetrics(metricsMap);
      
      // Set top automations (for now, just sort by name)
      setTopAutomations(automations.slice(0, 3));
      
      // Set recent activities
      setRecentActivities(userMetrics.recentActivities || []);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const checkInstagramAccount = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      setHasInstagramAccount(!!data);
    } catch (error) {
      console.error('Error checking Instagram account:', error);
    }
  };

  const filterAndSortAutomations = () => {
    let filtered = [...automations];

    if (searchQuery) {
      filtered = filtered.filter(auto =>
        auto.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        auto.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(auto => auto.status === statusFilter);
    }

    if (triggerFilter !== 'all') {
      filtered = filtered.filter(auto => auto.trigger_type === triggerFilter);
    }

    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    setFilteredAutomations(filtered);
  };

  const handleCreateAutomation = () => {
    if (!hasInstagramAccount) {
      alert('Please connect an Instagram account before creating automations.');
      navigate('/connect-accounts');
      return;
    }
    navigate('/automation/create');
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      // Update in Supabase
      const { error } = await supabase
        .from('automations')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setAutomations(automations.map(auto =>
        auto.id === id ? { ...auto, status: newStatus as 'active' | 'inactive' } : auto
      ));
      
      // Update in N8N as well
      try {
        await n8nService.updateWorkflowStatus(id, newStatus as 'active' | 'inactive');
      } catch (n8nError) {
        console.error('Error updating workflow status in N8N:', n8nError);
        // Don't throw error, just log it as N8N sync failure shouldn't break UI
      }
    } catch (error) {
      console.error('Error updating automation status:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Try to delete from N8N first
      try {
        await n8nService.deleteWorkflow(id);
      } catch (n8nError) {
        console.error('Error deleting workflow from N8N:', n8nError);
        // Continue with Supabase deletion even if N8N fails
      }
      
      // Then delete from Supabase
      const { error } = await supabase
        .from('automations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAutomations(automations.filter(auto => auto.id !== id));
    } catch (error) {
      console.error('Error deleting automation:', error);
      alert('Failed to delete automation. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">Automations</h1>
            <p className="text-gray-600 text-lg">Create and manage your Instagram automations</p>
          </div>
          <button
            onClick={handleCreateAutomation}
            className={`flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r ${gradientClass} text-white rounded-xl hover:opacity-90 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-semibold`}
          >
            <Plus size={20} />
            Create Automation
          </button>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Active Automations</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{automations.filter(a => a.status === 'active').length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">DMs Triggered</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{Object.values(metrics).reduce((sum, m) => sum + m.dmsTriggered, 0)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">DM Open Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{Object.values(metrics).reduce((avg, m, _, arr) => avg + m.dmOpenRate, 0) / (Object.keys(metrics).length || 1)}%</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Eye className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Unique Users</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{Object.values(metrics).reduce((sum, m) => sum + m.uniqueUsers, 0)}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search automations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm hover:border-gray-300 transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                className="appearance-none pl-4 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer font-medium shadow-sm hover:border-gray-300 transition-all"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">Name</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
            </div>

            <div className="flex gap-2 border-2 border-gray-200 rounded-xl p-1.5 bg-gray-50 shadow-sm">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  statusFilter === 'all'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  statusFilter === 'active'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('inactive')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Inactive
              </button>
            </div>

            <div className="relative">
              <select
                value={triggerFilter}
                onChange={(e) => setTriggerFilter(e.target.value as typeof triggerFilter)}
                className="appearance-none pl-4 pr-10 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer font-medium shadow-sm hover:border-gray-300 transition-all"
              >
                <option value="all">All Triggers</option>
                <option value="post_comment">Post Comment</option>
                <option value="story_reply">Story Reply</option>
                <option value="user_directed_messages">User Directed Messages</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredAutomations.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-5">
            {filteredAutomations.map((automation) => (
              <div
                key={automation.id}
                className="group bg-white rounded-2xl shadow-md border-2 border-gray-200 p-6 hover:shadow-xl hover:border-blue-300 transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-bold text-gray-900">{automation.name}</h3>
                      <span
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                          automation.status === 'active'
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {automation.status === 'active' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                          </span>
                        )}
                        {automation.status === 'active' ? 'Live & Monitoring' : automation.status}
                      </span>
                    </div>
                    {automation.description && (
                      <p className="text-gray-600 mb-4 text-base">{automation.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg">
                        <span className="font-bold text-blue-700">Trigger:</span>
                        <span className="text-blue-600">{triggerLabels[automation.trigger_type]}</span>
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-500 font-medium">Created {new Date(automation.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    {/* Metrics for this automation */}
                    {metrics[automation.id] && (
                      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
                        <div className="text-sm">
                          <span className="text-gray-500">DMs: </span>
                          <span className="font-semibold text-gray-900">{metrics[automation.id].dmsTriggered}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Open Rate: </span>
                          <span className="font-semibold text-gray-900">{metrics[automation.id].dmOpenRate}%</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Replies: </span>
                          <span className="font-semibold text-gray-900">{metrics[automation.id].commentReplies}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Users: </span>
                          <span className="font-semibold text-gray-900">{metrics[automation.id].uniqueUsers}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleStatus(automation.id, automation.status)}
                      className={`px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg ${
                        automation.status === 'active'
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700'
                      }`}
                    >
                      {automation.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(automation.id, automation.name)}
                      className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-all shadow-md hover:shadow-lg"
                      title="Delete automation"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="lg:col-span-1">
            {/* Top Automations */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Top Performing Automations</h3>
              {topAutomations.length > 0 ? (
                <div className="space-y-4">
                  {topAutomations.map((automation, index) => (
                    <div key={automation.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold">
                          {index + 1}
                        </div>
                        <span className="font-medium text-gray-900 truncate max-w-[160px]">{automation.name}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {metrics[automation.id]?.commentReplies || 0} replies
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No automations yet</p>
              )}
            </div>
            
            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
              {recentActivities.length > 0 ? (
                <div className="space-y-3">
                  {recentActivities.slice(0, 5).map((activity, index) => (
                    <div key={`${activity.workflowId}-${index}`} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{activity.actionType}</p>
                          <p className="text-sm text-gray-500">to @{activity.targetUsername}</p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus size={32} className="text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchQuery || statusFilter !== 'all' || triggerFilter !== 'all'
                ? 'No automations found'
                : 'No automations yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || statusFilter !== 'all' || triggerFilter !== 'all'
                ? 'Try adjusting your filters or search query'
                : 'Get started by creating your first automation'}
            </p>
            <button
              onClick={handleCreateAutomation}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Create Automation
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
