import Dockerode from 'dockerode';
import os from 'os';
import { statfs } from 'fs/promises';
import { logger } from '../logger.js';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

// ---- CPU usage sampler ----
// Samples the diff between two os.cpus() snapshots every 15 seconds.
let cachedCpuPercent = 0;
function sampleCpu(): void {
  const cpus1 = os.cpus();
  setTimeout(() => {
    const cpus2 = os.cpus();
    let idle = 0, total = 0;
    for (let i = 0; i < cpus1.length; i++) {
      for (const type of Object.keys(cpus1[i].times) as (keyof os.CpuInfo['times'])[]) {
        const diff = cpus2[i].times[type] - cpus1[i].times[type];
        total += diff;
        if (type === 'idle') idle += diff;
      }
    }
    cachedCpuPercent = total > 0 ? parseFloat((100 - (idle / total) * 100).toFixed(1)) : 0;
  }, 500);
}
sampleCpu();
setInterval(sampleCpu, 15_000);

// ---- Containers ----

export async function listContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.map(mapContainer);
}

export async function getContainer(id: string) {
  const container = docker.getContainer(id);
  const info = await container.inspect();
  return mapContainerInspect(info);
}

export async function startContainer(id: string) {
  await docker.getContainer(id).start();
  logger.info({ id }, 'Container started');
}

export async function stopContainer(id: string) {
  await docker.getContainer(id).stop();
  logger.info({ id }, 'Container stopped');
}

export async function restartContainer(id: string) {
  await docker.getContainer(id).restart();
  logger.info({ id }, 'Container restarted');
}

export async function removeContainer(id: string, force = false) {
  await docker.getContainer(id).remove({ force });
  logger.info({ id, force }, 'Container removed');
}

export async function getContainerLogs(id: string, tail = 100): Promise<string> {
  const container = docker.getContainer(id);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });
  return demuxLogs(logs as any);
}

export async function getContainerStats(id: string) {
  const container = docker.getContainer(id);
  const stats = await container.stats({ stream: false });
  return computeStats(stats);
}

export function streamContainerLogs(id: string, tail = 100) {
  return docker.getContainer(id).logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });
}

export function streamContainerStats(id: string) {
  return docker.getContainer(id).stats({ stream: true });
}

export async function openContainerShell(id: string, cols = 120, rows = 30) {
  const container = docker.getContainer(id);
  const info = await container.inspect();
  if (!info?.State?.Running) {
    throw new Error('Container is not running');
  }

  const exec = await container.exec({
    AttachStdout: true,
    AttachStderr: true,
    AttachStdin: true,
    Tty: true,
    Cmd: ['sh', '-lc', 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'],
    Env: ['TERM=xterm-256color'],
  });

  const stream = await exec.start({
    hijack: true,
    stdin: true,
    Tty: true,
  } as any);

  try {
    await exec.resize({ h: rows, w: cols });
  } catch {
    // Some runtimes do not support resize immediately after start.
  }

  return { exec, stream };
}

export async function resizeContainerShell(exec: any, cols: number, rows: number) {
  await exec.resize({ h: rows, w: cols });
}

// ---- Images ----

export async function listImages() {
  const images = await docker.listImages({ all: false });
  const containers = await docker.listContainers({ all: true });
  const usedImages = new Set(containers.map(c => c.ImageID));

  return images.map(img => ({
    id: img.Id.replace('sha256:', '').slice(0, 12),
    repository: img.RepoTags?.[0]?.split(':')[0] || '<none>',
    tag: img.RepoTags?.[0]?.split(':')[1] || '<none>',
    size: formatBytes(img.Size),
    created: new Date(img.Created * 1000).toISOString(),
    inUse: usedImages.has(img.Id),
  }));
}

export async function pullImage(name: string, tag = 'latest') {
  return new Promise<void>((resolve, reject) => {
    docker.pull(`${name}:${tag}`, (err: any, stream: any) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2: any) => {
        if (err2) reject(err2);
        else resolve();
      });
    });
  });
}

export async function removeImage(id: string, force = false) {
  await docker.getImage(id).remove({ force });
  logger.info({ id }, 'Image removed');
}

// ---- Volumes ----

