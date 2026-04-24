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

export interface BackupVolumeTarget {
  key: string;
  name: string;
  kind: 'volume' | 'bind';
  source: string;
  containerName: string;
}

interface StackContainerInfo {
  id: string;
  name: string;
  image: string;
  project?: string;
  service?: string;
  mounts: Array<{ type: string; name?: string; source?: string; destination?: string }>;
}

async function listLikelyStackContainers(stackName: string): Promise<StackContainerInfo[]> {
  const containers = await docker.listContainers({ all: true });
  const exact = containers.filter((container) => {
    const project = container.Labels?.['com.docker.compose.project'];
    return Boolean(project && project.toLowerCase() === stackName.toLowerCase());
  });
  if (exact.length > 0) {
    return exact.map((container) => ({
      id: container.Id,
      name: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
      image: container.Image || '',
      project: container.Labels?.['com.docker.compose.project'],
      service: container.Labels?.['com.docker.compose.service'],
      mounts: (container.Mounts || []).map((mount) => ({
        type: String(mount.Type || ''),
        name: mount.Name,
        source: mount.Source,
        destination: mount.Destination,
      })),
    }));
  }

  const normalizedStack = stackName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedProject = containers.filter((container) => {
    const project = container.Labels?.['com.docker.compose.project'];
    if (!project) return false;
    return project.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedStack;
  });

  if (normalizedProject.length > 0) {
    logger.warn({ stackName, matched: normalizedProject.length }, 'Using normalized compose project match for backup target detection');
  } else {
    logger.warn({ stackName }, 'No compose-labeled containers matched stack; refusing loose name fallback for backup safety');
  }

  return normalizedProject.map((container) => ({
    id: container.Id,
    name: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
    image: container.Image || '',
    project: container.Labels?.['com.docker.compose.project'],
    service: container.Labels?.['com.docker.compose.service'],
    mounts: (container.Mounts || []).map((mount) => ({
      type: String(mount.Type || ''),
      name: mount.Name,
      source: mount.Source,
      destination: mount.Destination,
    })),
  }));
}

function sanitizePathToName(input: string): string {
  const cleaned = input.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
  return cleaned || 'item';
}

