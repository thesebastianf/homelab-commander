import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

router.get('/info', asyncHandler(async (_req, res) => {
  const info = await dockerService.getSystemInfo();
  res.json(info);
}));

router.get('/df', asyncHandler(async (_req, res) => {
  const df = await dockerService.getSystemDf();
  res.json(df);
}));

router.post('/prune', asyncHandler(async (_req, res) => {
  const result = await dockerService.pruneSystem();
  await auditLog('prune', 'system', undefined, result);
  res.json(result);
}));

router.post('/prune/images', asyncHandler(async (_req, res) => {
  const result = await dockerService.pruneImages();
  await auditLog('prune_images', 'system', undefined, result);
  res.json(result);
}));

router.post('/prune/volumes', asyncHandler(async (_req, res) => {
  const result = await dockerService.pruneVolumes();
  await auditLog('prune_volumes', 'system', undefined, result);
  res.json(result);
}));

router.post('/prune/containers', asyncHandler(async (_req, res) => {
  const result = await dockerService.pruneContainers();
  await auditLog('prune_containers', 'system', undefined, result);
  res.json(result);
}));

router.post('/prune/networks', asyncHandler(async (_req, res) => {
  const result = await dockerService.pruneNetworks();
  await auditLog('prune_networks', 'system', undefined, result);
  res.json(result);
}));

export default router;
