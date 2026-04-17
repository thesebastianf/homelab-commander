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
    await client.query('SELECT 1');
    await runMigrations(client);
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}

async function runMigrations(client: pg.PoolClient): Promise<void> {
  const statements = [
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS git_integration_config JSONB DEFAULT '{"enabled":false,"repoUrl":"","accessToken":"","syncOn":"manual"}'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_update_schedule JSONB DEFAULT '{"enabled":false,"cron":"0 7 * * 6","label":"Saturdays at 07:00"}'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_config JSONB DEFAULT '{"enabled":false,"provider":"ollama","baseUrl":"http://host.docker.internal:11434","apiKey":"","model":"llama3.1","treatAsLocal":true,"allowEnvToLocal":false}'::jsonb`,
    `ALTER TABLE stacks ADD COLUMN IF NOT EXISTS auto_update BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE stacks ADD COLUMN IF NOT EXISTS run_backup_before_update BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS database_config JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS incremental BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS use_advanced_retention BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS retention_policy JSONB DEFAULT '{"daily":7,"weekly":4,"monthly":6,"yearly":1}'::jsonb`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS monitor_interval INTEGER DEFAULT 30`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS device_online BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'smart_startup_configs'
            AND column_name = 'trigger_type'
        ) THEN
          EXECUTE 'ALTER TABLE smart_startup_configs ALTER COLUMN trigger_type SET DEFAULT ''ip''';
          EXECUTE 'UPDATE smart_startup_configs SET trigger_type = ''ip'' WHERE trigger_type IS NULL';
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'smart_startup_configs'
            AND column_name = 'auto_start'
        ) THEN
          EXECUTE 'ALTER TABLE smart_startup_configs ALTER COLUMN auto_start SET DEFAULT TRUE';
          EXECUTE 'UPDATE smart_startup_configs SET auto_start = TRUE WHERE auto_start IS NULL';
        END IF;
      END
    $$`,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'smart_startup_configs'
            AND column_name = 'trigger_type'
        ) THEN
          ALTER TABLE smart_startup_configs ALTER COLUMN trigger_type SET DEFAULT 'ip';
          ALTER TABLE smart_startup_configs ALTER COLUMN trigger_type DROP NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'smart_startup_configs'
            AND column_name = 'auto_start'
        ) THEN
          ALTER TABLE smart_startup_configs ALTER COLUMN auto_start SET DEFAULT TRUE;
          ALTER TABLE smart_startup_configs ALTER COLUMN auto_start DROP NOT NULL;
        END IF;
      END
    $$`,
    `INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING`,
  ];

  for (const statement of statements) {
    await client.query(statement);
  }
}
