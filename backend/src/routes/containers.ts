import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { getUpdateStatus } from '../services/updates.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { sendNotification } from '../services/notifications.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

// List all containers
router.get('/', asyncHandler(async (_req, res) => {
  const containers = await dockerService.listContainers();
  // Enrich with update status
  const enriched = containers.map(c => ({
    ...c,
    updateAvailable: getUpdateStatus(c.id),
  }));
  res.json(enriched);
}));

// Get single container
router.get('/:id', asyncHandler(async (req, res) => {
  const container = await dockerService.getContainer(req.params.id);
  res.json(container);
}));

// Get container stats
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const stats = await dockerService.getContainerStats(req.params.id);
  res.json(stats);
}));

// Get container logs
router.get('/:id/logs', asyncHandler(async (req, res) => {
  const tail = parseInt(req.query.tail as string) || 100;
  const logs = await dockerService.getContainerLogs(req.params.id, tail);
  res.json({ logs });
}));

// Start container
router.post('/:id/start', asyncHandler(async (req, res) => {
  await dockerService.startContainer(req.params.id);
  await auditLog('start', 'container', req.params.id);
  await sendNotification('containerStarted', { containerId: req.params.id });
  res.json({ ok: true });
}));

// Stop container
router.post('/:id/stop', asyncHandler(async (req, res) => {
  await dockerService.stopContainer(req.params.id);
  await auditLog('stop', 'container', req.params.id);
  await sendNotification('containerStopped', { containerId: req.params.id });
  res.json({ ok: true });
}));

// Restart container
router.post('/:id/restart', asyncHandler(async (req, res) => {
  await dockerService.restartContainer(req.params.id);
  await auditLog('restart', 'container', req.params.id);
  res.json({ ok: true });
}));

// Remove container
router.delete('/:id', asyncHandler(async (req, res) => {
  const force = req.query.force === 'true';
  await dockerService.removeContainer(req.params.id, force);
  await auditLog('remove', 'container', req.params.id);
  res.json({ ok: true });
}));

export default router;
