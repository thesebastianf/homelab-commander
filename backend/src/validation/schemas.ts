import { z } from 'zod';

export const containerIdParam = z.object({
  id: z.string().min(1).max(64),
});

export const createStackBody = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(500).optional().default(''),
  composeContent: z.string().min(1).max(200_000),
  envContent: z.string().max(100_000).optional().default(''),
});

export const updateStackBody = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  description: z.string().max(500).optional(),
  composeContent: z.string().min(1).max(200_000).optional(),
  envContent: z.string().max(100_000).optional(),
  autoUpdate: z.boolean().optional(),
  runBackupBeforeUpdate: z.boolean().optional(),
  gitRepoConfig: z.object({
    enabled: z.boolean(),
    repoUrl: z.string().max(500).optional(),
    branch: z.string().max(200).optional(),
    composePath: z.string().max(500).optional(),
    autoSync: z.boolean().optional(),
  }).nullable().optional(),
});

export const updateSettingsBody = z.object({
  dockerHost: z.string().max(500).optional(),
  refreshInterval: z.number().int().min(1).max(3600).optional(),
  maxLogLines: z.number().int().min(10).max(10000).optional(),
  autoUpdate: z.boolean().optional(),
  globalUpdateFreeze: z.boolean().optional(),
  stacksBasePath: z.string().min(1).max(500).optional(),
  volumesBasePath: z.string().min(1).max(500).optional(),
  backupsBasePath: z.string().min(1).max(500).optional(),
  notifications: z.object({
    enabled: z.boolean(),
    events: z.record(z.boolean()).optional(),
    thresholds: z.object({
      cpuPercent: z.number().min(0).max(100),
      memoryPercent: z.number().min(0).max(100),
    }).optional(),
  }).optional(),
  homeAssistant: z.object({
    enabled: z.boolean(),
    baseUrl: z.string().max(500).optional(),
    accessToken: z.string().max(500).optional(),
    entityPrefix: z.string().max(50).optional(),
  }).optional(),
  gitIntegration: z.object({
    enabled: z.boolean(),
    repoUrl: z.string().max(500).optional(),
    accessToken: z.string().max(500).optional(),
    syncOn: z.enum(['save', 'deploy', 'manual']).optional(),
  }).optional(),
  autoUpdateSchedule: z.object({
    enabled: z.boolean(),
    cron: z.string().max(100).optional(),
    label: z.string().max(200).optional(),
  }).optional(),
  ai: z.object({
    enabled: z.boolean(),
    provider: z.enum(['ollama', 'openai', 'google', 'anthropic', 'custom']),
    baseUrl: z.string().max(500).optional(),
    apiKey: z.string().max(2000).optional(),
    model: z.string().max(200).optional(),
    treatAsLocal: z.boolean().optional(),
    allowEnvToLocal: z.boolean().optional(),
  }).optional(),
});

export const backupConfigBody = z.object({
  enabled: z.boolean(),
  cronSchedule: z.string().max(100).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional().default(7),
  includeStackFolder: z.boolean().optional(),
  includeVolumes: z.boolean().optional(),
  includeDatabases: z.boolean().optional(),
  databaseType: z.enum(['postgresql', 'mysql', 'mongodb', 'redis', 'influxdb', 'auto', 'none']).optional(),
  databaseConfig: z.object({
    containerName: z.string().max(200).optional(),
    databaseName: z.string().max(200).optional(),
    targets: z.array(z.object({
      serviceName: z.string().max(200).optional(),
      containerName: z.string().max(200).optional(),
      databaseName: z.string().max(200).optional(),
      type: z.enum(['postgresql', 'mysql', 'mongodb', 'redis', 'influxdb']),
    })).optional(),
  }).optional(),
  compressionLevel: z.number().int().min(0).max(9).optional(),
  encrypted: z.boolean().optional(),
  incremental: z.boolean().optional(),
  useAdvancedRetention: z.boolean().optional(),
  retentionPolicy: z.object({
    daily: z.number().int().min(0).max(365),
    weekly: z.number().int().min(0).max(52),
    monthly: z.number().int().min(0).max(120),
    yearly: z.number().int().min(0).max(10),
  }).optional(),
});

export const notificationServiceBody = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['telegram', 'discord', 'slack', 'email', 'webhook']),
  enabled: z.boolean(),
  config: z.record(z.string()),
});

export const portReservationBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(''),
  portRangeStart: z.number().int().min(1).max(65535),
  portRangeEnd: z.number().int().min(1).max(65535),
  groupName: z.string().max(100).optional().default('default'),
  color: z.string().max(20).optional().default('#3b82f6'),
}).refine(d => d.portRangeEnd >= d.portRangeStart, 'End port must be >= start port');

export const smartStartupBody = z.object({
  targetType: z.literal('stack'),
  targetId: z.string().min(1).max(100),
  // triggerValue may be empty when first enabling (user fills it in via the form).
  // Non-empty values must be a valid IP or hostname.
  triggerValue: z.union([
    z.literal(''),
    z.string().min(1).max(200).regex(/^[a-zA-Z0-9._:-]+$/),
  ]).default(''),
  startDelay: z.number().int().min(0).max(3600).default(60),
  monitorInterval: z.number().int().min(5).max(3600).default(30),
  enabled: z.boolean(),
});

export const composeAiGenerateBody = z.object({
  prompt: z.string().min(1).max(4000),
  composeContent: z.string().max(200_000).optional().default(''),
  envContent: z.string().max(100_000).optional().default(''),
});

export const composeAiValidateBody = z.object({
  prompt: z.string().max(4000).optional().default(''),
  composeContent: z.string().min(1).max(200_000),
  envContent: z.string().max(100_000).optional().default(''),
});

export const pullImageBody = z.object({
  name: z.string().min(1).max(200),
  tag: z.string().max(128).optional().default('latest'),
});

export const createVolumeBody = z.object({
  name: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_.-]+$/),
  driver: z.string().max(50).optional().default('local'),
});

export const createNetworkBody = z.object({
  name: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_.-]+$/),
  driver: z.enum(['bridge', 'host', 'overlay', 'macvlan', 'none']).optional().default('bridge'),
});
