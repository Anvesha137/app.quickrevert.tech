import { supabase } from './supabase';
import WebSocketService from './websocketService';

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

interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: any;
  credentials?: any;
  webhookId?: string;
}

interface N8nConnection {
  [nodeName: string]: {
    main: Array<Array<{
      node: string;
      type: string;
      index: number;
    }>>;
  };
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnection;
  settings: any;
  tags: string[];
  scope: string[];
  projectId: string;
  folderId: string;
  active: boolean;
}

class N8nService {
  private n8nApiKey: string;
  private n8nBaseUrl: string;
  private projectId: string;
  private folderId: string;
  private websocketService: WebSocketService;

  constructor() {
    this.n8nApiKey = import.meta.env.VITE_N8N_API_KEY || '';
    this.n8nBaseUrl = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.yourdomain.com';
    this.projectId = 'iT4vxoQUCp4XxToM';
    this.folderId = 'cG7JOnys7RGk6dnn';
    this.websocketService = new WebSocketService(import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8080/ws');
    
    // Attempt to connect to WebSocket
    if (typeof window !== 'undefined') {
      this.websocketService.connect();
    }
  }

  private isN8NAvailable(): boolean {
    return this.n8nApiKey.trim() !== '' && !!this.n8nBaseUrl && this.n8nBaseUrl !== 'https://n8n.yourdomain.com';
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.n8nApiKey,
    };
  }

