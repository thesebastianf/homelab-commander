# Phase 3: Database & Persistence Layer

> **Update 2026-04-15:** init.sql now fully aligned with PLAN.md spec — added `home_assistant_config` column to settings, `git_repo_config`/`volume_path` to stacks, `database_config`/`encrypted`/`incremental` to backup_configs. Settings route updated for HA config read/write.

> **Goal:** Create the PostgreSQL schema and backend routes for all data that doesn't live in Docker — settings, stacks metadata, version history, backup configs, notification services, port reservations, smart startup configs, and audit logging.

## Prerequisites
- Phase 2 complete (Docker API routes working, WebSocket streaming)
- PostgreSQL container running with health check passing

## Completion Criteria
- [ ] All 8 database tables created via migration on startup
- [ ] `GET/PUT /api/settings` persists and retrieves app settings
- [ ] `GET/POST/PUT/DELETE /api/stacks` manages stack metadata + compose files on disk
- [ ] `POST /api/stacks/:id/deploy` runs `docker compose up -d` for real
- [ ] `POST /api/stacks/:id/stop` runs `docker compose down` for real
- [ ] `GET /api/stacks/:id/versions` returns version history from DB
- [ ] `POST /api/stacks/:id/restore/:v` restores an old compose version
- [ ] `GET/POST/PUT/DELETE /api/notifications/services` manages notification services
- [ ] `GET/POST/DELETE /api/ports/reservations` manages port range reservations
- [ ] `GET/PUT /api/smart-startup` manages smart startup configs
- [ ] `GET/POST /api/backups` manages backup configs and job history
- [ ] All changes logged in `audit_log` table

---

## Task 3.1 — Database Connection Module

**File:** `backend/src/database.ts`

```typescript
import pg from 'pg';
import { config } from './config.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function initDatabase(): Promise<void> {
  // Run migrations on startup
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationPath = join(__dirname, '..', 'migrations', '001_initial.sql');

  try {
    const sql = readFileSync(migrationPath, 'utf-8');
    await pool.query(sql);
    console.log('Database migrations applied successfully');
  } catch (err) {
    // If tables already exist, that's fine
    if ((err as any).code === '42P07') {
      console.log('Database tables already exist');
    } else {
      throw err;
    }
  }

  // Seed default settings if not exist
  await pool.query(`
    INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING
  `);
}

export { pool };
```

Call `initDatabase()` from `index.ts` before starting the server.

---

## Task 3.2 — Migration: Full Schema

**File:** `backend/src/migrations/001_initial.sql`

Also copy to `DOCKERVERSION/db/init.sql` so it runs on first PostgreSQL start.

