import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { backupConfigBody } from '../validation/schemas.js';
import { runBackup } from '../services/backups.js';
import { rescheduleBackup } from '../services/backupScheduler.js';

const router = Router();

// Get backup config for a stack
router.get('/:stackId/config', asyncHandler(async (req, res) => {
  const { rows: [config] } = await pool.query(
    'SELECT * FROM backup_configs WHERE stack_id = $1', [req.params.stackId]
  );
  if (!config) {
    res.json({ enabled: false, cronSchedule: '0 2 * * *', retentionDays: 7 });
    return;
  }
  res.json(mapBackupConfig(config));
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
        database_type = $7, compression_level = $8, use_advanced_retention = $9,
        retention_policy = $10, updated_at = NOW()
      WHERE stack_id = $11`,
      [
        b.enabled, b.cronSchedule || '0 2 * * *', b.retentionDays || 7,
        b.includeStackFolder ?? true, b.includeVolumes ?? true, b.includeDatabases ?? false,
        b.databaseType || 'none', b.compressionLevel ?? 6, b.useAdvancedRetention ?? false,
        JSON.stringify(b.retentionPolicy || { daily: 7, weekly: 4, monthly: 6, yearly: 1 }),
        req.params.stackId,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO backup_configs (stack_id, enabled, cron_schedule, retention_days,
        include_stack_folder, include_volumes, include_databases, database_type,
        compression_level, use_advanced_retention, retention_policy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        req.params.stackId, b.enabled, b.cronSchedule || '0 2 * * *', b.retentionDays || 7,
        b.includeStackFolder ?? true, b.includeVolumes ?? true, b.includeDatabases ?? false,
        b.databaseType || 'none', b.compressionLevel ?? 6, b.useAdvancedRetention ?? false,
        JSON.stringify(b.retentionPolicy || { daily: 7, weekly: 4, monthly: 6, yearly: 1 }),
      ]
    );
  }

  // Reschedule
  rescheduleBackup({ stack_id: req.params.stackId, enabled: b.enabled, cron_schedule: b.cronSchedule });
  res.json({ ok: true });
}));

// Get backup jobs for a stack
router.get('/:stackId/jobs', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM backup_jobs WHERE stack_id = $1 ORDER BY started_at DESC LIMIT 50',
    [req.params.stackId]
  );
  res.json(rows.map(mapBackupJob));
}));

// Run backup now
router.post('/:stackId/run', asyncHandler(async (req, res) => {
  const stackId = String(req.params.stackId);
  await runBackup(stackId);
  res.json({ ok: true });
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
    compressionLevel: row.compression_level,
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
