
async function diagnose() {
  const n8nBaseUrl = process.env.N8N_BASE_URL;
  const n8nApiKey = process.env.X_N8N_API_KEY;

  if (!n8nBaseUrl || !n8nApiKey) {
    console.error("Missing n8n config");
    return;
  }

  console.log("Fetching credentials from n8n...");
  const res = await fetch(`${n8nBaseUrl}/api/v1/credentials`, {
    headers: { "X-N8N-API-KEY": n8nApiKey }
  });

  if (!res.ok) {
    console.error("Failed to fetch credentials", await res.text());
    return;
  }

  const data = await res.json();
  const igCreds = data.data.filter(c => c.type === 'facebookGraphApi');

  console.log(`Found ${igCreds.length} Instagram credentials:`);
  igCreds.forEach(c => {
    console.log(`- ID: ${c.id}, Name: "${c.name}", Created: ${c.createdAt}`);
  });

  // Check for duplicates based on ID in parentheses
  const idMap = {};
  igCreds.forEach(c => {
    const match = c.name.match(/\((\d+)\)/);
    if (match) {
      const igId = match[1];
      if (!idMap[igId]) idMap[igId] = [];
      idMap[igId].push(c);
    }
  });

  console.log("\nDuplicates found:");
  for (const [igId, creds] of Object.entries(idMap)) {
    if (creds.length > 1) {
      console.log(`IG Account ID ${igId} has ${creds.length} credentials:`);
      creds.forEach(c => console.log(`  - ${c.id} ("${c.name}")`));
    }
  }
}

diagnose();
