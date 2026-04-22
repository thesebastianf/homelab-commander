import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, constants } from 'fs';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { updateSettingsBody } from '../validation/schemas.js';
import { rescheduleAutoUpdater } from '../services/autoUpdateScheduler.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);
const accessAsync = promisify(access);

// Lazily resolved once at first settings request — avoids running on every poll
let _dockerCliVersion: string | null = null;
async function getDockerCliVersion(): Promise<string> {
  if (_dockerCliVersion !== null) return _dockerCliVersion;
  try {
    const { stdout } = await execFileAsync(config.composePath, ['--version']);
    _dockerCliVersion = stdout.trim();
  } catch {
    _dockerCliVersion = 'unavailable';
  }
  return _dockerCliVersion;
}

async function getSocketReachable(): Promise<boolean> {
  try {
    await accessAsync('/var/run/docker.sock', constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function getRegistryConfigPresent(): Promise<boolean> {
  try {
    await accessAsync('/root/.docker/config.json', constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const { rows: [settings] } = await pool.query('SELECT * FROM settings WHERE id = 1');
  const notifConfig = settings.notification_config || {};
  const haConfig = settings.home_assistant_config || {};
  const gitConfig = settings.git_integration_config || {};
  const scheduleConfig = settings.auto_update_schedule || {};
  const aiConfig = settings.ai_config || {};
  res.json({
    theme: settings.ui_theme || 'dark',
    dockerHost: settings.docker_host,
    refreshInterval: settings.refresh_interval,
    maxLogLines: settings.max_log_lines,
    autoUpdate: settings.auto_update,
    globalUpdateFreeze: settings.global_update_freeze,
    stacksBasePath: settings.stacks_base_path,
    volumesBasePath: settings.volumes_base_path,
    backupsBasePath: settings.backups_base_path,
    notifications: {
      enabled: notifConfig.enabled ?? false,
      services: [],
      events: notifConfig.events || {},
      thresholds: notifConfig.thresholds || { memoryPercent: 80, cpuPercent: 80 },
    },
    homeAssistant: {
      enabled: haConfig.enabled ?? false,
      baseUrl: haConfig.baseUrl || '',
      accessToken: haConfig.accessToken || '',
      entityPrefix: haConfig.entityPrefix || 'hlc',
    },
    gitIntegration: {
      enabled: gitConfig.enabled ?? false,
      repoUrl: gitConfig.repoUrl || '',
      accessToken: gitConfig.accessToken || '',
      syncOn: gitConfig.syncOn || 'manual',
    },
    autoUpdateSchedule: {
      enabled: scheduleConfig.enabled ?? false,
      cron: scheduleConfig.cron || '0 7 * * 6',
      label: scheduleConfig.label || 'Saturdays at 07:00',
    },
    ai: {
      enabled: aiConfig.enabled ?? false,
      provider: aiConfig.provider || 'ollama',
      baseUrl: aiConfig.baseUrl || 'http://host.docker.internal:11434',
      apiKey: aiConfig.apiKey || '',
      model: aiConfig.model || 'llama3.1',
      treatAsLocal: aiConfig.treatAsLocal ?? true,
      allowEnvToLocal: aiConfig.allowEnvToLocal ?? false,
    },
    dockerCompose: {
      runtimeMode: config.composeRuntimeMode,
      composePath: config.composePath,
      stacksPath: config.stacksPath,
      isNative: config.composeRuntimeMode === 'native',
      cliVersion: await getDockerCliVersion(),
      socketReachable: await getSocketReachable(),
      registryConfigPresent: await getRegistryConfigPresent(),
    },
    copyPasteHelpers: settings.copy_paste_helpers ?? [],
    warningThresholds: settings.warning_thresholds ?? { networkWarn: 25, zombieWarn: 5, diskWarn: 90, cpuWarn: 85, memoryWarn: 85 },
  });
}));

router.put('/', validateBody(updateSettingsBody), asyncHandler(async (req, res) => {
  const b = req.body;
  logger.info({ globalUpdateFreeze: b.globalUpdateFreeze, theme: b.theme }, 'PUT /settings: received update');
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (b.theme !== undefined) { updates.push(`ui_theme = $${idx++}`); values.push(b.theme); }
  if (b.dockerHost !== undefined) { updates.push(`docker_host = $${idx++}`); values.push(b.dockerHost); }
  if (b.refreshInterval !== undefined) { updates.push(`refresh_interval = $${idx++}`); values.push(b.refreshInterval); }
  if (b.maxLogLines !== undefined) { updates.push(`max_log_lines = $${idx++}`); values.push(b.maxLogLines); }
  if (b.autoUpdate !== undefined) { updates.push(`auto_update = $${idx++}`); values.push(b.autoUpdate); }
  if (b.globalUpdateFreeze !== undefined) { updates.push(`global_update_freeze = $${idx++}`); values.push(b.globalUpdateFreeze); }
  if (b.stacksBasePath !== undefined) { updates.push(`stacks_base_path = $${idx++}`); values.push(b.stacksBasePath); }
  if (b.volumesBasePath !== undefined) { updates.push(`volumes_base_path = $${idx++}`); values.push(b.volumesBasePath); }
  if (b.backupsBasePath !== undefined) { updates.push(`backups_base_path = $${idx++}`); values.push(b.backupsBasePath); }
  if (b.notifications !== undefined) { updates.push(`notification_config = $${idx++}`); values.push(JSON.stringify(b.notifications)); }
  if (b.homeAssistant !== undefined) { updates.push(`home_assistant_config = $${idx++}`); values.push(JSON.stringify(b.homeAssistant)); }
  if (b.gitIntegration !== undefined) { updates.push(`git_integration_config = $${idx++}`); values.push(JSON.stringify(b.gitIntegration)); }
  if (b.autoUpdateSchedule !== undefined) { updates.push(`auto_update_schedule = $${idx++}`); values.push(JSON.stringify(b.autoUpdateSchedule)); }
  if (b.ai !== undefined) { updates.push(`ai_config = $${idx++}`); values.push(JSON.stringify(b.ai)); }
  if (b.copyPasteHelpers !== undefined) { updates.push(`copy_paste_helpers = $${idx++}`); values.push(JSON.stringify(b.copyPasteHelpers)); }
  if (b.warningThresholds !== undefined) { updates.push(`warning_thresholds = $${idx++}`); values.push(JSON.stringify(b.warningThresholds)); }

  if (updates.length === 0) {
    res.json({ ok: true });
    return;
  }

  updates.push(`updated_at = NOW()`);
  await pool.query(
    `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`,
    values
  );
  logger.info({ fields: updates.length }, 'PUT /settings: update completed successfully');

  // Reschedule auto-updater if schedule changed
  if (b.autoUpdateSchedule !== undefined) {
    rescheduleAutoUpdater(b.autoUpdateSchedule.enabled ? (b.autoUpdateSchedule.cron || null) : null);
  }

  res.json({ ok: true });
}));

export default router;
