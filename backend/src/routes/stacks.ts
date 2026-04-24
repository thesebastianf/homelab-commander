import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createStackBody, updateStackBody } from '../validation/schemas.js';
import { auditLog } from '../lib/audit.js';
import { sendNotification } from '../services/notifications.js';
import { config } from '../config.js';
import { mkdir, writeFile, readFile, readdir, access, mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';
import { tmpdir } from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { getStackUpdateStatus, setStackUpdateStatus } from '../services/updates.js';
import { listComposeProjects } from '../services/docker.js';
import { logger } from '../logger.js';
import { runBackup } from '../services/backups.js';

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

function composeProjectNameFromStack(stack: any): string {
  return String(stack.name || 'stack')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 63) || 'stack';
}

let cachedCurrentComposeProjectName: string | null | undefined;

async function getCurrentComposeProjectName(): Promise<string | null> {
  if (cachedCurrentComposeProjectName !== undefined) {
    return cachedCurrentComposeProjectName;
  }

  const selfContainerId = String(process.env.HOSTNAME || '').trim();
  if (!selfContainerId) {
    cachedCurrentComposeProjectName = null;
    return null;
  }

  try {
    const { stdout } = await execFileAsync('docker', ['inspect', selfContainerId], { timeout: 10000 });
    const parsed = JSON.parse(stdout);
    const labels = parsed?.[0]?.Config?.Labels ?? {};
    const project = typeof labels['com.docker.compose.project'] === 'string'
      ? labels['com.docker.compose.project']
      : null;
    cachedCurrentComposeProjectName = project;
    return project;
  } catch {
    cachedCurrentComposeProjectName = null;
    return null;
  }
}

async function isSelfManagedStack(stack: any): Promise<boolean> {
  const currentProject = await getCurrentComposeProjectName();
  if (!currentProject) return false;
  return currentProject === composeProjectNameFromStack(stack);
}

async function sendStackOperationNotification(
  action: string,
  stack: any,
  succeeded: boolean,
  details?: Record<string, unknown>
): Promise<void> {
  const normalizedDetails = details || {};
  const trigger = String(normalizedDetails.trigger || (action === 'auto_update' ? 'schedule' : 'manual'));
  const eventType = succeeded
    ? (action === 'stop' || action === 'deactivate' ? 'containerStopped'
      : action === 'update' || action === 'bulk-update' ? 'containerAutoUpdated'
      : 'stackDeployed')
    : 'stackFailed';

  try {
    await sendNotification(eventType, {
      stackName: stack.name,
      action,
      trigger,
      ...normalizedDetails,
    });
  } catch (notificationErr: any) {
    logger.warn(
      { action, stackId: stack.id, stackName: stack.name, error: notificationErr?.message || String(notificationErr) },
      'Failed to send stack operation notification'
    );
  }
}

