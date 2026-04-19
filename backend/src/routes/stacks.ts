import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createStackBody, updateStackBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';
import { sendNotification } from '../services/notifications.js';
import { config } from '../config.js';
import { mkdir, writeFile, readFile, readdir, access, mkdtemp, rm } from 'fs/promises';
import { join, resolve, relative, dirname } from 'path';
import { tmpdir } from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { getStackUpdateStatus } from '../services/updates.js';
import { listComposeProjects } from '../services/docker.js';

const execFileAsync = promisify(execFile);
const router = Router();

// Docker supports 4 compose filenames in priority order
const COMPOSE_FILENAMES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];

function getStackPathCandidates(stackPath: string): string[] {
  const candidates = new Set<string>();
  const normalizedPath = String(stackPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const mountedBase = config.stacksPath.replace(/\\/g, '/').replace(/\/+$/, '');

  if (!normalizedPath) return [];

  candidates.add(normalizedPath);

  const stackSegments = normalizedPath.split('/').filter(Boolean);
  const stackName = stackSegments[stackSegments.length - 1];
  if (stackName) {
    candidates.add(join(mountedBase, stackName).replace(/\\/g, '/'));
  }

  const marker = '/stacks/';
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex !== -1) {
    const suffix = normalizedPath.slice(markerIndex + marker.length);
    if (suffix) {
      candidates.add(join(mountedBase, suffix).replace(/\\/g, '/'));
    }
  }

  return [...candidates];
}

