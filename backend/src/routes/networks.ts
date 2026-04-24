import { Router } from 'express';
import * as dockerService from '../services/docker.js';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createNetworkBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const networks = await dockerService.listNetworks();
  
  // Get list of managed networks from database
  const { rows: managed } = await pool.query(
    'SELECT docker_network_id FROM managed_networks'
  );
  const managedIds = new Set(managed.map((row) => row.docker_network_id));
  
  // Add isManuallyCreated flag to each network
  const enriched = networks.map((network) => ({
    ...network,
    isManuallyCreated: managedIds.has(network.id),
  }));
  
  res.json(enriched);
}));

router.post('/', validateBody(createNetworkBody), asyncHandler(async (req, res) => {
  const { name, driver } = req.body;
  const networkId = await dockerService.createNetwork(name, driver);
  
  // Mark as managed in database
  await pool.query(
    'INSERT INTO managed_networks (docker_network_id, docker_network_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [networkId, name]
  );
  
  await auditLog('create', 'network', name);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  
  // Remove from managed networks if it was tracked
  await pool.query(
    'DELETE FROM managed_networks WHERE docker_network_id = $1',
    [id]
  );
  
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
