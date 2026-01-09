import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { N8nWorkflowService } from '../lib/n8nService';

export default function N8NWorkflowManager() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    template: 'instagram_automation_v1' as const,
    variables: {
      instagramCredentialId: '',
      calendarUrl: '',
      brandName: 'QuickRevert',
    },
    autoActivate: true,
  });

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

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await N8nWorkflowService.createWorkflow(formData, user.id);
      setSuccess(result.message);
      console.log('Workflow created:', result);
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
          <label htmlFor="variables.instagramCredentialId" className="block text-sm font-medium text-gray-700 mb-1">
            Instagram Credential ID
          </label>
          <input
            type="text"
            id="variables.instagramCredentialId"
            name="variables.instagramCredentialId"
            value={formData.variables.instagramCredentialId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter Instagram credential ID"
          />
        </div>
        
        <div>
          <label htmlFor="variables.calendarUrl" className="block text-sm font-medium text-gray-700 mb-1">
            Calendar URL
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
            Brand Name
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
            Auto Activate Workflow
          </label>
        </div>
        
        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Creating Workflow...' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}