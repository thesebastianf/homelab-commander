import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createVolumeBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const volumes = await dockerService.listVolumes();
  res.json(volumes);
}));

router.post('/', validateBody(createVolumeBody), asyncHandler(async (req, res) => {
  const { name, driver } = req.body;
  await dockerService.createVolume(name, driver);
  await auditLog('create', 'volume', name);
  res.json({ ok: true });
}));

router.delete('/:name', asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  await dockerService.removeVolume(name);
  await auditLog('remove', 'volume', name);
  res.json({ ok: true });
}));

export default router;
