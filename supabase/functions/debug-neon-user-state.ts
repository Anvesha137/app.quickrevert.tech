import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const neonDbUrl = Deno.env.get('NEON_DB_URL');
if (!neonDbUrl) throw new Error("NEON_DB_URL not set");
const client = new Client(neonDbUrl);
await client.connect();

const email = 's08770363@gmail.com';
const { rows } = await client.queryObject(`SELECT id, email, assisted_by, plan_name FROM users WHERE email ILIKE $1`, [email]);

console.log(JSON.stringify(rows, null, 2));
await client.end();
