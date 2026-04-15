# Phase 5: Background Services

> **Goal:** Implement backend background services that run continuously: automated backup scheduling & execution, Docker image update checking, smart startup device monitoring, and notification dispatching.

## Prerequisites
- Phase 4 complete (full app working with real data)
- All database tables populated with user configurations

## Completion Criteria
- [ ] Backup scheduler reads cron expressions from DB and triggers backups on schedule
- [ ] Manual backup (`POST /api/backups/:stackId/run`) creates a real tar.gz archive
- [ ] Backup restore (`POST /api/backups/:jobId/restore`) extracts archive back to disk
- [ ] Update checker compares local image digests with registry digests
- [ ] Containers with `updateAvailable: true` are detected automatically
- [ ] Smart startup monitors configured trigger devices via ping
- [ ] When trigger device comes online, configured containers/stacks auto-start
- [ ] Notification service sends real messages to Telegram, Discord, Slack, Email, and Webhook

---

## Task 5.1 — Backup Service

**File:** `backend/src/services/backups.ts`

### Backup Execution Logic

When a backup runs (manual or scheduled), the service:

1. **Update job status** → `in-progress` in `backup_jobs` table
2. **Create backup directory**: `{backupsBasePath}/{stackName}/{timestamp}/`
3. **Backup stack folder** (if `include_stack_folder`):
   - Tar the stack directory: `{stacksBasePath}/{stackName}/`
   - Save as `stack-files.tar.gz`
4. **Backup volumes** (if `include_volumes`):
   - For each volume used by the stack's containers:
   - Create a temporary container that mounts the volume
   - Tar the volume data: `docker run --rm -v {volumeName}:/data -v {backupDir}:/backup alpine tar czf /backup/{volumeName}.tar.gz -C /data .`
5. **Backup database** (if `include_databases`):
   - Based on `database_type`:
     - **postgresql**: `docker exec {container} pg_dump -U {user} {db} | gzip > {backupDir}/db-dump.sql.gz`
     - **mysql**: `docker exec {container} mysqldump -u {user} -p{pass} {db} | gzip > {backupDir}/db-dump.sql.gz`
     - **mongodb**: `docker exec {container} mongodump --archive | gzip > {backupDir}/db-dump.archive.gz`
     - **redis**: `docker exec {container} redis-cli BGSAVE` + copy RDB file
6. **Compress** (if compression enabled):
   - Apply compression level to the final archive
7. **Write manifest**: `manifest.json` with metadata (timestamp, includes, sizes)
8. **Calculate total size** and update `backup_jobs`
9. **Update job status** → `completed` or `failed`
10. **Send notification** (if configured for backup events)
11. **Apply retention policy** — delete old backups exceeding retention

### Backup Command Helpers

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function backupVolume(volumeName: string, backupDir: string): Promise<string> {
  const archiveName = `${volumeName}.tar.gz`;
  await execFileAsync('docker', [
    'run', '--rm',
    '-v', `${volumeName}:/source:ro`,
    '-v', `${backupDir}:/backup`,
    'alpine',
    'tar', 'czf', `/backup/${archiveName}`, '-C', '/source', '.'
  ]);
  return archiveName;
}

async function backupPostgres(
  containerName: string, user: string, database: string, outputPath: string
): Promise<void> {
  const { stdout } = await execFileAsync('docker', [
    'exec', containerName,
    'pg_dump', '-U', user, database
  ]);
  // Write gzipped output
  const { createGzip } = await import('zlib');
  const { createWriteStream } = await import('fs');
  const { pipeline } = await import('stream/promises');
  const { Readable } = await import('stream');
  
  await pipeline(
    Readable.from(stdout),
    createGzip(),
    createWriteStream(outputPath)
  );
}
```

### Retention Policy Enforcement

```typescript
async function enforceRetention(stackName: string, config: BackupConfig): Promise<void> {
  const backupDir = join(config.backupsBasePath, stackName);
  const entries = await readdir(backupDir); // List backup folders
  
  if (config.useAdvancedRetention && config.retentionPolicy) {
    // Advanced: keep N daily, N weekly, N monthly, N yearly
    const now = new Date();
    const policy = config.retentionPolicy;
    
    for (const entry of entries) {
      const backupDate = parseBackupTimestamp(entry);
      const age = differenceInDays(now, backupDate);
      
      // Determine if this backup should be kept
      const keepDaily = age <= policy.daily;
      const keepWeekly = age <= policy.weekly * 7 && isWeeklyKeep(backupDate);
      const keepMonthly = age <= policy.monthly * 30 && isMonthlyKeep(backupDate);
      const keepYearly = age <= policy.yearly * 365 && isYearlyKeep(backupDate);
      
      if (!keepDaily && !keepWeekly && !keepMonthly && !keepYearly) {
        await rm(join(backupDir, entry), { recursive: true });
      }
    }
  } else {
    // Simple: delete anything older than retentionDays
    const cutoff = subDays(new Date(), config.retentionDays);
    for (const entry of entries) {
      const backupDate = parseBackupTimestamp(entry);
      if (backupDate < cutoff) {
        await rm(join(backupDir, entry), { recursive: true });
      }
    }
  }
}
```

---

## Task 5.2 — Backup Scheduler

**File:** `backend/src/services/backup-scheduler.ts`

Uses `node-cron` to schedule backups based on cron expressions stored in `backup_configs`.

```typescript
import cron from 'node-cron';
import { pool } from '../database.js';
import { runBackup } from './backups.js';

