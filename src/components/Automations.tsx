import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, ChevronDown, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { N8nWorkflowService } from '../lib/n8nService';

interface Automation {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  trigger_type: 'post_comment' | 'story_reply' | 'user_directed_messages';
  created_at: string;
  updated_at: string;
  n8n_workflow_id?: string;
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

  useEffect(() => {
    fetchAutomations();
    checkInstagramAccount();
  }, [user]);

  useEffect(() => {
    filterAndSortAutomations();
  }, [automations, searchQuery, sortBy, statusFilter, triggerFilter]);

  const fetchAutomations = async () => {
    if (!user) return;

    try {
      // Fetch automations
      const { data: automationsData, error: automationsError } = await supabase
        .from('automations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (automationsError) throw automationsError;

      // Fetch n8n workflows linked to automations
      const { data: workflowsData, error: workflowsError } = await supabase
        .from('n8n_workflows')
        .select('n8n_workflow_id, automation_id')
        .eq('user_id', user.id)
        .not('automation_id', 'is', null);

      if (workflowsError) throw workflowsError;

      // Map workflows to automations
      const workflowsMap = new Map(
        workflowsData?.filter(w => w.automation_id).map(w => [w.automation_id, w.n8n_workflow_id]) || []
      );

      const automationsWithWorkflows = (automationsData || []).map(automation => ({
        ...automation,
        n8n_workflow_id: workflowsMap.get(automation.id)
      }));

      setAutomations(automationsWithWorkflows);
    } catch (error) {
      console.error('Error fetching automations:', error);
    } finally {
      setLoading(false);
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

  const toggleStatus = async (id: string, currentStatus: string, n8nWorkflowId?: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      // Update automation status in Supabase
      const { error } = await supabase
        .from('automations')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Update n8n workflow status if workflow exists
      if (n8nWorkflowId && user) {
        try {
          if (newStatus === 'active') {
            await N8nWorkflowService.activateWorkflow(n8nWorkflowId, user.id);
          } else {
            await N8nWorkflowService.deactivateWorkflow(n8nWorkflowId, user.id);
          }
        } catch (n8nError) {
          console.error('Error updating n8n workflow status:', n8nError);
          // Don't fail the whole operation, just log the error
        }
      }

      setAutomations(automations.map(auto =>
        auto.id === id ? { ...auto, status: newStatus as 'active' | 'inactive' } : auto
      ));
    } catch (error) {
      console.error('Error updating automation status:', error);
      alert('Failed to update automation status. Please try again.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
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
        <div className="space-y-5">
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
                      className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                        automation.status === 'active'
                          ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {automation.status}
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
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleStatus(automation.id, automation.status, automation.n8n_workflow_id)}
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
