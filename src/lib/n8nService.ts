import { supabase } from './supabase';

interface WorkflowData {
  userId: string;
  instagramAccountId: string;
  automationName: string;
  triggerType: string;
  triggerConfig: any;
  actions: any[];
  status: 'active' | 'inactive';
}

interface N8nWorkflowResponse {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ActivityLog {
  id: string;
  userId: string;
  workflowId: string;
  actionType: string;
  targetUsername: string;
  timestamp: string;
  metadata: Record<string, any>;
}

class N8nService {
  private n8nApiKey: string;
  private n8nBaseUrl: string;
  private projectId: string;
  private folderId: string;

  constructor() {
    this.n8nApiKey = import.meta.env.VITE_N8N_API_KEY || '';
    this.n8nBaseUrl = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.yourdomain.com';
    this.projectId = 'iT4vxoQUCp4XxToM';
    this.folderId = 'cG7JOnys7RGk6dnn';
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.n8nApiKey,
    };
  }

  async createWorkflow(workflowData: WorkflowData): Promise<N8nWorkflowResponse> {
    try {
      // Create the workflow in N8N
      const workflowPayload = this.buildWorkflowPayload(workflowData);
      
      const response = await fetch(`${this.n8nBaseUrl}/workflows`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(workflowPayload),
      });

      if (!response.ok) {
        throw new Error(`Failed to create workflow: ${response.statusText}`);
      }

      const workflow = await response.json();
      
      // Save workflow metadata to Supabase
      await this.saveWorkflowMetadata(workflowData, workflow.id);
      
      return {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error creating workflow:', error);
      throw error;
    }
  }

  private buildWorkflowPayload(workflowData: WorkflowData) {
    // Build the N8N workflow JSON structure
    return {
      name: `${workflowData.automationName} - ${workflowData.userId}`,
      nodes: this.buildWorkflowNodes(workflowData),
      connections: this.buildWorkflowConnections(),
      settings: {
        saveManualExecutions: true,
        timezone: 'America/New_York',
        executionTimeout: 3600,
      },
      tags: [],
      scope: ['workflow'],
      projectId: this.projectId,
      folderId: this.folderId,
      active: true,
    };
  }

