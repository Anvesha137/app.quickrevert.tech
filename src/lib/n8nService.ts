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

interface ExecutionResponse {
  success: boolean;
  execution?: any;
  executions?: any[];
}

export class N8nWorkflowService {
  static async createWorkflow(
    data: Omit<WorkflowCreationData, 'userId'>,
    userId: string
  ): Promise<WorkflowCreationResponse> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('create-workflow', {
        body: {
          userId,
          template: data.template || 'instagram_automation_v1',
          variables: data.variables || {},
          autoActivate: data.autoActivate ?? false,
          instagramAccountId: data.instagramAccountId,
          workflowName: data.workflowName,
          automationId: data.automationId,
        }
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result as WorkflowCreationResponse;
    } catch (error) {
      console.error('Error creating N8N workflow:', error);
      throw error;
    }
  }

  static async updateWorkflow(
    data: Omit<WorkflowCreationData, 'userId'>,
    userId: string
  ): Promise<WorkflowCreationResponse> {
    // The backend 'create-workflow' function now handles updates automatically
    // when an existing 'automationId' is provided.
    return this.createWorkflow(data, userId);
  }

  static async createAnalyticsWorkflow(userId: string, instagramAccountId: string): Promise<WorkflowCreationResponse> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('create-workflow', {
        body: {
          userId,
          instagramAccountId,
          triggerType: 'enable_analytics',
          autoActivate: true
        }
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result as WorkflowCreationResponse;
    } catch (error) {
      console.error('Error creating Analytics workflow:', error);
      throw error;
    }
  }

  static async refreshAnalytics(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('refresh-analytics', {
        method: 'POST'
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result;
    } catch (error) {
      console.error('Error refreshing analytics:', error);
      throw error;
    }
  }

  static async activateWorkflow(workflowId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('activate-workflow', {
        body: { workflowId }
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result;
    } catch (error) {
      console.error('Error activating N8N workflow:', error);
      throw error;
    }
  }

  static async deactivateWorkflow(workflowId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('deactivate-workflow', {
        body: { workflowId }
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result;
    } catch (error) {
      console.error('Error deactivating N8N workflow:', error);
      throw error;
    }
  }

  static async getExecution(executionId: string, userId: string): Promise<ExecutionResponse> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(`get-executions?executionId=${executionId}`, {
        method: 'GET'
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result;
    } catch (error) {
      console.error('Error getting N8N execution:', error);
      throw error;
    }
  }

  static async getExecutions(workflowId?: string, limit: number = 50, userId?: string): Promise<ExecutionResponse> {
    try {
      const params = new URLSearchParams();
      if (workflowId) params.append('workflowId', workflowId);
      params.append('limit', limit.toString());

      const { data: result, error: invokeError } = await supabase.functions.invoke(`get-executions?${params.toString()}`, {
        method: 'GET'
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result;
    } catch (error) {
      console.error('Error getting N8N executions:', error);
      throw error;
    }
  }

  static async deleteWorkflow(workflowId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('delete-workflow', {
        body: { workflowId }
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      return result;
    } catch (error) {
      console.error('Error deleting N8N workflow:', error);
      throw error;
    }
  }
}