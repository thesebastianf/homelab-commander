import type {
  Container, Image, Stack, Volume, Network, SystemInfo,
  AppSettings, NotificationService, BackupConfig, BackupJob,
  PortReservation, SmartStartupConfig, ContainerStats,
} from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ---- Containers ----

export async function fetchContainers(): Promise<Container[]> {
  return request('/containers');
}

export async function fetchContainer(id: string): Promise<Container> {
  return request(`/containers/${encodeURIComponent(id)}`);
}

export async function fetchContainerStats(id: string): Promise<ContainerStats> {
  return request(`/containers/${encodeURIComponent(id)}/stats`);
}

export async function fetchContainerLogs(id: string, tail = 100): Promise<string> {
  const data = await request<{ logs: string }>(`/containers/${encodeURIComponent(id)}/logs?tail=${tail}`);
  return data.logs;
}

export async function startContainer(id: string): Promise<void> {
  await request(`/containers/${encodeURIComponent(id)}/start`, { method: 'POST' });
}

export async function stopContainer(id: string): Promise<void> {
  await request(`/containers/${encodeURIComponent(id)}/stop`, { method: 'POST' });
}

export async function restartContainer(id: string): Promise<void> {
  await request(`/containers/${encodeURIComponent(id)}/restart`, { method: 'POST' });
}

export async function removeContainer(id: string, force = false): Promise<void> {
  await request(`/containers/${encodeURIComponent(id)}?force=${force}`, { method: 'DELETE' });
}

// ---- Images ----

export async function fetchImages(): Promise<Image[]> {
  return request('/images');
}

export async function pullImage(name: string, tag = 'latest'): Promise<void> {
  await request('/images/pull', { method: 'POST', body: JSON.stringify({ name, tag }) });
}

export async function removeImage(id: string, force = false): Promise<void> {
  await request(`/images/${encodeURIComponent(id)}?force=${force}`, { method: 'DELETE' });
}

// ---- Volumes ----

export async function fetchVolumes(): Promise<Volume[]> {
  return request('/volumes');
}

export async function createVolume(name: string, driver = 'local'): Promise<void> {
  await request('/volumes', { method: 'POST', body: JSON.stringify({ name, driver }) });
}

export async function removeVolume(name: string): Promise<void> {
  await request(`/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ---- Networks ----

export async function fetchNetworks(): Promise<Network[]> {
  return request('/networks');
}

export async function createNetwork(name: string, driver = 'bridge'): Promise<void> {
  await request('/networks', { method: 'POST', body: JSON.stringify({ name, driver }) });
}

export async function removeNetwork(id: string): Promise<void> {
  await request(`/networks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---- System ----

export async function fetchSystemInfo(): Promise<SystemInfo> {
  return request('/system/info');
}

export async function pruneSystem(): Promise<any> {
  return request('/system/prune', { method: 'POST' });
}

export async function pruneImages(): Promise<any> {
  return request('/system/prune/images', { method: 'POST' });
}

export async function pruneVolumes(): Promise<any> {
  return request('/system/prune/volumes', { method: 'POST' });
}

export async function pruneContainers(): Promise<any> {
  return request('/system/prune/containers', { method: 'POST' });
}

export async function fetchSystemDf(): Promise<any> {
  return request('/system/df');
}

// ---- Settings ----

export async function fetchSettings(): Promise<AppSettings> {
  return request('/settings');
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  await request('/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

// ---- Stacks ----

export async function fetchStacks(): Promise<Stack[]> {
  return request('/stacks');
}

export async function fetchStack(id: string): Promise<Stack> {
  return request(`/stacks/${id}`);
}

export async function createStack(data: { name: string; description?: string; composeContent: string; envContent?: string }): Promise<Stack> {
  return request('/stacks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateStack(id: string, data: Partial<Stack & { composeContent: string; envContent: string }>): Promise<Stack> {
  return request(`/stacks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteStack(id: string): Promise<void> {
  await request(`/stacks/${id}`, { method: 'DELETE' });
}

export async function deployStack(id: string): Promise<void> {
  await request(`/stacks/${id}/deploy`, { method: 'POST' });
}

export async function stopStack(id: string): Promise<void> {
  await request(`/stacks/${id}/stop`, { method: 'POST' });
}

export async function restartStack(id: string): Promise<void> {
  await request(`/stacks/${id}/restart`, { method: 'POST' });
}

export async function fetchStackVersions(id: string): Promise<any[]> {
  return request(`/stacks/${id}/versions`);
}

export async function restoreStackVersion(id: string, version: number): Promise<void> {
  await request(`/stacks/${id}/restore/${version}`, { method: 'POST' });
}

// ---- Backups ----

export async function fetchBackupConfig(stackId: string): Promise<BackupConfig> {
  return request(`/backups/${stackId}/config`);
}

export async function updateBackupConfig(stackId: string, config: Partial<BackupConfig>): Promise<void> {
  await request(`/backups/${stackId}/config`, { method: 'PUT', body: JSON.stringify(config) });
}

export async function fetchBackupJobs(stackId: string): Promise<BackupJob[]> {
  return request(`/backups/${stackId}/jobs`);
}

export async function runBackup(stackId: string): Promise<void> {
  await request(`/backups/${stackId}/run`, { method: 'POST' });
}

// ---- Notification Services ----

export async function fetchNotificationServices(): Promise<NotificationService[]> {
  return request('/notifications');
}

export async function createNotificationService(data: Omit<NotificationService, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationService> {
  return request('/notifications', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateNotificationService(id: string, data: Omit<NotificationService, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationService> {
  return request(`/notifications/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteNotificationService(id: string): Promise<void> {
  await request(`/notifications/${id}`, { method: 'DELETE' });
}

export async function testNotificationService(id: string): Promise<void> {
  await request(`/notifications/${id}/test`, { method: 'POST' });
}

// ---- Port Reservations ----

export async function fetchPortReservations(): Promise<PortReservation[]> {
  return request('/ports');
}

export async function createPortReservation(data: Omit<PortReservation, 'id' | 'createdAt'>): Promise<PortReservation> {
  return request('/ports', { method: 'POST', body: JSON.stringify(data) });
}

export async function deletePortReservation(id: string): Promise<void> {
  await request(`/ports/${id}`, { method: 'DELETE' });
}

// ---- Smart Startup ----

export async function fetchSmartStartupConfigs(): Promise<SmartStartupConfig[]> {
  return request('/smart-startup');
}

export async function createSmartStartupConfig(data: Omit<SmartStartupConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<SmartStartupConfig> {
  return request('/smart-startup', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmartStartupConfig(id: string, data: Omit<SmartStartupConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<SmartStartupConfig> {
  return request(`/smart-startup/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteSmartStartupConfig(id: string): Promise<void> {
  await request(`/smart-startup/${id}`, { method: 'DELETE' });
}
