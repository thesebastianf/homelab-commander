import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLog } from '../lib/audit.js';
import { restoreManagedNetworks } from './networks.js';
import { logger } from '../logger.js';

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

  // Auto-restore managed networks that were pruned
  let networksRestored: number = 0;
  try {
    const restored = await restoreManagedNetworks();
    networksRestored = restored.filter((r) => r.status === 'created').length;
    if (networksRestored > 0) {
      logger.info({ networksRestored }, 'Auto-restored managed networks after full prune');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to auto-restore managed networks after prune');
  }

  res.json({ ...result, networksRestored });
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

  // Auto-restore managed networks that were pruned
  let networksRestored: number = 0;
  try {
    const restored = await restoreManagedNetworks();
    networksRestored = restored.filter((r) => r.status === 'created').length;
    if (networksRestored > 0) {
      logger.info({ networksRestored }, 'Auto-restored managed networks after network prune');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to auto-restore managed networks after network prune');
  }

  res.json({ ...result, networksRestored });
}));

export default router;
