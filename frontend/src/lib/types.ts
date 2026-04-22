export type ContainerStatus = 'running' | 'stopped' | 'paused' | 'restarting' | 'created'

export interface Container {
  id: string
  name: string
  image: string
  status: ContainerStatus
  state: string
  created: string
  ports: string[]
  cpu: number
  memory: number
  network: {
    rx: number
    tx: number
  }
  updateAvailable?: boolean
  autoUpdate?: boolean
  restartPolicy?: string
}

export interface Image {
  id: string
  repository: string
  tag: string
  size: string
  created: string
  inUse: boolean
}

export interface Stack {
  id: string
  name: string
  description?: string
  status: 'running' | 'stopped' | 'failed' | 'deploying'
  managedBy?: 'thc' | 'external'
  external?: boolean
  services: number
  containerCount?: number
  version: number
  stackPath?: string
  composeFiles?: string[]
  volumePath?: string
  compose: string
  composeContent?: string
  envFile?: string
  envContent?: string
  autoUpdate?: boolean
  runBackupBeforeUpdate?: boolean
  updateAvailable?: boolean
  hasHostNetworking?: boolean
  backupCount?: number
  createdAt?: string
  updatedAt?: string
  versions?: StackVersion[]
  ports?: number[]
  // External change detection (populated by GET /api/stacks/:id)
  hasExternalChanges?: boolean
  diskComposeContent?: string | null
  diskEnvContent?: string | null
  backupConfig?: {
    enabled: boolean
    schedule?: string
    retention?: number
    lastBackup?: string
    backupSize?: string
    lastBackupAt?: string
  }
  smartStartup?: {
    enabled: boolean
    triggerType?: string
    devices?: { name: string; ip: string; online: boolean }[]
  }
}

export interface StackVersion {
  id: string
  version: number
  compose?: string
  composeContent?: string
  envContent?: string
  description?: string
  timestamp?: string
  createdAt: string
}

export interface Volume {
  id: string
  name: string
  driver: string
  mountpoint: string
  size: string
  containers: string[]
}

export interface Network {
  id: string
  name: string
  driver: string
  scope: string
  containers: string[]
  subnet?: string
  gateway?: string
}

export interface SystemInfo {
  containers: {
    running: number
    stopped: number
    total: number
  }
  images: number
  dockerVersion: string
  os: string
  arch: string
  cpus: number
  memory: string
  memoryTotal: string
  memoryUsedPercent: number
  cpuUsedPercent: number
  diskTotal: string
  diskUsedPercent: number
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  container: string
  message: string
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'graphite' | 'ocean' | 'forest' | 'sunset'
  dockerHost: string
  refreshInterval: number
  maxLogLines: number
  autoUpdate: boolean
  globalUpdateFreeze: boolean
  stacksBasePath: string
  volumesBasePath: string
  backupsBasePath: string
  notifications: {
    enabled: boolean
    services: NotificationService[]
    events: Record<string, boolean>
    thresholds: {
      memoryPercent: number
      cpuPercent: number
    }
  }
  notificationConfig?: {
    enabled: boolean
    events: Record<string, boolean>
    thresholds: {
      memoryPercent: number
      cpuPercent: number
    }
  }
  homeAssistant?: {
    enabled: boolean
    baseUrl: string
    accessToken: string
    entityPrefix: string
  }
  gitIntegration?: {
    enabled: boolean
    repoUrl: string
    accessToken: string
    syncOn: 'save' | 'deploy' | 'manual'
  }
  autoUpdateSchedule?: {
    enabled: boolean
    cron: string
    label: string
  }
  ai?: {
    enabled: boolean
    provider: 'ollama' | 'openai' | 'google' | 'anthropic' | 'custom'
    baseUrl: string
    apiKey: string
    model: string
    treatAsLocal: boolean
    allowEnvToLocal: boolean
  }
  dockerCompose?: {
    runtimeMode: string
    composePath: string
    stacksPath: string
    isNative: boolean
    cliVersion: string
    socketReachable: boolean
    registryConfigPresent: boolean
  }
  copyPasteHelpers?: Array<{ id: string; label: string; value: string }>
}

export interface NotificationService {
  id: string
  name: string
  type: 'telegram' | 'discord' | 'slack' | 'email' | 'webhook'
  enabled: boolean
  config: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

export interface BackupConfig {
  enabled: boolean
  cronSchedule: string
  // In simple mode this is the "keep last N backups" count.
  retentionDays: number
  includeStackFolder: boolean
  includeVolumes: boolean
  includeDatabases: boolean
  databaseType?: string
  databaseConfig?: {
    containerName?: string
    databaseName?: string
    targets?: Array<{
      serviceName?: string
      containerName?: string
      databaseName?: string
      type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb'
    }>
  }
  compressionLevel?: number
  encrypted?: boolean
  incremental?: boolean
  useAdvancedRetention: boolean
  retentionPolicy?: {
    keepLast: number
    keepHourly: number
    keepDaily: number
    keepWeekly: number
    keepMonthly: number
    keepYearly: number
  }
}

export interface BackupJob {
  id: string
  stackId: string
  status: 'completed' | 'failed' | 'in-progress'
  sizeBytes: number
  backupPath: string
  includes: Record<string, boolean>
  errorMessage?: string
  startedAt: string
  completedAt?: string
}

export interface PortReservation {
  id: string
  name: string
  description?: string
  portRangeStart: number
  portRangeEnd: number
  groupName: string
  color: string
  createdAt: string
}

export interface SmartStartupConfig {
  id: string
  targetType: 'stack'
  targetId: string
  triggerValue: string
  startDelay: number
  monitorInterval: number
  enabled: boolean
  deviceOnline?: boolean
  lastCheckedAt?: string | null
  lastSeenAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface SmartStartupStartupWarning {
  checkedAt: string
  count: number
  items: {
    configId: string
    targetId: string
    triggerValue: string
    enabled: boolean
  }[]
}

export interface SmartStartupCheckNowResult {
  address: string
  isOnline: boolean
  latencyMs: number
  checkedAt: string
}

export interface ContainerStats {
  cpu: number
  memory: number
  memoryLimit: number
  memoryPercent: number
  networkRx: number
  networkTx: number
}
