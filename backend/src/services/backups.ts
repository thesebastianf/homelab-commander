import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, readdir, rm, stat, cp } from 'fs/promises';
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
  const stagingDir = join(backupDir, 'staging');
  await mkdir(backupDir, { recursive: true });
  await mkdir(stagingDir, { recursive: true });

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
    let artifactsCount = 0;
    const selectedVolumes = backupConfig.include_volumes
      ? await resolveSelectedVolumeNames(stack.name, backupConfig)
      : [];

    // Backup stack folder into STACK/
    if (backupConfig.include_stack_folder && stack.stack_path) {
      try {
        const stackTarget = join(stagingDir, 'STACK');
        await mkdir(stackTarget, { recursive: true });
        await cp(stack.stack_path, stackTarget, {
          recursive: true,
          filter: (source) => !source.split('/').includes('.git'),
        });
        artifactsCount += 1;
      } catch (err) {
        logger.warn({ err, stackId }, 'Stack folder backup failed (may not exist yet)');
      }
    }

    // Backup selected volumes into VOLUMES/<volume>.tar.gz
    if (backupConfig.include_volumes && selectedVolumes.length > 0) {
      try {
        const volumeDir = join(stagingDir, 'VOLUMES');
        await mkdir(volumeDir, { recursive: true });
        for (const vol of selectedVolumes) {
          const helperName = `hlc-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          try {
            const targetDir = join(volumeDir, vol);
            await mkdir(targetDir, { recursive: true });

            await execFileAsync('docker', [
              'create',
              '--name', helperName,
              '-v', `${vol}:/source:ro`,
              'alpine',
              'true',
            ], { timeout: 30000 });
            await execFileAsync('docker', ['cp', `${helperName}:/source/.`, targetDir], {
              timeout: 300000,
              maxBuffer: 512 * 1024 * 1024,
            });
            artifactsCount += 1;
          } catch (err) {
            logger.warn({ err, volume: vol }, 'Volume backup failed');
          } finally {
            await execFileAsync('docker', ['rm', '-f', helperName], { timeout: 30000 }).catch(() => {});
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Volume backup failed');
      }
    }

    let databaseBytes = 0;
    if (backupConfig.include_databases) {
      const dbDir = join(stagingDir, 'DATABASES');
      await mkdir(dbDir, { recursive: true });
      databaseBytes = await backupDatabaseTargets(stack, backupConfig, dbDir, dirTimestamp);
      if (databaseBytes > 0) {
        artifactsCount += 1;
      }
    }

    if (artifactsCount === 0) {
      throw new Error('Backup produced no content. Verify stack path/volumes and backup selection.');
    }

    const archiveName = `${stack.name}_backup_${dirTimestamp}.tar.gz`;
    const archivePath = join(backupDir, archiveName);
    await execFileAsync('tar', ['czf', archivePath, '-C', stagingDir, '.'], { timeout: 300000 });
    const archiveStat = await stat(archivePath);
    const totalSize = archiveStat.size;

    // Write manifest
    const manifest = {
      stackId,
      stackName: stack.name,
      timestamp: new Date().toISOString(),
      archive: archiveName,
      includes: {
        stackFolder: backupConfig.include_stack_folder,
        volumes: backupConfig.include_volumes,
        selectedVolumes,
        databases: backupConfig.include_databases,
      },
      databaseBytes,
      totalSize,
    };
    await writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await rm(stagingDir, { recursive: true, force: true });

    await pool.query(
      `UPDATE backup_jobs SET status = 'completed', size_bytes = $1, completed_at = NOW()
       WHERE id = $2`,
      [totalSize, job.id]
    );

    await sendNotification('backupCompleted', {
      stackName: stack.name,
      sizeBytes: totalSize,
      archive: archiveName,
    });
    await enforceRetention(stack.name, backupConfig);
    logger.info({ stackId, backupDir, totalSize }, 'Backup completed');
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
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

async function resolveSelectedVolumeNames(stackName: string, backupConfig: any): Promise<string[]> {
  const detected = await detectStackVolumeNames(stackName);
  const requested = Array.isArray(backupConfig.database_config?.volumeNames)
    ? backupConfig.database_config.volumeNames
    : [];

  if (requested.length === 0) {
    return detected;
  }

  const selected = new Set(requested.map((entry: string) => String(entry)));
  return detected.filter((name) => selected.has(name));
}

async function resolveSelectedDatabaseNames(stackName: string, backupConfig: any): Promise<string[]> {
  const detected = await detectStackDatabaseNames(stackName);
  const requested = Array.isArray(backupConfig.database_config?.databaseNames)
    ? backupConfig.database_config.databaseNames
    : [];

  if (requested.length === 0) {
    return detected.map(db => db.serviceName);
  }

  const selected = new Set(requested.map((entry: string) => String(entry)));
  return detected
    .filter((db) => selected.has(db.serviceName))
    .map(db => db.serviceName);
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

export async function detectStackVolumeNames(stackName: string): Promise<string[]> {
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

export interface DatabaseInfo {
  serviceName: string;
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb';
  containerName: string;
}

export async function detectStackDatabaseNames(stackName: string): Promise<DatabaseInfo[]> {
  const containers = await docker.listContainers({ all: true });
  const databases: DatabaseInfo[] = [];
  const seen = new Set<string>();

  for (const container of containers) {
    const project = container.Labels?.['com.docker.compose.project'];
    if (!project || project.toLowerCase() !== stackName.toLowerCase()) continue;

    const image = container.Image || '';
    const type = inferDatabaseType(image);
    if (!type) continue;

    const serviceName = container.Labels?.['com.docker.compose.service'] || container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12);
    
    if (!seen.has(serviceName)) {
      seen.add(serviceName);
      databases.push({
        serviceName,
        type,
        containerName: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
      });
    }
  }

  return databases.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
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
        databaseName: undefined,
      } as DatabaseTarget;
    })
    .filter((target): target is DatabaseTarget => Boolean(target));

  // Get selected database names; if none specified, use all detected
  const selectedNames = await resolveSelectedDatabaseNames(stackName, backupConfig);
  const selectedSet = new Set(selectedNames.map((name: string) => String(name)));

  return detected.filter((target) => {
    if (forcedType && target.type !== forcedType) return false;
    return selectedSet.has(target.serviceName);
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