async function resolveAccessibleStackPath(stack: any): Promise<string | null> {
  for (const candidate of getStackPathCandidates(stack.stack_path)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Returns the first compose filename found in the given directory, or 'docker-compose.yml' as fallback */
async function findComposeFile(dir: string): Promise<string> {
  for (const filename of COMPOSE_FILENAMES) {
    try {
      await access(join(dir, filename));
      return filename;
    } catch { /* not found, try next */ }
  }
  return 'docker-compose.yml'; // fallback for stacks created by THC
}

/**
 * Resolve where to run docker compose for a given stack.
 * - Preferred: use the real stack_path directly (works when mounted as volume, e.g. /data/stacks).
 *   This means relative bind mounts in the compose file resolve correctly.
 * - Fallback: write compose content to a temp dir (for adopted stacks whose host path is not
 *   accessible from within the container).
 */
async function resolveStackCwd(stack: any): Promise<{ cwd: string; cleanup: (() => Promise<void>) | null }> {
  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (accessiblePath) {
    return { cwd: accessiblePath, cleanup: null };
  }

  // Path not accessible (external/adopted stack) — fall back to in-container temp dir
  const tempDir = await mkdtemp(join(tmpdir(), 'hlc-'));
  await writeFile(join(tempDir, 'docker-compose.yml'), stack.compose_content || '');
  if (stack.env_content) {
    await writeFile(join(tempDir, '.env'), stack.env_content);
  }
  return {
    cwd: tempDir,
    cleanup: async () => { try { await rm(tempDir, { recursive: true, force: true }); } catch {} },
  };
}

// ---- In-memory operation store for streaming output ----
interface OperationState {
  lines: string[];
  done: boolean;
  startedAt: Date;
}
const operationStore = new Map<string, OperationState>();

async function runUpdateOperation(id: string, stack: any, op: OperationState): Promise<void> {
  const { cwd, cleanup } = await resolveStackCwd(stack);
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'docker',
        ['compose', '--project-name', stack.name.toLowerCase(), 'up', '-d', '--pull', 'always'],
        { cwd }
      );
      const onData = (data: Buffer) => {
        data.toString('utf8').split('\n').filter(l => l.trim()).forEach(l => op.lines.push(l));
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker compose exited with code ${code}`))));
      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new Error('docker CLI not found in container PATH. Ensure the container image includes docker-cli.'));
        } else {
          reject(err);
        }
      });
    });
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    op.lines.push('✓ Update complete — containers restarted with latest images');
    await auditLog('update', 'stack', id);
  } catch (err: any) {
    op.lines.push(`✗ Error: ${err.message}`);
    // Only mark as failed if containers are not still running
    try {
      const { stdout } = await execFileAsync(
        'docker', ['compose', '--project-name', stack.name.toLowerCase(), 'ps', '-q', '--status', 'running'],
        { timeout: 8000, cwd }
      );
      if (stdout.trim()) {
        await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
        op.lines.push('⚠ Update failed but existing containers are still running.');
      } else {
        await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [id]);
      }
    } catch {
      await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [id]);
    }
  } finally {
    op.done = true;
    await cleanup?.();
    setTimeout(() => operationStore.delete(id), 5 * 60 * 1000);
  }
}

const STACK_SELECT = `
    SELECT 
      s.*,
      bc.id as backup_config_id,
      bc.enabled as backup_enabled,
      bc.cron_schedule,
      bc.retention_days,
      bc.include_stack_folder,
      bc.include_volumes,
      bc.include_databases,
      bc.database_type,
      bc.compression_level,
      bc.use_advanced_retention,
      bc.retention_policy,
      sc.id as smart_startup_id,
      sc.enabled as smart_startup_enabled,
      sc.trigger_value as trigger_type,
      FALSE as auto_start,
      sc.start_delay,
      (SELECT completed_at FROM backup_jobs WHERE stack_id = s.id AND status = 'completed' ORDER BY completed_at DESC LIMIT 1) AS last_backup_at,
      (SELECT COUNT(*)::int FROM backup_jobs WHERE stack_id = s.id AND status = 'completed') AS backup_count
    FROM stacks s
    LEFT JOIN backup_configs bc ON s.id = bc.stack_id
    LEFT JOIN smart_startup_configs sc ON s.id::text = sc.target_id AND sc.target_type = 'stack'
`;

// List all stacks
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(STACK_SELECT + 'ORDER BY s.name');
  res.json(rows.map(mapStack));
}));

router.get('/external', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT name, stack_path FROM stacks');
  const managedNames = new Set(rows.map((row: any) => String(row.name).toLowerCase()));
  const managedPaths = new Set(rows.map((row: any) => row.stack_path).filter(Boolean));

  const externalProjects = await listComposeProjects();
  const unmanagedProjects = externalProjects.filter((project) => {
    if (managedNames.has(project.name.toLowerCase())) return false;
    if (project.stackPath && managedPaths.has(project.stackPath)) return false;
    return true;
  });

  res.json(unmanagedProjects);
}));

// Adopt an external stack — non-destructive: reads existing files, creates DB record.
// The stack directory is NOT moved or modified.
router.post('/adopt', asyncHandler(async (req, res) => {
  const { name, stackPath, composeFiles } = req.body as { name?: string; stackPath?: string; composeFiles?: string[] };
  if (!name || !stackPath) {
    res.status(400).json({ error: 'name and stackPath are required' }); return;
  }

  // Validate stackPath is absolute and readable
  const safePath = resolve(stackPath);
  if (safePath !== stackPath && !safePath.startsWith('/')) {
    res.status(400).json({ error: 'stackPath must be an absolute path' }); return;
  }

  // Read compose file via docker volume mount — the backend container cannot access host paths
  // directly, but the Docker daemon can mount them. We try three strategies:
  //   1. Mount each specific file from composeFiles labels (most reliable — exact paths)
  //   2. Mount the stackPath directory and scan for standard compose filenames
  let composeContent = '';
  let composeFile = '';

  // Strategy 1: mount the specific file path(s) reported by Docker Compose labels
  if (composeFiles?.length) {
    for (const filePath of composeFiles) {
      // Only accept absolute paths
      if (!filePath.startsWith('/')) continue;
      try {
        const { stdout } = await execFileAsync(
          'docker', ['run', '--rm', '-v', `${filePath}:/hlcread/compose.file:ro`, 'alpine', 'cat', '/hlcread/compose.file'],
          { timeout: 20000 }
        );
        if (stdout.trim()) {
          composeFile = filePath.split('/').pop() ?? 'docker-compose.yml';
          composeContent = stdout;
          break;
        }
      } catch { /* file not accessible, try next */ }
    }
  }

  // Strategy 2: mount directory and probe standard filenames
  if (!composeContent) {
    try {
      const { stdout } = await execFileAsync(
        'docker', [
          'run', '--rm',
          '-v', `${safePath}:/hlcread:ro`,
          'alpine', 'sh', '-c',
          'for f in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do [ -f "/hlcread/$f" ] && printf "__FILE__%s\\n" "$f" && cat "/hlcread/$f" && exit 0; done; exit 1',
        ],
        { timeout: 20000 }
      );
      const nlIdx = stdout.indexOf('\n');
      if (nlIdx !== -1) {
        composeFile = stdout.slice(0, nlIdx).replace('__FILE__', '');
        composeContent = stdout.slice(nlIdx + 1);
      }
    } catch { /* directory not accessible */ }
  }

  if (!composeContent.trim()) {
    res.status(400).json({ error: 'No compose file found at that path (tried compose.yaml, compose.yml, docker-compose.yaml, docker-compose.yml). Ensure the path is accessible to Docker and the file exists.' }); return;
  }

  let envContent = '';
  try {
    const { stdout: envOut } = await execFileAsync(
      'docker', ['run', '--rm', '-v', `${safePath}:/hlcread:ro`, 'alpine', 'cat', '/hlcread/.env'],
      { timeout: 10000 }
    );
    envContent = envOut;
  } catch { /* optional — .env may not exist */ }

  const { rows: dupe } = await pool.query(
    'SELECT id FROM stacks WHERE lower(name) = lower($1) OR stack_path = $2',
    [name, safePath]
  );
  if (dupe.length > 0) {
    res.status(409).json({ error: `Stack "${name}" is already managed by THC` }); return;
  }

  const serviceCount = countServices(composeContent);

  const { rows: [stack] } = await pool.query(
    `INSERT INTO stacks (name, description, stack_path, compose_content, env_content, services, status)
     VALUES ($1, '', $2, $3, $4, $5, 'running') RETURNING *`,
    [name, safePath, composeContent, envContent, serviceCount]
  );

  await pool.query(
    `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
     VALUES ($1, 1, $2, $3, 'Adopted from external compose project')`,
    [stack.id, composeContent, envContent]
  );

  await auditLog('adopt', 'stack', stack.id, { name, stackPath: safePath });
  res.status(201).json(mapStack(stack));
}));

// Get single stack
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query(STACK_SELECT + 'WHERE s.id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Get versions (max 10)
  const { rows: versions } = await pool.query(
    'SELECT * FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 10',
    [req.params.id]
  );

  // Detect external changes: read live files from disk and compare with DB content
  let hasExternalChanges = false;
  let diskComposeContent: string | null = null;
  let diskEnvContent: string | null = null;
  try {
    const accessiblePath = await resolveAccessibleStackPath(stack);
    if (!accessiblePath) throw new Error('not accessible');
    const composeName = await findComposeFile(accessiblePath);
    diskComposeContent = await readFile(join(accessiblePath, composeName), 'utf8').catch(() => null);
    diskEnvContent = await readFile(join(accessiblePath, '.env'), 'utf8').catch(() => null);
    if (diskComposeContent !== null && diskComposeContent.trim() !== (stack.compose_content || '').trim()) {
      hasExternalChanges = true;
    }
  } catch { /* stack_path not accessible from container — skip disk check */ }

  res.json({
    ...mapStack(stack),
    versions: versions.map(mapVersion),
    hasExternalChanges,
    diskComposeContent,
    diskEnvContent,
  });
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
  if (b.runBackupBeforeUpdate !== undefined) { updates.push(`run_backup_before_update = $${idx++}`); values.push(b.runBackupBeforeUpdate); }
  if (b.gitRepoConfig !== undefined) { updates.push(`git_repo_config = $${idx++}`); values.push(JSON.stringify(b.gitRepoConfig)); }

  if (b.composeContent !== undefined) {
    updates.push(`compose_content = $${idx++}`); values.push(b.composeContent);
    updates.push(`services = $${idx++}`); values.push(countServices(b.composeContent));
    updates.push(`version = version + 1`);

    // Write to disk — preserve existing compose filename
    const accessiblePath = await resolveAccessibleStackPath(existing);
    if (accessiblePath) {
      const composeFile = await findComposeFile(accessiblePath);
      await writeFile(join(accessiblePath, composeFile), b.composeContent);
    }

    // Save version
    const newVersion = existing.version + 1;
    await pool.query(
      `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, newVersion, b.composeContent, b.envContent ?? existing.env_content, 'Updated compose']
    );
    // Keep max 10 versions
    await pool.query(
      `DELETE FROM stack_versions WHERE stack_id = $1 AND version NOT IN (
         SELECT version FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 10
       )`,
      [req.params.id]
    );
  }

  if (b.envContent !== undefined) {
    updates.push(`env_content = $${idx++}`); values.push(b.envContent);
    const accessiblePath = await resolveAccessibleStackPath(existing);
    if (accessiblePath) {
      await writeFile(join(accessiblePath, '.env'), b.envContent);
    }

    // Version env-only changes too
    if (b.composeContent === undefined) {
      updates.push('version = version + 1');
      const newVersion = existing.version + 1;
      await pool.query(
        `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, newVersion, existing.compose_content, b.envContent, 'Updated .env']
      );
      await pool.query(
        `DELETE FROM stack_versions WHERE stack_id = $1 AND version NOT IN (
           SELECT version FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 10
         )`,
        [req.params.id]
      );
    }
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

  const { cwd, cleanup } = await resolveStackCwd(stack);
  try {
    await execFileAsync('docker', ['compose', '--project-name', stack.name.toLowerCase(), 'up', '-d'],
      { cwd, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    await sendNotification('stackDeployed', { name: stack.name });
    await auditLog('deploy', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [id]);
    await sendNotification('stackFailed', { name: stack.name, error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await cleanup?.();
  }
}));

// Stop stack
router.post('/:id/stop', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const { cwd, cleanup } = await resolveStackCwd(stack);
  try {
    await execFileAsync('docker', ['compose', '--project-name', stack.name.toLowerCase(), 'stop'],
      { cwd, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'stopped', updated_at = NOW() WHERE id = $1", [id]);
    await auditLog('stop', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await cleanup?.();
  }
}));

// Deactivate stack (docker compose down)
router.post('/:id/deactivate', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const { cwd, cleanup } = await resolveStackCwd(stack);
  try {
    await execFileAsync('docker', ['compose', '--project-name', stack.name.toLowerCase(), 'down'],
      { cwd, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'stopped', updated_at = NOW() WHERE id = $1", [id]);
    await auditLog('deactivate', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await cleanup?.();
  }
}));

// Restart stack
router.post('/:id/restart', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const { cwd, cleanup } = await resolveStackCwd(stack);
  try {
    await execFileAsync('docker', ['compose', '--project-name', stack.name.toLowerCase(), 'restart'],
      { cwd, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    await auditLog('restart', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await cleanup?.();
  }
}));

// Recreate stack containers (force new containers from current compose)
router.post('/:id/recreate', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);

  const { cwd, cleanup } = await resolveStackCwd(stack);
  try {
    await execFileAsync('docker', ['compose', '--project-name', stack.name.toLowerCase(), 'up', '-d', '--force-recreate'],
      { cwd, timeout: 120000 }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
    await auditLog('recreate', 'stack', id);
    res.json({ ok: true });
  } catch (err: any) {
    await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [id]);
    res.status(500).json({ error: err.message });
  } finally {
    await cleanup?.();
  }
}));

// Get stack versions
router.get('/:id/versions', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows } = await pool.query(
    'SELECT * FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 10',
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

  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (!accessiblePath) {
    res.status(400).json({ error: 'Stack directory is not accessible from the container.' }); return;
  }

  const composeFile = await findComposeFile(accessiblePath);
  await writeFile(join(accessiblePath, composeFile), versionRow.compose_content);
  if (versionRow.env_content) {
    await writeFile(join(accessiblePath, '.env'), versionRow.env_content);
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

// ---- File Browser ----

// List all files in a stack directory
router.get('/:id/files', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }
  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (!accessiblePath) { res.json([]); return; }
  const files = await listFilesRecursive(accessiblePath, accessiblePath);
  res.json(files);
}));

// Read a single file — path supplied as ?path=relative/path
router.get('/:id/file', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const filePath = String(req.query.path || '');
  if (!filePath) { res.status(400).json({ error: 'path query param required' }); return; }

  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (!accessiblePath) { res.status(400).json({ error: 'Stack directory is not accessible from the container.' }); return; }

  const safePath = resolve(join(accessiblePath, filePath));
  const base = resolve(accessiblePath);
  if (!safePath.startsWith(base + '/') && safePath !== base) {
    res.status(400).json({ error: 'Invalid path' }); return;
  }

  try {
    const content = await readFile(safePath, 'utf8');
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
}));

// Write a single file — path supplied as ?path=relative/path
router.put('/:id/file', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const filePath = String(req.query.path || '');
  if (!filePath) { res.status(400).json({ error: 'path query param required' }); return; }

  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (!accessiblePath) { res.status(400).json({ error: 'Stack directory is not accessible from the container.' }); return; }

  const safePath = resolve(join(accessiblePath, filePath));
  const base = resolve(accessiblePath);
  if (!safePath.startsWith(base + '/') && safePath !== base) {
    res.status(400).json({ error: 'Invalid path' }); return;
  }

  const { content } = req.body;
  if (typeof content !== 'string') { res.status(400).json({ error: 'content must be string' }); return; }

  await mkdir(dirname(safePath), { recursive: true });
  await writeFile(safePath, content, 'utf8');

  // Sync compose/env files to DB and save a version
  const isCompose = COMPOSE_FILENAMES.includes(filePath);
  if (isCompose) {
    const newVersion = stack.version + 1;
    await pool.query(
      'UPDATE stacks SET compose_content = $1, version = $2, services = $3, updated_at = NOW() WHERE id = $4',
      [content, newVersion, countServices(content), req.params.id]
    );
    await pool.query(
      `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, newVersion, content, stack.env_content || '', `Edited via file browser: ${filePath}`]
    );
    await pool.query(
      `DELETE FROM stack_versions WHERE stack_id = $1 AND version NOT IN (
         SELECT version FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 10
       )`,
      [req.params.id]
    );
  }
  if (filePath === '.env') {
    await pool.query('UPDATE stacks SET env_content = $1, updated_at = NOW() WHERE id = $2', [content, req.params.id]);
  }

  await auditLog('file_update', 'stack', String(req.params.id), { filePath });
  res.json({ ok: true });
}));

