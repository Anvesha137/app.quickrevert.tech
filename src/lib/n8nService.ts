import { supabase } from './supabase';

interface WorkflowCreationData {
  userId: string;
  template?: 'instagram_automation_v1';
  variables?: {
    instagramCredentialId?: string;
    calendarUrl?: string;
    brandName?: string;
    [key: string]: string | undefined;
  };
  autoActivate?: boolean;
  instagramAccountId?: string;
  workflowName?: string;
  automationId?: string;
}

interface WorkflowCreationResponse {
  success: boolean;
  workflowId: string;
  workflowName?: string;
  webhookPath?: string;
  webhookUrl?: string;
  instagramAccount?: {
    id: string;
    username: string;
  };
  n8nWorkflow?: any;
  message: string;
}

interface WorkflowErrorResponse {
  error: string;
}

export class N8nWorkflowService {
  static async createWorkflow(
    data: Omit<WorkflowCreationData, 'userId'>, 
    userId: string
  ): Promise<WorkflowCreationResponse> {
    try {
      // Get auth token - try to refresh if needed
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // If no session or session expired, try to refresh
      if (!session || sessionError) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          throw new Error('No authentication token available. Please log in again.');
        }
        session = refreshData.session;
      }
      
      const authToken = session.access_token;
      
      if (!authToken) {
        throw new Error('No authentication token available');
      }

      // Prepare the request payload
      const requestBody = {
        userId,
        template: data.template || 'instagram_automation_v1',
        variables: data.variables || {},
        autoActivate: data.autoActivate ?? false,
        instagramAccountId: data.instagramAccountId,
        workflowName: data.workflowName,
        automationId: data.automationId,
      };

      console.log('Creating workflow with:', {
        userId,
        instagramAccountId: data.instagramAccountId,
        hasToken: !!authToken,
        tokenLength: authToken.length
      });

      // Call the Supabase Edge Function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(requestBody)
      });

      const result: WorkflowCreationResponse | WorkflowErrorResponse = await response.json();

      if (!response.ok) {
        const errorResult = result as WorkflowErrorResponse;
        console.error('Workflow creation failed:', {
          status: response.status,
          error: errorResult.error,
          details: (errorResult as any).details
        });
        throw new Error(errorResult.error || `HTTP error! status: ${response.status}`);
      }

      return result as WorkflowCreationResponse;
    } catch (error) {
      console.error('Error creating N8N workflow:', error);
      throw error;
    }
  }
}