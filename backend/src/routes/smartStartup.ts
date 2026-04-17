import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody as validate } from '../middleware/validate.js';
import { smartStartupBody, smartStartupCheckNowBody } from '../validation/schemas.js';
import { getDeviceStatuses, getStartupOrphansSnapshot, runDeviceDiagnostics } from '../services/smartStartup.js';

const router = Router();

/** GET /  — list all configs with live device status */
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM smart_startup_configs ORDER BY created_at'
  );
  const statuses = getDeviceStatuses();
  res.json(rows.map(r => mapConfig(r, statuses)));
}));

/** GET /device-status  — real-time ping status for all monitored addresses */
router.get('/device-status', asyncHandler(async (_req, res) => {
  const statuses = getDeviceStatuses();
  res.json(statuses);
}));

/** GET /warnings/startup  — one-time startup orphan snapshot for UI visibility */
router.get('/warnings/startup', asyncHandler(async (_req, res) => {
  res.json(getStartupOrphansSnapshot());
}));

/** POST /check-now  — immediate connectivity check for one configured address */
router.post('/check-now', validate(smartStartupCheckNowBody), asyncHandler(async (req, res) => {
  const result = await runDeviceDiagnostics(req.body.address);
  res.json(result);
}));

router.post('/', validate(smartStartupBody), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [row] } = await pool.query(
    `INSERT INTO smart_startup_configs
       (target_type, target_id, trigger_type, trigger_value, auto_start, start_delay, monitor_interval, enabled)
     VALUES ('stack', $1, 'ip', $2, TRUE, $3, $4, $5) RETURNING *`,
    [b.targetId, b.triggerValue, b.startDelay, b.monitorInterval, b.enabled]
  );
  res.status(201).json(mapConfig(row, getDeviceStatuses()));
}));

router.put('/:id', validate(smartStartupBody), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [row] } = await pool.query(
    `UPDATE smart_startup_configs SET
       target_id = $1, trigger_type = 'ip', trigger_value = $2,
       auto_start = TRUE, start_delay = $3, monitor_interval = $4, enabled = $5,
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [b.targetId, b.triggerValue, b.startDelay, b.monitorInterval, b.enabled, req.params.id]
  );
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(mapConfig(row, getDeviceStatuses()));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM smart_startup_configs WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

function mapConfig(row: any, statuses: Record<string, any>) {
  const live = statuses[row.trigger_value];
  return {
    id: row.id,
    targetType: 'stack' as const,
    targetId: row.target_id,
    triggerValue: row.trigger_value,
    startDelay: row.start_delay,
    monitorInterval: row.monitor_interval,
    enabled: row.enabled,
    deviceOnline: live?.isOnline ?? row.device_online ?? false,
    lastCheckedAt: live?.lastCheckedAt ?? row.last_checked_at ?? null,
    lastSeenAt: live?.lastSeenAt ?? row.last_seen_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
