import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import Dockerode from 'dockerode';
import { pool } from '../database.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { sendNotification } from './notifications.js';

const execFileAsync = promisify(execFile);
const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

interface DatabaseTarget {
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb';
  serviceName: string;
  containerName: string;
  containerId: string;
  databaseName?: string;
}

export async function runBackup(stackId: string): Promise<void> {
  const { rows: [stack] } = await pool.query('SELECT * FROM stacks WHERE id = $1', [stackId]);
  if (!stack) throw new Error(`Stack ${stackId} not found`);

  const { rows: [backupConfigRow] } = await pool.query(
    'SELECT * FROM backup_configs WHERE stack_id = $1', [stackId]
  );
  const backupConfig = backupConfigRow || {
    include_stack_folder: true,
    include_volumes: true,
    include_databases: false,
    database_type: 'none',
    database_config: {},
    retention_days: 7,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 17);
  const dirTimestamp = timestamp.replace(/-/g, '').replace('_', '-');
  const backupDir = join(config.backupsPath, `${stack.name}_${dirTimestamp}`);
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

    // Backup stack folder — named: stackname_stack_YYYYMMDD-HHmmss.tar.gz
    if (backupConfig.include_stack_folder && stack.stack_path) {
      try {
        const archivePath = join(backupDir, `${stack.name}_stack_${dirTimestamp}.tar.gz`);
        await execFileAsync('tar', ['czf', archivePath, '-C', stack.stack_path, '.', '--exclude=.git'], { timeout: 120000 });
        const s = await stat(archivePath);
        totalSize += s.size;
      } catch (err) {
        logger.warn({ err, stackId }, 'Stack folder backup failed (may not exist yet)');
      }
    }

    // Backup volumes — named: stackname_vol-volname_YYYYMMDD-HHmmss.tar.gz
    if (backupConfig.include_volumes) {
      try {
        const stackVolumes = await detectStackVolumeNames(stack.name);

        for (const vol of stackVolumes) {
          try {
            const archiveName = `${stack.name}_vol-${vol}_${dirTimestamp}.tar.gz`;
            await execFileAsync('docker', [
              'run', '--rm',
              '-v', `${vol}:/source:ro`,
              '-v', `${backupDir}:/backup`,
              'alpine',
              'tar', 'czf', `/backup/${archiveName}`, '-C', '/source', '.',
            ], { timeout: 300000 });
            const s = await stat(join(backupDir, archiveName));
            totalSize += s.size;
          } catch (err) {
            logger.warn({ err, volume: vol }, 'Volume backup failed');
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Volume backup failed');
      }
    }

    if (backupConfig.include_databases) {
      totalSize += await backupDatabaseTargets(stack, backupConfig, backupDir, dirTimestamp);
    }

    // Write manifest
    const manifest = {
      stackId,
      stackName: stack.name,
      timestamp: new Date().toISOString(),
      namingConvention: `${stack.name}_{type}_{timestamp}.tar.gz`,
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
  const backupDir = config.backupsPath || configPath();
  try {
    const entries = await readdir(backupDir);
    const relevantEntries = entries.filter((entry) => entry.startsWith(`${stackName}_`));
    if (relevantEntries.length <= 1) return;

    // Simple retention: delete folders older than retention_days
    const cutoff = Date.now() - (config.retention_days || 7) * 24 * 60 * 60 * 1000;
    for (const entry of relevantEntries) {
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

async function detectStackVolumeNames(stackName: string): Promise<string[]> {
  const containers = await docker.listContainers({ all: true });
  const volumeNames = new Set<string>();

  for (const container of containers) {
    const project = container.Labels?.['com.docker.compose.project'];
    if (!project || project.toLowerCase() !== stackName.toLowerCase()) continue;

    for (const mount of container.Mounts || []) {
      if (mount.Type === 'volume' && mount.Name) {
        volumeNames.add(mount.Name);
      }
    }
  }

  return [...volumeNames].sort((a, b) => a.localeCompare(b));
}

async function backupDatabaseTargets(stack: any, backupConfig: any, backupDir: string, dirTimestamp: string): Promise<number> {
  const targets = await detectDatabaseTargets(stack.name, backupConfig);
  if (targets.length === 0) {
    logger.info({ stack: stack.name }, 'No running database targets detected for logical backup');
    return 0;
  }

  let totalSize = 0;
  for (const target of targets) {
    try {
      const archiveName = `${stack.name}_db-${target.serviceName}_${dirTimestamp}${target.type === 'mongodb' ? '.archive.gz' : '.sql.gz'}`;
      const archivePath = join(backupDir, archiveName);
      const dumpBuffer = await createDatabaseDump(target);
      if (!dumpBuffer) continue;
      await writeFile(archivePath, dumpBuffer);
      const s = await stat(archivePath);
      totalSize += s.size;
    } catch (err) {
      logger.warn({ err, target }, 'Database dump failed for target');
    }
  }

  return totalSize;
}

async function detectDatabaseTargets(stackName: string, backupConfig: any): Promise<DatabaseTarget[]> {
  const requestedTargets = Array.isArray(backupConfig.database_config?.targets)
    ? backupConfig.database_config.targets
    : [];
  const forcedType = backupConfig.database_type && backupConfig.database_type !== 'auto' && backupConfig.database_type !== 'none'
    ? backupConfig.database_type
    : null;

  const containers = await docker.listContainers({ all: true });
  const detected = containers
    .filter((container) => {
      const project = container.Labels?.['com.docker.compose.project'];
      return project && project.toLowerCase() === stackName.toLowerCase();
    })
    .map((container) => {
      const image = container.Image || '';
      const type = inferDatabaseType(image);
      if (!type) return null;
      return {
        type,
        serviceName: container.Labels?.['com.docker.compose.service'] || container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
        containerName: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
        containerId: container.Id,
        databaseName: requestedTargets.find((target: any) => target.serviceName === container.Labels?.['com.docker.compose.service'])?.databaseName,
      } as DatabaseTarget;
    })
    .filter((target): target is DatabaseTarget => Boolean(target));

  return detected.filter((target) => {
    if (forcedType && target.type !== forcedType) return false;
    if (requestedTargets.length === 0) return true;
    return requestedTargets.some((requested: any) =>
      (requested.serviceName && requested.serviceName === target.serviceName) ||
      (requested.containerName && requested.containerName === target.containerName)
    );
  });
}

function inferDatabaseType(image: string): DatabaseTarget['type'] | null {
  const normalized = image.toLowerCase();
  if (normalized.includes('postgres')) return 'postgresql';
  if (normalized.includes('mariadb') || normalized.includes('mysql')) return 'mysql';
  if (normalized.includes('mongo')) return 'mongodb';
  if (normalized.includes('redis')) return 'redis';
  if (normalized.includes('influxdb')) return 'influxdb';
  return null;
}

async function createDatabaseDump(target: DatabaseTarget): Promise<Buffer | null> {
  switch (target.type) {
    case 'postgresql':
      return dumpPostgres(target);
    case 'mysql':
      return dumpMysql(target);
    case 'mongodb':
      return dumpMongo(target);
    case 'redis':
    case 'influxdb':
      logger.warn({ target }, 'Logical dump not implemented for this database type yet; rely on volume backup');
      return null;
    default:
      return null;
  }
}

async function dumpPostgres(target: DatabaseTarget): Promise<Buffer> {
  const env = await inspectContainerEnv(target.containerId);
  const user = env.POSTGRES_USER || env.POSTGRES_USERNAME || env.PGUSER || 'postgres';
  const password = env.POSTGRES_PASSWORD || env.PGPASSWORD || '';
  const database = target.databaseName || env.POSTGRES_DB || '';
  const command = database
    ? `export PGPASSWORD=${shellEscape(password)}; pg_dump -U ${shellEscape(user)} ${shellEscape(database)}`
    : `export PGPASSWORD=${shellEscape(password)}; pg_dumpall -U ${shellEscape(user)}`;

  const { stdout } = await execFileAsync('docker', ['exec', target.containerName, 'sh', '-lc', `${command} | gzip -c`], {
    encoding: 'buffer' as BufferEncoding,
    maxBuffer: 256 * 1024 * 1024,
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

async function dumpMysql(target: DatabaseTarget): Promise<Buffer> {
  const env = await inspectContainerEnv(target.containerId);
  const user = env.MYSQL_USER || env.MARIADB_USER || env.MYSQL_ROOT_USER || 'root';
  const password = env.MYSQL_PASSWORD || env.MARIADB_PASSWORD || env.MYSQL_ROOT_PASSWORD || env.MARIADB_ROOT_PASSWORD || '';
  const database = target.databaseName || '';
  const scope = database ? shellEscape(database) : '--all-databases';
  const command = `mysqldump -u${shellEscape(user)} -p${shellEscape(password)} ${scope} | gzip -c`;

  const { stdout } = await execFileAsync('docker', ['exec', target.containerName, 'sh', '-lc', command], {
    encoding: 'buffer' as BufferEncoding,
    maxBuffer: 256 * 1024 * 1024,
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

async function dumpMongo(target: DatabaseTarget): Promise<Buffer> {
  const env = await inspectContainerEnv(target.containerId);
  const username = env.MONGO_INITDB_ROOT_USERNAME || '';
  const password = env.MONGO_INITDB_ROOT_PASSWORD || '';
  const database = target.databaseName || env.MONGO_INITDB_DATABASE || '';
  const auth = username && password
    ? ` --username ${shellEscape(username)} --password ${shellEscape(password)} --authenticationDatabase admin`
    : '';
  const dbArg = database ? ` --db ${shellEscape(database)}` : '';
  const command = `mongodump --archive --gzip${auth}${dbArg}`;

  const { stdout } = await execFileAsync('docker', ['exec', target.containerName, 'sh', '-lc', command], {
    encoding: 'buffer' as BufferEncoding,
    maxBuffer: 256 * 1024 * 1024,
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

async function inspectContainerEnv(containerId: string): Promise<Record<string, string>> {
  const info = await docker.getContainer(containerId).inspect();
  return Object.fromEntries(
    (info.Config?.Env || [])
      .map((entry) => {
        const idx = entry.indexOf('=');
        return idx >= 0 ? [entry.slice(0, idx), entry.slice(idx + 1)] : [entry, ''];
      })
  );
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function configPath(): string {
  return config.backupsPath || '/data/backups';
}
