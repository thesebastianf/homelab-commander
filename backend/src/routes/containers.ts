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

// Get aggregated logs from all running containers
router.get('/logs/all', asyncHandler(async (_req, res) => {
  const containers = await dockerService.listContainers();
  const running = containers.filter(c => c.status === 'running');

  const results = await Promise.allSettled(
    running.map(async (c) => {
      const raw = await dockerService.getContainerLogs(c.id, 50);
      return { name: c.name, id: c.id, raw };
    })
  );

  const entries: { id: string; timestamp: string; level: 'info'|'warn'|'error'|'debug'; container: string; message: string }[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { name, raw } = r.value;
    const lines = raw.split('\n').filter(Boolean);
    for (const line of lines) {
      // Try to parse docker log format: "YYYY-MM-DDTHH:MM:SS.nnnZ message"
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+(.*)/s);
      const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString();
      const message = (tsMatch ? tsMatch[2] : line).trim();
      if (!message) continue;
      const lower = message.toLowerCase();
      const level: 'info'|'warn'|'error'|'debug' =
        lower.includes('error') || lower.includes('fatal') ? 'error' :
        lower.includes('warn') ? 'warn' :
        lower.includes('debug') || lower.includes('trace') ? 'debug' : 'info';
      entries.push({ id: `${name}-${timestamp}`, timestamp, level, container: name, message });
    }
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(entries.slice(0, 200));
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
