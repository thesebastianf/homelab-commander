import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { pullImageBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const images = await dockerService.listImages();
  res.json(images);
}));

router.post('/pull', validateBody(pullImageBody), asyncHandler(async (req, res) => {
  const { name, tag } = req.body;
  await dockerService.pullImage(name, tag);
  await auditLog('pull', 'image', name, { tag });
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const force = String(req.query.force || '') === 'true';
  await dockerService.removeImage(id, force);
  await auditLog('remove', 'image', id);
  res.json({ ok: true });
}));

export default router;