async function startDetachedSelfUpdate(id: string, stack: any, op: OperationState): Promise<boolean> {
  const { cwd, cleanup } = await resolveStackCwd(stack);

  try {
    const project = composeProjectNameFromStack(stack);
    const composeFile = await findComposeFile(cwd);
    op.lines.push('[+] Self-update detected — handing off to helper container...');

    // Get current container ID (self)
    const currentContainerId = String(process.env.HOSTNAME || '').trim();
    if (!currentContainerId) {
      op.lines.push('⚠️ Cannot determine own container ID — falling back to in-process update');
      return false;
    }

    const composePath = `${cwd}/${composeFile}`;

    // Build the helper script: wait → pull → recreate → cleanup
    const script = [
      'set -e',
      'echo "Helper: waiting 3s for old instance to finish responding..."',
      'sleep 3',
      `echo "Helper: pulling latest images for project ${project}..."`,
      `docker compose --project-name ${project} -f ${composePath} pull`,
      `echo "Helper: recreating containers..."`,
      `docker compose --project-name ${project} -f ${composePath} up -d --force-recreate`,
      'echo "Helper: self-update complete!"',
    ].join(' && ');

    // Start a detached helper container with docker socket + compose files
    const child = spawn('docker', [
      'run', '-d', '--rm',
      '--name', `hlc-self-update-${Date.now()}`,
      '-v', '/var/run/docker.sock:/var/run/docker.sock',
      '-v', `${cwd}:${cwd}:ro`,
      'docker:cli',
      'sh', '-c', script,
    ], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    op.lines.push('• Helper container spawned (detached)');
    op.lines.push('• THC will pull latest images and recreate itself');
    op.lines.push('• Page will reload automatically when new instance is ready');
    op.done = true;

    // Don't process.exit — let the helper container handle the recreation
    // The compose up --force-recreate will stop and replace this container
    return true;
  } catch (err: any) {
    logger.warn(
      { action: 'update', stackId: id, stackName: stack.name, error: formatExecError(err) },
      'Detached self-update handoff failed; falling back to in-process update'
    );
    op.lines.push('⚠️ Self-update helper failed, trying direct update...');
    return false;
  } finally {
    await cleanup?.();
  }
}

function formatExecError(err: any): string {
  const parts: string[] = [];
  if (err?.message) parts.push(String(err.message));
  const stderr = String(err?.stderr || '').trim();
  const stdout = String(err?.stdout || '').trim();
  if (stderr) parts.push(stderr);
  if (stdout) parts.push(stdout);
  return parts.join('\n').trim() || 'Unknown docker compose error';
}

// ---- Structured error analysis for docker compose stderr ----
type ComposeErrorCode = 'NETWORK_POOL_FULL' | 'NETWORK_NOT_FOUND' | 'PERMISSION_DENIED' | 'GENERIC';

interface ComposeErrorAnalysis {
  errorCode: ComposeErrorCode;
  friendlyMessage: string;
  isNetworkError: boolean;
  isNetworkPoolError: boolean;
  isPermissionError: boolean;
}

function parseComposeError(err: any): ComposeErrorAnalysis {
  const combined = `${String(err?.message || '')}\n${String(err?.stderr || '')}\n${String(err?.stdout || '')}`.toLowerCase();

  if (combined.includes('all predefined address pools have been fully subnetted')) {
    return {
      errorCode: 'NETWORK_POOL_FULL',
      friendlyMessage: 'Docker Netzwerk-Pool voll. Führe "Prune Networks" in System Maintenance aus, um nicht genutzte Netzwerke zu entfernen.',
      isNetworkError: true,
      isNetworkPoolError: true,
      isPermissionError: false,
    };
  }

  if (/network .+ not found/.test(combined) || combined.includes('network not found')) {
    return {
      errorCode: 'NETWORK_NOT_FOUND',
      friendlyMessage: 'Zombie-Netzwerk gefunden. Stack wird automatisch neu aufgebaut (down + up -d).',
      isNetworkError: true,
      isNetworkPoolError: false,
      isPermissionError: false,
    };
  }

  if (combined.includes('permission denied')) {
    return {
      errorCode: 'PERMISSION_DENIED',
      friendlyMessage: 'Zugriff verweigert. Prüfe den Docker Socket (/var/run/docker.sock) und ob der Container socket-Zugriff hat.',
      isNetworkError: false,
      isNetworkPoolError: false,
      isPermissionError: true,
    };
  }

  return {
    errorCode: 'GENERIC',
    friendlyMessage: formatExecError(err),
    isNetworkError: false,
    isNetworkPoolError: false,
    isPermissionError: false,
  };
}

/** Strip obsolete top-level `version:` field from compose content (Docker Compose v2 ignores it). */
function stripComposeVersion(content: string): string {
  return content.replace(/^\s*version\s*:\s*['"]?[\d.]+['"]?\s*\r?\n/m, '');
}

async function execComposeWithLogging(
  stack: any,
  id: string,
  action: string,
  command: string[],
  options: { cwd: string; timeout?: number }
): Promise<void> {
  await execComposeCommand(stack, id, action, command, options);
}

// ---- In-memory operation store for streaming output ----
interface OperationState {
  lines: string[];
  done: boolean;
  error?: string;
  startedAt: Date;
  action: string;
  stackName: string;
  trigger?: string;
  reconciledStatus?: string;
  lineIndexByKey?: Record<string, number>;
  progressState?: {
    pull: Record<string, string>;
    containers: Record<string, string>;
    images: Record<string, string>;
    networks: Record<string, string>;
  };
}
const operationStore = new Map<string, OperationState>();

function upsertOperationLine(op: OperationState, key: string, text: string): void {
  op.lineIndexByKey ||= {};
  const existingIndex = op.lineIndexByKey[key];
  if (existingIndex === undefined) {
    op.lineIndexByKey[key] = op.lines.length;
    op.lines.push(text);
    return;
  }
  op.lines[existingIndex] = text;
}

function ensureProgressState(op: OperationState): NonNullable<OperationState['progressState']> {
  op.progressState ||= { pull: {}, containers: {}, images: {}, networks: {} };
  return op.progressState;
}

function buildCompactSummary(title: string, states: Record<string, string>, options?: { limit?: number; doneToken?: RegExp }): string {
  const entries = Object.entries(states);
  if (entries.length === 0) return title;

  const limit = options?.limit ?? 3;
  const active = entries.filter(([, value]) => !(options?.doneToken?.test(value) ?? false));
  const shown = (active.length > 0 ? active : entries).slice(-limit);
  const doneCount = options?.doneToken ? entries.filter(([, value]) => options.doneToken!.test(value)).length : 0;
  const preview = shown.map(([key, value]) => `${key} ${value}`).join(' • ');
  const suffix = doneCount > 0 ? ` • ${doneCount}/${entries.length} complete` : '';
  return `${title}: ${preview}${suffix}`;
}

function compactComposeOutput(op: OperationState, rawLine: string): void {
  const line = rawLine.trim();
  if (!line) return;
  const progress = ensureProgressState(op);

  // Docker Compose v2 progress header: "[+] Running 3/3", "[+] Stopping 2/2", "[+] Pulling 2/2"
  let match = line.match(/^\[?\+\]?\s+(Running|Stopping|Pulling|Building|Creating|Removing)\s+(\d+\/\d+)\s*$/i);
  if (match) {
    upsertOperationLine(op, 'compose-header', `[+] ${match[1]} ${match[2]}`);
    return;
  }

  // Docker Compose v2 container status: "✔ Container myapp-web-1  Started  1.2s"
  match = line.match(/^[✔✓]\s+Container\s+(.+?)\s+(Started|Stopped|Healthy|Created|Removed|Running|Recreated|Waiting)\s+[\d.]+s\s*$/i);
  if (match) {
    const [, containerName, phase] = match;
    progress.containers[containerName.trim()] = phase;
    upsertOperationLine(op, 'container-summary', buildCompactSummary('• Containers', progress.containers, { limit: 3, doneToken: /healthy|started|running|stopped|removed|recreated/i }));
    return;
  }

  // Docker Compose v2 network status: "✔ Network myapp_default  Created  0.0s"
  match = line.match(/^[✔✓]\s+Network\s+(.+?)\s+(Created|Removed|Error)\s+[\d.]+s\s*$/i);
  if (match) {
    const [, networkName, phase] = match;
    progress.networks[networkName.trim()] = phase;
    upsertOperationLine(op, 'network-summary', buildCompactSummary('• Networks', progress.networks, { limit: 2, doneToken: /created|removed/i }));
    return;
  }

  // Docker Compose v2 pull status: "✔ folio-demo-app Pulled  0.7s"
  match = line.match(/^[✔✓]\s+(.+?)\s+Pulled\s+[\d.]+s\s*$/i);
  if (match) {
    progress.images[match[1].trim()] = 'Pulled';
    upsertOperationLine(op, 'image-summary', buildCompactSummary('• Images ready', progress.images, { limit: 2, doneToken: /pulled/i }));
    return;
  }

  // Legacy layer-level pull progress
  match = line.match(/^([a-f0-9]{6,64}|[^\s]+)\s+(Pulling fs layer|Waiting|Verifying Checksum|Download complete|Pull complete|Already exists)(?:\s+(.*))?$/i);
  if (match) {
    const [, layerId, state, suffix] = match;
    progress.pull[layerId] = `${state}${suffix ? ` ${suffix}` : ''}`;
    upsertOperationLine(op, 'pull-summary', buildCompactSummary('• Pulling images', progress.pull, { limit: 2, doneToken: /download complete|pull complete|already exists/i }));
    return;
  }

  match = line.match(/^([a-f0-9]{6,64}|[^\s]+)\s+(Downloading|Extracting)\s+(.+)$/i);
  if (match) {
    const [, layerId, phase, progress] = match;
    ensureProgressState(op).pull[layerId] = `${phase} ${progress}`;
    upsertOperationLine(op, 'pull-summary', buildCompactSummary('• Pulling images', ensureProgressState(op).pull, { limit: 2, doneToken: /download complete|pull complete|already exists/i }));
    return;
  }

  match = line.match(/^Image\s+(.+?)\s+Pulled$/i);
  if (match) {
    progress.images[match[1]] = 'Pulled';
    upsertOperationLine(op, 'image-summary', buildCompactSummary('• Images ready', progress.images, { limit: 2, doneToken: /pulled/i }));
    return;
  }

  // Legacy Container/Network lines (Compose v1 format)
  match = line.match(/^Container\s+(.+?)\s+(Recreate|Recreated|Creating|Created|Starting|Started|Waiting|Healthy|Stopping|Stopped|Removing|Removed|Running)$/i);
  if (match) {
    const [, containerName, phase] = match;
    progress.containers[containerName] = phase;
    upsertOperationLine(op, 'container-summary', buildCompactSummary('• Containers', progress.containers, { limit: 3, doneToken: /healthy|started|running|stopped|removed|recreated/i }));
    return;
  }

  match = line.match(/^Network\s+(.+?)\s+(Creating|Created|Removing|Removed|Error)\s*(.*)$/i);
  if (match) {
    const [, networkName, phase, extra] = match;
    progress.networks[networkName] = `${phase}${extra ? ` ${extra}` : ''}`;
    upsertOperationLine(op, 'network-summary', buildCompactSummary(phase.toLowerCase() === 'error' ? '❌ Networks' : '• Networks', progress.networks, { limit: 2, doneToken: /created|removed/i }));
    return;
  }

  if (/error|failed/i.test(line)) {
    op.lines.push(`❌ ${line}`);
    return;
  }
  if (/warn|obsolete|deprecated/i.test(line)) {
    op.lines.push(`⚠ ${line}`);
    return;
  }

  op.lines.push(line);
}

interface ComposeInvocationResult {
  runtime: 'docker' | 'docker-compose';
  args: string[];
  stdout: string;
  stderr: string;
}

function buildComposeCommandEnv(): NodeJS.ProcessEnv {
  const keepExact = new Set([
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'TMPDIR',
    'TEMP',
    'TMP',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
  ]);

  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    if (keepExact.has(key) || key.startsWith('COMPOSE_')) {
      env[key] = value;
    }
  }
  return env;
}

function getComposeInvocations(stack: any, command: string[], _cwd: string): Array<{ runtime: 'docker' | 'docker-compose'; args: string[] }> {
  const project = composeProjectNameFromStack(stack);
  // Native runtime: docker CLI with compose plugin (installed in Dockerfile)
  // CRITICAL: --project-name MUST come immediately after 'compose', not before it.
  // Correct:   docker compose --project-name mystack up -d
  // Wrong:     docker --project-name mystack compose up -d
  return [
    { runtime: 'docker', args: ['compose', '--project-name', project, ...command] },
    { runtime: 'docker', args: ['compose', '-p', project, ...command] },
    // Fallback: docker-compose symlink (created in Dockerfile)
    { runtime: 'docker-compose', args: ['--project-name', project, ...command] },
  ];
}

function shouldTryComposeFallback(err: any): boolean {
  const combined = `${String(err?.message || '')}\n${String(err?.stderr || '')}\n${String(err?.stdout || '')}`.toLowerCase();
  return combined.includes("not a docker command")
    || combined.includes('unknown flag')
    || combined.includes('unknown shorthand flag')
    || combined.includes('docker compose exited with code 125')
    || combined.includes('command not found')
    || combined.includes('no such file or directory')
    || err?.code === 'ENOENT';
}

function buildComposeFallbackError(errors: any[]): Error {
  const summary = errors.map((entry, idx) => {
    const runtime = entry.runtime || 'unknown';
    const message = formatExecError(entry.error);
    return `[attempt ${idx + 1} via ${runtime}] ${message}`;
  }).join('\n\n');
  return new Error(summary || 'All compose runtimes failed');
}

async function execComposeCommand(
  stack: any,
  id: string,
  action: string,
  command: string[],
  options: { cwd: string; timeout?: number }
): Promise<ComposeInvocationResult> {
  const attempts = getComposeInvocations(stack, command, options.cwd);
  const errors: Array<{ runtime: string; error: any }> = [];

  for (let idx = 0; idx < attempts.length; idx++) {
    const attempt = attempts[idx];
    const startedAt = Date.now();

    logger.info(
      {
        action,
        stackId: id,
        stackName: stack.name,
        stackPath: stack.stack_path,
        cwd: options.cwd,
        composeRuntime: attempt.runtime,
        dockerCommand: attempt.runtime,
        dockerArgs: attempt.args,
      },
      `Executing native compose action for stack [${stack.name}]`
    );

    try {
      // CRITICAL: Verify compose file exists before attempting execution
      const composeFileExists = COMPOSE_FILENAMES.some(filename => existsSync(join(options.cwd, filename)));
      if (!composeFileExists) {
        const missingPath = `${options.cwd}/${COMPOSE_FILENAMES.join(' or ')}`;
        logger.warn(
          { cwd: options.cwd, stackName: stack.name, stackId: id },
          `Compose file not found at [${missingPath}] — proceeding with docker compose fallback`
        );
      }

      const { stdout, stderr } = await execFileAsync(attempt.runtime, attempt.args, {
        cwd: options.cwd,
        timeout: options.timeout,
        env: buildComposeCommandEnv(),
      });

      logger.info(
        {
          action,
          stackId: id,
          stackName: stack.name,
          cwd: options.cwd,
          composeRuntime: attempt.runtime,
          durationMs: Date.now() - startedAt,
          stdoutPreview: String(stdout || '').split('\n').filter(Boolean).slice(-20),
          stderrPreview: String(stderr || '').split('\n').filter(Boolean).slice(-20),
        },
        'Stack compose action succeeded'
      );

      return {
        runtime: attempt.runtime,
        args: attempt.args,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      };
    } catch (err: any) {
      logger.error(
        {
          action,
          stackId: id,
          stackName: stack.name,
          stackPath: stack.stack_path,
          cwd: options.cwd,
          durationMs: Date.now() - startedAt,
          composeRuntime: attempt.runtime,
          dockerCommand: attempt.runtime,
          dockerArgs: attempt.args,
          errorMessage: err?.message || 'Unknown error',
          code: err?.code,
          signal: err?.signal,
          killed: err?.killed,
          stdout: String(err?.stdout || ''),
          stderr: String(err?.stderr || ''),
        },
        'Stack compose action failed'
      );

      errors.push({ runtime: attempt.runtime, error: err });
      const isLast = idx === attempts.length - 1;
      if (isLast || !shouldTryComposeFallback(err)) {
        throw buildComposeFallbackError(errors);
      }
    }
  }

  throw new Error('Compose command failed unexpectedly');
}

async function reconcileStackStatusFromRuntime(id: string, stack: any): Promise<'running' | 'stopped' | 'failed'> {
  const project = composeProjectNameFromStack(stack);
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.State}}'],
      { timeout: 10000 }
    );
    const states = String(stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (states.length === 0) {
      // No containers exist — this is normal after 'down', treat as stopped
      return 'stopped';
    }
    if (states.some((s) => s === 'running')) return 'running';
    // All containers exist but none running — stopped (not failed)
    return 'stopped';
  } catch (err: any) {
    logger.warn({ stackId: id, stackName: stack.name, project, error: formatExecError(err) }, 'Failed to reconcile stack status from runtime');
    return 'failed';
  }
}

