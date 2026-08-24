import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

const { Client } = pg;

// Validate database name identifier strictly against injection
function validateDatabaseName(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid database name identifier: "${name}". Must be alphanumeric and underscores only.`);
  }
  return name;
}

async function ensureDatabaseExists() {
  const dbName = validateDatabaseName(env.PGDATABASE);

  const adminClient = new Client({
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: 'postgres'
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1;`,
      [dbName]
    );

    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" does not exist. Creating...`);
      await adminClient.query(`CREATE DATABASE "${dbName}";`);
      console.log(`Database "${dbName}" created successfully.`);
    }
  } catch (err: any) {
    console.warn('Admin database check skipped or failed:', err.message);
  } finally {
    await adminClient.end().catch(() => {});
  }
}

export async function runMigrations() {
  const dbName = validateDatabaseName(env.PGDATABASE);
  console.log(`Connecting to PostgreSQL and running migrations on "${dbName}"...`);
  await ensureDatabaseExists();

  const client = new Client({
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: dbName
  });

  try {
    await client.connect();
    console.log('Connected to target database.');

    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const sqlPath = path.resolve(currentDir, 'migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('Migrations executed successfully. Tables and indexes are ready.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('migrate')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
