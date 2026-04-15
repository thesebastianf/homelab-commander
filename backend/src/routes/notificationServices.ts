import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { notificationServiceBody } from '../validation/schemas.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM notification_services ORDER BY name');
  res.json(rows.map(mapService));
}));

router.post('/', validateBody(notificationServiceBody), asyncHandler(async (req, res) => {
  const { name, type, enabled, config: svcConfig } = req.body;
  const { rows: [svc] } = await pool.query(
    `INSERT INTO notification_services (name, type, enabled, config)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, type, enabled, JSON.stringify(svcConfig)]
  );
  res.status(201).json(mapService(svc));
}));

router.put('/:id', validateBody(notificationServiceBody), asyncHandler(async (req, res) => {
  const { name, type, enabled, config: svcConfig } = req.body;
  const { rows: [svc] } = await pool.query(
    `UPDATE notification_services SET name = $1, type = $2, enabled = $3, config = $4, updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [name, type, enabled, JSON.stringify(svcConfig), req.params.id]
  );
  if (!svc) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(mapService(svc));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM notification_services WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Test notification
router.post('/:id/test', asyncHandler(async (req, res) => {
  const { rows: [svc] } = await pool.query('SELECT * FROM notification_services WHERE id = $1', [req.params.id]);
  if (!svc) { res.status(404).json({ error: 'Not found' }); return; }

  const { sendNotification } = await import('../services/notifications.js');
  await sendNotification('containerStarted', { test: true, message: 'Test notification from Homelab Commander' });
  res.json({ ok: true });
}));

function mapService(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    config: row.config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