async function verifyBackupArchive(archivePath: string, opts: { requireStackFolder: boolean; expectedVolumeTargets: number; expectedDatabaseDumps: number }): Promise<{ ok: boolean; checks: Record<string, unknown> }> {
  const checks: Record<string, unknown> = {
    archiveListReadable: false,
    hasStackFolder: false,
    volumeEntries: 0,
    databaseEntries: 0,
  };

  const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  checks.archiveListReadable = true;

  const entries = String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  checks.hasStackFolder = entries.some((entry) => entry === 'STACK/' || entry.startsWith('STACK/'));
  checks.volumeEntries = entries.filter((entry) => entry.startsWith('VOLUMES/')).length;
  checks.databaseEntries = entries.filter((entry) => entry.startsWith('DATABASES/')).length;

  if (opts.requireStackFolder && !checks.hasStackFolder) {
    return { ok: false, checks };
  }
  if (opts.expectedVolumeTargets > 0 && Number(checks.volumeEntries) === 0) {
    return { ok: false, checks };
  }
  if (opts.expectedDatabaseDumps > 0 && Number(checks.databaseEntries) === 0) {
    return { ok: false, checks };
  }

  return { ok: true, checks };
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
    const selectedVolumeTargets = backupConfig.include_volumes
      ? await resolveSelectedVolumeTargets(stack.name, backupConfig)
      : [];
    const selectedVolumeKeys = selectedVolumeTargets.map((target) => target.key);
    const selectedDatabaseNames = backupConfig.include_databases
      ? await resolveSelectedDatabaseNames(stack.name, backupConfig)
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

    // Backup selected volumes/bind mounts into VOLUMES/<target>/
    if (backupConfig.include_volumes && selectedVolumeTargets.length > 0) {
      try {
        const volumeDir = join(stagingDir, 'VOLUMES');
        await mkdir(volumeDir, { recursive: true });
        for (const target of selectedVolumeTargets) {
          const helperName = `hlc-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          try {
            const targetDir = join(volumeDir, `${target.kind}-${sanitizePathToName(target.name)}`);
            await mkdir(targetDir, { recursive: true });

            await execFileAsync('docker', [
              'create',
              '--name', helperName,
              '-v', `${target.source}:/source:ro`,
              'alpine',
              'true',
            ], { timeout: 30000 });
            await execFileAsync('docker', ['cp', `${helperName}:/source/.`, targetDir], {
              timeout: 300000,
              maxBuffer: 512 * 1024 * 1024,
            });
            artifactsCount += 1;
          } catch (err) {
            logger.warn({ err, target }, 'Volume/bind backup failed');
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
      if (databaseBytes > 0 || selectedDatabaseNames.length > 0) {
        artifactsCount += 1;
      }
      if (selectedDatabaseNames.length > 0 && databaseBytes <= 0) {
        throw new Error('Database backup selected but no logical dump file was produced. Use volume backup for unsupported database engines or verify credentials/container health.');
      }
    }

    if (artifactsCount === 0) {
      throw new Error('Backup produced no content. Verify stack path/volumes and backup selection.');
    }

    const manifest = {
      stackId,
      stackName: stack.name,
      timestamp: new Date().toISOString(),
      includes: {
        stackFolder: backupConfig.include_stack_folder,
        volumes: backupConfig.include_volumes,
        selectedVolumeKeys,
        selectedVolumeTargets: selectedVolumeTargets.map((target) => ({ key: target.key, kind: target.kind, source: target.source, name: target.name })),
        databases: backupConfig.include_databases,
        selectedDatabaseNames,
      },
      databaseBytes,
    };
    await writeFile(join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const archiveName = `${stack.name}_backup_${dirTimestamp}.tar.gz`;
    const archivePath = join(backupDir, archiveName);
    await execFileAsync('tar', ['czf', archivePath, '-C', stagingDir, '.'], { timeout: 300000 });
    const archiveStat = await stat(archivePath);
    const totalSize = archiveStat.size;

    const verification = await verifyBackupArchive(archivePath, {
      requireStackFolder: Boolean(backupConfig.include_stack_folder && stack.stack_path),
      expectedVolumeTargets: selectedVolumeTargets.length,
      expectedDatabaseDumps: selectedDatabaseNames.length > 0 ? 1 : 0,
    });
    if (!verification.ok) {
      throw new Error(`Backup archive verification failed: ${JSON.stringify(verification.checks)}`);
    }

    // Write manifest alongside archive for quick inspection
    const completedManifest = { ...manifest, archive: archiveName, totalSize, verification };
    await writeFile(join(backupDir, 'manifest.json'), JSON.stringify(completedManifest, null, 2));
    await rm(stagingDir, { recursive: true, force: true });

    await pool.query(
      `UPDATE backup_jobs SET status = 'completed', size_bytes = $1, completed_at = NOW()
       , includes = $2
       WHERE id = $3`,
      [
        totalSize,
        JSON.stringify({
          stackFolder: backupConfig.include_stack_folder,
          volumes: backupConfig.include_volumes,
          databases: backupConfig.include_databases,
          selectedVolumeKeys,
          selectedDatabaseNames,
          verification,
        }),
        job.id,
      ]
    );

    await sendNotification('backupCompleted', {
      stackName: stack.name,
      sizeBytes: totalSize,
      archive: archiveName,
      verification,
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

async function resolveSelectedVolumeTargets(stackName: string, backupConfig: any): Promise<BackupVolumeTarget[]> {
  const detected = await detectStackVolumeTargets(stackName);
  const requested = Array.isArray(backupConfig.database_config?.volumeNames)
    ? backupConfig.database_config.volumeNames
    : [];

  if (requested.length === 0) {
    return detected;
  }

  const selected = new Set(requested.map((entry: string) => String(entry)));
  return detected.filter((target) => selected.has(target.key) || selected.has(target.name) || selected.has(target.source));
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
    .filter((db) => selected.has(db.key) || selected.has(db.serviceName))
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
  const targets = await detectStackVolumeTargets(stackName);
  return targets.map((target) => target.key).sort((a, b) => a.localeCompare(b));
}

export async function detectStackVolumeTargets(stackName: string): Promise<BackupVolumeTarget[]> {
  const containers = await listLikelyStackContainers(stackName);
  const dedup = new Map<string, BackupVolumeTarget>();

  for (const container of containers) {
    for (const mount of container.mounts) {
      const mountType = mount.type.toLowerCase();
      if (mountType === 'volume' && mount.name) {
        const key = `volume:${mount.name}`;
        if (!dedup.has(key)) {
          dedup.set(key, {
            key,
            name: mount.name,
            kind: 'volume',
            source: mount.name,
            containerName: container.name,
          });
        }
      } else if (mountType === 'bind' && mount.source) {
        const key = `bind:${mount.source}`;
        if (!dedup.has(key)) {
          dedup.set(key, {
            key,
            name: mount.source,
            kind: 'bind',
            source: mount.source,
            containerName: container.name,
          });
        }
      }
    }
  }

  const result = [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (result.length === 0) {
    logger.warn({ stackName, candidateContainers: containers.length }, 'No backup mount targets detected for stack');
  } else {
    logger.debug({ stackName, containerCount: containers.length, targetCount: result.length }, 'Detected backup mount targets');
  }
  return result;
}

export interface DatabaseInfo {
  key: string;
  serviceName: string;
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb';
  containerName: string;
}

export async function detectStackDatabaseNames(stackName: string): Promise<DatabaseInfo[]> {
  const containers = await listLikelyStackContainers(stackName);
  const databases: DatabaseInfo[] = [];
  const seen = new Set<string>();
  let matchedContainers = 0;
  let dbTypesFound = 0;

  for (const container of containers) {
    matchedContainers++;
    const image = container.image || '';
    const type = inferDatabaseType(image);
    if (!type) {
      logger.debug({ image, containerName: container.name }, 'Container image does not match any database type');
      continue;
    }

    dbTypesFound++;
    const serviceName = container.service || container.name || container.id.slice(0, 12);
    
    if (!seen.has(serviceName)) {
      seen.add(serviceName);
      databases.push({
        key: `${serviceName}:${container.id}`,
        serviceName,
        type,
        containerName: container.name || container.id.slice(0, 12),
      });
    }
  }

  if (matchedContainers === 0) {
    logger.warn({ stackName, containerCount: containers.length }, 'No containers found for stack with any detection method');
  } else {
    logger.debug({ stackName, matchedContainers, dbTypesFound, databaseCount: databases.length }, 'Detected stack databases');
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
      const extension = target.type === 'mongodb'
        ? '.archive.gz'
        : target.type === 'redis'
          ? '.rdb.gz'
          : target.type === 'influxdb'
            ? '.influx-backup.tgz'
            : '.sql.gz';
      const archiveName = `${stack.name}_db-${target.serviceName}_${dirTimestamp}${extension}`;
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
  const containers = await listLikelyStackContainers(stackName);
  const selectedNames = await resolveSelectedDatabaseNames(stackName, backupConfig);
  const selectedSet = new Set(selectedNames.map((name: string) => String(name)));

  const detected = containers
    .map((container) => {
      const type = inferDatabaseType(container.image || '');
      if (!type) return null;
      const serviceName = container.service || container.name || container.id.slice(0, 12);
      return {
        type,
        serviceName,
        containerName: container.name || container.id.slice(0, 12),
        containerId: container.id,
        databaseName: backupConfig.database_config?.databaseName,
      } as DatabaseTarget;
    })
    .filter((target): target is DatabaseTarget => Boolean(target));

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
      return dumpRedis(target);
    case 'influxdb':
      return dumpInflux(target);
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

async function dumpRedis(target: DatabaseTarget): Promise<Buffer> {
  const tmp = `/tmp/hlc-redis-${Date.now()}.rdb`;
  const command = `set -e; redis-cli --rdb ${shellEscape(tmp)} >/dev/null 2>&1 || true; if [ -f ${shellEscape(tmp)} ]; then cat ${shellEscape(tmp)}; rm -f ${shellEscape(tmp)}; elif [ -f /data/dump.rdb ]; then cat /data/dump.rdb; else exit 1; fi`;
  const { stdout } = await execFileAsync('docker', ['exec', target.containerName, 'sh', '-lc', `${command} | gzip -c`], {
    encoding: 'buffer' as BufferEncoding,
    maxBuffer: 256 * 1024 * 1024,
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

async function dumpInflux(target: DatabaseTarget): Promise<Buffer> {
  const tmpDir = `/tmp/hlc-influx-${Date.now()}`;
  const command = `set -e; mkdir -p ${shellEscape(tmpDir)}; influxd backup -portable ${shellEscape(tmpDir)} >/dev/null 2>&1; tar czf - -C ${shellEscape(tmpDir)} .; rm -rf ${shellEscape(tmpDir)}`;
  const { stdout } = await execFileAsync('docker', ['exec', target.containerName, 'sh', '-lc', command], {
    encoding: 'buffer' as BufferEncoding,
    maxBuffer: 512 * 1024 * 1024,
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
