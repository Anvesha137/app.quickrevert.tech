import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const neonDbUrl = Deno.env.get('NEON_DB_URL');
if (!neonDbUrl) {
    console.error("NEON_DB_URL not set");
    Deno.exit(1);
}

const client = new Client(neonDbUrl);
await client.connect();

const email = 's08770363@gmail.com';

console.log(`--- Checking Neon Data for ${email} ---`);

const userRes = await client.queryObject(`SELECT * FROM users WHERE email = $1`, [email]);
console.log("User Table:", JSON.stringify(userRes.rows, null, 2));

if (userRes.rows.length > 0) {
    const userId = (userRes.rows[0] as any).id;
    const subRes = await client.queryObject(`SELECT * FROM subscriptions WHERE user_id = $1`, [userId]);
    console.log("Subscriptions Table:", JSON.stringify(subRes.rows, null, 2));

    const payRes = await client.queryObject(`SELECT * FROM payments WHERE user_id = $1`, [userId]);
    console.log("Payments Table:", JSON.stringify(payRes.rows, null, 2));
}

const plansRes = await client.queryObject(`SELECT * FROM plans`);
console.log("Plans Table (first 5):", JSON.stringify(plansRes.rows.slice(0, 5), null, 2));

await client.end();