```sql
-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================
-- Settings (singleton row)
-- ================================================
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    stacks_base_path TEXT NOT NULL DEFAULT '/opt/stacks',
    volumes_base_path TEXT NOT NULL DEFAULT '/mnt/docker-volumes',
    backups_base_path TEXT NOT NULL DEFAULT '/mnt/backups',
    auto_update BOOLEAN NOT NULL DEFAULT FALSE,
    global_update_freeze BOOLEAN NOT NULL DEFAULT FALSE,
    notification_config JSONB NOT NULL DEFAULT '{
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
        "thresholds": {
            "memoryPercent": 80,
            "cpuPercent": 80
        }
    }'::jsonb,
    home_assistant_config JSONB NOT NULL DEFAULT '{
        "enabled": false,
        "baseUrl": "",
        "accessToken": "",
        "entityPrefix": "hlc"
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- Stacks (compose files stored on disk, metadata in DB)
-- ================================================
CREATE TABLE IF NOT EXISTS stacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    stack_path TEXT NOT NULL,
    volume_path TEXT,
    env_file TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    git_repo_config JSONB,
    smart_startup_config JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- Stack Versions (compose file history)
-- ================================================
CREATE TABLE IF NOT EXISTS stack_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id UUID NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    compose_content TEXT NOT NULL,
    env_content TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(stack_id, version)
);

-- ================================================
-- Backup Configs (per stack)
-- ================================================
CREATE TABLE IF NOT EXISTS backup_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id UUID UNIQUE NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    cron_schedule TEXT,
    retention_days INTEGER NOT NULL DEFAULT 30,
    retention_policy JSONB,
    use_advanced_retention BOOLEAN NOT NULL DEFAULT FALSE,
    include_stack_folder BOOLEAN NOT NULL DEFAULT TRUE,
    include_volumes BOOLEAN NOT NULL DEFAULT TRUE,
    include_databases BOOLEAN NOT NULL DEFAULT FALSE,
    compression_level TEXT NOT NULL DEFAULT 'balanced'
        CHECK (compression_level IN ('none', 'fast', 'balanced', 'maximum')),
    incremental_backup BOOLEAN NOT NULL DEFAULT FALSE,
    encryption_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    database_type TEXT CHECK (database_type IN ('mysql', 'postgresql', 'mongodb', 'redis')),
    database_config JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- Backup Jobs (history)
-- ================================================
CREATE TABLE IF NOT EXISTS backup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id UUID REFERENCES stacks(id) ON DELETE SET NULL,
    stack_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'in-progress')),
    path TEXT,
    size TEXT,
    includes JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ================================================
-- Notification Services
-- ================================================
CREATE TABLE IF NOT EXISTS notification_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('telegram', 'discord', 'slack', 'email', 'webhook')),
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================
-- Port Reservations
-- ================================================
CREATE TABLE IF NOT EXISTS port_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    start_port INTEGER NOT NULL CHECK (start_port BETWEEN 1 AND 65535),
    end_port INTEGER NOT NULL CHECK (end_port BETWEEN 1 AND 65535),
    group_name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_port >= start_port)
);

-- ================================================
-- Smart Startup Configs
-- ================================================
CREATE TABLE IF NOT EXISTS smart_startup_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('container', 'stack')),
    target_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    trigger_device TEXT,
    trigger_type TEXT CHECK (trigger_type IN ('nas', 'device', 'ip', 'ping')),
    trigger_value TEXT,
    auto_start BOOLEAN NOT NULL DEFAULT FALSE,
    start_delay INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(target_type, target_id)
);

-- ================================================
-- Audit Log
-- ================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
```

---

## Task 3.3 — Settings Routes

**File:** `backend/src/routes/settings.ts`

### Endpoints:

#### `GET /api/settings`

Reads the singleton settings row and transforms to the frontend `AppSettings` shape:

```typescript
// DB row → Frontend response transformation:
{
  stacksBasePath: row.stacks_base_path,
  volumesBasePath: row.volumes_base_path,
  backupsBasePath: row.backups_base_path,
  autoUpdate: row.auto_update,
  globalUpdateFreeze: row.global_update_freeze,
  notifications: row.notification_config,   // JSONB, already the right shape
  homeAssistant: row.home_assistant_config   // JSONB, already the right shape
}
```

#### `PUT /api/settings`

Body: The full `AppSettings` object.
- Validates with zod schema
- Updates all columns
- Sets `updated_at = NOW()`
- Logs to `audit_log`
- Returns updated settings

```sql
UPDATE settings SET
  stacks_base_path = $1,
  volumes_base_path = $2,
  backups_base_path = $3,
  auto_update = $4,
  global_update_freeze = $5,
  notification_config = $6,
  home_assistant_config = $7,
  updated_at = NOW()
WHERE id = 1
RETURNING *
```

---

## Task 3.4 — Stacks Routes

**File:** `backend/src/routes/stacks.ts`

