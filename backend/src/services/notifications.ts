import { pool } from '../database.js';
import { logger } from '../logger.js';

interface NotificationPayload {
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  // Rich data for Discord/Slack fields
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  emoji?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) { value /= 1024; idx += 1; }
  const precision = idx === 0 ? 0 : idx === 1 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

function triggerLabel(trigger: unknown): string {
  const value = String(trigger || '').toLowerCase();
  if (!value || value === 'manual') return 'Manual';
  if (value === 'schedule' || value === 'auto_update_schedule') return 'Auto-update schedule';
  if (value === 'detached-self-update') return 'Self-update';
  return value.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function actionLabel(action: unknown): string {
  const value = String(action || '').toLowerCase();
  const labels: Record<string, string> = {
    deploy: 'Start', update: 'Update', 'bulk-update': 'Bulk update',
    restart: 'Restart', recreate: 'Recreate', stop: 'Stop',
    deactivate: 'Deactivate', auto_update: 'Auto update',
  };
  return labels[value] || (value ? value.replace(/[_-]+/g, ' ') : 'Update');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = data[key];
    if (v !== undefined && v !== null && String(v).trim()) return String(v);
    if (isRecord(data.details)) {
      const dv = (data.details as Record<string, unknown>)[key];
      if (dv !== undefined && dv !== null && String(dv).trim()) return String(dv);
    }
  }
  return undefined;
}

// ─── Rich message builder ──────────────────────────────────────────────────────

interface RichPayload {
  title: string;
  emoji: string;
  level: 'info' | 'warning' | 'error' | 'success';
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: string;
  oneliner: string; // compact for Telegram
}

