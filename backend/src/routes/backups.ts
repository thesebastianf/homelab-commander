import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { backupConfigBody } from '../validation/schemas.js';
import { runBackup, detectStackVolumeTargets, detectStackDatabaseNames } from '../services/backups.js';
import { rescheduleBackup } from '../services/backupScheduler.js';
import { writeFile, access } from 'fs/promises';
import { join } from 'path';

const router = Router();

// Get backup config for a stack
router.get('/:stackId/config', asyncHandler(async (req, res) => {
  const { rows: [config] } = await pool.query(
    'SELECT * FROM backup_configs WHERE stack_id = $1', [req.params.stackId]
  );
  if (!config) {
    res.json({
      enabled: false,
      cronSchedule: '0 22 * * 3',
      retentionDays: 7,
      includeStackFolder: true,
      includeVolumes: true,
      includeDatabases: false,
      useAdvancedRetention: false,
      retentionPolicy: {
        keepLast: 10,
        keepHourly: 24,
        keepDaily: 7,
        keepWeekly: 4,
        keepMonthly: 6,
        keepYearly: 2,
      },
    });
    return;
  }
  res.json(mapBackupConfig(config));
}));

// List attachable named volumes for a stack
router.get('/:stackId/volumes', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT id, name FROM stacks WHERE id = $1', [req.params.stackId]);
  if (!stack) {
    res.status(404).json({ error: 'Stack not found' });
    return;
  }

  const targets = await detectStackVolumeTargets(String(stack.name));
  res.json(targets.map((target) => ({
    key: target.key,
    name: target.key,
    displayName: target.name,
    kind: target.kind,
    source: target.source,
    containerName: target.containerName,
  })));
}));

// List detectable databases for a stack
router.get('/:stackId/databases', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT id, name FROM stacks WHERE id = $1', [req.params.stackId]);
  if (!stack) {
    res.status(404).json({ error: 'Stack not found' });
    return;
  }

  const databases = await detectStackDatabaseNames(String(stack.name));
  const duplicateServiceNames = new Set(
    databases
      .map((db) => db.serviceName)
      .filter((serviceName, index, arr) => arr.indexOf(serviceName) !== index)
  );

  res.json(databases.map((db) => ({
    key: db.key,
    name: db.serviceName,
    type: db.type,
    containerName: db.containerName,
    warning: duplicateServiceNames.has(db.serviceName)
      ? 'Multiple containers with the same service name were detected; selection uses an internal key to avoid mix-ups.'
      : undefined,
  })));
}));

// Debug: Show container labels and mounts for a stack
router.get('/:stackId/debug/containers', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT id, name FROM stacks WHERE id = $1', [req.params.stackId]);
  if (!stack) {
    res.status(404).json({ error: 'Stack not found' });
    return;
  }

  const Dockerode = (await import('dockerode')).default;
  const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  const allContainers = await docker.listContainers({ all: true });
  
  const debugInfo = {
    stackName: stack.name,
    totalContainers: allContainers.length,
    containers: allContainers.map(c => ({
      id: c.Id?.slice(0, 12),
      name: c.Names?.[0]?.replace(/^\//, ''),
      image: c.Image,
      labels: c.Labels || {},
      mounts: (c.Mounts || []).map(m => ({ name: m.Name, type: m.Type, source: m.Source, destination: m.Destination })),
    })),
  };
  res.json(debugInfo);
}));

