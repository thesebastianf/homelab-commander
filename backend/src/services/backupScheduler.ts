import cron from 'node-cron';
import { pool } from '../database.js';
import { runBackup } from './backups.js';
import { logger } from '../logger.js';

const scheduledJobs = new Map<string, cron.ScheduledTask>();

export async function initBackupScheduler(): Promise<void> {
  const { rows } = await pool.query(`
    SELECT bc.*, s.name as stack_name
    FROM backup_configs bc
    JOIN stacks s ON s.id = bc.stack_id
    WHERE bc.enabled = true AND bc.cron_schedule IS NOT NULL
  `);

  for (const config of rows) {
    scheduleBackup(config);
  }

  logger.info({ count: rows.length }, 'Backup scheduler initialized');
}

export function scheduleBackup(config: any): void {
  const existing = scheduledJobs.get(config.stack_id);
  if (existing) existing.stop();

  if (!cron.validate(config.cron_schedule)) {
    logger.warn({ stackId: config.stack_id, cron: config.cron_schedule }, 'Invalid cron expression');
    return;
  }

  const task = cron.schedule(config.cron_schedule, async () => {
    logger.info({ stackName: config.stack_name }, 'Running scheduled backup');
    try {
      await runBackup(config.stack_id);
    } catch (err) {
      logger.error({ err, stackName: config.stack_name }, 'Scheduled backup failed');
    }
  });

  scheduledJobs.set(config.stack_id, task);
}

export function unscheduleBackup(stackId: string): void {
  const task = scheduledJobs.get(stackId);
  if (task) {
    task.stop();
    scheduledJobs.delete(stackId);
  }
}

export function rescheduleBackup(config: any): void {
  unscheduleBackup(config.stack_id);
  if (config.enabled && config.cron_schedule) {
    scheduleBackup(config);
  }
}
