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
  const id = String(req.params.id);
  const container = await dockerService.getContainer(id);
  res.json(container);
}));

// Get container stats
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const stats = await dockerService.getContainerStats(id);
  res.json(stats);
}));

// Get container logs
router.get('/:id/logs', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const tail = parseInt(String(req.query.tail || '100')) || 100;
  const logs = await dockerService.getContainerLogs(id, tail);
  res.json({ logs });
}));

// Start container
router.post('/:id/start', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await dockerService.startContainer(id);
  await auditLog('start', 'container', id);
  await sendNotification('containerStarted', { containerId: id });
  res.json({ ok: true });
}));

// Stop container
router.post('/:id/stop', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await dockerService.stopContainer(id);
  await auditLog('stop', 'container', id);
  await sendNotification('containerStopped', { containerId: id });
  res.json({ ok: true });
}));

// Restart container
router.post('/:id/restart', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await dockerService.restartContainer(id);
  await auditLog('restart', 'container', id);
  res.json({ ok: true });
}));

// Remove container
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const force = String(req.query.force || '') === 'true';
  await dockerService.removeContainer(id, force);
  await auditLog('remove', 'container', id);
  res.json({ ok: true });
}));

export default router;
