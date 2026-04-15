import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { smartStartupBody } from '../validation/schemas.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM smart_startup_configs ORDER BY created_at');
  res.json(rows.map(mapConfig));
}));

router.post('/', validateBody(smartStartupBody), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [row] } = await pool.query(
    `INSERT INTO smart_startup_configs (target_type, target_id, trigger_type, trigger_value, auto_start, start_delay, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [b.targetType, b.targetId, b.triggerType, b.triggerValue, b.autoStart, b.startDelay, b.enabled]
  );
  res.status(201).json(mapConfig(row));
}));

router.put('/:id', validateBody(smartStartupBody), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [row] } = await pool.query(
    `UPDATE smart_startup_configs SET
      target_type = $1, target_id = $2, trigger_type = $3, trigger_value = $4,
      auto_start = $5, start_delay = $6, enabled = $7, updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [b.targetType, b.targetId, b.triggerType, b.triggerValue, b.autoStart, b.startDelay, b.enabled, req.params.id]
  );
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(mapConfig(row));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM smart_startup_configs WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

function mapConfig(row: any) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    triggerType: row.trigger_type,
    triggerValue: row.trigger_value,
    autoStart: row.auto_start,
    startDelay: row.start_delay,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
