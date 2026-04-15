import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { updateSettingsBody } from '../validation/schemas.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const { rows: [settings] } = await pool.query('SELECT * FROM settings WHERE id = 1');
  res.json({
    dockerHost: settings.docker_host,
    refreshInterval: settings.refresh_interval,
    maxLogLines: settings.max_log_lines,
    autoUpdate: settings.auto_update,
    globalUpdateFreeze: settings.global_update_freeze,
    stacksBasePath: settings.stacks_base_path,
    volumesBasePath: settings.volumes_base_path,
    backupsBasePath: settings.backups_base_path,
    notificationConfig: settings.notification_config,
    homeAssistantConfig: settings.home_assistant_config,
  });
}));

router.put('/', validateBody(updateSettingsBody), asyncHandler(async (req, res) => {
  const b = req.body;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (b.dockerHost !== undefined) { updates.push(`docker_host = $${idx++}`); values.push(b.dockerHost); }
  if (b.refreshInterval !== undefined) { updates.push(`refresh_interval = $${idx++}`); values.push(b.refreshInterval); }
  if (b.maxLogLines !== undefined) { updates.push(`max_log_lines = $${idx++}`); values.push(b.maxLogLines); }
  if (b.autoUpdate !== undefined) { updates.push(`auto_update = $${idx++}`); values.push(b.autoUpdate); }
  if (b.globalUpdateFreeze !== undefined) { updates.push(`global_update_freeze = $${idx++}`); values.push(b.globalUpdateFreeze); }
  if (b.stacksBasePath !== undefined) { updates.push(`stacks_base_path = $${idx++}`); values.push(b.stacksBasePath); }
  if (b.volumesBasePath !== undefined) { updates.push(`volumes_base_path = $${idx++}`); values.push(b.volumesBasePath); }
  if (b.backupsBasePath !== undefined) { updates.push(`backups_base_path = $${idx++}`); values.push(b.backupsBasePath); }
  if (b.notificationConfig !== undefined) { updates.push(`notification_config = $${idx++}`); values.push(JSON.stringify(b.notificationConfig)); }
  if (b.homeAssistantConfig !== undefined) { updates.push(`home_assistant_config = $${idx++}`); values.push(JSON.stringify(b.homeAssistantConfig)); }

  if (updates.length === 0) {
    res.json({ ok: true });
    return;
  }

  updates.push(`updated_at = NOW()`);
  await pool.query(
    `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`,
    values
  );

  res.json({ ok: true });
}));

export default router;
