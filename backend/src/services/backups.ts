import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { createGzip } from 'zlib';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { pool } from '../database.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { sendNotification } from './notifications.js';

const execFileAsync = promisify(execFile);

export async function runBackup(stackId: string): Promise<void> {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [stackId]);
  if (!stack) throw new Error(`Stack ${stackId} not found`);

  const { rows: [backupConfig] } = await pool.query(
    'SELECT * FROM backup_configs WHERE stack_id = $1', [stackId]
  );
  if (!backupConfig) throw new Error(`No backup config for stack ${stackId}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(config.backupsPath, stack.name, timestamp);
  await mkdir(backupDir, { recursive: true });

  // Create job record
  const { rows: [job] } = await pool.query(
    `INSERT INTO backup_jobs (stack_id, status, backup_path, includes)
     VALUES ($1, 'in-progress', $2, $3) RETURNING *`,
    [stackId, backupDir, JSON.stringify({
      stackFolder: backupConfig.include_stack_folder,
      volumes: backupConfig.include_volumes,
      databases: backupConfig.include_databases,
    })]
  );

  try {
    let totalSize = 0;

    // Backup stack folder
    if (backupConfig.include_stack_folder && stack.stack_path) {
      try {
        const archivePath = join(backupDir, 'stack-files.tar.gz');
        await execFileAsync('tar', ['czf', archivePath, '-C', stack.stack_path, '.'], { timeout: 120000 });
        const s = await stat(archivePath);
        totalSize += s.size;
      } catch (err) {
        logger.warn({ err, stackId }, 'Stack folder backup failed (may not exist yet)');
      }
    }

    // Backup volumes
    if (backupConfig.include_volumes) {
      try {
        const { listVolumes } = await import('./docker.js');
        const volumes = await listVolumes();
        const stackVolumes = volumes.filter(v =>
          v.containers.some(c => c.toLowerCase().includes(stack.name.toLowerCase()))
        );

        for (const vol of stackVolumes) {
          try {
            const archiveName = `vol-${vol.name}.tar.gz`;
            await execFileAsync('docker', [
              'run', '--rm',
              '-v', `${vol.name}:/source:ro`,
              '-v', `${backupDir}:/backup`,
              'alpine',
              'tar', 'czf', `/backup/${archiveName}`, '-C', '/source', '.',
            ], { timeout: 300000 });
            const s = await stat(join(backupDir, archiveName));
            totalSize += s.size;
          } catch (err) {
            logger.warn({ err, volume: vol.name }, 'Volume backup failed');
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Volume backup failed');
      }
    }

    // Write manifest
    const manifest = {
      stackId,
      stackName: stack.name,
      timestamp: new Date().toISOString(),
      includes: {
        stackFolder: backupConfig.include_stack_folder,
        volumes: backupConfig.include_volumes,
        databases: backupConfig.include_databases,
      },
      totalSize,
    };
    await writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    await pool.query(
      `UPDATE backup_jobs SET status = 'completed', size_bytes = $1, completed_at = NOW()
       WHERE id = $2`,
      [totalSize, job.id]
    );

    await sendNotification('backupCompleted', { stack: stack.name, size: `${(totalSize / 1024 / 1024).toFixed(1)} MB` });
    await enforceRetention(stack.name, backupConfig);
    logger.info({ stackId, backupDir, totalSize }, 'Backup completed');
  } catch (err) {
    await pool.query(
      `UPDATE backup_jobs SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [(err as Error).message, job.id]
    );
    await sendNotification('backupFailed', { stack: stack.name, error: (err as Error).message });
    logger.error({ err, stackId }, 'Backup failed');
    throw err;
  }
}

async function enforceRetention(stackName: string, config: any): Promise<void> {
  const backupDir = join(config.backups_base_path || '/data/backups', stackName);
  try {
    const entries = await readdir(backupDir);
    if (entries.length <= 1) return;

    // Simple retention: delete folders older than retention_days
    const cutoff = Date.now() - (config.retention_days || 7) * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      try {
        const s = await stat(join(backupDir, entry));
        if (s.mtimeMs < cutoff) {
          await rm(join(backupDir, entry), { recursive: true });
          logger.info({ backupDir, entry }, 'Old backup removed by retention policy');
        }
      } catch { /* skip */ }
    }
  } catch { /* directory may not exist */ }
}