  async createWorkflow(workflowData: WorkflowData): Promise<N8nWorkflowResponse> {
    if (!this.isN8NAvailable()) {
      // If N8N is not available, create a local record only
      const workflowId = crypto.randomUUID();
      
      // Save workflow metadata to Supabase
      await this.saveWorkflowMetadata(workflowData, workflowId);
      
      return {
        id: workflowId,
        name: workflowData.automationName,
        active: workflowData.status === 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    
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

  private buildWorkflowPayload(workflowData: WorkflowData): N8nWorkflow {
    // Create a basic workflow based on the trigger and action types
    const workflow: N8nWorkflow = {
      name: `${workflowData.automationName} - ${workflowData.userId}`,
      nodes: [],
      connections: {},
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

    // Create webhook trigger node
    const webhookNode: N8nNode = {
      parameters: {
        multipleMethods: true,
        path: `instagram-webhook-${workflowData.userId}-${Date.now()}`,
        responseMode: 'responseNode',
        options: {},
      },
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [-1568, 32],
      id: `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Instagram Webhook',
      webhookId: `instagram-webhook-${workflowData.userId}-${Date.now()}`,
    };

    workflow.nodes.push(webhookNode);

    // Add action nodes based on workflowData.actions
    workflowData.actions.forEach((action, index) => {
      const positionX = -896;
      const positionY = 224 + (index * 192);

      switch (action.type) {
        case 'reply_to_comment':
          const randomTemplate = this.selectRandomTemplate(action.replyTemplates);

          const replyNode: N8nNode = {
            parameters: {
              method: 'POST',
              url: '=https://graph.instagram.com/v24.0/{{ $json.body.entry[0].changes[0].value.from.id }}/messages',
              authentication: 'genericCredentialType',
              genericAuthType: 'httpHeaderAuth',
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: 'Content-Type',
                    value: 'application/json'
                  }
                ]
              },
              sendBody: true,
              specifyBody: 'json',
              jsonBody: `={
  "recipient": { "id": "{{ $json.body.entry[0].changes[0].value.from.id }}" },
  "message": {
    "text": "${randomTemplate}"
  }
}`,
              options: {}
            },
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4.3,
            position: [positionX, positionY],
            id: `action-reply-${workflowData.userId}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `Reply to Comment ${index + 1}`,
            credentials: {
              httpHeaderAuth: {
                id: 'insta-cred-id',
                name: 'Instagram API'
              }
            }
          };

          workflow.nodes.push(replyNode);

          // Add button node if actionButtons exist
          if (action.actionButtons && action.actionButtons.length > 0) {
            const buttonNode: N8nNode = {
              parameters: {
                method: 'POST',
                url: '=https://graph.instagram.com/v24.0/{{ $json.body.entry[0].changes[0].value.from.id }}/messages',
                authentication: 'genericCredentialType',
                genericAuthType: 'httpHeaderAuth',
                sendHeaders: true,
                headerParameters: {
                  parameters: [
                    {
                      name: 'Content-Type',
                      value: 'application/json'
                    }
                  ]
                },
                sendBody: true,
                specifyBody: 'json',
                jsonBody: `={
  "recipient": { "id": "{{ $json.body.entry[0].changes[0].value.from.id }}" },
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [
          {
            "title": "${randomTemplate}",
            "buttons": [${action.actionButtons.map((btn: any) => `{"type": "web_url", "url": "${btn.url || ''}", "title": "${btn.text}"}`).join(', ')}]
          }
        ]
      }
    }
  }
}`,
                options: {}
              },
              type: 'n8n-nodes-base.httpRequest',
              typeVersion: 4.3,
              position: [positionX, positionY + 100],
              id: `action-reply-btn-${workflowData.userId}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: `Reply with Buttons ${index + 1}`,
              credentials: {
                httpHeaderAuth: {
                  id: 'insta-cred-id',
                  name: 'Instagram API'
                }
              }
            };

            workflow.nodes.push(buttonNode);
          }
          break;

        case 'ask_to_follow':
          const followNode: N8nNode = {
            parameters: {
              method: 'POST',
              url: '=https://graph.instagram.com/v24.0/{{ $json.body.entry[0].changes[0].value.from.id }}/messages',
              authentication: 'genericCredentialType',
              genericAuthType: 'httpHeaderAuth',
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: 'Content-Type',
                    value: 'application/json'
                  }
                ]
              },
              sendBody: true,
              specifyBody: 'json',
              jsonBody: `={
  "recipient": { "id": "{{ $json.body.entry[0].changes[0].value.from.id }}" },
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [
          {
            "title": "${action.messageTemplate}",
            "buttons": [
              { "type": "postback", "title": "${action.followButtonText}", "payload": "FOLLOWING" }
            ]
          }
        ]
      }
    }
  }
}`,
              options: {}
            },
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4.3,
            position: [positionX, positionY],
            id: `action-follow-${workflowData.userId}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `Ask to Follow ${index + 1}`,
            credentials: {
              httpHeaderAuth: {
                id: 'insta-cred-id',
                name: 'Instagram API'
              }
            }
          };

          workflow.nodes.push(followNode);
          break;

        case 'send_dm':
          let messageBody = `={
  "recipient": { "id": "{{ $json.body.entry[0].changes[0].value.from.id }}" },
  "message": {
    "text": "${action.messageTemplate}"
  }
}`;

          if (action.actionButtons && action.actionButtons.length > 0) {
            messageBody = `={
  "recipient": { "id": "{{ $json.body.entry[0].changes[0].value.from.id }}" },
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [
          {
            "title": "${action.messageTemplate}",
            "buttons": [${action.actionButtons.map((btn: any) => {
              if (btn.url) {
                return `{"type": "web_url", "url": "${btn.url}", "title": "${btn.text}"}`
              } else {
                return `{"type": "postback", "title": "${btn.text}", "payload": "${btn.text.toUpperCase().replace(/\s+/g, '_')}"}`
              }
            }).join(', ')}]
          }
        ]
      }
    }
  }
}`;
          }

          const dmNode: N8nNode = {
            parameters: {
              method: 'POST',
              url: '=https://graph.instagram.com/v24.0/{{ $json.body.entry[0].changes[0].value.from.id }}/messages',
              authentication: 'genericCredentialType',
              genericAuthType: 'httpHeaderAuth',
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  {
                    name: 'Content-Type',
                    value: 'application/json'
                  }
                ]
              },
              sendBody: true,
              specifyBody: 'json',
              jsonBody: messageBody,
              options: {}
            },
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4.3,
            position: [positionX, positionY],
            id: `action-dm-${workflowData.userId}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: `Send DM ${index + 1}`,
            credentials: {
              httpHeaderAuth: {
                id: 'insta-cred-id',
                name: 'Instagram API'
              }
            }
          };

          workflow.nodes.push(dmNode);
          break;
      }
    });

    // Build simple connections
    if (workflow.nodes.length > 1) {
      workflow.connections = {
        [webhookNode.name]: {
          main: [
            [
              {
                node: workflow.nodes[1].id, // Connect to first action node
                type: 'main',
                index: 0
              }
            ]
          ]
        }
      };
    }

    return workflow;
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
        id: n8nWorkflowId, // Use the ID as primary key
        user_id: workflowData.userId,
        name: workflowData.automationName,
        trigger_type: workflowData.triggerType,
        trigger_config: workflowData.triggerConfig,
        actions: workflowData.actions,
        status: workflowData.status,
        n8n_workflow_id: n8nWorkflowId, // Store the N8N workflow ID separately
        // Remove created_at and updated_at to let the DB defaults handle them
      });

    if (error) {
      console.error('Error saving workflow metadata:', error);
      throw error;
    }
  }

  async updateWorkflowStatus(workflowId: string, status: 'active' | 'inactive') {
    if (!this.isN8NAvailable()) {
      // If N8N is not available, update only in Supabase
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
      
      return { active: status === 'active' };
    }
    
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
    if (!this.isN8NAvailable()) {
      // If N8N is not available, delete only from Supabase
      const { error } = await supabase
        .from('automations')
        .delete()
        .eq('n8n_workflow_id', workflowId);

      if (error) {
        console.error('Error deleting workflow from Supabase:', error);
        throw error;
      }

      return true;
    }
    
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
      const activityEntry = {
        id: crypto.randomUUID(),
        automation_id: activity.workflowId,
        user_id: activity.userId,
        activity_type: activity.actionType,
        activity_data: {
          target_username: activity.targetUsername,
          metadata: activity.metadata,
        },
        executed_at: new Date().toISOString(),
      };
      
      const { error } = await supabase
        .from('automation_activities')
        .insert(activityEntry);

      if (error) {
        console.error('Error logging activity:', error);
        throw error;
      }
      
      // Emit real-time update via WebSocket
      this.websocketService.send({
        type: 'activity_log',
        data: activityEntry,
      });
      
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
  }

  private formatDateForSupabase(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }

  async getWorkflowMetrics(userId: string) {
    try {
      // Get metrics from Supabase
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const { data: activities, error } = await supabase
        .from('automation_activities')
        .select('*')
        .eq('user_id', userId)
        .gte('executed_at', this.formatDateForSupabase(thirtyDaysAgo)); // Last 30 days

      if (error) {
        console.error('Error fetching workflow metrics:', error);
        throw error;
      }

      // Calculate metrics
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

      return {
        dmsTriggered,
        dmOpenRate,
        commentReplies,
        uniqueUsers,
        recentActivities: mappedActivities.slice(0, 10), // Last 10 activities
      };
    } catch (error) {
      console.error('Error getting workflow metrics:', error);
      throw error;
    }
  }
  
  subscribeToRealTimeUpdates(callback: (data: any) => void) {
    return this.websocketService.subscribe(callback);
  }
  
  async triggerWorkflowExecution(workflowId: string, inputData: any) {
    try {
      const response = await fetch(`${this.n8nBaseUrl}/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: inputData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger workflow execution: ${response.statusText}`);
      }

      const executionResult = await response.json();
      
      // Log the execution
      await this.logActivity({
        userId: inputData.userId || 'unknown',
        workflowId,
        actionType: 'execution_triggered',
        targetUsername: inputData.username || 'unknown',
        metadata: {
          executionId: executionResult.executionId,
          workflowId,
          inputData,
          status: executionResult.status,
        },
      });
      
      return executionResult;
    } catch (error) {
      console.error('Error triggering workflow execution:', error);
      throw error;
    }
  }
}

export const n8nService = new N8nService();