import { execFile } from 'child_process';
import { promisify } from 'util';
import { pool } from '../database.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

/** In-memory device status cache (keyed by trigger_value / IP or hostname) */
interface DeviceStatus {
  isOnline: boolean;
  lastCheckedAt: Date | null;
  lastSeenAt: Date | null;
}

const deviceStatuses = new Map<string, DeviceStatus>();
let pollerHandle: ReturnType<typeof setInterval> | null = null;

/** Called at backend startup */
export async function initSmartStartup(): Promise<void> {
  // Run immediately, then every 10 s to re-evaluate per-config intervals
  await monitorDevices();
  pollerHandle = setInterval(monitorDevices, 10_000);
  logger.info('Smart startup monitor initialized');
}

/** Called by the route to expose current device statuses */
export function getDeviceStatuses(): Record<string, DeviceStatus> {
  return Object.fromEntries(deviceStatuses);
}

// Track the last real check time per config to honour per-config monitor_interval
const lastChecked = new Map<string, number>();

async function monitorDevices(): Promise<void> {
  try {
    const { rows: configs } = await pool.query(
      `SELECT ssc.*, s.stack_path, s.status AS stack_status
       FROM smart_startup_configs ssc
       JOIN stacks s ON ssc.target_id = s.id
       WHERE ssc.enabled = true`
    );

    const now = Date.now();

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

      const prev = deviceStatuses.get(addr);
      const wasOnline = prev?.isOnline ?? false;

      const isOnline = await pingDevice(addr);
      const checkedAt = new Date();
      const seenAt = isOnline ? checkedAt : (prev?.lastSeenAt ?? null);

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
        logger.info(
          { addr, stackId: config.target_id, delay: config.start_delay },
          'Smart startup: trigger device came online — scheduling stack start'
        );
        const status = config.stack_status as string;
        if (status === 'stopped' || status === 'failed') {
          setTimeout(
            () => startStack(config.target_id, config.stack_path, addr),
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

async function startStack(stackId: string, stackPath: string, triggeredBy: string): Promise<void> {
  try {
    logger.info({ stackId, stackPath, triggeredBy }, 'Smart startup: starting stack');
    await pool.query("UPDATE stacks SET status = 'deploying', updated_at = NOW() WHERE id = $1", [stackId]);
    await execFileAsync('docker', ['compose', '-f', `${stackPath}/docker-compose.yml`, 'up', '-d'],
      { cwd: stackPath, timeout: 120_000 }
    );
    await pool.query("UPDATE stacks SET status = 'running', updated_at = NOW() WHERE id = $1", [stackId]);
    logger.info({ stackId }, 'Smart startup: stack started successfully');
  } catch (err: any) {
    await pool.query("UPDATE stacks SET status = 'failed', updated_at = NOW() WHERE id = $1", [stackId]).catch(() => {});
    logger.error({ err, stackId }, 'Smart startup: stack start failed');
  }
}

/** ICMP ping an IP or hostname. Returns true if reachable. */
async function pingDevice(address: string): Promise<boolean> {
  // Input is already validated by the regex in the Zod schema, double-check here
  if (!/^[a-zA-Z0-9._:-]+$/.test(address)) return false;

  try {
    const isWindows = process.platform === 'win32';
    const args = isWindows
      ? ['-n', '1', '-w', '1000', address]
      : ['-c', '1', '-W', '2', address];
    await execFileAsync('ping', args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
