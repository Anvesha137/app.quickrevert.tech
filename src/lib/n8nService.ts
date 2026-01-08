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
    this.n8nBaseUrl = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.quickrevert.tech';
    this.projectId = 'iT4vxoQUCp4XxToM';
    this.folderId = 'cG7JOnys7RGk6dnn';
    this.websocketService = new WebSocketService(import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8080/ws');
    
    // Attempt to connect to WebSocket
    if (typeof window !== 'undefined') {
      this.websocketService.connect();
    }
  }

  private async checkN8NAccess(): Promise<boolean> {
    if (!this.n8nApiKey.trim() || !this.n8nBaseUrl || this.n8nBaseUrl === 'https://n8n.quickrevert.tech') {
      return false;
    }
    
    try {
      // Test N8N API access by fetching workflow count
      const response = await fetch(`${this.n8nBaseUrl}/workflows`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      
      return response.ok;
    } catch (error) {
      console.error('N8N access check failed:', error);
      return false;
    }
  }
  
  private isN8NAvailable(): boolean {
    return this.n8nApiKey.trim() !== '' && !!this.n8nBaseUrl && this.n8nBaseUrl !== 'https://n8n.quickrevert.tech';
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.n8nApiKey,
    };
  }

  async createWorkflow(workflowData: WorkflowData): Promise<N8nWorkflowResponse> {
    // Check if N8N is available and accessible
    const hasN8NAccess = await this.checkN8NAccess();
    
    if (!hasN8NAccess) {
      // If N8N is not available or accessible, create a local record only
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
      // If N8N fails, fall back to local storage
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
  }

  private buildWorkflowPayload(workflowData: WorkflowData): N8nWorkflow {
    // Generate unique identifiers for this workflow
    const workflowId = crypto.randomUUID();
    const webhookPath = `instagram-webhook-${workflowData.userId}-${workflowId}`;
    
    // Create the exact workflow structure as provided in the template
    const workflow: N8nWorkflow = {
      name: `${workflowData.automationName} - ${workflowData.userId}`,
      nodes: [],
      connections: {},
      settings: {
        saveManualExecutions: true,
        saveExecutionProgress: true,
        timezone: 'America/New_York',
        executionTimeout: 3600,
        maxExecutionTimeout: 3600,
        onboardingFlowType: 'none',
        retryOnFail: false,
        webhookId: workflowId,
        versionId: workflowId,
      },
      tags: [],
      scope: ['workflow'],
      projectId: this.projectId,
      folderId: this.folderId,
      active: true,
    };

    // 1. Webhook Trigger Node
    const webhookNode: N8nNode = {
      id: `webhook-${workflowId}`,
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [1080, 460],
      parameters: {
        httpMethod: 'POST',
        path: webhookPath, // Dynamic path per user
        responseMode: 'responseNode',
        responseBinaryPropertyName: 'data',
        options: {},
      },
      credentials: {
        httpHeaderAuth: {
          id: workflowData.instagramAccountId, // Dynamic credential ID per user
          name: `Instagram Account - ${workflowData.userId}`
        }
      },
      webhookId: webhookPath, // Match webhookId to path
    };
    workflow.nodes.push(webhookNode);
    
    // 2. IF Node (Verify Webhook)
    const ifNode: N8nNode = {
      id: `if-${workflowId}`,
      name: 'IF',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [1280, 460],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
          },
          conditions: [
            {
              id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', // Generate unique ID
              leftValue: '={{ $json.body["hub.challenge"] }}',
              rightValue: '',
              operator: {
                type: 'string',
                operation: 'isEmpty',
              },
            },
          ],
          combiner: 'and',
        },
        elseOutput: 'noOutput',
      },
    };
    workflow.nodes.push(ifNode);
    
    // 3. Response Node (for webhook verification)
    const responseNode: N8nNode = {
      id: `response-${workflowId}`,
      name: 'Response',
      type: 'n8n-nodes-base.response',
      typeVersion: 1,
      position: [1480, 360],
      parameters: {
        options: {},
      },
    };
    workflow.nodes.push(responseNode);
    
    // 4. Switch Node (for different message types)
    const switchNode: N8nNode = {
      id: `switch-${workflowId}`,
      name: 'Switch',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3,
      position: [1480, 560],
      parameters: {
        caseSensitive: true,
        output: '={{ $json.body.entry[0].changes[0].value.item }}',
        defaultOutput: 'other',
        options: {
          leftValue: '',
          operations: {
            operation: 'string',
            operator: 'contains',
          },
          rightValue: '',
          typeValidation: 'strict',
        },
        rules: {
          values: [
            {
              id: 'rule-comment',
              value: 'comment',
            },
            {
              id: 'rule-message',
              value: 'message',
            },
          ],
        },
      },
    };
    workflow.nodes.push(switchNode);
    
    // 5. HTTP Request Node for Comment Reply
    const commentReplyNode: N8nNode = {
      id: `http-comment-${workflowId}`,
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1680, 460],
      parameters: {
        url: '=https://graph.facebook.com/v18.0/{{ $json.body.entry[0].id }}/comments',
        method: 'POST',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Content-Type',
              value: 'application/json',
            },
          ],
        },
        sendBody: true,
        bodyParameters: {
          parameters: [
            {
              name: 'message',
              value: '={{ $json.body.entry[0].changes[0].value.message }}',
            },
            {
              name: 'access_token',
              value: '={{ $json.body.access_token }}',
            },
          ],
        },
        options: {},
      },
      credentials: {
        httpHeaderAuth: {
          id: workflowData.instagramAccountId, // Dynamic credential ID per user
          name: `Instagram Account - ${workflowData.userId}`
        }
      },
    };
    workflow.nodes.push(commentReplyNode);
    
    // 6. HTTP Request Node for Direct Message
    const dmNode: N8nNode = {
      id: `http-dm-${workflowId}`,
      name: 'HTTP Request1',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1680, 660],
      parameters: {
        url: '=https://graph.facebook.com/v18.0/{{ $json.body.entry[0].changes[0].value.from.id }}/messages',
        method: 'POST',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Content-Type',
              value: 'application/json',
            },
          ],
        },
        sendBody: true,
        bodyParameters: {
          parameters: [
            {
              name: 'message',
              value: '={{ $json.body.entry[0].changes[0].value.message }}',
            },
            {
              name: 'access_token',
              value: '={{ $json.body.access_token }}',
            },
          ],
        },
        options: {},
      },
      credentials: {
        httpHeaderAuth: {
          id: workflowData.instagramAccountId, // Dynamic credential ID per user
          name: `Instagram Account - ${workflowData.userId}`
        }
      },
    };
    workflow.nodes.push(dmNode);
    
    // 7. Supabase Logging Node (to track metrics)
    const loggingNode: N8nNode = {
      id: `logging-${workflowId}`,
      name: 'Supabase Logging',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1880, 560],
      parameters: {
        url: `${window.location.origin}/api/log-activity`, // Replace with your actual API endpoint
        method: 'POST',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Content-Type',
              value: 'application/json',
            },
          ],
        },
        sendBody: true,
        body: `={
  "userId": "${workflowData.userId}",
  "workflowId": "${workflowId}",
  "event": "dm_sent",
  "targetUser": "{{ $json.body.entry[0].changes[0].value.from.id }}",
  "timestamp": "{{ $now }}"
}`,
        options: {},
      },
    };
    workflow.nodes.push(loggingNode);
    
    // Build connections between nodes
    workflow.connections = {
      [webhookNode.name]: {
        main: [
          [
            {
              node: ifNode.name,
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
      [ifNode.name]: {
        main: [
          [
            {
              node: responseNode.name,
              type: 'main',
              index: 0,
            },
          ],
          [
            {
              node: switchNode.name,
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
      [switchNode.name]: {
        main: [
          [
            {
              node: commentReplyNode.name,
              type: 'main',
              index: 0,
            },
          ],
          [
            {
              node: dmNode.name,
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
      [commentReplyNode.name]: {
        main: [
          [
            {
              node: loggingNode.name,
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
      [dmNode.name]: {
        main: [
          [
            {
              node: loggingNode.name,
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
    };
    
    // Update the workflowData actions to use the new workflow structure
    // This is where you would customize the message content based on user input
    if (workflowData.actions && workflowData.actions.length > 0) {
      // Customize the HTTP request nodes based on user's action configuration
      const action = workflowData.actions[0]; // Using first action for demo
      
      if (action.type === 'send_dm' && action.messageTemplate) {
        // Update the DM node with user's message template
        const dmNodeIndex = workflow.nodes.findIndex(node => node.name === 'HTTP Request1');
        if (dmNodeIndex !== -1) {
          (workflow.nodes[dmNodeIndex] as N8nNode).parameters.bodyParameters = {
            parameters: [
              {
                name: 'message',
                value: action.messageTemplate,
              },
              {
                name: 'access_token',
                value: '={{ $json.body.access_token }}',
              },
            ],
          };
        }
        
        // Update the comment reply node with user's template
        const commentNodeIndex = workflow.nodes.findIndex(node => node.name === 'HTTP Request');
        if (commentNodeIndex !== -1) {
          (workflow.nodes[commentNodeIndex] as N8nNode).parameters.bodyParameters = {
            parameters: [
              {
                name: 'message',
                value: action.messageTemplate,
              },
              {
                name: 'access_token',
                value: '={{ $json.body.access_token }}',
              },
            ],
          };
        }
      }
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
        instagram_account_id: workflowData.instagramAccountId, // Store the Instagram account ID
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
    // Check if N8N is available and accessible
    const hasN8NAccess = await this.checkN8NAccess();
    
    if (!hasN8NAccess) {
      // If N8N is not available or accessible, delete only from Supabase
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
      // If N8N fails, delete only from Supabase
      const { error: supabaseError } = await supabase
        .from('automations')
        .delete()
        .eq('n8n_workflow_id', workflowId);

      if (supabaseError) {
        console.error('Error deleting workflow from Supabase:', supabaseError);
        throw supabaseError;
      }

      return true;
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
      // Check if N8N is available and accessible
      const hasN8NAccess = await this.checkN8NAccess();
      
      if (hasN8NAccess) {
        // Try to get metrics from N8N first
        try {
          // For now, we'll fetch from Supabase as the primary source
          // In a real N8N integration, this would fetch from N8N
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const { data: activities, error } = await supabase
            .from('automation_activities')
            .select('*')
            .eq('user_id', userId)
            .gte('executed_at', this.formatDateForSupabase(thirtyDaysAgo)); // Last 30 days

          if (error) throw error;

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
        } catch (n8nError) {
          console.error('Error getting metrics from N8N:', n8nError);
          // Fall through to Supabase-only approach
        }
      }
      
      // Fallback: Get metrics from Supabase
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