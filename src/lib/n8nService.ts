import { supabase } from './supabase';

interface WorkflowCreationData {
  userId: string;
  template: 'instagram_automation_v1';
  variables: {
    instagramCredentialId: string;
    calendarUrl: string;
    brandName: string;
    [key: string]: string;
  };
  autoActivate: boolean;
}

interface WorkflowCreationResponse {
  success: boolean;
  workflowId: string;
  n8nWorkflow: any;
  message: string;
}

interface WorkflowErrorResponse {
  error: string;
}

export class N8nWorkflowService {
  static async createWorkflow(data: Omit<WorkflowCreationData, 'userId'>, userId: string): Promise<WorkflowCreationResponse> {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      
      if (!authToken) {
        throw new Error('No authentication token available');
      }

      // Prepare the request payload
      const requestBody = {
        userId,
        ...data
      };

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
        throw new Error(errorResult.error || `HTTP error! status: ${response.status}`);
      }

      return result as WorkflowCreationResponse;
    } catch (error) {
      console.error('Error creating N8N workflow:', error);
      throw error;
    }
  }
}