// Sync DB with live files on disk (external changes — user edited host files directly)
router.post('/:id/sync-from-disk', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (!accessiblePath) {
    res.status(400).json({ error: 'Stack directory is not accessible from the container. Only stacks in mounted paths (e.g. /data/stacks) can be synced.' });
    return;
  }

  const composeName = await findComposeFile(accessiblePath);
  const diskCompose = await readFile(join(accessiblePath, composeName), 'utf8');
  const diskEnv = await readFile(join(accessiblePath, '.env'), 'utf8').catch(() => '');

  const newVersion = stack.version + 1;
  await pool.query(
    `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, newVersion, diskCompose, diskEnv, 'Synced from disk (external change detected)']
  );
  await pool.query(
    `DELETE FROM stack_versions WHERE stack_id = $1 AND version NOT IN (
       SELECT version FROM stack_versions WHERE stack_id = $1 ORDER BY version DESC LIMIT 10
     )`,
    [id]
  );
  await pool.query(
    `UPDATE stacks SET compose_content = $1, env_content = $2, version = $3, services = $4, updated_at = NOW() WHERE id = $5`,
    [diskCompose, diskEnv, newVersion, countServices(diskCompose), id]
  );

  await auditLog('sync_from_disk', 'stack', id);
  res.json({ ok: true, compose: diskCompose, env: diskEnv, version: newVersion });
}));

// ---- Git Sync ----

// Get git sync status
router.get('/:id/git/status', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const gitConfig = stack.git_repo_config;
  if (!gitConfig || !gitConfig.repoUrl) {
    res.json({ configured: false }); return;
  }

  try {
    const [branchOut, logOut, statusOut] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd: stack.stack_path }).then(r => r.stdout.trim()).catch(() => ''),
      execFileAsync('git', ['log', '-1', '--format=%h|%s'], { cwd: stack.stack_path }).then(r => r.stdout.trim()).catch(() => '|'),
      execFileAsync('git', ['status', '--short'], { cwd: stack.stack_path }).then(r => r.stdout.trim()).catch(() => '?'),
    ]);
    const [hash, ...msgParts] = logOut.split('|');
    res.json({
      configured: true,
      branch: branchOut,
      lastCommit: hash || '',
      lastCommitMessage: msgParts.join('|') || '',
      status: statusOut && statusOut !== '?' ? 'modified' : 'in_sync',
      lastSynced: stack.updated_at,
    });
  } catch {
    res.json({ configured: true, status: 'not_initialized', branch: '', lastCommit: '', lastCommitMessage: '' });
  }
}));

// Pull from remote (sync)
router.post('/:id/git/sync', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  const gitConfig = stack.git_repo_config;
  if (!gitConfig || !gitConfig.repoUrl) {
    res.status(400).json({ error: 'No git repository configured' }); return;
  }

  try {
    const isGit = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: stack.stack_path })
      .then(() => true).catch(() => false);

    if (!isGit) {
      await execFileAsync('git', ['init'], { cwd: stack.stack_path });
      await execFileAsync('git', ['remote', 'add', 'origin', gitConfig.repoUrl], { cwd: stack.stack_path });
    }

    await execFileAsync('git', ['pull', 'origin', gitConfig.branch || 'main'], {
      cwd: stack.stack_path, timeout: 30000,
    });

    // Sync compose content to DB
    const composePath = join(stack.stack_path, gitConfig.composePath || 'docker-compose.yml');
    const compose = await readFile(composePath, 'utf8').catch(() => null);
    if (compose) {
      await pool.query('UPDATE stacks SET compose_content = $1, updated_at = NOW() WHERE id = $2', [compose, req.params.id]);
    }

    await auditLog('git_sync', 'stack', String(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}));

// Push to remote
router.post('/:id/git/push', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  try {
    await execFileAsync('git', ['add', '.'], { cwd: stack.stack_path });
    const message = String(req.body?.message || 'Updated via THC');
    await execFileAsync('git', ['commit', '-m', message], { cwd: stack.stack_path }).catch(() => {/* nothing to commit */});
    await execFileAsync('git', ['push'], { cwd: stack.stack_path, timeout: 30000 });

    await auditLog('git_push', 'stack', String(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}));

// ---- Container list for a stack ----

router.get('/:id/containers', asyncHandler(async (req, res) => {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [req.params.id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '-a', '--filter', `label=com.docker.compose.project=${stack.name.toLowerCase()}`, '--format', '{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Image}}\t{{.Label "com.docker.compose.service"}}'],
      { timeout: 10000 }
    );
    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [id, names, state, image, serviceName] = line.split('\t');
      return {
        id: id?.trim() || '',
        name: (names?.trim() || '').replace(/^\//, ''),
        status: state?.trim() || '',
        image: image?.trim() || '',
        serviceName: serviceName?.trim() || '',
      };
    }).filter(c => c.id);
    res.json(containers);
  } catch {
    res.json([]);
  }
}));

// ---- Operation output polling ----

router.get('/:id/operation', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const op = operationStore.get(id);
  if (!op) { res.json({ running: false, lines: [], done: false }); return; }
  res.json({ running: !op.done, lines: op.lines, done: op.done });
}));

// ---- Update stack images (pull + redeploy) ----

router.post('/:id/update', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date() };
  operationStore.set(id, op);
  await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);

  // Fire-and-forget: start operation in background
  runUpdateOperation(id, stack, op).catch(() => { /* handled inside */ });
  res.json({ ok: true });
}));

// ---- Helpers ----

async function listFilesRecursive(dir: string, base: string, depth = 0): Promise<any[]> {
  if (depth > 5) return [];
  const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const result: any[] = [];
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const relPath = relative(base, fullPath);
      if (entry.isDirectory()) {
        const children = await listFilesRecursive(fullPath, base, depth + 1);
        result.push({ name: entry.name, path: relPath, type: 'directory', children });
      } else {
        result.push({ name: entry.name, path: relPath, type: 'file' });
      }
    }
    // Directories first, then files, both alphabetical
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  } catch {
    return [];
  }
}

// Detect if a compose file has any service with network_mode: host
function hasHostNetworking(composeContent: string): boolean {
  if (!composeContent) return false;
  const lines = composeContent.split('\n');
  let inServices = false;
  for (const line of lines) {
    if (line.match(/^services:\s*$/)) {
      inServices = true;
      continue;
    }
    if (inServices) {
      // Stop at next top-level key (starts without indentation)
      if (line.match(/^[a-zA-Z]/)) break;
      // Check for network_mode: host at service level (6-space indent = inside service definition)
      if (line.match(/^\s{4,6}network_mode:\s*host\s*$/)) {
        return true;
      }
    }
  }
  return false;
}

function mapStack(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    managedBy: 'thc',
    external: false,
    services: row.services,
    version: row.version,
    stackPath: row.stack_path,
    volumePath: row.volume_path || '',
    composeContent: row.compose_content,
    envContent: row.env_content,
    autoUpdate: row.auto_update,
    runBackupBeforeUpdate: row.run_backup_before_update,
    updateAvailable: getStackUpdateStatus(row.name),
    lastBackupAt: row.last_backup_at || null,
    gitRepoConfig: row.git_repo_config,
    hasHostNetworking: hasHostNetworking(row.compose_content),
    backupCount: Number(row.backup_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    backupConfig: row.backup_config_id ? {
      enabled: row.backup_enabled || false,
      schedule: row.cron_schedule,
      retention: row.retention_days,
      includeStackFolder: row.include_stack_folder,
      includeVolumes: row.include_volumes,
      includeDatabases: row.include_databases,
      databaseType: row.database_type,
      compressionLevel: row.compression_level,
      useAdvancedRetention: row.use_advanced_retention,
      retentionPolicy: row.retention_policy,
      lastBackupAt: row.last_backup_at || null,
    } : undefined,
    smartStartup: row.smart_startup_id ? {
      enabled: row.smart_startup_enabled || false,
      triggerType: row.trigger_type,
      autoStart: row.auto_start,
      startDelay: row.start_delay,
    } : undefined,
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
