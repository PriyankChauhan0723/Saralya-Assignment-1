import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  host: env.PGHOST,
  port: env.PGPORT,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client pool:', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (env.NODE_ENV === 'development' && duration > 200) {
    console.log(`[Slow Query - ${duration}ms]: ${text.slice(0, 100)}...`);
  }
  return res;
}

export async function getClient() {
  return await pool.connect();
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const res = await query('SELECT 1 as health;');
    return res.rows[0]?.health === 1;
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  }
}
