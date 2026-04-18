import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createNetworkBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const networks = await dockerService.listNetworks();
  res.json(networks);
}));

router.post('/', validateBody(createNetworkBody), asyncHandler(async (req, res) => {
  const { name, driver } = req.body;
  await dockerService.createNetwork(name, driver);
  await auditLog('create', 'network', name);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await dockerService.removeNetwork(id);
  await auditLog('remove', 'network', id);
  res.json({ ok: true });
}));

router.get('/:id/inspect', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const info = await dockerService.inspectNetwork(id);
  res.json(info);
}));

export default router;
