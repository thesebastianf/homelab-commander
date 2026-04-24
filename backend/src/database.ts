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
    // Check before creating — migrations only apply to existing installs
    const isExistingInstall = await schemaExists(client);
    await initSchema(client);
    if (isExistingInstall) {
      await runMigrations(client);
    }
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}

/** Returns true if the settings table already exists (i.e. not a fresh database). */
async function schemaExists(client: pg.PoolClient): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'settings'`,
  );
  return rows.length > 0;
}

/**
 * Creates all application tables via CREATE TABLE IF NOT EXISTS.
 * Safe to run on every boot — idempotent.
 * This makes the app self-contained: no postgres init-script mount required.
 */
async function initSchema(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      ui_theme TEXT DEFAULT 'dark' CHECK (ui_theme IN ('dark', 'light', 'graphite', 'ocean', 'forest', 'sunset')),
      docker_host TEXT DEFAULT '/var/run/docker.sock',
      refresh_interval INTEGER DEFAULT 5,
      max_log_lines INTEGER DEFAULT 200,
      auto_update BOOLEAN DEFAULT FALSE,
      global_update_freeze BOOLEAN DEFAULT FALSE,
      stacks_base_path TEXT DEFAULT '/data/stacks',
      volumes_base_path TEXT DEFAULT '/data/volumes',
      backups_base_path TEXT DEFAULT '/data/backups',
      notification_config JSONB DEFAULT '{
        "enabled": false,
        "events": {
          "updateAvailable": true,
          "containerAutoUpdated": true,
          "containerFailed": true,
          "highMemory": true,
          "highCpu": true,
          "containerStarted": false,
          "containerStopped": false,
          "stackDeployed": true,
          "stackFailed": true
        },
        "thresholds": { "cpuPercent": 80, "memoryPercent": 80 }
      }'::jsonb,
      home_assistant_config JSONB DEFAULT '{"enabled":false,"baseUrl":"","accessToken":"","entityPrefix":"hlc"}'::jsonb,
      git_integration_config JSONB DEFAULT '{"enabled":false,"repoUrl":"","accessToken":"","syncOn":"manual"}'::jsonb,
      auto_update_schedule JSONB DEFAULT '{"enabled":false,"cron":"0 7 * * 6","label":"Saturdays at 07:00"}'::jsonb,
      ai_config JSONB DEFAULT '{"enabled":false,"provider":"ollama","baseUrl":"http://host.docker.internal:11434","apiKey":"","model":"llama3.1","treatAsLocal":true,"allowEnvToLocal":false}'::jsonb,
      copy_paste_helpers JSONB DEFAULT '[]'::jsonb,
      warning_thresholds JSONB DEFAULT '{"networkWarn":25,"zombieWarn":5,"diskWarn":90,"cpuWarn":85,"memoryWarn":85}'::jsonb,
      stack_file_excludes JSONB DEFAULT '["*.jpg","*.jpeg","*.png","*.gif","*.webp","*.bmp","*.ico","*.svg","*.avif","*.tiff","*.svc","*.mp4","*.mkv","*.mov","*.avi","*.mp3","*.wav","*.flac","*.zip","*.tar","*.gz","*.7z","*.pdf","*.woff","*.woff2","*.ttf","*.otf"]'::jsonb,
      homepage_widget_config JSONB DEFAULT '{"enabled":false,"baseUrl":"","apiKey":"","serviceName":"Homelab Commander","show":{"containers":true,"stacks":true,"images":true,"volumes":true,"networks":true,"cpu":true,"memory":true,"disk":true,"updates":true}}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS stacks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      stack_path TEXT NOT NULL,
      compose_content TEXT NOT NULL DEFAULT '',
      env_content TEXT DEFAULT '',
      volume_path TEXT DEFAULT '',
      git_repo_config JSONB DEFAULT NULL,
      status TEXT DEFAULT 'stopped' CHECK (status IN ('running','stopped','failed','deploying')),
      services INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      auto_update BOOLEAN DEFAULT FALSE,
      run_backup_before_update BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS stack_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stack_id UUID NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      compose_content TEXT NOT NULL,
      env_content TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_stack_versions_stack ON stack_versions(stack_id, version DESC)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS backup_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stack_id UUID NOT NULL UNIQUE REFERENCES stacks(id) ON DELETE CASCADE,
      enabled BOOLEAN DEFAULT FALSE,
      cron_schedule TEXT DEFAULT '0 22 * * 3',
      retention_days INTEGER DEFAULT 7,
      include_stack_folder BOOLEAN DEFAULT TRUE,
      include_volumes BOOLEAN DEFAULT TRUE,
      include_databases BOOLEAN DEFAULT FALSE,
      database_type TEXT DEFAULT 'none' CHECK (database_type IN ('postgresql','mysql','mongodb','redis','influxdb','none')),
      database_config JSONB DEFAULT '{}'::jsonb,
      compression_level INTEGER DEFAULT 6,
      encrypted BOOLEAN DEFAULT FALSE,
      incremental BOOLEAN DEFAULT FALSE,
      use_advanced_retention BOOLEAN DEFAULT FALSE,
      retention_policy JSONB DEFAULT '{"daily":7,"weekly":4,"monthly":6,"yearly":1}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stack_id UUID NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'in-progress' CHECK (status IN ('completed','failed','in-progress')),
      size_bytes BIGINT DEFAULT 0,
      backup_path TEXT NOT NULL,
      includes JSONB DEFAULT '{"stackFolder":true,"volumes":true,"databases":false}'::jsonb,
      error_message TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_backup_jobs_stack ON backup_jobs(stack_id, started_at DESC)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('telegram','discord','slack','email','webhook')),
      enabled BOOLEAN DEFAULT TRUE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS port_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      port_range_start INTEGER NOT NULL CHECK (port_range_start BETWEEN 1 AND 65535),
      port_range_end INTEGER NOT NULL CHECK (port_range_end BETWEEN 1 AND 65535),
      group_name TEXT DEFAULT 'default',
      color TEXT DEFAULT '#3b82f6',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_port_range CHECK (port_range_end >= port_range_start)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS smart_startup_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type TEXT NOT NULL CHECK (target_type IN ('stack')),
      target_id TEXT NOT NULL,
      trigger_value TEXT NOT NULL,
      start_delay INTEGER DEFAULT 60,
      monitor_interval INTEGER DEFAULT 30,
      enabled BOOLEAN DEFAULT FALSE,
      device_online BOOLEAN DEFAULT FALSE,
      last_checked_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id)`);

  logger.debug('Schema initialised');
}