function buildRichPayload(eventType: string, data: Record<string, unknown>): RichPayload {
  const stackName = pickString(data, ['stackName', 'stack', 'name']);
  const action = actionLabel(pickString(data, ['action']) || eventType);
  const trigger = triggerLabel(pickString(data, ['trigger', 'triggeredBy', 'mode']) || 'manual');
  const container = pickString(data, ['container']);
  const error = pickString(data, ['error', 'message']);

  switch (eventType) {
    case 'smartStartupDeviceOnline': {
      const address = pickString(data, ['address', 'triggeredBy']) || 'unknown device';
      return {
        title: '🟢 Smart Startup Triggered',
        emoji: '🟢',
        level: 'info',
        fields: [
          { name: '📡 Monitored Device', value: address, inline: true },
          { name: '📦 Stack', value: stackName || '—', inline: true },
          { name: '⚡ Action', value: 'Preparing automatic stack start', inline: false },
        ],
        oneliner: `🟢 Monitored device *${address}* is online — preparing auto-start for *${stackName || 'stack'}*`,
      };
    }
    case 'smartStartupStackStarted': {
      const address = pickString(data, ['address', 'triggeredBy']) || 'unknown device';
      return {
        title: '🚀 Smart Startup: Stack Started',
        emoji: '🚀',
        level: 'success',
        fields: [
          { name: '📡 Monitored Device', value: address, inline: true },
          { name: '📦 Stack', value: stackName || '—', inline: true },
          { name: '✅ Result', value: 'Stack automatically started', inline: false },
        ],
        oneliner: `🚀 Monitored device *${address}* online -> stack *${stackName || 'stack'}* automatically started`,
      };
    }
    case 'stackDeployed':
    case 'containerStarted': {
      return {
        title: '✅ Stack Started Successfully',
        emoji: '🚀',
        level: 'success',
        fields: [
          { name: '📦 Stack', value: stackName || '—', inline: true },
          { name: '⚡ Action', value: action, inline: true },
          { name: '👤 Triggered By', value: trigger, inline: true },
        ],
        oneliner: `✅ *${stackName || 'Stack'}* started successfully`,
      };
    }
    case 'containerStopped': {
      return {
        title: '⏹ Stack Stopped',
        emoji: '⏹',
        level: 'info',
        fields: [
          { name: '📦 Stack', value: stackName || '—', inline: true },
          { name: '⚡ Action', value: action, inline: true },
          { name: '👤 Triggered By', value: trigger, inline: true },
        ],
        oneliner: `⏹ *${stackName || 'Stack'}* stopped`,
      };
    }
    case 'containerAutoUpdated': {
      return {
        title: '🔄 Stack Updated Successfully',
        emoji: '🔄',
        level: 'success',
        fields: [
          { name: '📦 Stack', value: stackName || '—', inline: true },
          { name: '⚡ Action', value: action, inline: true },
          { name: '👤 Triggered By', value: trigger, inline: true },
        ],
        oneliner: `🔄 *${stackName || 'Stack'}* updated successfully`,
      };
    }
    case 'stackFailed': {
      const fields: RichPayload['fields'] = [
        { name: '📦 Stack', value: stackName || '—', inline: true },
        { name: '⚡ Action', value: action, inline: true },
        { name: '👤 Triggered By', value: trigger, inline: true },
      ];
      if (error) fields.push({ name: '❗ Error', value: error.slice(0, 500), inline: false });
      return {
        title: '❌ Stack Action Failed',
        emoji: '🚨',
        level: 'error',
        fields,
        oneliner: `❌ *${stackName || 'Stack'}* — action failed: ${error?.slice(0, 100) || 'Unknown error'}`,
      };
    }
    case 'backupCompleted': {
      const sizeRaw = data.sizeBytes ?? (isRecord(data.details) ? data.details.sizeBytes : undefined);
      const size = typeof sizeRaw === 'number' && sizeRaw > 0 ? formatBytes(sizeRaw) : (pickString(data, ['size']) || '—');
      const archive = pickString(data, ['archive']) || '—';
      return {
        title: '🗄️ Backup Completed',
        emoji: '🗄️',
        level: 'success',
        fields: [
          { name: '📦 Stack', value: stackName || '—', inline: true },
          { name: '📁 Archive Size', value: size, inline: true },
          { name: '🗜️ File', value: archive, inline: false },
        ],
        oneliner: `🗄️ Backup of *${stackName || 'Stack'}* complete — ${size}`,
      };
    }
    case 'backupFailed': {
      return {
        title: '🚨 Backup Failed',
        emoji: '🚨',
        level: 'error',
        fields: [
          { name: '📦 Stack', value: stackName || '—', inline: true },
          ...(error ? [{ name: '❗ Error', value: error.slice(0, 500), inline: false as const }] : []),
        ],
        oneliner: `🚨 Backup of *${stackName || 'Stack'}* failed: ${error?.slice(0, 100) || '—'}`,
      };
    }
    case 'highCpu': {
      const usage = pickString(data, ['usage']) || '—';
      const threshold = pickString(data, ['threshold']) || '—';
      return {
        title: '🔥 High CPU Usage',
        emoji: '🔥',
        level: 'warning',
        fields: [
          { name: '📦 Container', value: container || '—', inline: true },
          { name: '📈 Usage', value: usage, inline: true },
          { name: '⚠️ Threshold', value: threshold, inline: true },
        ],
        oneliner: `🔥 High CPU on *${container || 'container'}*: ${usage} (threshold: ${threshold})`,
      };
    }
    case 'highMemory': {
      const usage = pickString(data, ['usage']) || '—';
      const threshold = pickString(data, ['threshold']) || '—';
      return {
        title: '🧠 High Memory Usage',
        emoji: '🧠',
        level: 'warning',
        fields: [
          { name: '📦 Container', value: container || '—', inline: true },
          { name: '📈 Usage', value: usage, inline: true },
          { name: '⚠️ Threshold', value: threshold, inline: true },
        ],
        oneliner: `🧠 High memory on *${container || 'container'}*: ${usage} (threshold: ${threshold})`,
      };
    }
    case 'diskSpaceLow': {
      const freeGB = pickString(data, ['freeGB']);
      const thresholdGB = pickString(data, ['thresholdGB']);
      return {
        title: '💾 Low Disk Space — Auto-Update Skipped',
        emoji: '⚠️',
        level: 'warning',
        fields: [
          { name: '💽 Free Space', value: freeGB ? `${freeGB} GB` : '—', inline: true },
          { name: '⚠️ Threshold', value: thresholdGB ? `${thresholdGB} GB` : '—', inline: true },
        ],
        oneliner: `⚠️ Low disk space — free: ${freeGB || '?'} GB (threshold: ${thresholdGB || '?'} GB)`,
      };
    }
    case 'autoUpdateSkippedFrozen': {
      const phase = pickString(data, ['phase']) || 'preflight';
      const phaseLabel = phase === 'mid-run' ? 'during scheduled run' : 'before scheduled run';
      return {
        title: '❄️ Auto-Update Skipped (Global Freeze Active)',
        emoji: '❄️',
        level: 'warning',
        fields: [
          { name: '🧊 Reason', value: 'Global Update Freeze is enabled', inline: false },
          { name: '⚙️ Trigger', value: 'Auto-update schedule', inline: true },
          { name: '🕒 Phase', value: phaseLabel, inline: true },
          { name: '📦 Stack', value: stackName || 'All scheduled stacks', inline: false },
        ],
        oneliner: `❄️ Scheduled auto-update skipped because Global Update Freeze is enabled`,
      };
    }
    default: {
      const title = pickString(data, ['title']) || `Homelab Commander: ${eventType}`;
      const msg = pickString(data, ['message']) || 'No details.';
      return {
        title,
        emoji: 'ℹ️',
        level: eventType.toLowerCase().includes('fail') || eventType.toLowerCase().includes('error') ? 'error' : 'info',
        fields: [{ name: 'Details', value: msg.slice(0, 500), inline: false }],
        oneliner: `ℹ️ ${title}`,
      };
    }
  }
}