async function finishActionOnFailure(
  res: any,
  id: string,
  stack: any,
  desiredStatus: 'running' | 'stopped',
  err: any
): Promise<'running' | 'stopped' | 'failed'> {
  const reconciledStatus = await reconcileStackStatusFromRuntime(id, stack);
  await pool.query('UPDATE stacks SET status = $1, updated_at = NOW() WHERE id = $2', [reconciledStatus, id]);

  const errorText = formatExecError(err);
  const parsed = parseComposeError(err);
  if (reconciledStatus === desiredStatus) {
    logger.warn(
      {
        stackId: id,
        stackName: stack.name,
        desiredStatus,
        reconciledStatus,
        error: errorText,
      },
      'Stack action command failed but desired runtime state was reached'
    );
    res.json({ ok: true, recovered: true, warning: errorText, status: reconciledStatus });
    return reconciledStatus;
  }

  res.status(500).json({ error: errorText, errorCode: parsed.errorCode, friendlyMessage: parsed.friendlyMessage, status: reconciledStatus });
  return reconciledStatus;
}

async function runUpdateOperation(id: string, stack: any, op: OperationState, trigger = 'manual'): Promise<void> {
  let cleanup: (() => Promise<void>) | null = null;
  const wasRunning = stack.status === 'running';
  try {
    op.lines.push(`[+] Updating stack ${stack.name}...`);

    if (await isSelfManagedStack(stack)) {
      const detachedStarted = await startDetachedSelfUpdate(id, stack, op);
      if (detachedStarted) {
        return;
      }
    }

    const resolved = await resolveStackCwd(stack);
    const cwd = resolved.cwd;
    cleanup = resolved.cleanup;

    // Like Dockge: if stack is not running, only pull images — don't start
    const composeCommand = wasRunning
      ? ['up', '-d', '--pull', 'always']
      : ['pull'];

    if (!wasRunning) {
      op.lines.push('Stack is not running — pulling images only (will not auto-start)');
    }

    // Use streaming spawn for real-time progress (Dockge-style)
    const attempts = getComposeInvocations(stack, composeCommand, cwd);
    let lastError: any = null;

    for (let attemptIdx = 0; attemptIdx < attempts.length; attemptIdx++) {
      const attempt = attempts[attemptIdx];
      lastError = null;

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(attempt.runtime, attempt.args, {
            cwd,
            timeout: 300000, // 5min for pull+up
            env: buildComposeCommandEnv(),
          });

          proc.stdout.on('data', (data: Buffer) => {
            data.toString('utf8').split('\n').filter(Boolean).forEach(line => {
              compactComposeOutput(op, line);
            });
          });

          proc.stderr.on('data', (data: Buffer) => {
            data.toString('utf8').split('\n').filter(Boolean).forEach(line => {
              compactComposeOutput(op, line);
            });
          });

          proc.on('close', (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`${attempt.runtime} exited with code ${code}`));
            }
          });

          proc.on('error', (err: NodeJS.ErrnoException) => {
            reject(new Error(err.code === 'ENOENT' ? `${attempt.runtime} not found` : err.message));
          });
        });

        // Success
        if (wasRunning) {
          await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
          op.reconciledStatus = 'running';
          op.lines.push('✅ Update complete — containers restarted with latest images');
        } else {
          await pool.query('UPDATE stacks SET status = $1, updated_at = NOW() WHERE id = $2', [stack.status === 'deploying' ? 'stopped' : stack.status, id]);
          op.reconciledStatus = 'stopped';
          op.lines.push('✅ Images pulled successfully (stack remains stopped)');
        }
        setStackUpdateStatus(stack.name, false);
        await auditLog('update', 'stack', id, { trigger, source: trigger === 'schedule' ? 'auto-update' : 'user' });
        await sendStackOperationNotification('update', stack, true, { trigger });
        return;
      } catch (err: any) {
        lastError = err;
        const isLast = attemptIdx === attempts.length - 1;
        if (isLast || !shouldTryComposeFallback(err)) {
          throw err;
        }
        op.lines.push(`⚠️ Attempt ${attemptIdx + 1} failed, trying fallback...`);
      }
    }

    throw lastError || new Error('Update operation failed');
  } catch (err: any) {
    logger.error({ action: 'update', stackId: id, stackName: stack.name, error: formatExecError(err) }, 'Stack update operation failed');
    op.lines.push(`❌ Update failed: ${formatExecError(err)}`);
    op.error = formatExecError(err);
    const reconciledStatus = await reconcileStackStatusFromRuntime(id, stack);
    op.reconciledStatus = reconciledStatus;
    await pool.query('UPDATE stacks SET status = $1, updated_at = NOW() WHERE id = $2', [reconciledStatus, id]);
    await sendStackOperationNotification('update', stack, false, { reconciledStatus, trigger });
    if (reconciledStatus === 'running') {
      op.lines.push('⚠ Update failed but existing containers are still running.');
    }
  } finally {
    op.done = true;
    await cleanup?.();
    setTimeout(() => operationStore.delete(id), 5 * 60 * 1000);
  }
}