/**
 * Runs column-addition migrations for existing installs that pre-date initSchema.
 * Only called when the schema already existed before this boot.
 */
async function runMigrations(client: pg.PoolClient): Promise<void> {
  const statements = [
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ui_theme TEXT DEFAULT 'dark'`,
    `DO $$
      BEGIN
        UPDATE settings
        SET ui_theme = 'dark'
        WHERE ui_theme IS NULL OR ui_theme NOT IN ('dark', 'light', 'graphite', 'ocean', 'forest', 'sunset');
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'settings_ui_theme_check'
        ) THEN
          ALTER TABLE settings
          ADD CONSTRAINT settings_ui_theme_check
          CHECK (ui_theme IN ('dark', 'light', 'graphite', 'ocean', 'forest', 'sunset'));
        END IF;
      END
    $$`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS git_integration_config JSONB DEFAULT '{"enabled":false,"repoUrl":"","accessToken":"","syncOn":"manual"}'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_update_schedule JSONB DEFAULT '{"enabled":false,"cron":"0 7 * * 6","label":"Saturdays at 07:00"}'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_config JSONB DEFAULT '{"enabled":false,"provider":"ollama","baseUrl":"http://host.docker.internal:11434","apiKey":"","model":"llama3.1","treatAsLocal":true,"allowEnvToLocal":false}'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS copy_paste_helpers JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS warning_thresholds JSONB DEFAULT '{"networkWarn":25,"zombieWarn":5,"diskWarn":90,"cpuWarn":85,"memoryWarn":85}'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS stack_file_excludes JSONB DEFAULT '["*.jpg","*.jpeg","*.png","*.gif","*.webp","*.bmp","*.ico","*.svg","*.avif","*.tiff","*.svc","*.mp4","*.mkv","*.mov","*.avi","*.mp3","*.wav","*.flac","*.zip","*.tar","*.gz","*.7z","*.pdf","*.woff","*.woff2","*.ttf","*.otf"]'::jsonb`,
    `ALTER TABLE settings ADD COLUMN IF NOT EXISTS homepage_widget_config JSONB DEFAULT '{"enabled":false,"baseUrl":"","apiKey":"","serviceName":"Homelab Commander","show":{"containers":true,"stacks":true,"images":true,"volumes":true,"networks":true,"cpu":true,"memory":true,"disk":true,"updates":true}}'::jsonb`,
    `ALTER TABLE stacks ADD COLUMN IF NOT EXISTS auto_update BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE stacks ADD COLUMN IF NOT EXISTS run_backup_before_update BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS database_config JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS incremental BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS use_advanced_retention BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE backup_configs ADD COLUMN IF NOT EXISTS retention_policy JSONB DEFAULT '{"daily":7,"weekly":4,"monthly":6,"yearly":1}'::jsonb`,
    `DO $$
      DECLARE
        c RECORD;
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'backup_configs'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%database_type%influxdb%'
        ) THEN
          FOR c IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'backup_configs'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%database_type%'
          LOOP
            EXECUTE format('ALTER TABLE backup_configs DROP CONSTRAINT IF EXISTS %I', c.conname);
          END LOOP;

          ALTER TABLE backup_configs
          ADD CONSTRAINT backup_configs_database_type_check
          CHECK (database_type IN ('postgresql','mysql','mongodb','redis','influxdb','none'));
        END IF;
      END
    $$`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS monitor_interval INTEGER DEFAULT 30`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS device_online BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ`,
    `ALTER TABLE smart_startup_configs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'smart_startup_configs' AND column_name = 'trigger_type'
        ) THEN
          EXECUTE 'ALTER TABLE smart_startup_configs ALTER COLUMN trigger_type SET DEFAULT ''ip''';
          EXECUTE 'UPDATE smart_startup_configs SET trigger_type = ''ip'' WHERE trigger_type IS NULL';
          EXECUTE 'ALTER TABLE smart_startup_configs ALTER COLUMN trigger_type DROP NOT NULL';
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'smart_startup_configs' AND column_name = 'auto_start'
        ) THEN
          EXECUTE 'ALTER TABLE smart_startup_configs ALTER COLUMN auto_start SET DEFAULT TRUE';
          EXECUTE 'UPDATE smart_startup_configs SET auto_start = TRUE WHERE auto_start IS NULL';
          EXECUTE 'ALTER TABLE smart_startup_configs ALTER COLUMN auto_start DROP NOT NULL';
        END IF;
      END
    $$`,
    `INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING`,
  ];

  for (const statement of statements) {
    await client.query(statement);
  }
  logger.debug('Schema migrations applied');
}