// ─── Channel formatters ────────────────────────────────────────────────────────

/** Telegram MarkdownV2 — escape required characters */
function escapeMdV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function buildTelegramText(rich: RichPayload, timestamp: string): string {
  const ts = new Date(timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour12: false });
  const sep = escapeMdV2('──────────────────');
  const lines: string[] = [
    `*${escapeMdV2(rich.title)}*`,
    sep,
  ];
  for (const field of rich.fields) {
    lines.push(`*${escapeMdV2(field.name)}*`);
    lines.push(escapeMdV2(field.value));
    lines.push('');
  }
  lines.push(sep);
  lines.push(`_${escapeMdV2('🏠 Homelab Commander • ' + ts)}_`);
  return lines.join('\n');
}

/** Discord rich embed with color-coded sidebar, fields and footer */
function buildDiscordEmbed(rich: RichPayload, timestamp: string) {
  const color = rich.level === 'error' ? 0xe74c3c
    : rich.level === 'warning' ? 0xf39c12
    : rich.level === 'success' ? 0x2ecc71
    : 0x3498db;

  return {
    embeds: [{
      title: rich.title,
      color,
      fields: rich.fields.map((f) => ({
        name: f.name,
        value: f.value || '—',
        inline: f.inline ?? false,
      })),
      footer: {
        text: '🏠 Homelab Commander',
        icon_url: 'https://raw.githubusercontent.com/thesebastianf/homelab-commander/main/docs/icon.png',
      },
      timestamp,
    }],
  };
}

/** Slack Block Kit */
function buildSlackPayload(rich: RichPayload, timestamp: string) {
  const ts = new Date(timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour12: false });
  const levelColor = rich.level === 'error' ? '#e74c3c'
    : rich.level === 'warning' ? '#f39c12'
    : rich.level === 'success' ? '#2ecc71'
    : '#3498db';

  const fieldsText = rich.fields
    .map((f) => `*${f.name}*\n${f.value || '—'}`)
    .join('\n\n');

  return {
    attachments: [{
      color: levelColor,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: rich.title, emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: fieldsText },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `🏠 *Homelab Commander* · ${ts}` },
          ],
        },
      ],
    }],
  };
}