// Action-specific labels for Dockge-style output
const ACTION_LABELS: Record<string, { verb: string; doneVerb: string; headerPrefix: string }> = {
  deploy:     { verb: 'Starting',     doneVerb: 'Started',     headerPrefix: '[+] Starting' },
  stop:       { verb: 'Stopping',     doneVerb: 'Stopped',     headerPrefix: '[+] Stopping' },
  deactivate: { verb: 'Deactivating', doneVerb: 'Deactivated', headerPrefix: '[+] Removing' },
  restart:    { verb: 'Restarting',    doneVerb: 'Restarted',   headerPrefix: '[+] Restarting' },
  recreate:   { verb: 'Recreating',   doneVerb: 'Recreated',   headerPrefix: '[+] Recreating' },
  update:     { verb: 'Updating',     doneVerb: 'Updated',     headerPrefix: '[+] Updating' },
};

/** Execute a compose command with real-time streaming output to OperationState */
async function runStreamingStackOperation(
  stackId: string,
  stack: any,
  op: OperationState,
  composeCommand: string[],
  desiredStatus: 'running' | 'stopped',
  auditAction: string,
  trigger = 'manual'
): Promise<void> {
  const { cwd, cleanup } = await resolveStackCwd(stack);
  const labels = ACTION_LABELS[op.action] || { verb: op.action, doneVerb: op.action, headerPrefix: `[+] ${op.action}` };
  op.lines.push(`${labels.headerPrefix} ${stack.name}...`);
  try {
    const attempts = getComposeInvocations(stack, composeCommand, cwd);
    let lastError: any = null;

    for (let attemptIdx = 0; attemptIdx < attempts.length; attemptIdx++) {
      const attempt = attempts[attemptIdx];
      lastError = null;

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(attempt.runtime, attempt.args, {
            cwd,
            timeout: 120000,
            env: buildComposeCommandEnv(),
          });

          proc.stdout.on('data', (data: Buffer) => {
            data.toString('utf8').split('\n').filter(Boolean).forEach(line => {
              compactComposeOutput(op, line);
            });
          });

          proc.stderr.on('data', (data: Buffer) => {
            data.toString('utf8').split('\n').filter(Boolean).forEach(line => {
              compactComposeOutput(op, line);
            });
          });

          proc.on('close', (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`${attempt.runtime} exited with code ${code}`));
            }
          });

          proc.on('error', (err: NodeJS.ErrnoException) => {
            reject(new Error(err.code === 'ENOENT' ? `${attempt.runtime} not found` : err.message));
          });
        });

        // Success — reconcile actual status from Docker to be 100% correct
        const reconciledStatus = await reconcileStackStatusFromRuntime(stackId, stack);
        const finalStatus = reconciledStatus || desiredStatus;
        op.reconciledStatus = finalStatus;
        logger.info({ stackId, stackName: stack.name, action: op.action, attemptIndex: attemptIdx, reconciledStatus: finalStatus }, 'Stack operation succeeded');
        await pool.query('UPDATE stacks SET status = $1, updated_at = NOW() WHERE id = $2', [finalStatus, stackId]);
        op.lines.push(`✅ ${labels.doneVerb} successfully`);
        await auditLog(auditAction, 'stack', stackId, { trigger, source: trigger === 'schedule' ? 'auto-update' : 'user' });
        await sendStackOperationNotification(op.action, stack, true, { desiredStatus: finalStatus, trigger });
        return;
      } catch (err: any) {
        lastError = err;
        logger.warn({ stackId, stackName: stack.name, action: op.action, attemptIndex: attemptIdx, error: err.message }, 'Stack operation attempt failed');

        const isLast = attemptIdx === attempts.length - 1;
        if (isLast || !shouldTryComposeFallback(err)) {
          throw err;
        }
        // Try next attempt
        op.lines.push(`⚠️ Attempt ${attemptIdx + 1} failed, trying fallback...`);
      }
    }

    throw lastError || new Error('Stack operation failed');
  } catch (err: any) {
    logger.error({ stackId, stackName: stack.name, action: op.action, error: formatExecError(err) }, 'Stack operation failed completely');
    const parsed = parseComposeError(err);

    // Reconcile actual status — maybe the action still worked despite exit code
    const reconciledStatus = await reconcileStackStatusFromRuntime(stackId, stack);
    op.reconciledStatus = reconciledStatus;
    await pool.query('UPDATE stacks SET status = $1, updated_at = NOW() WHERE id = $2', [reconciledStatus, stackId]);

    if (reconciledStatus === desiredStatus) {
      // Docker command returned non-zero but the desired state was reached — treat as success
      logger.info({ stackId, stackName: stack.name, action: op.action, reconciledStatus }, 'Stack operation command failed but desired state reached — treating as success');
      op.lines.push(`✅ ${labels.doneVerb} successfully`);
      await auditLog(auditAction, 'stack', stackId, { trigger, source: trigger === 'schedule' ? 'auto-update' : 'user', recoveredFromError: true });
      await sendStackOperationNotification(op.action, stack, true, { desiredStatus, reconciledStatus, trigger });
    } else {
      op.lines.push(`❌ ${labels.verb} failed: ${parsed.friendlyMessage}`);
      op.error = parsed.friendlyMessage;
      await sendStackOperationNotification(op.action, stack, false, { desiredStatus, reconciledStatus, trigger });
    }
  } finally {
    op.done = true;
    await cleanup?.();
    setTimeout(() => operationStore.delete(stackId), 5 * 60 * 1000);
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
  const runtimeProjects = await listComposeProjects();
  const runtimeStatusByName = new Map(runtimeProjects.map((p) => [p.name.toLowerCase(), p.status]));
  const stacks = await Promise.all(rows.map(async (row: any) => {
    const mapped = mapStack(row);
    const runtimeStatus = runtimeStatusByName.get(String(mapped.name || '').toLowerCase());
    if (runtimeStatus) (mapped as any).status = runtimeStatus;
    // Check if stack files are still accessible on disk
    if (row.stack_path) {
      const accessiblePath = await resolveAccessibleStackPath(row);
      (mapped as any).filesLost = !accessiblePath;
    }
    return mapped;
  }));
  res.json(stacks);
}));

