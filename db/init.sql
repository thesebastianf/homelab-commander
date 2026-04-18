CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Application settings (singleton row)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
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
      "stackFailed": true,
      "backupCompleted": true,
      "backupFailed": true,
      "smartStartupDeviceOnline": false,
      "smartStartupStackStarted": true
    },
    "thresholds": {
      "cpuPercent": 80,
      "memoryPercent": 80
    }
  }'::jsonb,
  home_assistant_config JSONB DEFAULT '{
    "enabled": false,
    "baseUrl": "",
    "accessToken": "",
    "entityPrefix": "hlc"
  }'::jsonb,
  git_integration_config JSONB DEFAULT '{
    "enabled": false,
    "repoUrl": "",
    "accessToken": "",
    "syncOn": "manual"
  }'::jsonb,
  auto_update_schedule JSONB DEFAULT '{
    "enabled": false,
    "cron": "0 7 * * 6",
    "label": "Saturdays at 07:00"
  }'::jsonb,
  ai_config JSONB DEFAULT '{
    "enabled": false,
    "provider": "ollama",
    "baseUrl": "http://host.docker.internal:11434",
    "apiKey": "",
    "model": "llama3.1",
    "treatAsLocal": true,
    "allowEnvToLocal": false
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Migrate existing installs: add copy_paste_helpers column if missing
ALTER TABLE settings ADD COLUMN IF NOT EXISTS copy_paste_helpers JSONB DEFAULT '[]'::jsonb;

-- Stacks
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
);

-- Stack version history
CREATE TABLE IF NOT EXISTS stack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id UUID NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  compose_content TEXT NOT NULL,
  env_content TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stack_versions_stack ON stack_versions(stack_id, version DESC);

-- Backup configurations
CREATE TABLE IF NOT EXISTS backup_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id UUID NOT NULL UNIQUE REFERENCES stacks(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  cron_schedule TEXT DEFAULT '0 2 * * *',
  retention_days INTEGER DEFAULT 7,
  include_stack_folder BOOLEAN DEFAULT TRUE,
  include_volumes BOOLEAN DEFAULT TRUE,
  include_databases BOOLEAN DEFAULT FALSE,
  database_type TEXT DEFAULT 'none' CHECK (database_type IN ('postgresql','mysql','mongodb','redis','none')),
  database_config JSONB DEFAULT '{}'::jsonb,
  compression_level INTEGER DEFAULT 6,
  encrypted BOOLEAN DEFAULT FALSE,
  incremental BOOLEAN DEFAULT FALSE,
  use_advanced_retention BOOLEAN DEFAULT FALSE,
  retention_policy JSONB DEFAULT '{"daily":7,"weekly":4,"monthly":6,"yearly":1}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup jobs (history)
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
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_stack ON backup_jobs(stack_id, started_at DESC);

-- Notification services
CREATE TABLE IF NOT EXISTS notification_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('telegram','discord','slack','email','webhook')),
  enabled BOOLEAN DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Port reservations
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
);

-- Smart startup configurations
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
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