/** HTML email */
function buildHtmlEmail(rich: RichPayload, timestamp: string): { subject: string; html: string; text: string } {
  const ts = new Date(timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour12: false });
  const accentColor = rich.level === 'error' ? '#e74c3c'
    : rich.level === 'warning' ? '#f39c12'
    : rich.level === 'success' ? '#2ecc71'
    : '#3498db';

  const fieldsHtml = rich.fields.map((f) => `
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap">${f.name}</td>
      <td style="padding:8px 12px;color:#1f2937;font-size:14px">${f.value || '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header bar -->
        <tr><td style="background:${accentColor};border-radius:8px 8px 0 0;padding:24px 32px">
          <p style="margin:0;color:rgba(255,255,255,0.8);font-size:12px;text-transform:uppercase;letter-spacing:0.1em">HOMELAB COMMANDER</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3">${rich.title}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#ffffff;padding:0;border-radius:0 0 8px 8px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${fieldsHtml}
          </table>
          <!-- Footer -->
          <div style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb;border-radius:0 0 8px 8px">
            <p style="margin:0;color:#9ca3af;font-size:12px">🏠 Homelab Commander &nbsp;·&nbsp; ${ts}</p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [rich.title, '', ...rich.fields.map((f) => `${f.name}: ${f.value || '—'}`), '', `Homelab Commander · ${ts}`].join('\n');

  return { subject: rich.title, html, text };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

function buildPayload(eventType: string, data: Record<string, unknown>): NotificationPayload {
  const rich = buildRichPayload(eventType, data);
  return {
    title: rich.title,
    message: rich.fields.map((f) => `${f.name}: ${f.value}`).join('\n'),
    level: rich.level,
    timestamp: new Date().toISOString(),
    fields: rich.fields,
    emoji: rich.emoji,
  };
}

async function dispatchToService(
  service: { type: string; config: Record<string, string> },
  eventType: string,
  data: Record<string, unknown>,
  payload: NotificationPayload
): Promise<void> {
  const rich = buildRichPayload(eventType, data);
  switch (service.type) {
    case 'telegram': await sendTelegram(service.config, rich, payload.timestamp); break;
    case 'discord':  await sendDiscord(service.config, rich, payload.timestamp);  break;
    case 'slack':    await sendSlack(service.config, rich, payload.timestamp);    break;
    case 'email':    await sendEmail(service.config, rich, payload.timestamp);    break;
    case 'webhook':  await sendWebhook(service.config, payload);                  break;
  }
}

// ─── Channel implementations ──────────────────────────────────────────────────

async function sendTelegram(config: Record<string, string>, rich: RichPayload, timestamp: string): Promise<void> {
  if (!config.botToken || !config.chatId) throw new Error('Telegram requires botToken and chatId');
  const text = buildTelegramText(rich, timestamp);
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'MarkdownV2' }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Telegram API error (${response.status}): ${body}`);
  try {
    const parsed = JSON.parse(body) as { ok?: boolean; description?: string };
    if (parsed.ok === false) throw new Error(`Telegram rejected: ${parsed.description}`);
  } catch { /* non-JSON ok */ }
}

async function sendDiscord(config: Record<string, string>, rich: RichPayload, timestamp: string): Promise<void> {
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDiscordEmbed(rich, timestamp)),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${body}`);
  }
}

async function sendSlack(config: Record<string, string>, rich: RichPayload, timestamp: string): Promise<void> {
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSlackPayload(rich, timestamp)),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook failed (${response.status}): ${body}`);
  }
}

async function sendEmail(config: Record<string, string>, rich: RichPayload, timestamp: string): Promise<void> {
  const nodemailer = await import('nodemailer');
  const { subject, html, text } = buildHtmlEmail(rich, timestamp);
  const transporter = nodemailer.default.createTransport({
    host: config.smtpHost,
    port: parseInt(config.smtpPort || '587'),
    secure: parseInt(config.smtpPort || '587') === 465,
    auth: { user: config.username, pass: config.password },
  });
  await transporter.sendMail({ from: config.from, to: config.to, subject, text, html });
}

async function sendWebhook(config: Record<string, string>, payload: NotificationPayload): Promise<void> {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook failed (${response.status}): ${body}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendNotification(eventType: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { rows: [settings] } = await pool.query('SELECT notification_config FROM settings WHERE id = 1');
    if (!settings) return;
    const notifConfig = settings.notification_config;
    if (!notifConfig?.enabled) return;
    if (notifConfig.events && !notifConfig.events[eventType]) return;

    const payload = buildPayload(eventType, data);
    const { rows: services } = await pool.query('SELECT * FROM notification_services WHERE enabled = true');

    for (const service of services) {
      try {
        await dispatchToService(service, eventType, data, payload);
        await pool.query(
          `INSERT INTO audit_log (action, resource_type, resource_id, details) VALUES ($1, $2, $3, $4)`,
          ['notification', eventType, service.name || service.type,
           JSON.stringify({ title: payload.title, level: payload.level, serviceType: service.type })]
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
  await dispatchToService(service, eventType, data, payload);
}

// ─── Threshold monitor ────────────────────────────────────────────────────────

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
          await sendNotification('highCpu', { container: container.name, usage: `${stats.cpu.toFixed(1)}%`, threshold: `${thresholds.cpuPercent}%` });
          alertCooldown.set(container.id, now);
        }
        if (stats.memoryPercent > thresholds.memoryPercent) {
          await sendNotification('highMemory', { container: container.name, usage: `${stats.memoryPercent.toFixed(1)}%`, threshold: `${thresholds.memoryPercent}%` });
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
