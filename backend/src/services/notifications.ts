import { pool } from '../database.js';
import { logger } from '../logger.js';

interface NotificationPayload {
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toStringValue(item)).join(', ');
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, inner]) => `${humanizeKey(key)}: ${toStringValue(inner)}`)
      .join(', ');
  }
  return String(value);
}

function humanizeKey(key: string): string {
  const lookup: Record<string, string> = {
    stack: 'Stack',
    stackName: 'Stack',
    name: 'Name',
    action: 'Action',
    container: 'Container',
    usage: 'Usage',
    threshold: 'Threshold',
    trigger: 'Triggered By',
    mode: 'Mode',
    desiredStatus: 'Target Status',
    reconciledStatus: 'Runtime Status',
    size: 'Size',
    sizeBytes: 'Size',
    error: 'Error',
    address: 'Address',
    stackId: 'Stack ID',
    triggeredBy: 'Triggered By',
  };
  return lookup[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function triggerLabel(trigger: unknown): string {
  const value = String(trigger || '').toLowerCase();
  if (!value) return 'Manual';
  if (value === 'schedule' || value === 'auto_update_schedule') return 'Auto update schedule';
  if (value === 'manual') return 'Manual';
  if (value === 'detached-self-update') return 'Self-update handoff';
  return value.replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

function actionLabel(action: unknown): string {
  const value = String(action || '').toLowerCase();
  const labels: Record<string, string> = {
    deploy: 'Deploy',
    update: 'Update',
    'bulk-update': 'Bulk update',
    restart: 'Restart',
    recreate: 'Recreate',
    stop: 'Stop',
    deactivate: 'Deactivate',
    auto_update: 'Auto update',
  };
  return labels[value] || (value ? value.replace(/[_-]+/g, ' ') : 'Update');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = idx === 0 ? 0 : idx === 1 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

function extractNestedDetails(data: Record<string, unknown>): Record<string, unknown> {
  return isRecord(data.details) ? data.details : {};
}

function pickString(data: Record<string, unknown>, details: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && String(data[key]).trim()) {
      return toStringValue(data[key]);
    }
    if (details[key] !== undefined && details[key] !== null && String(details[key]).trim()) {
      return toStringValue(details[key]);
    }
  }
  return undefined;
}

function buildGenericLines(data: Record<string, unknown>, details: Record<string, unknown>, exclude: string[] = []): string[] {
  const excluded = new Set([...exclude, 'title', 'message', 'details']);
  const source: Record<string, unknown> = { ...data, ...details };
  return Object.entries(source)
    .filter(([key, value]) => !excluded.has(key) && value !== undefined)
    .map(([key, value]) => `${humanizeKey(key)}: ${toStringValue(value)}`);
}

function buildHumanMessage(eventType: string, data: Record<string, unknown>): { title: string; message: string; level: 'info' | 'warning' | 'error' } {
  const details = extractNestedDetails(data);
  const stackName = pickString(data, details, ['stackName', 'stack', 'name']);
  const container = pickString(data, details, ['container', 'name']);
  const action = actionLabel(pickString(data, details, ['action']) || eventType);
  const trigger = triggerLabel(pickString(data, details, ['trigger', 'triggeredBy', 'mode']) || 'manual');

  switch (eventType) {
    case 'containerAutoUpdated': {
      const lines = [
        stackName ? `Stack: ${stackName}` : 'Stack: Unknown',
        `Action: ${action}`,
        `Triggered By: ${trigger}`,
      ];
      lines.push(...buildGenericLines(data, details, ['stackName', 'stack', 'name', 'action', 'trigger', 'triggeredBy', 'mode']));
      return {
        title: '✅ Stack Update Succeeded',
        message: lines.join('\n'),
        level: 'info',
      };
    }
    case 'stackDeployed': {
      const lines = [stackName ? `Stack: ${stackName}` : 'Stack: Unknown', `Action: ${action}`, `Triggered By: ${trigger}`];
      lines.push(...buildGenericLines(data, details, ['stackName', 'stack', 'name', 'action', 'trigger', 'triggeredBy', 'mode']));
      return { title: '🚀 Stack Deploy Succeeded', message: lines.join('\n'), level: 'info' };
    }
    case 'stackFailed': {
      const lines = [
        stackName ? `Stack: ${stackName}` : 'Stack: Unknown',
        `Action: ${action}`,
        `Triggered By: ${trigger}`,
      ];
      const error = pickString(data, details, ['error', 'message']);
      if (error) lines.push(`Error: ${error}`);
      lines.push(...buildGenericLines(data, details, ['stackName', 'stack', 'name', 'action', 'trigger', 'triggeredBy', 'mode', 'error', 'message']));
      return {
        title: '❌ Stack Action Failed',
        message: lines.join('\n'),
        level: 'error',
      };
    }
    case 'highCpu': {
      return {
        title: '🔥 High CPU Usage',
        message: [
          `Container: ${container || 'Unknown'}`,
          `Usage: ${pickString(data, details, ['usage']) || '-'}`,
          `Threshold: ${pickString(data, details, ['threshold']) || '-'}`,
        ].join('\n'),
        level: 'warning',
      };
    }
    case 'highMemory': {
      return {
        title: '🧠 High Memory Usage',
        message: [
          `Container: ${container || 'Unknown'}`,
          `Usage: ${pickString(data, details, ['usage']) || '-'}`,
          `Threshold: ${pickString(data, details, ['threshold']) || '-'}`,
        ].join('\n'),
        level: 'warning',
      };
    }
    case 'backupCompleted': {
      const sizeBytesRaw = data.sizeBytes ?? details.sizeBytes;
      const parsed = typeof sizeBytesRaw === 'number' ? sizeBytesRaw : Number(sizeBytesRaw);
      const size = Number.isFinite(parsed) && parsed > 0
        ? formatBytes(parsed)
        : pickString(data, details, ['size']) || 'Unknown';
      const lines = [
        `Stack: ${stackName || 'Unknown'}`,
        `Backup Size: ${size}`,
      ];
      lines.push(...buildGenericLines(data, details, ['stackName', 'stack', 'name', 'size', 'sizeBytes']));
      return {
        title: '🗄️ Backup Completed',
        message: lines.join('\n'),
        level: 'info',
      };
    }
    case 'backupFailed': {
      const lines = [`Stack: ${stackName || 'Unknown'}`];
      const error = pickString(data, details, ['error', 'message']);
      if (error) lines.push(`Error: ${error}`);
      lines.push(...buildGenericLines(data, details, ['stackName', 'stack', 'name', 'error', 'message']));
      return {
        title: '🚨 Backup Failed',
        message: lines.join('\n'),
        level: 'error',
      };
    }
    case 'diskSpaceLow': {
      const freeGB = pickString(data, details, ['freeGB']);
      const thresholdGB = pickString(data, details, ['thresholdGB']);
      const msg = pickString(data, details, ['message']);
      const lines = [
        `Free Space: ${freeGB ? freeGB + ' GB' : 'Unknown'}`,
        `Threshold: ${thresholdGB ? thresholdGB + ' GB' : 'Unknown'}`,
      ];
      if (msg) lines.push(`Note: ${msg}`);
      lines.push(...buildGenericLines(data, details, ['freeGB', 'thresholdGB', 'message', 'action']));
      return {
        title: '⚠️ Low Disk Space — Auto-Update Skipped',
        message: lines.join('\n'),
        level: 'warning',
      };
    }
    default: {
      const genericTitle = pickString(data, details, ['title']) || `Homelab Commander: ${eventType}`;
      const message = pickString(data, details, ['message']);
      if (message) {
        const remainder = buildGenericLines(data, details, ['message']);
        return {
          title: genericTitle,
          message: [message, ...remainder].join('\n'),
          level: eventType.toLowerCase().includes('fail') || eventType.toLowerCase().includes('error') ? 'error' : 'info',
        };
      }
      const fallbackLines = buildGenericLines(data, details);
      return {
        title: genericTitle,
        message: fallbackLines.length > 0 ? fallbackLines.join('\n') : 'No details provided',
        level: eventType.toLowerCase().includes('high') ? 'warning'
          : eventType.toLowerCase().includes('fail') || eventType.toLowerCase().includes('error') ? 'error'
            : 'info',
      };
    }
  }
}

export async function sendNotification(
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { rows: [settings] } = await pool.query('SELECT notification_config FROM settings WHERE id = 1');
    if (!settings) return;

    const notifConfig = settings.notification_config;
    if (!notifConfig?.enabled) return;
    if (notifConfig.events && !notifConfig.events[eventType]) return;

    const payload = buildPayload(eventType, data);

    const { rows: services } = await pool.query(
      'SELECT * FROM notification_services WHERE enabled = true'
    );

    for (const service of services) {
      try {
        await sendNotificationToService(service, eventType, data);
        // Log every successful dispatch to audit_log for the history view
        const payload = buildPayload(eventType, data);
        await pool.query(
          `INSERT INTO audit_log (action, resource_type, resource_id, details) VALUES ($1, $2, $3, $4)`,
          [
            'notification',
            eventType,
            service.name || service.type,
            JSON.stringify({ title: payload.title, message: payload.message, level: payload.level, serviceType: service.type }),
          ]
        );
      } catch (err) {
        logger.error({ err, service: service.name }, 'Notification dispatch failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'sendNotification failed');
  }
}

export async function sendNotificationToService(
  service: { type: string; config: Record<string, string>; name?: string },
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const payload = buildPayload(eventType, data);
  await dispatchToService(service, payload);
}

function buildPayload(eventType: string, data: Record<string, unknown>): NotificationPayload {
  const friendly = buildHumanMessage(eventType, data);

  return {
    title: friendly.title,
    message: friendly.message,
    level: friendly.level,
    timestamp: new Date().toISOString(),
  };
}

async function dispatchToService(
  service: { type: string; config: Record<string, string> },
  payload: NotificationPayload
): Promise<void> {
  switch (service.type) {
    case 'telegram':
      await sendTelegram(service.config, payload);
      break;
    case 'discord':
      await sendDiscord(service.config, payload);
      break;
    case 'slack':
      await sendSlack(service.config, payload);
      break;
    case 'email':
      await sendEmail(service.config, payload);
      break;
    case 'webhook':
      await sendWebhook(service.config, payload);
      break;
  }
}

async function sendTelegram(
  config: Record<string, string>,
  payload: NotificationPayload
): Promise<void> {
  if (!config.botToken || !config.chatId) {
    throw new Error('Telegram configuration requires botToken and chatId');
  }

  const text = `${payload.title}\n\n${payload.message}`;
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram API error (${response.status}): ${body || response.statusText}`);
  }

  // Telegram can return 200 with ok=false in body.
  try {
    const parsed = JSON.parse(body) as { ok?: boolean; description?: string };
    if (parsed.ok === false) {
      throw new Error(`Telegram API rejected message: ${parsed.description || 'unknown error'}`);
    }
  } catch {
    // Non-JSON success body is acceptable.
  }
}

async function sendDiscord(
  config: Record<string, string>,
  payload: NotificationPayload
): Promise<void> {
  const color = payload.level === 'error' ? 0xff0000
    : payload.level === 'warning' ? 0xffaa00 : 0x00ff00;
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{ title: payload.title, description: payload.message, color, timestamp: payload.timestamp }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${body || response.statusText}`);
  }
}

async function sendSlack(
  config: Record<string, string>,
  payload: NotificationPayload
): Promise<void> {
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `${payload.title}\n${payload.message}` }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook failed (${response.status}): ${body || response.statusText}`);
  }
}

async function sendEmail(
  config: Record<string, string>,
  payload: NotificationPayload
): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: config.smtpHost,
    port: parseInt(config.smtpPort || '587'),
    secure: parseInt(config.smtpPort || '587') === 465,
    auth: { user: config.username, pass: config.password },
  });
  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: payload.title,
    text: payload.message,
  });
}

async function sendWebhook(
  config: Record<string, string>,
  payload: NotificationPayload
): Promise<void> {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook failed (${response.status}): ${body || response.statusText}`);
  }
}

