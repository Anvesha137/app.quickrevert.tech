
export async function syncN8nCredential(supabase: any, instagramAccount: any) {
  const n8nBaseUrl = Deno.env.get("N8N_BASE_URL");
  const n8nApiKey = Deno.env.get("X-N8N-API-KEY");

  if (!n8nBaseUrl || !n8nApiKey) {
    console.warn("[n8n-sync] Missing n8n config, skipping sync");
    return instagramAccount.n8n_credential_id;
  }

  const userId = instagramAccount.instagram_user_id;
  const bizId = instagramAccount.instagram_business_id;
  const username = instagramAccount.username?.toLowerCase();
  const credType = "facebookGraphApi";

  const startTime = Date.now();
  try {
    console.log(`[n8n-sync] Starting sync for ${instagramAccount.username}...`);
    
    // 🔥 OPTIMIZATION: FAST-PATH validation
    // If we have an ID, try updating it directly. If it works, we skip the expensive 250-workflow scan.
    if (instagramAccount.n8n_credential_id) {
      console.log(`[n8n-sync] Fast-Path: Attempting direct update for ${instagramAccount.n8n_credential_id}...`);
      try {
        const patchRes = await fetch(`${n8nBaseUrl}/api/v1/credentials/${instagramAccount.n8n_credential_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
          body: JSON.stringify({ data: { accessToken: instagramAccount.access_token } })
        });
        
        if (patchRes.ok) {
          console.log(`[n8n-sync] ✅ Fast-Path SUCCESS. Credential ${instagramAccount.n8n_credential_id} updated in ${(Date.now() - startTime)}ms.`);
          return instagramAccount.n8n_credential_id;
        }
        console.warn(`[n8n-sync] Fast-Path failed (Status ${patchRes.status}). Falling back to Deep Scan...`);
      } catch (e) {
        console.warn(`[n8n-sync] Fast-Path error:`, e.message);
      }
    }

    const targetIds = new Set<string>();
    if (instagramAccount.n8n_credential_id) targetIds.add(instagramAccount.n8n_credential_id);

    // --- PHASE 1: WORKFLOW SCAN (find credential IDs from actual workflows) ---
    try {
      const workflowsRes = await fetch(`${n8nBaseUrl}/api/v1/workflows?limit=250`, {
        headers: { "X-N8N-API-KEY": n8nApiKey }
      });
      
      if (workflowsRes.ok) {
        const wfData = await workflowsRes.json();
        const workflows = wfData.data || [];
        
        // Process in batches of 10
        const batchSize = 10;
        for (let i = 0; i < workflows.length; i += batchSize) {
          const batch = workflows.slice(i, i + batchSize);
          await Promise.all(batch.map(async (wf: any) => {
            try {
              const fullWfRes = await fetch(`${n8nBaseUrl}/api/v1/workflows/${wf.id}`, {
                headers: { "X-N8N-API-KEY": n8nApiKey }
              });
              if (fullWfRes.ok) {
                const fullWf = await fullWfRes.json();
                const wfStr = JSON.stringify(fullWf.nodes).toLowerCase();
                if (wfStr.includes(username) || (userId && wfStr.includes(userId)) || (bizId && wfStr.includes(bizId))) {
                  for (const node of fullWf.nodes || []) {
                    if (node.credentials && node.credentials[credType]) {
                      const cid = node.credentials[credType].id;
                      if (cid) targetIds.add(cid);
                    }
                  }
                }
              }
            } catch (_e) { /* skip failed fetches */ }
          }));
        }
      }
    } catch (e) {
      console.error("[n8n-sync] Workflow scan error:", e);
    }

    // --- PHASE 2: CREDENTIAL LIST SCAN (safety net) ---
    try {
      let nextCursor: string | null = null;
      let page = 0;
      do {
        const url = new URL(`${n8nBaseUrl}/api/v1/credentials`);
        url.searchParams.set("limit", "250");
        url.searchParams.set("type", credType);
        if (nextCursor) url.searchParams.set("nextCursor", nextCursor);
        const res = await fetch(url.toString(), { headers: { "X-N8N-API-KEY": n8nApiKey } });
        if (!res.ok) break;
        const data = await res.json();
        for (const c of (data.data || [])) {
          const cn = c.name.toLowerCase();
          if ((userId && cn.includes(userId)) || (bizId && cn.includes(bizId)) || (username && cn.includes(username))) {
            targetIds.add(c.id);
          }
        }
        nextCursor = data.nextCursor;
        page++;
      } while (nextCursor && page < 8);
    } catch (_e) { /* ignore */ }

    console.log(`[n8n-sync] Found ${targetIds.size} credential IDs to update:`, Array.from(targetIds));

    // --- PHASE 3: PATCH UPDATE (THE FIX: use PATCH, not PUT!) ---
    if (targetIds.size > 0) {
      const results = await Promise.all(Array.from(targetIds).map(async (cid) => {
        try {
          const res = await fetch(`${n8nBaseUrl}/api/v1/credentials/${cid}`, {
            method: "PATCH",  // <-- THIS WAS THE BUG! Was using PUT which returns 405
            headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
            body: JSON.stringify({ data: { accessToken: instagramAccount.access_token } })
          });
          console.log(`[n8n-sync] PATCH ${cid}: ${res.status}`);
          return { id: cid, ok: res.ok, status: res.status };
        } catch (_e) {
          return { id: cid, ok: false, status: 0 };
        }
      }));
      const ok = results.filter(r => r.ok).length;
      console.log(`[n8n-sync] Successfully updated ${ok}/${targetIds.size} credentials.`);
    }

    // --- PHASE 4: DB SYNC ---
    let finalId = instagramAccount.n8n_credential_id;
    if (targetIds.size > 0 && (!finalId || !targetIds.has(finalId))) {
      finalId = Array.from(targetIds)[0];
    } else if (targetIds.size === 0) {
      const createRes = await fetch(`${n8nBaseUrl}/api/v1/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-N8N-API-KEY": n8nApiKey },
        body: JSON.stringify({
          name: `Instagram - ${instagramAccount.username} (${bizId || userId})`,
          type: credType,
          data: { accessToken: instagramAccount.access_token }
        })
      });
      if (createRes.ok) finalId = (await createRes.json()).id;
    }

    if (finalId && finalId !== instagramAccount.n8n_credential_id) {
      await supabase.from('instagram_accounts').update({ n8n_credential_id: finalId }).eq('id', instagramAccount.id);
    }

    return finalId;

  } catch (error) {
    console.error("[n8n-sync] FATAL:", error);
    return instagramAccount.n8n_credential_id;
  }
}