// Scan stacks folder for compose directories not yet managed by THC
router.get('/orphans', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT name, stack_path FROM stacks');
  const managedPaths = new Set(rows.map((row: any) => row.stack_path).filter(Boolean));
  const managedNames = new Set(rows.map((row: any) => String(row.name).toLowerCase()));

  const orphans: Array<{ name: string; stackPath: string; composeFile: string }> = [];
  try {
    const entries = await readdir(config.stacksPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = join(config.stacksPath, entry.name);
      if (managedPaths.has(dirPath)) continue;
      if (managedNames.has(entry.name.toLowerCase())) continue;

      let foundCompose: string | null = null;
      for (const filename of COMPOSE_FILENAMES) {
        try {
          await access(join(dirPath, filename));
          foundCompose = filename;
          break;
        } catch { /* try next */ }
      }
      if (foundCompose) {
        orphans.push({ name: entry.name, stackPath: dirPath, composeFile: foundCompose });
      }
    }
  } catch { /* stacks folder not accessible from container */ }

  res.json(orphans);
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

  const result = await Promise.all(unmanagedProjects.map(async (project) => {
    if (!project.stackPath) return { ...project, pathAccessible: false };
    const accessiblePath = await resolveAccessibleStackPath({ stack_path: project.stackPath });
    return { ...project, pathAccessible: !!accessiblePath };
  }));

  res.json(result);
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
  //   0. Direct filesystem read if path is accessible from within the container (e.g. inside config.stacksPath)
  //   1. Mount each specific file from composeFiles labels (most reliable — exact paths)
  //   2. Mount the stackPath directory and scan for standard compose filenames
  let composeContent = '';
  let composeFile = '';
  let directAccessPath: string | null = null;

  // Strategy 0: direct read if path is accessible from container (path is inside mounted stacks volume)
  directAccessPath = await resolveAccessibleStackPath({ stack_path: safePath });
  if (directAccessPath) {
    for (const filename of COMPOSE_FILENAMES) {
      try {
        const content = await readFile(join(directAccessPath, filename), 'utf8');
        if (content.trim()) {
          composeFile = filename;
          composeContent = content;
          break;
        }
      } catch { /* try next */ }
    }
  }

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
  // Strategy 0: direct read if accessible (reuse directAccessPath from compose detection)
  if (directAccessPath) {
    envContent = await readFile(join(directAccessPath, '.env'), 'utf8').catch(() => '');
  }
  if (!envContent) {
    try {
      const { stdout: envOut } = await execFileAsync(
        'docker', ['run', '--rm', '-v', `${safePath}:/hlcread:ro`, 'alpine', 'cat', '/hlcread/.env'],
        { timeout: 10000 }
      );
      envContent = envOut;
    } catch { /* optional — .env may not exist */ }
  }

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

router.get('/:id/update-history', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows } = await pool.query(
    `SELECT id, action, details, created_at
     FROM audit_log
     WHERE resource_type = 'stack' AND resource_id = $1 AND action IN ('update', 'deploy', 'restart', 'recreate', 'auto_update', 'stop', 'deactivate')
     ORDER BY created_at DESC
     LIMIT 20`,
    [id],
  );

  const actionLabels: Record<string, string> = {
    update: 'Update',
    deploy: 'Deploy',
    restart: 'Restart',
    recreate: 'Recreate',
    auto_update: 'Auto update',
    stop: 'Stop',
    deactivate: 'Deactivate',
  };

  const triggerLabel = (value: string): string => {
    const normalized = value.toLowerCase();
    if (!normalized) return 'Manual';
    if (normalized === 'schedule') return 'Auto update schedule';
    if (normalized === 'manual') return 'Manual';
    if (normalized === 'detached-self-update') return 'Self-update handoff';
    return normalized.replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase());
  };

  const updateLike = new Set(['update', 'auto_update', 'recreate']);

  res.json(rows.map((row: any) => ({
    id: row.id,
    action: row.action,
    details: row.details || {},
    actionLabel: actionLabels[row.action] || row.action,
    trigger: triggerLabel(String(row.details?.trigger || (row.action === 'auto_update' ? 'schedule' : 'manual'))),
    isUpdate: updateLike.has(String(row.action)),
    createdAt: row.created_at,
  })));
}));