  private buildWorkflowNodes(workflowData: WorkflowData) {
    const nodes = [];

    // Trigger node based on trigger type
    switch (workflowData.triggerType) {
      case 'post_comment':
        nodes.push({
          id: 'trigger-post-comment',
          name: 'Instagram Post Comment Trigger',
          type: 'n8n-nodes-base.httpRequest',
          position: [240, 300],
          parameters: {
            method: 'GET',
            url: `https://graph.instagram.com/me/media?fields=id,caption,comments{from,text}&access_token={{$json.instagram_access_token}}`,
            options: {},
          },
          credentials: {},
        });
        break;
      case 'story_reply':
        nodes.push({
          id: 'trigger-story-reply',
          name: 'Instagram Story Reply Trigger',
          type: 'n8n-nodes-base.httpRequest',
          position: [240, 300],
          parameters: {
            method: 'GET',
            url: `https://graph.facebook.com/v18.0/{{$json.page_id}}/conversations?platform=instagram&access_token={{$json.instagram_access_token}}`,
            options: {},
          },
          credentials: {},
        });
        break;
      case 'user_directed_messages':
        nodes.push({
          id: 'trigger-direct-message',
          name: 'Instagram Direct Message Trigger',
          type: 'n8n-nodes-base.webhook',
          position: [240, 300],
          parameters: {
            httpMethod: 'POST',
            path: `instagram-webhook-${workflowData.userId}`,
            responseMode: 'responseNode',
            options: {},
          },
          credentials: {},
        });
        break;
      default:
        // Default webhook trigger
        nodes.push({
          id: 'trigger-default',
          name: 'Webhook Trigger',
          type: 'n8n-nodes-base.webhook',
          position: [240, 300],
          parameters: {
            httpMethod: 'POST',
            path: `webhook-${workflowData.userId}-${Date.now()}`,
            responseMode: 'responseNode',
            options: {},
          },
          credentials: {},
        });
    }

    // Action nodes based on workflowData.actions
    workflowData.actions.forEach((action, index) => {
      switch (action.type) {
        case 'reply_to_comment':
          nodes.push({
            id: `action-reply-${index}`,
            name: `Reply to Comment ${index + 1}`,
            type: 'n8n-nodes-base.httpRequest',
            position: [520, 300 + (index * 100)],
            parameters: {
              method: 'POST',
              url: 'https://graph.instagram.com/{{ $json.comment_id }}/replies',
              body: {
                message: this.selectRandomTemplate(action.replyTemplates),
              },
              options: {
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            },
            credentials: {},
          });
          break;
        case 'ask_to_follow':
          nodes.push({
            id: `action-follow-${index}`,
            name: `Ask to Follow ${index + 1}`,
            type: 'n8n-nodes-base.httpRequest',
            position: [520, 300 + (index * 100)],
            parameters: {
              method: 'POST',
              url: 'https://graph.instagram.com/{{ $json.user_id }}/relationships',
              body: {
                action: 'follow',
              },
              options: {
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            },
            credentials: {},
          });
          break;
        case 'send_dm':
          nodes.push({
            id: `action-send-dm-${index}`,
            name: `Send DM ${index + 1}`,
            type: 'n8n-nodes-base.httpRequest',
            position: [520, 300 + (index * 100)],
            parameters: {
              method: 'POST',
              url: 'https://graph.facebook.com/v18.0/{{ $json.recipient_id }}/messages',
              body: {
                messaging_type: 'MESSAGE_TAG',
                recipient: {
                  id: '{{ $json.user_id }}',
                },
                message: {
                  text: action.messageTemplate,
                },
              },
              options: {
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            },
            credentials: {},
          });
          break;
      }
    });

    return nodes;
  }

  private buildWorkflowConnections() {
    // Simple linear connection for now - could be enhanced based on more complex logic
    return {};
  }

  private selectRandomTemplate(templates: string[]): string {
    if (templates.length === 0) return '';
    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex];
  }

  private async saveWorkflowMetadata(workflowData: WorkflowData, n8nWorkflowId: string) {
    const { error } = await supabase
      .from('automations')
      .insert({
        id: n8nWorkflowId, // Use N8N workflow ID as our ID
        user_id: workflowData.userId,
        name: workflowData.automationName,
        trigger_type: workflowData.triggerType,
        trigger_config: workflowData.triggerConfig,
        actions: workflowData.actions,
        status: workflowData.status,
        n8n_workflow_id: n8nWorkflowId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error saving workflow metadata:', error);
      throw error;
    }
  }

  async updateWorkflowStatus(workflowId: string, status: 'active' | 'inactive') {
    try {
      const response = await fetch(`${this.n8nBaseUrl}/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          active: status === 'active',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update workflow status: ${response.statusText}`);
      }

      // Update in Supabase as well
      const { error } = await supabase
        .from('automations')
        .update({ 
          status,
          updated_at: new Date().toISOString() 
        })
        .eq('n8n_workflow_id', workflowId);

      if (error) {
        console.error('Error updating workflow status in Supabase:', error);
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating workflow status:', error);
      throw error;
    }
  }

  async deleteWorkflow(workflowId: string) {
    try {
      const response = await fetch(`${this.n8nBaseUrl}/workflows/${workflowId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete workflow: ${response.statusText}`);
      }

      // Remove from Supabase as well
      const { error } = await supabase
        .from('automations')
        .delete()
        .eq('n8n_workflow_id', workflowId);

      if (error) {
        console.error('Error deleting workflow from Supabase:', error);
        throw error;
      }

      return response.status === 200;
    } catch (error) {
      console.error('Error deleting workflow:', error);
      throw error;
    }
  }

  async logActivity(activity: Omit<ActivityLog, 'id' | 'timestamp'>) {
    try {
      const { error } = await supabase
        .from('automation_activities')
        .insert({
          ...activity,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        });

      if (error) {
        console.error('Error logging activity:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
  }

  async getWorkflowMetrics(userId: string) {
    try {
      // Get metrics from Supabase
      const { data: activities, error } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

      if (error) {
        console.error('Error fetching workflow metrics:', error);
        throw error;
      }

      // Calculate metrics
      const dmsTriggered = activities?.filter(a => a.actionType === 'dm_sent').length || 0;
      const commentReplies = activities?.filter(a => a.actionType === 'reply').length || 0;
      const uniqueUsers = new Set(activities?.map(a => a.targetUsername)).size;

      // Calculate DM open rate if we have seen data
      const dms = activities?.filter(a => a.actionType === 'dm_sent') || [];
      const seenDms = dms.filter(dm => dm.metadata?.seen === true).length;
      const dmOpenRate = dms.length > 0 ? Math.round((seenDms / dms.length) * 100) : 0;

      return {
        dmsTriggered,
        dmOpenRate,
        commentReplies,
        uniqueUsers,
        recentActivities: activities?.slice(0, 10) || [], // Last 10 activities
      };
    } catch (error) {
      console.error('Error getting workflow metrics:', error);
      throw error;
    }
  }
}

export const n8nService = new N8nService();