// Threshold monitoring
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 15 * 60 * 1000;

export async function checkThresholds(): Promise<void> {
  try {
    const { rows: [settings] } = await pool.query('SELECT notification_config FROM settings WHERE id = 1');
    if (!settings?.notification_config?.enabled) return;

    const thresholds = settings.notification_config.thresholds;
    if (!thresholds) return;

    const { listContainers, getContainerStats } = await import('./docker.js');
    const containers = await listContainers();

    for (const container of containers) {
      if (container.status !== 'running') continue;
      const now = Date.now();
      const lastAlert = alertCooldown.get(container.id) || 0;
      if (now - lastAlert < COOLDOWN_MS) continue;

      try {
        const stats = await getContainerStats(container.id);
        if (stats.cpu > thresholds.cpuPercent) {
          await sendNotification('highCpu', {
            container: container.name,
            usage: `${stats.cpu.toFixed(1)}%`,
            threshold: `${thresholds.cpuPercent}%`,
          });
          alertCooldown.set(container.id, now);
        }
        if (stats.memoryPercent > thresholds.memoryPercent) {
          await sendNotification('highMemory', {
            container: container.name,
            usage: `${stats.memoryPercent.toFixed(1)}%`,
            threshold: `${thresholds.memoryPercent}%`,
          });
          alertCooldown.set(container.id, now);
        }
      } catch { /* container may have stopped */ }
    }
  } catch (err) {
    logger.error({ err }, 'Threshold check failed');
  }
}

export function initThresholdMonitor(): void {
  setInterval(checkThresholds, 60_000);
  logger.info('Threshold monitor initialized');
}
