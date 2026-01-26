
export const extractN8nExecutionData = (execution: any) => {
    let username = 'Unknown';
    let message = 'Workflow execution';

    // Helper to safely access nested properties
    const safeGet = (obj: any, path: string[]) =>
        path.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);

    // 1. Try to find Username
    // Strategy: Look through ALL nodes in runData for common username patterns
    if (execution?.data?.resultData?.runData) {
        const runData = execution.data.resultData.runData;
        const nodeNames = Object.keys(runData);

        for (const nodeName of nodeNames) {
            const nodeExecutions = runData[nodeName];
            // nodeExecutions is an array of { data: { main: [ [ { json: ... } ] ] } }

            for (const nodeExec of nodeExecutions) {
                const jsonData = nodeExec?.data?.main?.[0]?.[0]?.json; // Standard main output

                if (jsonData) {
                    // Check for explicit username field (common in HTTP Request nodes fetching profile)
                    if (jsonData.username && typeof jsonData.username === 'string') {
                        username = jsonData.username;
                        break;
                    }
                    // Check for sender_name (common in some webhooks)
                    if (jsonData.sender_name && typeof jsonData.sender_name === 'string') {
                        username = jsonData.sender_name;
                        break;
                    }
                    // Check for from.username
                    if (jsonData.from?.username && typeof jsonData.from.username === 'string') {
                        username = jsonData.from.username;
                        break;
                    }
                }
            }
            if (username !== 'Unknown') break;
        }
    }

    // Backup: Check startData or top-level keys if basic execution
    if (username === 'Unknown') {
        const data = execution.data || execution;
        if (data.sender_name) username = data.sender_name;
        else if (data.from?.username) username = data.from.username;
    }

    // 2. Try to find Message
    if (execution?.data?.resultData?.runData) {
        const runData = execution.data.resultData.runData;
        const nodeNames = Object.keys(runData);

        for (const nodeName of nodeNames) {
            // specific check for webhook-like payload structure regardless of node name
            const nodeExecutions = runData[nodeName];
            for (const nodeExec of nodeExecutions) {
                const jsonData = nodeExec?.data?.main?.[0]?.[0]?.json; // Standard main output
                if (jsonData) {
                    // Instagram Webhook structure
                    const entry = jsonData.body?.entry?.[0];
                    if (entry) {
                        const messagingComp = entry.messaging?.[0];
                        if (messagingComp?.message?.text) {
                            message = messagingComp.message.text;
                            break;
                        }
                        if (entry.changes?.[0]?.value?.text) {
                            message = entry.changes[0].value.text; // Comment
                            break;
                        }
                    }
                    // Flat message/text fields
                    if (jsonData.message && typeof jsonData.message === 'string' && jsonData.message.length < 500) {
                        message = jsonData.message;
                        // Don't break immediately for generic 'message', prefer webhook structure if found later? 
                        // Actually, usually webhook is first.
                    }
                    if (jsonData.text && typeof jsonData.text === 'string' && !jsonData.username) {
                        // 'text' is very generic, be careful. 
                        // If it looks like a message...
                        if (jsonData.text.length > 0 && jsonData.text.length < 500) {
                            message = jsonData.text;
                        }
                    }
                }
            }
            if (message !== 'Workflow execution') break;
        }
    }

    return { username, message };
};
