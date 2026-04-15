import { execFile } from 'child_process';
import { promisify } from 'util';
import { pool } from '../database.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);
const POLL_INTERVAL = 30_000;
const deviceStates = new Map<string, boolean>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function initSmartStartup(): Promise<void> {
  intervalHandle = setInterval(monitorDevices, POLL_INTERVAL);
  logger.info('Smart startup monitor initialized');
}

async function monitorDevices(): Promise<void> {
  try {
    const { rows: configs } = await pool.query(
      'SELECT * FROM smart_startup_configs WHERE enabled = true'
    );

    for (const config of configs) {
      const wasOnline = deviceStates.get(config.trigger_value) || false;
      const isOnline = await checkDevice(config.trigger_value);
      deviceStates.set(config.trigger_value, isOnline);

      if (isOnline && !wasOnline && config.auto_start) {
        logger.info(
          { triggerValue: config.trigger_value, targetType: config.target_type, targetId: config.target_id },
          'Trigger device came online, scheduling auto-start'
        );

        setTimeout(async () => {
          try {
            const { startContainer } = await import('./docker.js');
            if (config.target_type === 'container') {
              await startContainer(config.target_id);
            } else if (config.target_type === 'stack') {
              // Stack start would use docker compose — deferred to when stacks service exists
              logger.info({ targetId: config.target_id }, 'Smart startup: stack start triggered');
            }
          } catch (err) {
            logger.error({ err, targetId: config.target_id }, 'Smart startup failed');
          }
        }, (config.start_delay || 30) * 1000);
      }
    }
  } catch (err) {
    logger.error({ err }, 'Smart startup monitor error');
  }
}

async function checkDevice(value: string): Promise<boolean> {
  // Validate to prevent command injection
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) return false;

  try {
    // Use ping with timeout
    const isWindows = process.platform === 'win32';
    const args = isWindows
      ? ['-n', '1', '-w', '2000', value]
      : ['-c', '1', '-W', '2', value];

    await execFileAsync('ping', args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