const scheduledJobs = new Map<string, cron.ScheduledTask>();

export async function initBackupScheduler(): Promise<void> {
  // Load all enabled backup configs
  const { rows } = await pool.query(`
    SELECT bc.*, s.name as stack_name, s.stack_path
    FROM backup_configs bc
    JOIN stacks s ON s.id = bc.stack_id
    WHERE bc.enabled = true AND bc.cron_schedule IS NOT NULL
  `);

  for (const config of rows) {
    scheduleBackup(config);
  }

  console.log(`Backup scheduler initialized with ${rows.length} jobs`);
}

export function scheduleBackup(config: any): void {
  // Remove existing schedule if any
  const existing = scheduledJobs.get(config.stack_id);
  if (existing) existing.stop();

  if (!cron.validate(config.cron_schedule)) {
    console.warn(`Invalid cron for stack ${config.stack_name}: ${config.cron_schedule}`);
    return;
  }

  const task = cron.schedule(config.cron_schedule, async () => {
    console.log(`Running scheduled backup for ${config.stack_name}`);
    try {
      await runBackup(config.stack_id);
    } catch (err) {
      console.error(`Scheduled backup failed for ${config.stack_name}:`, err);
    }
  });

  scheduledJobs.set(config.stack_id, task);
}

export function unscheduleBackup(stackId: string): void {
  const task = scheduledJobs.get(stackId);
  if (task) {
    task.stop();
    scheduledJobs.delete(stackId);
  }
}