router.post('/actions/update-all', asyncHandler(async (_req, res) => {
  const { rows: stacks } = await pool.query(
    `SELECT s.*, bc.enabled AS backup_enabled
     FROM stacks s
     LEFT JOIN backup_configs bc ON bc.stack_id = s.id
     ORDER BY s.name`
  );

  const summary: {
    updated: Array<{ id: string; name: string }>;
    skipped: Array<{ id: string; name: string; reason: string }>;
    failed: Array<{ id: string; name: string; error: string }>;
  } = { updated: [], skipped: [], failed: [] };

  for (const stack of stacks) {
    const id = String(stack.id);
    const name = String(stack.name);

    const existing = operationStore.get(id);
    if (existing && !existing.done) {
      summary.skipped.push({ id, name, reason: 'operation already running' });
      continue;
    }

    try {
      const shouldBackupFirst = !!stack.run_backup_before_update || !!stack.backup_enabled;
      if (shouldBackupFirst) {
        try {
          await runBackup(id);
        } catch (backupErr: any) {
          summary.failed.push({ id, name, error: `backup failed: ${backupErr?.message || 'unknown error'}` });
          continue;
        }
      }

      const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'bulk-update', stackName: name, trigger: 'manual' };
      operationStore.set(id, op);
      await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);
      await runUpdateOperation(id, stack, op, 'manual');
      summary.updated.push({ id, name });
    } catch (err: any) {
      summary.failed.push({ id, name, error: err?.message || 'unknown error' });
    }
  }

  res.json(summary);
}));

