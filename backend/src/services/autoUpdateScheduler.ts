import cron from 'node-cron';
import { spawn } from 'child_process';
import { join } from 'path';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pool } from '../database.js';
import { logger } from '../logger.js';
import { sendNotification } from './notifications.js';
import { auditLog } from '../lib/audit.js';
import { runBackup } from './backups.js';
import { getStackUpdateStatus } from './updates.js';

const execFileAsync = promisify(execFile);
const MIN_FREE_DISK_GB = 3;

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

async function checkFreeDiskSpaceGB(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('df', ['-BG', '/'], { timeout: 8000 });
    const lines = stdout.trim().split('\n');
    for (const line of lines.slice(1)) {
      const parts = line.trim().split(/\s+/);
      // Format: Filesystem  1G-blocks  Used  Available  Use%  Mounted
      if (parts.length >= 4) {
        const available = parseInt(parts[3].replace(/G$/, ''), 10);
        if (Number.isFinite(available)) return available;
      }
    }
    return Infinity;
  } catch {
    return Infinity; // can't determine — allow update to proceed
  }
}

let scheduledTask: cron.ScheduledTask | null = null;

async function recordFreezeSkip(phase: 'preflight' | 'mid-run', stackName?: string): Promise<void> {
  const details: Record<string, unknown> = {
    trigger: 'schedule',
    action: 'update',
    source: 'auto-update',
    reason: 'global_update_freeze',
    phase,
  };
  if (stackName) {
    details.stackName = stackName;
  }

  await auditLog('auto_update_skipped', 'system', undefined, details).catch(() => { /* best-effort */ });
  await sendNotification('autoUpdateSkippedFrozen', details).catch(() => { /* best-effort */ });
}

async function isGlobalUpdateFreezeEnabled(): Promise<boolean> {
  const { rows: [settings] } = await pool.query(
    'SELECT global_update_freeze FROM settings WHERE id = 1'
  );
  return Boolean(settings?.global_update_freeze);
}

export async function initAutoUpdateScheduler(): Promise<void> {
  try {
    const { rows: [settings] } = await pool.query('SELECT auto_update_schedule FROM settings WHERE id = 1');
    const schedule = settings?.auto_update_schedule || {};

    if (!schedule.enabled || !schedule.cron) {
      logger.info('Auto-update scheduler: disabled or no cron configured');
      return;
    }

    rescheduleAutoUpdater(schedule.cron);
  } catch (err) {
    logger.error({ err }, 'Failed to initialize auto-update scheduler');
  }
}

export function rescheduleAutoUpdater(cronExpr: string | null): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (!cronExpr) return;

  if (!cron.validate(cronExpr)) {
    logger.warn({ cron: cronExpr }, 'Invalid auto-update cron expression — scheduler not started');
    return;
  }

  scheduledTask = cron.schedule(cronExpr, runScheduledUpdates);
  logger.info({ cron: cronExpr }, 'Auto-update scheduler initialized');
}

async function runScheduledUpdates(): Promise<void> {
  try {
    if (await isGlobalUpdateFreezeEnabled()) {
      logger.info('Auto-update scheduled run skipped: global update freeze is active');
      await recordFreezeSkip('preflight');
      return;
    }

    // ── Disk space pre-check ───────────────────────────────────────────
    const freeGB = await checkFreeDiskSpaceGB();
    if (freeGB < MIN_FREE_DISK_GB) {
      logger.error({ freeGB, thresholdGB: MIN_FREE_DISK_GB }, 'Auto-update aborted: insufficient disk space');
      await sendNotification('diskSpaceLow', {
        freeGB,
        thresholdGB: MIN_FREE_DISK_GB,
        action: 'auto-update skipped',
        message: `Only ${freeGB} GB free on /. Docker image pulls could fill the disk and corrupt databases. Free up space first (docker image prune -a).`,
      }).catch(() => { /* best-effort */ });
      return;
    }

    const { rows: stacks } = await pool.query(
      "SELECT * FROM stacks WHERE auto_update = true AND status = 'running'"
    );

    if (stacks.length === 0) {
      logger.info('Auto-update scheduled run: no stacks with auto_update=true and status=running');
      return;
    }

    logger.info({ count: stacks.length, freeGB }, 'Starting scheduled auto-update run');

    for (const stack of stacks) {
      if (await isGlobalUpdateFreezeEnabled()) {
        logger.info('Auto-update run interrupted: global update freeze enabled during execution');
        await recordFreezeSkip('mid-run', stack.name);
        return;
      }

      if (!getStackUpdateStatus(String(stack.name || ''))) {
        logger.info({ stackName: stack.name }, 'Auto-update skipped: stack already up to date');
        continue;
      }

      logger.info({ stackName: stack.name }, 'Auto-updating stack');
      try {
        // Run backup before update if configured
        if (stack.run_backup_before_update) {
          logger.info({ stackName: stack.name }, 'Running pre-update backup');
          await runBackup(stack.id).catch((err: any) => {
            logger.warn({ err, stackName: stack.name }, 'Pre-update backup failed, continuing with update');
          });
        }

        await updateStackImages(stack);
        await pool.query(
          "UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1",
          [stack.id]
        );
        await auditLog('auto_update', 'stack', String(stack.id), { trigger: 'schedule', action: 'update', source: 'auto-update' });
        await sendNotification('containerAutoUpdated', {
          stackName: stack.name,
          action: 'update',
          trigger: 'schedule',
          source: 'auto-update',
        });
        logger.info({ stackName: stack.name }, 'Auto-update complete');
      } catch (err: any) {
        logger.error({ err, stackName: stack.name }, 'Auto-update failed for stack');
        await pool.query(
          "UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1",
          [stack.id]
        ).catch(() => { /* best-effort */ });
        await sendNotification('stackFailed', {
          stackName: stack.name,
          action: 'update',
          trigger: 'schedule',
          source: 'auto-update',
          error: err.message,
        }).catch(() => { /* best-effort */ });
      }
    }
  } catch (err) {
    logger.error({ err }, 'Auto-update scheduler error');
  }
}

function updateStackImages(stack: any): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let tempDir: string | null = null;
    try {
      tempDir = await mkdtemp(join(tmpdir(), `hlc-autoupdate-`));
      await writeFile(join(tempDir, 'docker-compose.yml'), stack.compose_content || '');
      if (stack.env_content) {
        await writeFile(join(tempDir, '.env'), stack.env_content);
      }

      const proc = spawn(
        'docker',
        ['compose', '-p', stack.name.toLowerCase(), 'up', '-d', '--pull', 'always'],
        { cwd: tempDir, env: buildComposeCommandEnv() }
      );
      const outputLines: string[] = [];
      const onData = (data: Buffer) => {
        data.toString('utf8').split('\n').filter(Boolean).forEach(line => {
          outputLines.push(line);
          logger.debug({ stackName: stack.name, line }, 'docker compose output');
        });
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('close', (code) => {
        if (tempDir) rm(tempDir, { recursive: true, force: true }).catch(() => {});
        if (code === 0) {
          resolve();
        } else {
          const tail = outputLines.slice(-30).join('\n');
          reject(new Error(`docker compose exited with code ${code}${tail ? '\n' + tail : ''}`));
        }
      });
      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (tempDir) rm(tempDir, { recursive: true, force: true }).catch(() => {});
        reject(new Error(err.code === 'ENOENT' ? 'docker CLI not found' : err.message));
      });
    } catch (err) {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      reject(err);
    }
  });
}
