import { execFile } from 'child_process';
import { promisify } from 'util';
import { pool } from '../database.js';
import { logger } from '../logger.js';
import { sendNotification } from './notifications.js';

const execFileAsync = promisify(execFile);

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

/** In-memory device status cache (keyed by trigger_value / IP or hostname) */
interface DeviceStatus {
  isOnline: boolean;
  lastCheckedAt: Date | null;
  lastSeenAt: Date | null;
}

interface SmartStartupOrphan {
  configId: string;
  targetId: string;
  triggerValue: string;
  enabled: boolean;
}

interface SmartStartupDiagnostics {
  address: string;
  isOnline: boolean;
  latencyMs: number;
  checkedAt: string;
}

const deviceStatuses = new Map<string, DeviceStatus>();
let pollerHandle: ReturnType<typeof setInterval> | null = null;
let startupOrphansSnapshot: { checkedAt: string; count: number; items: SmartStartupOrphan[] } = {
  checkedAt: new Date(0).toISOString(),
  count: 0,
  items: [],
};

/** Called at backend startup */
export async function initSmartStartup(): Promise<void> {
  await checkStartupOrphans();
  // Run immediately, then every 10 s to re-evaluate per-config intervals
  await monitorDevices();
  pollerHandle = setInterval(monitorDevices, 10_000);
  logger.info('Smart startup monitor initialized');
}

/** Called by the route to expose current device statuses */
export function getDeviceStatuses(): Record<string, DeviceStatus> {
  return Object.fromEntries(deviceStatuses);
}

/** Called by route to show one-time startup orphan check result in UI. */
export function getStartupOrphansSnapshot(): { checkedAt: string; count: number; items: SmartStartupOrphan[] } {
  return startupOrphansSnapshot;
}

/** Called when an orphan is manually deleted to update the UI snapshot state. */
export function removeStartupOrphanFromSnapshot(configId: string): void {
  startupOrphansSnapshot.items = startupOrphansSnapshot.items.filter(i => i.configId !== configId);
  startupOrphansSnapshot.count = startupOrphansSnapshot.items.length;
}

/** Called by route to force an immediate check for one IP/hostname. */
export async function runDeviceDiagnostics(address: string): Promise<SmartStartupDiagnostics> {
  const { isOnline, latencyMs } = await pingDeviceWithLatency(address);
  const checkedAt = new Date();

  const prev = deviceStatuses.get(address);
  const seenAt = isOnline ? checkedAt : (prev?.lastSeenAt ?? null);

  deviceStatuses.set(address, {
    isOnline,
    lastCheckedAt: checkedAt,
    lastSeenAt: seenAt,
  });

  await pool.query(
    `UPDATE smart_startup_configs
     SET device_online = $1, last_checked_at = $2, last_seen_at = $3, updated_at = NOW()
     WHERE trigger_value = $4`,
    [isOnline, checkedAt, seenAt, address]
  );

  return {
    address,
    isOnline,
    latencyMs,
    checkedAt: checkedAt.toISOString(),
  };
}

// Track the last real check time per config to honour per-config monitor_interval
const lastChecked = new Map<string, number>();

