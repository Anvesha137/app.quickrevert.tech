import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://neondb_owner:npg_AxZu5OcCXmL7@ep-polished-cake-ahjm2aou-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function debugNeon() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("CONNECTED TO NEON");

    // 1. Check gifted_premium columns
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'gifted_premium'
    `);
    console.log("\nGIFTED_PREMIUM COLUMNS:");
    console.table(colsRes.rows);

    // 2. Check for Varshini specifically
    console.log("\nVARSHINI LOOKUP:");
    const varshiniRes = await client.query(`
      SELECT gp.*, u.email as u_email, u.id as u_id
      FROM gifted_premium gp
      LEFT JOIN users u ON u.id = gp.user_id
      WHERE LOWER(u.email) = 'varshinidiwakar3@gmail.com'
    `);
    console.log(JSON.stringify(varshiniRes.rows, null, 2));

  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    await client.end();
  }
}

debugNeon();