// Update backup config
router.put('/:stackId/config', validateBody(backupConfigBody), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [existing] } = await pool.query(
    'SELECT * FROM backup_configs WHERE stack_id = $1', [req.params.stackId]
  );

  if (existing) {
    await pool.query(
      `UPDATE backup_configs SET
        enabled = $1, cron_schedule = $2, retention_days = $3,
        include_stack_folder = $4, include_volumes = $5, include_databases = $6,
        database_type = $7, database_config = $8, compression_level = $9,
        encrypted = $10, incremental = $11, use_advanced_retention = $12,
        retention_policy = $13, updated_at = NOW()
      WHERE stack_id = $14`,
      [
        b.enabled, b.cronSchedule || '0 22 * * 3', b.retentionDays || 7,
        b.includeStackFolder ?? true, b.includeVolumes ?? true, b.includeDatabases ?? false,
        b.databaseType || 'none', JSON.stringify(b.databaseConfig || {}), b.compressionLevel ?? 6,
        b.encrypted ?? false, b.incremental ?? false, b.useAdvancedRetention ?? false,
        JSON.stringify(b.retentionPolicy || {
          keepLast: 10,
          keepHourly: 24,
          keepDaily: 7,
          keepWeekly: 4,
          keepMonthly: 6,
          keepYearly: 2,
        }),
        req.params.stackId,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO backup_configs (stack_id, enabled, cron_schedule, retention_days,
        include_stack_folder, include_volumes, include_databases, database_type,
        database_config, compression_level, encrypted, incremental,
        use_advanced_retention, retention_policy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        req.params.stackId, b.enabled, b.cronSchedule || '0 22 * * 3', b.retentionDays || 7,
        b.includeStackFolder ?? true, b.includeVolumes ?? true, b.includeDatabases ?? false,
        b.databaseType || 'none', JSON.stringify(b.databaseConfig || {}), b.compressionLevel ?? 6,
        b.encrypted ?? false, b.incremental ?? false, b.useAdvancedRetention ?? false,
        JSON.stringify(b.retentionPolicy || {
          keepLast: 10,
          keepHourly: 24,
          keepDaily: 7,
          keepWeekly: 4,
          keepMonthly: 6,
          keepYearly: 2,
        }),
      ]
    );
  }

  // Reschedule
  rescheduleBackup({ stack_id: req.params.stackId, enabled: b.enabled, cron_schedule: b.cronSchedule });

  // Write backup.md to stack folder
  try {
    const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.stackId]);
    if (stack?.stack_path) {
      const scheduleLabels: Record<string, string> = {
        '0 22 * * 3': 'Every Wednesday at 22:00',
        '0 22 * * 0': 'Every Sunday at 22:00',
        '0 22 1 * *': 'Every 1st of Month at 22:00',
      };
      const scheduleLabel = scheduleLabels[b.cronSchedule || ''] || b.cronSchedule || 'Not set';
      const retentionInfo = b.useAdvancedRetention
        ? `Advanced:\n  - Keep Last: ${b.retentionPolicy?.keepLast ?? 10}\n  - Keep Hourly: ${b.retentionPolicy?.keepHourly ?? 24}\n  - Keep Daily: ${b.retentionPolicy?.keepDaily ?? 7}\n  - Keep Weekly: ${b.retentionPolicy?.keepWeekly ?? 4}\n  - Keep Monthly: ${b.retentionPolicy?.keepMonthly ?? 6}\n  - Keep Yearly: ${b.retentionPolicy?.keepYearly ?? 2}`
        : `Simple: Keep last ${b.retentionDays ?? 7} backups`;

      const md = `# Backup Configuration: ${stack.name}

> Auto-generated by Homelab Commander. Edit this config via the UI — do not modify manually.

## Status

| Setting | Value |
|---------|-------|
| Enabled | ${b.enabled ? '✓ Yes' : '✗ No'} |
| Schedule | \`${b.cronSchedule || 'not set'}\` — ${scheduleLabel} |
| Retention | ${b.useAdvancedRetention ? 'Advanced (see below)' : `Keep last ${b.retentionDays ?? 7} backups`} |
| Compression | Level ${b.compressionLevel ?? 6} / 9 |
| Encrypted (metadata) | ${b.encrypted ? '✓ Enabled' : '✗ Disabled'} |
| Incremental (metadata) | ${b.incremental ? '✓ Enabled' : '✗ Disabled'} |

## Contents

- [${b.includeStackFolder !== false ? 'x' : ' '}] Full stack folder (everything except \`.git\`)
- [${b.includeVolumes !== false ? 'x' : ' '}] Docker volumes${Array.isArray(b.databaseConfig?.volumeNames) && b.databaseConfig.volumeNames.length > 0 ? ` (${b.databaseConfig.volumeNames.length} selected)` : ' (all attached)'}
- [${b.includeDatabases ? 'x' : ' '}] Database dumps${b.includeDatabases ? ` (${b.databaseType || 'postgres'})` : ''}

## Naming Convention

\`\`\`
{stackName}_backup_{YYYYMMDD-HHmmss}.tar.gz
\`\`\`

Example: \`${stack.name}_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-070000.tar.gz\`

Archive structure:

\`\`\`
STACK/
VOLUMES/
DATABASES/
manifest.json
\`\`\`

## Runtime Behavior Notes

- Encryption and incremental options are currently stored for forward compatibility.
- Current backup runs always generate full archives and do not apply encryption automatically.

## Retention Policy

${retentionInfo}

*Last updated: ${new Date().toISOString()}*
`;
      await writeFile(join(stack.stack_path, 'backup.md'), md, 'utf8');
    }
  } catch { /* non-fatal — backup.md is a convenience file */ }

  res.json({ ok: true });
}));