export async function listVolumes() {
  const { Volumes } = await docker.listVolumes();
  const containers = await docker.listContainers({ all: true });

  return (Volumes || []).map(vol => {
    const usedBy = containers
      .filter(c => c.Mounts?.some(m => m.Name === vol.Name))
      .map(c => c.Names[0]?.replace(/^\//, '') || '');

    return {
      id: vol.Name.slice(0, 12),
      name: vol.Name,
      driver: vol.Driver,
      mountpoint: vol.Mountpoint,
      size: '-',
      containers: usedBy,
    };
  });
}

export async function createVolume(name: string, driver = 'local') {
  const vol = await docker.createVolume({ Name: name, Driver: driver });
  return vol;
}

export async function removeVolume(name: string) {
  await docker.getVolume(name).remove();
  logger.info({ name }, 'Volume removed');
}

export async function inspectVolume(name: string) {
  return docker.getVolume(name).inspect();
}

// ---- Networks ----

export async function listNetworks() {
  const networks = await docker.listNetworks();
  return networks.map(net => ({
    id: net.Id.slice(0, 12),
    name: net.Name,
    driver: net.Driver || '',
    scope: net.Scope || '',
    containers: Object.values(net.Containers || {}).map((c: any) => c.Name || ''),
    subnet: (net as any).IPAM?.Config?.[0]?.Subnet || '',
    gateway: (net as any).IPAM?.Config?.[0]?.Gateway || '',
  }));
}

export async function createNetwork(name: string, driver = 'bridge') {
  const net = await docker.createNetwork({ Name: name, Driver: driver });
  return net;
}

export async function removeNetwork(id: string) {
  await docker.getNetwork(id).remove();
  logger.info({ id }, 'Network removed');
}

export async function inspectNetwork(id: string) {
  return docker.getNetwork(id).inspect();
}

// ---- System ----

export async function getSystemInfo() {
  const info = await docker.info();
  const version = await docker.version();

  // Host memory via os module (reads /proc/meminfo — reflects host on Linux)
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  const memUsedPercent = parseFloat(((memUsed / memTotal) * 100).toFixed(1));

  // Disk via statfs on / (container root — best available without host mount)
  let diskTotal = 0;
  let diskUsedPercent = 0;
  try {
    const st = await statfs('/');
    diskTotal = st.blocks * st.bsize;
    const diskUsed = (st.blocks - st.bfree) * st.bsize;
    diskUsedPercent = parseFloat(((diskUsed / (diskTotal || 1)) * 100).toFixed(1));
  } catch { /* non-critical */ }

  return {
    containers: {
      running: info.ContainersRunning || 0,
      stopped: info.ContainersStopped || 0,
      total: info.Containers || 0,
    },
    images: info.Images || 0,
    dockerVersion: version.Version,
    os: info.OperatingSystem,
    arch: info.Architecture,
    cpus: info.NCPU,
    memory: formatBytes(memTotal),
    memoryTotal: formatBytes(memTotal),
    memoryUsedPercent: memUsedPercent,
    cpuUsedPercent: cachedCpuPercent,
    diskTotal: formatBytes(diskTotal),
    diskUsedPercent,
  };
}

export async function getSystemDf() {
  const df = await docker.df();
  return {
    images: df.Images?.map((i: any) => ({
      id: i.Id?.slice(0, 12),
      size: formatBytes(i.Size || 0),
      shared: formatBytes(i.SharedSize || 0),
    })) || [],
    containers: df.Containers?.map((c: any) => ({
      id: c.Id?.slice(0, 12),
      size: formatBytes(c.SizeRw || 0),
    })) || [],
    volumes: df.Volumes?.map((v: any) => ({
      name: v.Name,
      size: formatBytes(v.UsageData?.Size || 0),
    })) || [],
    buildCache: formatBytes(
      df.BuildCache?.reduce((acc: number, bc: any) => acc + (bc.Size || 0), 0) || 0
    ),
  };
}

export async function pruneSystem() {
  const containers = await docker.pruneContainers();
  const images = await docker.pruneImages();
  const volumes = await docker.pruneVolumes();
  const networks = await docker.pruneNetworks();
  return {
    containers: containers.ContainersDeleted?.length || 0,
    images: images.ImagesDeleted?.length || 0,
    volumes: volumes.VolumesDeleted?.length || 0,
    networks: networks.NetworksDeleted?.length || 0,
    spaceReclaimed: formatBytes(
      (containers.SpaceReclaimed || 0) +
      (images.SpaceReclaimed || 0) +
      (volumes.SpaceReclaimed || 0)
    ),
  };
}

export async function pruneImages() {
  const result = await docker.pruneImages();
  return {
    deleted: result.ImagesDeleted?.length || 0,
    spaceReclaimed: formatBytes(result.SpaceReclaimed || 0),
  };
}

export async function pruneVolumes() {
  const result = await docker.pruneVolumes();
  return {
    deleted: result.VolumesDeleted?.length || 0,
    spaceReclaimed: formatBytes(result.SpaceReclaimed || 0),
  };
}

export async function pruneContainers() {
  const result = await docker.pruneContainers();
  return {
    deleted: result.ContainersDeleted?.length || 0,
    spaceReclaimed: formatBytes(result.SpaceReclaimed || 0),
  };
}

export async function pruneNetworks() {
  const result = await docker.pruneNetworks();
  return {
    deleted: result.NetworksDeleted?.length || 0,
  };
}

export async function ping() {
  await docker.ping();
}

export function getDockerEventStream() {
  return docker.getEvents();
}

export async function listComposeProjects() {
  const containers = await docker.listContainers({ all: true });
  const projects = new Map<string, {
    id: string;
    name: string;
    status: 'running' | 'stopped' | 'failed' | 'deploying';
    services: Set<string>;
    stackPath: string;
    composeFiles: string[];
    ports: number[];
    containerCount: number;
  }>();

  for (const container of containers) {
    const labels = container.Labels || {};
    const projectName = labels['com.docker.compose.project'];
    if (!projectName) continue;

    const serviceName = labels['com.docker.compose.service'] || container.Names?.[0]?.replace(/^\//, '') || 'service';
    const workingDir = labels['com.docker.compose.project.working_dir'] || '';
    const configFiles = (labels['com.docker.compose.project.config_files'] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const existing = projects.get(projectName) ?? {
      id: `external:${projectName}`,
      name: projectName,
      status: 'stopped' as const,
      services: new Set<string>(),
      stackPath: workingDir,
      composeFiles: configFiles,
      ports: [],
      containerCount: 0,
    };

    existing.services.add(serviceName);
    existing.containerCount += 1;
    if (!existing.stackPath && workingDir) existing.stackPath = workingDir;
    if (existing.composeFiles.length === 0 && configFiles.length > 0) existing.composeFiles = configFiles;

    for (const port of container.Ports || []) {
      if (port.PublicPort) {
        existing.ports.push(port.PublicPort);
      }
    }

    const state = (container.State || '').toLowerCase();
    if (state === 'running') {
      existing.status = 'running';
    } else if (existing.status !== 'running' && (state === 'restarting' || state === 'created')) {
      existing.status = 'deploying';
    } else if (existing.status !== 'running' && existing.status !== 'deploying' && (state === 'dead' || state === 'exited')) {
      existing.status = 'failed';
    }

    projects.set(projectName, existing);
  }

  return [...projects.values()]
    .map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      services: project.services.size || project.containerCount,
      version: 0,
      stackPath: project.stackPath,
      composeFiles: project.composeFiles,
      ports: [...new Set(project.ports)].sort((a, b) => a - b),
      external: true,
      managedBy: 'external' as const,
      containerCount: project.containerCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Helpers ----

function mapContainer(c: Dockerode.ContainerInfo) {
  const ports = (c.Ports || []).map(p =>
    p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`
  );

  return {
    id: c.Id.slice(0, 12),
    name: c.Names[0]?.replace(/^\//, '') || '',
    image: c.Image,
    status: mapStatus(c.State),
    state: c.Status || '',
    created: new Date(c.Created * 1000).toISOString(),
    ports,
    restartPolicy: (c as any).HostConfig?.RestartPolicy?.Name || '',
    cpu: 0,
    memory: 0,
    network: { rx: 0, tx: 0 },
  };
}

function mapContainerInspect(info: Dockerode.ContainerInspectInfo) {
  const ports = Object.entries(info.NetworkSettings?.Ports || {}).flatMap(([k, v]) =>
    (v || []).map(binding => `${binding.HostPort}:${k}`)
  );

  return {
    id: info.Id.slice(0, 12),
    name: info.Name?.replace(/^\//, '') || '',
    image: info.Config?.Image || '',
    status: mapStatus(info.State?.Status || ''),
    state: info.State?.Status || '',
    created: info.Created || '',
    ports,
    restartPolicy: info.HostConfig?.RestartPolicy?.Name || 'no',
    cpu: 0,
    memory: 0,
    network: { rx: 0, tx: 0 },
  };
}

function mapStatus(state: string): 'running' | 'stopped' | 'paused' | 'restarting' | 'created' {
  switch (state.toLowerCase()) {
    case 'running': return 'running';
    case 'paused': return 'paused';
    case 'restarting': return 'restarting';
    case 'created': return 'created';
    default: return 'stopped';
  }
}

function computeStats(stats: any) {
  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
    (stats.precpu_stats?.cpu_usage?.total_usage || 0);
  const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) -
    (stats.precpu_stats?.system_cpu_usage || 0);
  const numCpus = stats.cpu_stats?.online_cpus || 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

  const memUsage = stats.memory_stats?.usage || 0;
  const memLimit = stats.memory_stats?.limit || 1;
  const memPercent = (memUsage / memLimit) * 100;

  const networks = stats.networks || {};
  let rxBytes = 0, txBytes = 0;
  for (const net of Object.values(networks) as any[]) {
    rxBytes += net.rx_bytes || 0;
    txBytes += net.tx_bytes || 0;
  }

  return {
    cpu: parseFloat(cpuPercent.toFixed(2)),
    memoryUsage: memUsage,
    memoryLimit: memLimit,
    memoryPercent: parseFloat(memPercent.toFixed(2)),
    networkRx: rxBytes,
    networkTx: txBytes,
  };
}

function demuxLogs(buffer: Buffer | string): string {
  if (typeof buffer === 'string') return buffer;
  const lines: string[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + size > buffer.length) break;
    lines.push(buffer.subarray(offset + 8, offset + 8 + size).toString('utf8'));
    offset += 8 + size;
  }
  return lines.join('');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