// Create stack
router.post('/', validateBody(createStackBody), asyncHandler(async (req, res) => {
  const { name, description, composeContent: rawCompose, envContent } = req.body;
  const composeContent = stripComposeVersion(rawCompose);
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
    const cleanedCompose = stripComposeVersion(b.composeContent);
    updates.push(`compose_content = $${idx++}`); values.push(cleanedCompose);
    updates.push(`services = $${idx++}`); values.push(countServices(cleanedCompose));
    updates.push(`version = version + 1`);

    // Write to disk — preserve existing compose filename
    const accessiblePath = await resolveAccessibleStackPath(existing);
    if (accessiblePath) {
      const composeFile = await findComposeFile(accessiblePath);
      await writeFile(join(accessiblePath, composeFile), cleanedCompose);
    }

    // Save version
    const newVersion = existing.version + 1;
    await pool.query(
      `INSERT INTO stack_versions (stack_id, version, compose_content, env_content, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, newVersion, cleanedCompose, b.envContent ?? existing.env_content, 'Updated compose']
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
  // Clean up related configs to prevent orphan warnings
  await pool.query("DELETE FROM smart_startup_configs WHERE target_id = $1 AND target_type = 'stack'", [id]);
  await pool.query('DELETE FROM backup_configs WHERE stack_id = $1', [id]);
  await pool.query('DELETE FROM stacks WHERE id = $1', [id]);
  await auditLog('delete', 'stack', id);
  res.json({ ok: true });
}));

// Deploy stack — clean deploy strategy:
//   1. Try `up -d` (fast path — reuses existing networks/containers).
//   2. If a network error is detected (zombie network), automatically run `down` then `up -d`.
//   3. If the network pool is full, fail with a specific errorCode so the UI can guide the user.
router.post('/:id/deploy', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'deploy', stackName: stack.name, trigger: 'manual' };
  operationStore.set(id, op);
  await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);

  // Fire-and-forget: start operation in background
  runStreamingStackOperation(id, stack, op, ['up', '-d'], 'running', 'deploy', 'manual').catch(() => { /* handled inside */ });
  res.json({ ok: true });
}));

// Stop stack
router.post('/:id/stop', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'stop', stackName: stack.name, trigger: 'manual' };
  operationStore.set(id, op);

  // Fire-and-forget: start operation in background
  runStreamingStackOperation(id, stack, op, ['stop'], 'stopped', 'stop', 'manual').catch(() => { /* handled inside */ });
  res.json({ ok: true });
}));

// Deactivate stack (docker compose down)
router.post('/:id/deactivate', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'deactivate', stackName: stack.name, trigger: 'manual' };
  operationStore.set(id, op);

  // Fire-and-forget: start operation in background
  runStreamingStackOperation(id, stack, op, ['down'], 'stopped', 'deactivate', 'manual').catch(() => { /* handled inside */ });
  res.json({ ok: true });
}));

// Restart stack
router.post('/:id/restart', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'restart', stackName: stack.name, trigger: 'manual' };
  operationStore.set(id, op);

  // Fire-and-forget: start operation in background
  runStreamingStackOperation(id, stack, op, ['restart'], 'running', 'restart', 'manual').catch(() => { /* handled inside */ });
  res.json({ ok: true });
}));

// Recreate stack containers (force new containers from current compose)
router.post('/:id/recreate', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'recreate', stackName: stack.name, trigger: 'manual' };
  operationStore.set(id, op);
  await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);

  // Fire-and-forget: start operation in background
  runStreamingStackOperation(id, stack, op, ['up', '-d', '--force-recreate'], 'running', 'recreate', 'manual').catch(() => { /* handled inside */ });
  res.json({ ok: true });
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
      ['ps', '-a', '--filter', `label=com.docker.compose.project=${composeProjectNameFromStack(stack)}`, '--format', '{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Image}}\t{{.Label "com.docker.compose.service"}}'],
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
  if (!op) {
    const { rows: [stack] } = await pool.query('SELECT status FROM stacks WHERE id = $1', [id]);
    res.json({ running: false, lines: [], done: stack ? stack.status !== 'deploying' : true, action: null, error: null, reconciledStatus: stack?.status || null });
    return;
  }
  res.json({
    running: !op.done,
    lines: op.lines,
    done: op.done,
    action: op.action,
    error: op.error || null,
    reconciledStatus: op.reconciledStatus || null,
  });
}));

// ---- Update stack images (pull + redeploy) ----

router.post('/:id/update', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [id]);
  if (!stack) { res.status(404).json({ error: 'Stack not found' }); return; }

  // Reject if already running an operation for this stack
  const existing = operationStore.get(id);
  if (existing && !existing.done) { res.status(409).json({ error: 'Operation already running' }); return; }

  const op: OperationState = { lines: [], done: false, startedAt: new Date(), action: 'update', stackName: stack.name, trigger: 'manual' };
  operationStore.set(id, op);
  await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [id]);

  // Fire-and-forget: start operation in background
  runUpdateOperation(id, stack, op, 'manual').catch(() => { /* handled inside */ });
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
