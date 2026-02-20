
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.NEON_DB_URL;

if (!connectionString) {
    console.error('Missing NEON_DB_URL in .env');
    process.exit(1);
}

const client = new pg.Client({
    connectionString,
    ssl: {
        rejectUnauthorized: false // Often needed for Neon/Supabase if certificate chain isn't perfect in node
    }
});

async function applyMigration() {
    try {
        await client.connect();
        console.log('Connected to database.');

        const migrationPath = path.join(__dirname, '../supabase/migrations/20260216213000_update_contacts_columns.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Applying migration:', migrationPath);
        console.log('SQL:', migrationSql);

        await client.query(migrationSql);

        console.log('Migration applied successfully!');
    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

applyMigration();