// Call when backup config changes (from PUT /api/backups/:stackId/config)
export function rescheduleBackup(config: any): void {
  unscheduleBackup(config.stack_id);
  if (config.enabled && config.cron_schedule) {
    scheduleBackup(config);
  }
}
```

**Add `node-cron` dependency:** `npm install node-cron` + `@types/node-cron`

Call `initBackupScheduler()` from `index.ts` after database init.

---

## Task 5.3 — Update Checker Service

**File:** `backend/src/services/updates.ts`

Periodically checks if local Docker images have newer versions available in their registries.

### Logic:

1. List all containers and their images
2. For each image with a tag (not `sha256:` digest):
   - Get local image digest: `docker.getImage(name).inspect()` → `RepoDigests`
   - Query registry for current digest: Docker Registry V2 API
   - Compare digests — if different, update is available
3. Store results in memory (or lightweight DB table)
4. Frontend reads via `GET /api/containers` which includes `updateAvailable` flag

### Registry Digest Check:

```typescript
async function checkRegistryDigest(image: string, tag: string): Promise<string | null> {
  // Docker Hub API
  const [namespace, repo] = image.includes('/') 
    ? image.split('/') 
    : ['library', image];

  try {
    // Get auth token
    const authRes = await fetch(
      `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${namespace}/${repo}:pull`
    );
    const { token } = await authRes.json();

    // Get manifest digest
    const manifestRes = await fetch(
      `https://registry-1.docker.io/v2/${namespace}/${repo}/manifests/${tag}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
        }
      }
    );

    return manifestRes.headers.get('docker-content-digest');
  } catch {
    return null;
  }
}
```

### Scheduling:

```typescript
let updateResults = new Map<string, boolean>(); // imageId → updateAvailable

export async function checkForUpdates(): Promise<void> {
  const containers = await dockerService.listContainers();
  
  for (const container of containers) {
    const [name, tag] = container.image.split(':');
    if (!tag || tag === 'latest') continue; // Skip untagged

    const localDigest = await getLocalDigest(container.image);
    const remoteDigest = await checkRegistryDigest(name, tag || 'latest');

    if (localDigest && remoteDigest && localDigest !== remoteDigest) {
      updateResults.set(container.id, true);
    } else {
      updateResults.set(container.id, false);
    }
  }
}

// Run every 6 hours
setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
// Also run on startup (after 30 second delay)
setTimeout(checkForUpdates, 30000);
```

### Auto-Update Logic:

When `settings.autoUpdate === true` AND `settings.globalUpdateFreeze === false`:

```typescript
async function autoUpdateContainer(containerId: string, imageName: string): Promise<void> {
  // 1. Pull new image
  await dockerService.pullImage(imageName, 'latest');
  
  // 2. Stop old container
  const container = await dockerService.getContainer(containerId);
  const config = await container.inspect();
  await container.stop();
  await container.remove();
  
  // 3. Recreate with same config but new image
  const newContainer = await docker.createContainer({
    ...config.Config,
    HostConfig: config.HostConfig,
    name: config.Name.replace(/^\//, '')
  });
  await newContainer.start();
  
  // 4. Notify
  await sendNotification('containerAutoUpdated', {
    container: config.Name,
    image: imageName
  });
}
```

---

## Task 5.4 — Smart Startup Monitor

**File:** `backend/src/services/smart-startup.ts`

Monitors network for configured trigger devices and auto-starts containers/stacks when devices come online.

### Device Monitoring:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { pool } from '../database.js';
import { dockerService } from './docker.js';
import { stackService } from './stacks.js';

const execAsync = promisify(exec);
const POLL_INTERVAL = 30_000; // 30 seconds
const deviceStates = new Map<string, boolean>(); // triggerValue → online

export async function initSmartStartup(): Promise<void> {
  // Start monitoring loop
  setInterval(monitorDevices, POLL_INTERVAL);
  console.log('Smart startup monitor initialized');
}

async function monitorDevices(): Promise<void> {
  const { rows: configs } = await pool.query(
    'SELECT * FROM smart_startup_configs WHERE enabled = true'
  );

  for (const config of configs) {
    const wasOnline = deviceStates.get(config.trigger_value) || false;
    const isOnline = await checkDevice(config.trigger_type, config.trigger_value);
    
    deviceStates.set(config.trigger_value, isOnline);

    // Device just came online (transition from offline → online)
    if (isOnline && !wasOnline && config.auto_start) {
      console.log(`Trigger device ${config.trigger_value} came online, starting ${config.target_type} ${config.target_id} in ${config.start_delay}s`);
      
      setTimeout(async () => {
        try {
          if (config.target_type === 'container') {
            await dockerService.startContainer(config.target_id);
          } else if (config.target_type === 'stack') {
            const { rows } = await pool.query(
              'SELECT stack_path FROM stacks WHERE id = $1', [config.target_id]
            );
            if (rows[0]) {
              await stackService.deploy(rows[0].stack_path);
            }
          }
        } catch (err) {
          console.error(`Smart startup failed for ${config.target_id}:`, err);
        }
      }, config.start_delay * 1000);
    }
  }
}

async function checkDevice(type: string, value: string): Promise<boolean> {
  try {
    switch (type) {
      case 'ping':
      case 'ip':
      case 'nas':
      case 'device': {
        // Validate IP/hostname format to prevent command injection
        if (!/^[a-zA-Z0-9._-]+$/.test(value)) return false;
        
        const { stdout } = await execAsync(
          `ping -c 1 -W 2 ${value}`,
          { timeout: 5000 }
        );
        return stdout.includes('1 received') || stdout.includes('1 packets received');
      }
      default:
        return false;
    }
  } catch {
    return false; // Ping failed = device offline
  }
}
```

**SECURITY NOTE:** The `value` parameter (IP/hostname) is validated with a strict regex before being used in a command. This prevents command injection.

---

## Task 5.5 — Notification Dispatcher

**File:** `backend/src/services/notifications.ts`

Sends notifications to configured services when events occur.

### Dispatcher:

```typescript
import { pool } from '../database.js';

interface NotificationPayload {
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
}

export async function sendNotification(
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  // 1. Check if notifications are enabled
  const { rows: [settings] } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const notifConfig = settings.notification_config;
  
  if (!notifConfig.enabled) return;
  if (!notifConfig.events[eventType]) return;

  // 2. Build payload
  const payload = buildPayload(eventType, data);

  // 3. Get all enabled services
  const { rows: services } = await pool.query(
    'SELECT * FROM notification_services WHERE enabled = true'
  );

  // 4. Send to each service
  for (const service of services) {
    try {
      await dispatchToService(service, payload);
    } catch (err) {
      console.error(`Notification failed for ${service.name}:`, err);
    }
  }
}

function buildPayload(eventType: string, data: Record<string, unknown>): NotificationPayload {
  const titles: Record<string, string> = {
    updateAvailable: '🔄 Update Available',
    containerAutoUpdated: '✅ Container Auto-Updated',
    containerFailed: '❌ Container Failed',
    highMemory: '⚠️ High Memory Usage',
    highCpu: '⚠️ High CPU Usage',
    containerStarted: '▶️ Container Started',
    containerStopped: '⏹️ Container Stopped',
    stackDeployed: '🚀 Stack Deployed',
    stackFailed: '❌ Stack Deploy Failed',
    backupCompleted: '💾 Backup Completed',
    backupFailed: '❌ Backup Failed',
  };

  return {
    title: titles[eventType] || `HLC: ${eventType}`,
    message: JSON.stringify(data, null, 2),
    level: eventType.includes('Failed') || eventType.includes('error') ? 'error'
         : eventType.includes('High') ? 'warning' : 'info',
    timestamp: new Date().toISOString(),
  };
}
```

### Service-Specific Dispatchers:

```typescript
async function dispatchToService(
  service: { type: string; config: Record<string, string> },
  payload: NotificationPayload
): Promise<void> {
  switch (service.type) {
    case 'telegram':
      await sendTelegram(service.config, payload);
      break;
    case 'discord':
      await sendDiscord(service.config, payload);
      break;
    case 'slack':
      await sendSlack(service.config, payload);
      break;
    case 'email':
      await sendEmail(service.config, payload);
      break;
    case 'webhook':
      await sendWebhook(service.config, payload);
      break;
  }
}

async function sendTelegram(
  config: { botToken: string; chatId: string },
  payload: NotificationPayload
): Promise<void> {
  const text = `*${payload.title}*\n\n${payload.message}`;
  await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: 'Markdown'
    })
  });
}