// Get backup jobs for a stack
router.get('/:stackId/jobs', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM backup_jobs WHERE stack_id = $1 ORDER BY started_at DESC LIMIT 50',
    [req.params.stackId]
  );

  // Reconcile: delete DB records for completed jobs whose backup files no longer exist on disk
  const orphanIds: string[] = [];
  for (const row of rows) {
    if (row.status === 'completed' && row.backup_path) {
      try {
        await access(row.backup_path);
      } catch {
        orphanIds.push(String(row.id));
      }
    }
  }
  if (orphanIds.length > 0) {
    await pool.query('DELETE FROM backup_jobs WHERE id = ANY($1::uuid[])', [orphanIds]);
  }

  const surviving = rows.filter((row) => !orphanIds.includes(String(row.id)));
  res.json(surviving.map(mapBackupJob));
}));

// Run backup now
router.post('/:stackId/run', asyncHandler(async (req, res) => {
  const stackId = String(req.params.stackId);
  await runBackup(stackId, 'manual');
  res.json({ ok: true });
}));

router.post('/run-all', asyncHandler(async (_req, res) => {
  const { rows: stacks } = await pool.query('SELECT id, name FROM stacks ORDER BY name');
  const summary: {
    started: Array<{ id: string; name: string }>;
    failed: Array<{ id: string; name: string; error: string }>;
  } = { started: [], failed: [] };

  for (const stack of stacks) {
    try {
      await runBackup(String(stack.id), 'manual-all');
      summary.started.push({ id: String(stack.id), name: String(stack.name) });
    } catch (err: any) {
      summary.failed.push({ id: String(stack.id), name: String(stack.name), error: err?.message || 'unknown error' });
    }
  }

  res.json(summary);
}));

function mapBackupConfig(row: any) {
  return {
    enabled: row.enabled,
    cronSchedule: row.cron_schedule,
    retentionDays: row.retention_days,
    includeStackFolder: row.include_stack_folder,
    includeVolumes: row.include_volumes,
    includeDatabases: row.include_databases,
    databaseType: row.database_type,
    databaseConfig: row.database_config,
    compressionLevel: row.compression_level,
    encrypted: row.encrypted,
    incremental: row.incremental,
    useAdvancedRetention: row.use_advanced_retention,
    retentionPolicy: row.retention_policy,
  };
}

function mapBackupJob(row: any) {
  return {
    id: row.id,
    stackId: row.stack_id,
    status: row.status,
    sizeBytes: row.size_bytes,
    backupPath: row.backup_path,
    includes: row.includes,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export default router;