async function monitorDevices(): Promise<void> {
  try {
    const { rows: configs } = await pool.query(
      `SELECT ssc.*, s.stack_path, s.status AS stack_status, s.name AS stack_name
       FROM smart_startup_configs ssc
       LEFT JOIN stacks s ON s.id::text = ssc.target_id
       WHERE ssc.enabled = true`
    );

    const now = Date.now();
    const pingCache = new Map<string, { isOnline: boolean; checkedAt: Date }>();

    for (const config of configs) {
      const intervalMs = (config.monitor_interval ?? 30) * 1000;
      const last = lastChecked.get(config.id) ?? 0;
      if (now - last < intervalMs) continue; // not due yet
      lastChecked.set(config.id, now);

      const addr = config.trigger_value as string;

      // Skip ping if no device address configured yet
      if (!addr) {
        lastChecked.set(config.id, now);
        continue;
      }

      const wasOnline = Boolean(config.device_online);
      let pingResult = pingCache.get(addr);
      if (!pingResult) {
        const { isOnline } = await pingDeviceWithLatency(addr);
        pingResult = { isOnline, checkedAt: new Date() };
        pingCache.set(addr, pingResult);
      }

      const isOnline = pingResult.isOnline;
      const checkedAt = pingResult.checkedAt;
      const persistedLastSeenAt = config.last_seen_at ? new Date(config.last_seen_at) : null;
      const seenAt = isOnline ? checkedAt : persistedLastSeenAt;

      deviceStatuses.set(addr, { isOnline, lastCheckedAt: checkedAt, lastSeenAt: seenAt });

      // Persist status back to DB so it survives restarts
      await pool.query(
        `UPDATE smart_startup_configs
         SET device_online = $1, last_checked_at = $2, last_seen_at = $3, updated_at = NOW()
         WHERE id = $4`,
        [isOnline, checkedAt, seenAt, config.id]
      );

      // Transition: offline → online → start stack after configurable delay
      if (isOnline && !wasOnline) {
        if (!config.stack_path) {
          logger.warn(
            { addr, stackId: config.target_id },
            'Smart startup: config references missing stack, skipping start'
          );
          continue;
        }

        logger.info(
          { addr, stackId: config.target_id, delay: config.start_delay },
          'Smart startup: trigger device came online — scheduling stack start'
        );
        const status = config.stack_status as string;
        if (status === 'stopped' || status === 'failed') {
          const stackName = String(config.stack_name || config.target_id || 'unknown');
          sendNotification('smartStartupDeviceOnline', {
            address: addr,
            stackId: config.target_id,
            stackName,
            trigger: 'smart-startup',
          }).catch(() => {});
          setTimeout(
            () => startStack(config.target_id, config.stack_path, addr, stackName),
            (config.start_delay ?? 60) * 1000
          );
        } else {
          logger.info({ stackId: config.target_id, status }, 'Smart startup: stack already running, skipping');
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Smart startup monitor error');
  }
}

async function checkStartupOrphans(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const { rows } = await pool.query(
    `SELECT ssc.id, ssc.target_id, ssc.trigger_value, ssc.enabled
     FROM smart_startup_configs ssc
     LEFT JOIN stacks s ON s.id::text = ssc.target_id
     WHERE s.id IS NULL`
  );

  const items = rows.map((row: any) => ({
    configId: row.id as string,
    targetId: row.target_id as string,
    triggerValue: row.trigger_value as string,
    enabled: row.enabled as boolean,
  }));

  startupOrphansSnapshot = {
    checkedAt,
    count: items.length,
    items,
  };

  if (items.length > 0) {
    logger.warn(
      {
        count: items.length,
        orphanConfigIds: items.map((i) => i.configId),
        checkedAt,
      },
      'Smart startup: found orphan configs at startup (target stack missing)'
    );
  }
}

async function startStack(stackId: string, stackPath: string, triggeredBy: string, stackNameHint?: string): Promise<void> {
  try {
    logger.info({ stackId, stackPath, triggeredBy }, 'Smart startup: starting stack');
    await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [stackId]);
    await execFileAsync('docker', ['compose', 'up', '-d'],
      { cwd: stackPath, timeout: 120_000, env: buildComposeCommandEnv() }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [stackId]);
    const { rows: [stackRow] } = await pool.query('SELECT name FROM stacks WHERE id = $1', [stackId]);
    const stackName = String(stackRow?.name || stackNameHint || stackId);
    sendNotification('smartStartupStackStarted', { stackId, stackName, address: triggeredBy, trigger: 'smart-startup' }).catch(() => {});
    logger.info({ stackId }, 'Smart startup: stack started successfully');
  } catch (err: any) {
    await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [stackId]).catch(() => {});
    logger.error({ err, stackId }, 'Smart startup: stack start failed');
  }
}

/** ICMP ping an IP or hostname. Returns true if reachable. */
async function pingDeviceWithLatency(address: string): Promise<{ isOnline: boolean; latencyMs: number }> {
  // Input is already validated by the regex in the Zod schema, double-check here
  if (!/^[a-zA-Z0-9._:-]+$/.test(address)) return { isOnline: false, latencyMs: 0 };

  try {
    const isWindows = process.platform === 'win32';
    const args = isWindows
      ? ['-n', '1', '-w', '1000', address]
      : ['-c', '1', '-W', '2', address];
    const startedAt = Date.now();
    await execFileAsync('ping', args, { timeout: 5000 });
    return { isOnline: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { isOnline: false, latencyMs: 0 };
  }
}