async function sendDiscord(
  config: { webhookUrl: string },
  payload: NotificationPayload
): Promise<void> {
  const color = payload.level === 'error' ? 0xff0000
              : payload.level === 'warning' ? 0xffaa00 : 0x00ff00;
  
  await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: payload.title,
        description: payload.message,
        color,
        timestamp: payload.timestamp
      }]
    })
  });
}

async function sendSlack(
  config: { webhookUrl: string },
  payload: NotificationPayload
): Promise<void> {
  await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${payload.title}\n${payload.message}`
    })
  });
}

async function sendEmail(
  config: { smtpHost: string; smtpPort: string; username: string; password: string; from: string; to: string },
  payload: NotificationPayload
): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: parseInt(config.smtpPort),
    secure: parseInt(config.smtpPort) === 465,
    auth: { user: config.username, pass: config.password }
  });

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: payload.title,
    text: payload.message
  });
}

async function sendWebhook(
  config: { url: string; method?: string },
  payload: NotificationPayload
): Promise<void> {
  await fetch(config.url, {
    method: config.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
```

**Add dependency:** `npm install nodemailer` + `@types/nodemailer`

---

## Task 5.6 — Integrate Services with Event Hooks

Wire notification dispatch into existing operations:

### In container routes (Phase 2):
```typescript
// After container start
await sendNotification('containerStarted', { name: containerName });

// After container stop
await sendNotification('containerStopped', { name: containerName });
```

### In stack routes (Phase 3):
```typescript
// After stack deploy success
await sendNotification('stackDeployed', { name: stackName });

// After stack deploy failure
await sendNotification('stackFailed', { name: stackName, error: err.message });
```

### In backup service (this phase):
```typescript
// After backup success
await sendNotification('backupCompleted', { stack: stackName, size: totalSize });

// After backup failure
await sendNotification('backupFailed', { stack: stackName, error: err.message });
```

### In Docker events WebSocket (Phase 2):
```typescript
// When a container dies unexpectedly
if (event.Action === 'die' && event.Actor.Attributes.exitCode !== '0') {
  await sendNotification('containerFailed', {
    name: event.Actor.Attributes.name,
    exitCode: event.Actor.Attributes.exitCode
  });
}
```

---

## Task 5.7 — Resource Threshold Monitoring

Monitor CPU and memory usage, send alerts when thresholds are exceeded.

```typescript
const THRESHOLD_CHECK_INTERVAL = 60_000; // 1 minute
const alertCooldown = new Map<string, number>(); // containerId → last alert timestamp

export async function initThresholdMonitor(): Promise<void> {
  setInterval(checkThresholds, THRESHOLD_CHECK_INTERVAL);
}

async function checkThresholds(): Promise<void> {
  const { rows: [settings] } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const thresholds = settings.notification_config.thresholds;
  if (!thresholds) return;

  const containers = await dockerService.listContainers();
  
  for (const container of containers) {
    if (container.State !== 'running') continue;

    try {
      const stats = await getContainerStatsOnce(container.Id);
      const cpu = calculateCPU(stats);
      const mem = (stats.memory_stats.usage / stats.memory_stats.limit) * 100;

      const cooldownKey = container.Id;
      const lastAlert = alertCooldown.get(cooldownKey) || 0;
      const now = Date.now();

      // Only alert once per 15 minutes per container
      if (now - lastAlert < 15 * 60 * 1000) continue;

      if (cpu > thresholds.cpuPercent) {
        await sendNotification('highCpu', {
          container: container.Names[0],
          usage: cpu.toFixed(1),
          threshold: thresholds.cpuPercent
        });
        alertCooldown.set(cooldownKey, now);
      }

      if (mem > thresholds.memoryPercent) {
        await sendNotification('highMemory', {
          container: container.Names[0],
          usage: mem.toFixed(1),
          threshold: thresholds.memoryPercent
        });
        alertCooldown.set(cooldownKey, now);
      }
    } catch { /* Container might have stopped */ }
  }
}
```

---

## Task 5.8 — Initialize All Services on Startup

Update `backend/src/index.ts`:

```typescript
import { initDatabase } from './database.js';
import { initBackupScheduler } from './services/backup-scheduler.js';
import { initSmartStartup } from './services/smart-startup.js';
import { initThresholdMonitor } from './services/notifications.js';
import { checkForUpdates } from './services/updates.js';

async function main() {
  await initDatabase();

  const server = createServer(app);
  setupWebSocket(server);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`HLC Backend listening on port ${config.port}`);
  });

  // Initialize background services
  await initBackupScheduler();
  await initSmartStartup();
  await initThresholdMonitor();
  
  // Check for updates after 30s delay (let everything stabilize)
  setTimeout(checkForUpdates, 30_000);
}

main().catch(console.error);
```

---

## Verification Steps

```bash
# 1. Test manual backup
curl -X POST http://localhost:3001/api/backups/<STACK_ID>/run
# Check ./data/backups/<stack-name>/ for tar.gz files

# 2. Test backup scheduling
# Set cron to "* * * * *" (every minute) for testing
curl -X PUT http://localhost:3001/api/backups/<STACK_ID>/config \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"cronSchedule":"* * * * *","retentionDays":7,"includeStackFolder":true,"includeVolumes":true,"includeDatabases":false}'
# Wait 1 minute, check backup_jobs table

# 3. Test notification
curl -X POST http://localhost:3001/api/notifications/test/<SERVICE_ID>

# 4. Test update checker
curl http://localhost:3001/api/containers | jq '.[].updateAvailable'

# 5. Test smart startup
# Configure a device trigger, verify ping monitoring in logs
```

---

## Files Created / Modified in This Phase

```
backend/src/
├── index.ts                        (modified — init all background services)
├── services/
│   ├── backups.ts                  (REWRITTEN — real backup execution)
│   ├── backup-scheduler.ts         (new — node-cron scheduling)
│   ├── updates.ts                  (new — registry digest comparison)
│   ├── smart-startup.ts            (new — ping monitoring + auto-start)
│   └── notifications.ts            (new — Telegram/Discord/Slack/Email/Webhook)
├── routes/
│   ├── backups.ts                  (modified — calls real backup service)
│   ├── containers.ts               (modified — sends notifications on actions)
│   └── stacks.ts                   (modified — sends notifications on deploy/fail)
└── package.json                    (modified — add node-cron, nodemailer)
```

### New Dependencies

```json
{
  "node-cron": "^3.0.3",
  "nodemailer": "^6.9.16"
}
```

Dev:
```json
{
  "@types/node-cron": "^3.0.11",
  "@types/nodemailer": "^6.4.17"
}
```