This is the most complex route module. Stacks are stored as:
- **Metadata:** PostgreSQL `stacks` table
- **Compose file:** On disk at `{stacksBasePath}/{stackName}/docker-compose.yml`
- **Env file:** On disk at `{stacksBasePath}/{stackName}/.env`
- **Status:** Derived from Docker (are the compose project's containers running?)

### Stack Service Helper

**File:** `backend/src/services/stacks.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export const stackService = {
  // Write compose file to disk
  async writeCompose(stackPath: string, content: string): Promise<void>;

  // Write .env file to disk
  async writeEnv(stackPath: string, content: string): Promise<void>;

  // Read compose file from disk
  async readCompose(stackPath: string): Promise<string>;

  // Deploy stack (docker compose up -d)
  async deploy(stackPath: string): Promise<{ stdout: string; stderr: string }>;

  // Stop stack (docker compose down)
  async stop(stackPath: string): Promise<{ stdout: string; stderr: string }>;

  // Restart stack (down + up)
  async restart(stackPath: string): Promise<{ stdout: string; stderr: string }>;

  // Get stack status from Docker
  async getStatus(stackPath: string): Promise<'running' | 'stopped' | 'failed' | 'deploying'>;

  // Delete stack files from disk
  async deleteFiles(stackPath: string): Promise<void>;
};
```

**IMPORTANT — Command Execution Security:**
- Stack names validated: `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`
- Compose paths constructed from validated names + configured base path
- Use `execa` or `child_process.exec` with explicit args array — NO shell string interpolation
- Example: `execAsync('docker compose -f /opt/stacks/web-stack/docker-compose.yml up -d')`

### Endpoints:

#### `GET /api/stacks`

1. Query all stacks from DB
2. For each stack, read compose file from disk
3. For each stack, get live status from Docker
4. For each stack, get backup config from `backup_configs` table
5. Merge and return

Response shape matches frontend `Stack` type:
```typescript
{
  id: string;           // UUID from DB
  name: string;
  status: 'running' | 'stopped' | 'failed' | 'deploying';
  services: number;     // Count from compose file parsing
  created: string;      // ISO from DB
  compose: string;      // Content from disk
  version: number;      // current_version from DB
  stackPath: string;
  volumePath: string;
  envFile: string;      // Content from disk (or empty)
  ports: number[];      // Parsed from compose
  versions: StackVersion[];  // From stack_versions table
  backupConfig: BackupConfig; // From backup_configs table
  gitRepo: GitRepoConfig;    // From DB JSONB
  smartStartup: SmartStartupConfig; // From DB JSONB
}
```

#### `POST /api/stacks`

Body:
```json
{
  "name": "my-stack",
  "compose": "version: '3.8'\nservices: ...",
  "envFile": "KEY=value",
  "gitRepoConfig": { ... },
  "backupConfig": { ... }
}
```

Steps:
1. Validate stack name (alphanumeric + hyphens)
2. Check name uniqueness in DB
3. Create stack directory on disk: `{stacksBasePath}/{name}/`
4. Write `docker-compose.yml` to disk
5. Write `.env` to disk (if provided)
6. INSERT into `stacks` table
7. INSERT version 1 into `stack_versions` table
8. INSERT backup config into `backup_configs` table (if provided)
9. Log to `audit_log`
10. Return created stack

#### `PUT /api/stacks/:id`

Body: partial stack update (compose, envFile, gitRepoConfig, etc.)

Steps:
1. Fetch existing stack from DB
2. Write updated compose file to disk
3. Increment `current_version`
4. INSERT new version into `stack_versions`
5. UPDATE stack row in DB
6. Log to `audit_log`
7. Return updated stack

#### `DELETE /api/stacks/:id`

Steps:
1. Fetch stack from DB
2. Stop stack if running (`docker compose down`)
3. Delete stack files from disk
4. DELETE from DB (cascades to versions and backup_configs)
5. Log to `audit_log`

#### `POST /api/stacks/:id/deploy`

Steps:
1. Fetch stack path from DB
2. Run `docker compose -f {path}/docker-compose.yml up -d`
3. Return stdout/stderr output
4. Log to `audit_log`

#### `POST /api/stacks/:id/stop`

Steps:
1. Fetch stack path from DB
2. Run `docker compose -f {path}/docker-compose.yml down`
3. Return output
4. Log to `audit_log`

#### `POST /api/stacks/:id/restart`

Steps:
1. Stop then deploy
2. Log to `audit_log`

#### `GET /api/stacks/:id/versions`

- Query `stack_versions` table for stack ID
- Order by version DESC
- Return array of `StackVersion` objects

#### `POST /api/stacks/:id/restore/:version`

Steps:
1. Fetch version from `stack_versions` table
2. Write compose content to disk
3. Write env content to disk (if present)
4. Update `stacks.current_version` to a NEW version number (don't reuse)
5. INSERT new version entry (copy of old + description "Restored from v{N}")
6. Log to `audit_log`

---

## Task 3.5 — Backup Routes

**File:** `backend/src/routes/backups.ts`

### Endpoints:

#### `GET /api/backups`
- Query `backup_jobs` table
- Order by `started_at DESC`
- Limit 100

#### `GET /api/backups/:stackId/config`
- Query `backup_configs` table by stack_id

#### `PUT /api/backups/:stackId/config`
- Body: backup config fields
- UPSERT into `backup_configs` table
- Log to `audit_log`

#### `POST /api/backups/:stackId/run`
- Creates a new `backup_jobs` entry with status `in-progress`
- Triggers actual backup (Phase 5 implements the actual backup logic)
- For now: mark as `completed` after a brief delay
- Returns job ID

#### `POST /api/backups/:jobId/restore`
- Placeholder for Phase 5
- Returns 501 Not Implemented for now

---

## Task 3.6 — Notification Services Routes

**File:** `backend/src/routes/notifications.ts`

### Endpoints:

#### `GET /api/notifications/services`
- Query `notification_services` table
- Return array

#### `POST /api/notifications/services`
- Body: `{ type, name, enabled, config }`
- Validate type is one of: telegram, discord, slack, email, webhook
- INSERT into DB
- Log to `audit_log`

#### `PUT /api/notifications/services/:id`
- Body: partial update
- UPDATE in DB
- Log to `audit_log`

#### `DELETE /api/notifications/services/:id`
- DELETE from DB
- Log to `audit_log`

#### `POST /api/notifications/test/:id`
- Fetch service config from DB
- Send test notification (Phase 5 implements dispatching)
- For now: return `{ success: true, message: "Test notification sent" }`

---

## Task 3.7 — Port Reservations Routes

**File:** `backend/src/routes/ports.ts`

### Endpoints:

#### `GET /api/ports`
Returns:
```json
{
  "reservations": [...],     // From DB
  "portMappings": [...],     // From Docker (containers + stacks)
  "conflicts": [...]         // Computed: ports used by multiple sources
}
```

Port mappings are extracted from:
1. Container port bindings (from Docker API)
2. Stack compose file parsing (from stacks on disk)

#### `POST /api/ports/reservations`
- Body: `{ name, description, startPort, endPort, groupName, color }`
- Validate port range (1-65535, end >= start)
- Check for overlapping reservations
- INSERT into DB
- Log to `audit_log`

#### `DELETE /api/ports/reservations/:id`
- DELETE from DB
- Log to `audit_log`

---

## Task 3.8 — Smart Startup Routes

**File:** `backend/src/routes/smart-startup.ts`

### Endpoints:

#### `GET /api/smart-startup`
- Query `smart_startup_configs` table
- Return array

#### `PUT /api/smart-startup/:id`
- Body: `{ enabled, triggerDevice, triggerType, triggerValue, autoStart, startDelay }`
- UPSERT into DB (using `target_type` + `target_id` unique constraint)
- Log to `audit_log`

---

## Task 3.9 — Audit Log Helper

**File:** `backend/src/services/audit.ts`

```typescript
import { pool } from '../database.js';

export async function logAudit(
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    'INSERT INTO audit_log (action, resource_type, resource_id, details) VALUES ($1, $2, $3, $4)',
    [action, resourceType, resourceId || null, details ? JSON.stringify(details) : null]
  );
}
```

Usage in routes:
```typescript
await logAudit('create', 'stack', stack.id, { name: stack.name });
await logAudit('update', 'settings', '1', { field: 'autoUpdate', value: true });
await logAudit('deploy', 'stack', stack.id, { name: stack.name });
```

---

## Task 3.10 — Register New Routes in App

Update `backend/src/app.ts` to include new routes:

```typescript
import { settingsRouter } from './routes/settings.js';
import { stacksRouter } from './routes/stacks.js';
import { backupsRouter } from './routes/backups.js';
import { notificationsRouter } from './routes/notifications.js';
import { portsRouter } from './routes/ports.js';
import { smartStartupRouter } from './routes/smart-startup.js';

// ... existing routes ...
app.use('/api/settings', settingsRouter);
app.use('/api/stacks', stacksRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ports', portsRouter);
app.use('/api/smart-startup', smartStartupRouter);
```

---

## Task 3.11 — Update Backend Startup

Update `backend/src/index.ts` to run migrations:

```typescript
import { initDatabase } from './database.js';

async function main() {
  await initDatabase();

  const server = createServer(app);
  setupWebSocket(server);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`HLC Backend listening on port ${config.port}`);
  });
}

main().catch(console.error);
```

---

## Verification Steps

```bash
# Settings
curl http://localhost:3001/api/settings | jq
curl -X PUT http://localhost:3001/api/settings \
  -H "Content-Type: application/json" \
  -d '{"stacksBasePath":"/opt/stacks","volumesBasePath":"/mnt/docker-volumes","backupsBasePath":"/mnt/backups","autoUpdate":false,"globalUpdateFreeze":false,"notifications":{"enabled":false,"events":{},"thresholds":{"memoryPercent":80,"cpuPercent":80}}}'

# Stacks CRUD
curl -X POST http://localhost:3001/api/stacks \
  -H "Content-Type: application/json" \
  -d '{"name":"test-stack","compose":"version: \"3.8\"\nservices:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - \"8888:80\""}'
curl http://localhost:3001/api/stacks | jq
curl -X POST http://localhost:3001/api/stacks/<STACK_ID>/deploy
curl -X POST http://localhost:3001/api/stacks/<STACK_ID>/stop
curl -X DELETE http://localhost:3001/api/stacks/<STACK_ID>

# Notification Services
curl -X POST http://localhost:3001/api/notifications/services \
  -H "Content-Type: application/json" \
  -d '{"type":"discord","name":"My Discord","enabled":true,"config":{"webhookUrl":"https://discord.com/api/webhooks/test"}}'
curl http://localhost:3001/api/notifications/services | jq

# Port Reservations
curl -X POST http://localhost:3001/api/ports/reservations \
  -H "Content-Type: application/json" \
  -d '{"name":"Media Services","startPort":8000,"endPort":8999,"groupName":"Media","color":"#3b82f6"}'
curl http://localhost:3001/api/ports | jq

# Smart Startup
curl http://localhost:3001/api/smart-startup | jq
```

---

## Files Created / Modified in This Phase

```
backend/src/
├── index.ts              (modified — calls initDatabase)
├── app.ts                (modified — registers new routes)
├── database.ts           (new — pg pool + migration runner)
├── migrations/
│   └── 001_initial.sql   (new — full schema)
├── routes/
│   ├── settings.ts       (new)
│   ├── stacks.ts         (new)
│   ├── backups.ts        (new)
│   ├── notifications.ts  (new)
│   ├── ports.ts          (new)
│   └── smart-startup.ts  (new)
└── services/
    ├── stacks.ts         (new — compose file + docker compose exec)
    └── audit.ts          (new — audit log helper)

db/
└── init.sql              (updated — full schema for first-run)
```
