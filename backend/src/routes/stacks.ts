import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createStackBody, updateStackBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';
import { sendNotification } from '../services/notifications.js';
import { config } from '../config.js';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const router = Router();

// List all stacks
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM stacks ORDER BY name');
  res.json(rows.map(mapStack));
}));

// Get single stack
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Get versions
  const { rows: versions } = await pool.query(
    'SELECT * FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 20',
    [req.params.id]
  );

  res.json({ ...mapStack(stack), versions: versions.map(mapVersion) });
}));

// Create stack
router.post('/', validateBody(createStackBody), asyncHandler(async (req, res) => {
  const { name, description, composeContent, envContent } = req.body;
  const stackPath = join(config.stacksPath, name);

  // Create stack directory and write files
  await mkdir(stackPath, { recursive: true });
  await writeFile(join(stackPath, 'docker-compose.yml'), composeContent);
  if (envContent) {
    await writeFile(join(stackPath, '.env'), envContent);
  }

  // Count services from compose content
  const serviceCount = countServices(composeContent);

  const { rows: [stack] } = await pool.query(
    `INSERT INTO stacks (name, description, stack_path, compose_content, env_content, services)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, description || '', stackPath, composeContent, envContent || '', serviceCount]
  );

  // Save initial version
  await pool.query(
    `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
     VALUES ($1, 1, $2, $3, 'Initial version')`,
    [stack.id, composeContent, envContent || '']
  );

  await auditLog('create', 'stack', stack.id, { name });
  res.status(201).json(mapStack(stack));
}));

// Update stack
router.put('/:id', validateBody(updateStackBody), asyncHandler(async (req, res) => {
  const { rows: [existing] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!existing) { res.status(404).json({ error: 'Stack not found' }); return; }

  const b = req.body;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (b.name !== undefined) { updates.push(`name = $${idx++}`); values.push(b.name); }
  if (b.description !== undefined) { updates.push(`description = $${idx++}`); values.push(b.description); }
  if (b.autoUpdate !== undefined) { updates.push(`auto_update = $${idx++}`); values.push(b.autoUpdate); }
  if (b.gitRepoConfig !== undefined) { updates.push(`git_repo_config = $${idx++}`); values.push(JSON.stringify(b.gitRepoConfig)); }

  if (b.composeContent !== undefined) {
    updates.push(`compose_content = $${idx++}`); values.push(b.composeContent);
    updates.push(`services = $${idx++}`); values.push(countServices(b.composeContent));
    updates.push(`version = version + 1`);

    // Write to disk
    await writeFile(join(existing.stack_path, 'docker-compose.yml'), b.composeContent);

    // Save version
    const newVersion = existing.version + 1;
    await pool.query(
      `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, newVersion, b.composeContent, b.envContent || existing.env_content, 'Updated']
    );
  }

  if (b.envContent !== undefined) {
    updates.push(`env_content = $${idx++}`); values.push(b.envContent);
    await writeFile(join(existing.stack_path, '.env'), b.envContent);
  }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    await pool.query(
      `UPDATE stacks SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  const { rows: [updated] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  const id = String(req.params.id);
  await auditLog('update', 'stack', id);
  res.json(mapStack(updated));
}));

// Delete stack
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await pool.query('DELETE FROM stacks WHERE id = $1', [id]);
  await auditLog('delete', 'stack', id);
  res.json({ ok: true });
}));

// Deploy stack (docker compose up)
router.post('/:id/deploy', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);

  try {
    await execFileAsync('docker', ['compose', '-f', join(stack.stack_path, 'docker-compose.yml'), 'up', '-d'],
      { cwd: stack.stack_path, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    await sendNotification('stackDeployed', { name: stack.name });
    await auditLog('deploy', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [id]);
    await sendNotification('stackFailed', { name: stack.name, error: err.message });
    res.status(500).json({ error: err.message });
  }
}));

// Stop stack
router.post('/:id/stop', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  try {
    await execFileAsync('docker', ['compose', '-f', join(stack.stack_path, 'docker-compose.yml'), 'down'],
      { cwd: stack.stack_path, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'stopped', updated_at = NOW() WHERE id = $1", [id]);
    await auditLog('stop', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}));

// Restart stack
router.post('/:id/restart', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  try {
    await execFileAsync('docker', ['compose', '-f', join(stack.stack_path, 'docker-compose.yml'), 'restart'],
      { cwd: stack.stack_path, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    await auditLog('restart', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}));

// Get stack versions
router.get('/:id/versions', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows } = await pool.query(
    'SELECT * FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC',
    [id]
  );
  res.json(rows.map(mapVersion));
}));

// Restore stack to a version
router.post('/:id/restore/:version', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const version = parseInt(String(req.params.version));
  const { rows: [versionRow] } = await pool.query(
    'SELECT * FROM stack_versions WHERE stack_id = $1 AND version = $2',
    [id, version]
  );
  if (!versionRow) { res.status(404).json({ error: 'Version not found' }); return; }

  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  await writeFile(join(stack.stack_path, 'docker-compose.yml'), versionRow.compose_content);
  if (versionRow.env_content) {
    await writeFile(join(stack.stack_path, '.env'), versionRow.env_content);
  }

  const newVersion = stack.version + 1;
  await pool.query(
    `UPDATE stacks SET compose_content = $1, env_content = $2, version = $3, updated_at = NOW() WHERE id = $4`,
    [versionRow.compose_content, versionRow.env_content || '', newVersion, id]
  );

  await pool.query(
    `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, newVersion, versionRow.compose_content, versionRow.env_content || '', `Restored from v${version}`]
  );

  await auditLog('restore', 'stack', id, { fromVersion: version, toVersion: newVersion });
  res.json({ ok: true, version: newVersion });
}));

// Helpers
function mapStack(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    services: row.services,
    version: row.version,
    stackPath: row.stack_path,
    volumePath: row.volume_path || '',
    composeContent: row.compose_content,
    envContent: row.env_content,
    autoUpdate: row.auto_update,
    gitRepoConfig: row.git_repo_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: any) {
  return {
    id: row.id,
    version: row.version,
    composeContent: row.compose_content,
    envContent: row.env_content,
    description: row.description,
    createdAt: row.created_at,
  };
}

function countServices(compose: string): number {
  const match = compose.match(/^\s{2}\w/gm);
  // Simple heuristic: lines after "services:" with 2-space indent
  const servicesMatch = compose.match(/^services:\s*$/m);
  if (!servicesMatch) return 0;

  let count = 0;
  const lines = compose.split('\n');
  let inServices = false;
  for (const line of lines) {
    if (line.match(/^services:\s*$/)) { inServices = true; continue; }
    if (inServices) {
      if (line.match(/^[a-zA-Z]/)) break; // new top-level key
      if (line.match(/^  [a-zA-Z_-]+:/)) count++;
    }
  }
  return count || 1;
}

export default router;
