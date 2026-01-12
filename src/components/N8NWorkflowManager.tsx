import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { N8nWorkflowService } from '../lib/n8nService';
import { supabase } from '../lib/supabase';
import { Instagram } from 'lucide-react';

interface InstagramAccount {
  id: string;
  username: string;
  profile_picture_url: string | null;
  status: string;
}

export default function N8NWorkflowManager() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [formData, setFormData] = useState({
    template: 'instagram_automation_v1' as const,
    instagramAccountId: '',
    workflowName: '',
    variables: {
      calendarUrl: '',
      brandName: 'QuickRevert',
    },
    autoActivate: false,
  });

  useEffect(() => {
    fetchInstagramAccounts();
  }, [user]);

  const fetchInstagramAccounts = async () => {
    if (!user) return;
    
    try {
      setLoadingAccounts(true);
      const { data, error } = await supabase
        .from('instagram_accounts')
        .select('id, username, profile_picture_url, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('connected_at', { ascending: false });

      if (error) throw error;
      
      setInstagramAccounts(data || []);
      
      // Auto-select first account if available
      if (data && data.length > 0 && !formData.instagramAccountId) {
        setFormData(prev => ({ ...prev, instagramAccountId: data[0].id }));
      }
    } catch (err) {
      console.error('Error fetching Instagram accounts:', err);
      setError('Failed to load Instagram accounts');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (name.startsWith('variables.')) {
      const varName = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        variables: {
          ...prev.variables,
          [varName]: value
        }
      }));
    } else if (type === 'checkbox') {
      const target = e.target as HTMLInputElement;
      setFormData(prev => ({
        ...prev,
        [name]: target.checked
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('User not authenticated');
      return;
    }

    if (!formData.instagramAccountId) {
      setError('Please select an Instagram account');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await N8nWorkflowService.createWorkflow({
        template: formData.template,
        instagramAccountId: formData.instagramAccountId,
        workflowName: formData.workflowName || undefined,
        variables: formData.variables,
        autoActivate: formData.autoActivate,
      }, user.id);
      
      setSuccess(result.message);
      console.log('Workflow created:', result);
      
      // Reset form
      setFormData(prev => ({
        ...prev,
        workflowName: '',
      }));
    } catch (err: any) {
      console.error('Error creating workflow:', err);
      setError(err.message || 'Failed to create workflow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">N8N Workflow Manager</h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}
      
      {loadingAccounts ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : instagramAccounts.length === 0 ? (
        <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <Instagram className="text-yellow-600" size={20} />
            <strong className="text-yellow-900">No Instagram Account Connected</strong>
          </div>
          <p className="text-yellow-700 text-sm">
            Please connect an Instagram account before creating workflows. 
            <a href="/connect-accounts" className="ml-1 text-yellow-800 underline font-semibold">Connect now</a>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template
            </label>
            <select
              name="template"
              value={formData.template}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled
            >
              <option value="instagram_automation_v1">Instagram Automation v1</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">Currently only Instagram automation template is available</p>
          </div>

          <div>
            <label htmlFor="instagramAccountId" className="block text-sm font-medium text-gray-700 mb-2">
              Select Instagram Account <span className="text-red-500">*</span>
            </label>
            <select
              id="instagramAccountId"
              name="instagramAccountId"
              value={formData.instagramAccountId}
              onChange={(e) => setFormData(prev => ({ ...prev, instagramAccountId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select an account...</option>
              {instagramAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  @{account.username}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              The workflow will use this account's access token for API calls
            </p>
          </div>

          <div>
            <label htmlFor="workflowName" className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Name (Optional)
            </label>
            <input
              type="text"
              id="workflowName"
              name="workflowName"
              value={formData.workflowName}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Instagram Automation"
            />
            <p className="mt-1 text-sm text-gray-500">Leave empty to use auto-generated name</p>
          </div>
        
          <div>
            <label htmlFor="variables.calendarUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Calendar URL (Optional)
            </label>
            <input
              type="url"
              id="variables.calendarUrl"
              name="variables.calendarUrl"
              value={formData.variables.calendarUrl}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://calendar.example.com"
            />
          </div>
          
          <div>
            <label htmlFor="variables.brandName" className="block text-sm font-medium text-gray-700 mb-1">
              Brand Name (Optional)
            </label>
            <input
              type="text"
              id="variables.brandName"
              name="variables.brandName"
              value={formData.variables.brandName}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your brand name"
            />
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="autoActivate"
              name="autoActivate"
              checked={formData.autoActivate}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="autoActivate" className="ml-2 block text-sm text-gray-700">
              Auto Activate Workflow (defaults off)
            </label>
          </div>
          
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !formData.instagramAccountId}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Workflow...' : 'Create Workflow'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}