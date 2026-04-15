import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT 1');
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}
