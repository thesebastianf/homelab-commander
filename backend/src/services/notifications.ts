import { pool } from '../database.js';
import { logger } from '../logger.js';

interface NotificationPayload {
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
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
  const titles: Record<string, string> = {
    updateAvailable: 'Update Available',
    containerAutoUpdated: 'Container Auto-Updated',
    containerFailed: 'Container Failed',
    highMemory: 'High Memory Usage',
    highCpu: 'High CPU Usage',
    containerStarted: 'Container Started',
    containerStopped: 'Container Stopped',
    stackDeployed: 'Stack Deployed',
    stackFailed: 'Stack Deploy Failed',
    backupCompleted: 'Backup Completed',
    backupFailed: 'Backup Failed',
    smartStartupDeviceOnline: 'Smart Startup: Device Online',
    smartStartupStackStarted: 'Smart Startup: Stack Started',
  };

  return {
    title: titles[eventType] || `Homelab Commander: ${eventType}`,
    message: Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n'),
    level: eventType.includes('Failed') || eventType.includes('error') ? 'error'
      : eventType.includes('High') ? 'warning' : 'info',
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

  const text = `*${payload.title}*\n\n${payload.message}`;
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'Markdown' }),
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
