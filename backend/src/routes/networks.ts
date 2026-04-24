import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createNetworkBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const networks = await dockerService.listNetworks();

  // Get managed networks from database
  const { rows: managed } = await pool.query(
    'SELECT docker_network_id, docker_network_name, driver FROM managed_networks'
  );
  const managedById = new Map(managed.map((row) => [row.docker_network_id, row]));
  const managedByName = new Map(managed.map((row) => [row.docker_network_name, row]));

  const liveIds = new Set(networks.map((n) => n.id));
  const liveNames = new Set(networks.map((n) => n.name));

  const enriched = networks.map((network) => ({
    ...network,
    isManuallyCreated: managedById.has(network.id) || managedByName.has(network.name),
  }));

  // Detect managed networks that are missing from Docker (pruned/deleted externally)
  const missing = managed.filter(
    (row) => !liveIds.has(row.docker_network_id) && !liveNames.has(row.docker_network_name)
  );

  res.json({ networks: enriched, missingCount: missing.length });
}))

// Keep backwards-compatible plain array response for legacy clients
router.get('/list', asyncHandler(async (_req, res) => {
  const networks = await dockerService.listNetworks();
  const { rows: managed } = await pool.query(
    'SELECT docker_network_id, docker_network_name FROM managed_networks'
  );
  const managedIds = new Set(managed.map((row) => row.docker_network_id));
  const managedNames = new Set(managed.map((row) => row.docker_network_name));
  res.json(networks.map((network) => ({
    ...network,
    isManuallyCreated: managedIds.has(network.id) || managedNames.has(network.name),
  })));
}));

router.post('/', validateBody(createNetworkBody), asyncHandler(async (req, res) => {
  const { name, driver = 'bridge' } = req.body;
  const networkId = await dockerService.createNetwork(name, driver);

  // Persist in database with driver info for later restoration
  await pool.query(
    'INSERT INTO managed_networks (docker_network_id, docker_network_name, driver) VALUES ($1, $2, $3) ON CONFLICT (docker_network_name) DO UPDATE SET docker_network_id = $1, driver = $3',
    [networkId, name, driver]
  );

  await auditLog('create', 'network', name, { driver });
  res.json({ ok: true, id: networkId, name, driver });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);

  const info = await dockerService.inspectNetwork(id);
  const attachedContainers = Object.values(info?.Containers || {}).filter(Boolean);
  if (attachedContainers.length > 0) {
    return res.status(409).json({ error: 'Cannot remove a network while containers are attached' });
  }

  // Remove from managed_networks BEFORE removing from Docker
  await pool.query(
    'DELETE FROM managed_networks WHERE docker_network_id = $1 OR docker_network_name = $2',
    [id, String(info?.Name || '')]
  );

  await dockerService.removeNetwork(id);
  await auditLog('remove', 'network', id, { name: info?.Name });
  res.json({ ok: true });
}));

router.get('/:id/inspect', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const info = await dockerService.inspectNetwork(id);
  res.json(info);
}));

/**
 * POST /networks/restore — recreate any managed networks that have been lost
 * (e.g., after a docker network prune). Called automatically after prune,
 * or manually from the UI.
 */
router.post('/restore', asyncHandler(async (_req, res) => {
  const restored = await restoreManagedNetworks();
  res.json({ restored });
}));

export async function restoreManagedNetworks(): Promise<Array<{ name: string; driver: string; status: 'created' | 'exists' | 'failed'; error?: string }>> {
  const { rows: managed } = await pool.query(
    'SELECT docker_network_id, docker_network_name, driver FROM managed_networks'
  );
  if (managed.length === 0) return [];

  const liveNetworks = await dockerService.listNetworks();
  const liveNames = new Set(liveNetworks.map((n) => n.name));
  const liveIds = new Set(liveNetworks.map((n) => n.id));

  const results: Array<{ name: string; driver: string; status: 'created' | 'exists' | 'failed'; error?: string }> = [];

  for (const row of managed) {
    const { docker_network_name: name, docker_network_id: oldId, driver } = row;

    if (liveNames.has(name) || liveIds.has(oldId)) {
      results.push({ name, driver, status: 'exists' });
      continue;
    }

    try {
      const newId = await dockerService.createNetwork(name, driver);
      // Update the stored ID — the network was recreated with a new ID
      await pool.query(
        'UPDATE managed_networks SET docker_network_id = $1 WHERE docker_network_name = $2',
        [newId, name]
      );
      await auditLog('restore', 'network', name, { driver, newId });
      logger.info({ name, driver, newId }, 'Managed network restored after prune');
      results.push({ name, driver, status: 'created' });
    } catch (err: any) {
      logger.error({ name, driver, err: err.message }, 'Failed to restore managed network');
      results.push({ name, driver, status: 'failed', error: err.message });
    }
  }

  return results;
}

export default router;
