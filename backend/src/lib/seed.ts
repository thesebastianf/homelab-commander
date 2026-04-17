import { pool } from '../database.js';
import { logger } from '../logger.js';

/**
 * Seeds the settings table from SEED_* environment variables on first startup.
 *
 * Seeds are applied ONCE — only when the settings row has never been saved via the
 * UI (i.e. updated_at == created_at within a 10-second tolerance).  After the user
 * first saves anything through the Settings UI, seed vars are silently ignored on
 * subsequent restarts.
 *
 * Notification services are seeded regardless of the "first run" check, but only
 * when no service of that type already exists.
 */
export async function seedSettings(): Promise<void> {
  const e = process.env;

  // ── Settings table seed ──────────────────────────────────────────────────
  const pathsChanged =
    e.SEED_STACKS_BASE_PATH || e.SEED_VOLUMES_BASE_PATH || e.SEED_BACKUPS_BASE_PATH;
  const haChanged =
    e.SEED_HA_BASE_URL || e.SEED_HA_ACCESS_TOKEN || e.SEED_HA_ENABLED;
  const gitChanged =
    e.SEED_GIT_REPO_URL || e.SEED_GIT_ACCESS_TOKEN || e.SEED_GIT_ENABLED;
  const aiChanged =
    e.SEED_AI_ENABLED ||
    e.SEED_AI_PROVIDER ||
    e.SEED_AI_BASE_URL ||
    e.SEED_AI_API_KEY ||
    e.SEED_AI_MODEL ||
    e.SEED_AI_TREAT_AS_LOCAL ||
    e.SEED_AI_ALLOW_ENV_TO_LOCAL;

  if (pathsChanged || haChanged || gitChanged || aiChanged) {
    // Only seed settings if they have never been saved via the UI
    const { rows: [row] } = await pool.query(
      'SELECT created_at, updated_at FROM settings WHERE id = 1'
    );
    if (!row) return;

    const diff = Math.abs(
      new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()
    );

    if (diff > 10_000) {
      logger.debug('Settings already modified via UI — skipping SEED_* vars for settings table');
    } else {
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      // Paths
      if (e.SEED_STACKS_BASE_PATH) {
        updates.push(`stacks_base_path = $${idx++}`);
        values.push(e.SEED_STACKS_BASE_PATH);
      }
      if (e.SEED_VOLUMES_BASE_PATH) {
        updates.push(`volumes_base_path = $${idx++}`);
        values.push(e.SEED_VOLUMES_BASE_PATH);
      }
      if (e.SEED_BACKUPS_BASE_PATH) {
        updates.push(`backups_base_path = $${idx++}`);
        values.push(e.SEED_BACKUPS_BASE_PATH);
      }

      // Home Assistant
      if (haChanged) {
        const ha = {
          enabled: e.SEED_HA_ENABLED === 'true',
          baseUrl: e.SEED_HA_BASE_URL ?? '',
          accessToken: e.SEED_HA_ACCESS_TOKEN ?? '',
          entityPrefix: e.SEED_HA_ENTITY_PREFIX ?? 'hlc',
        };
        updates.push(`home_assistant_config = $${idx++}`);
        values.push(JSON.stringify(ha));
      }

      // Git integration
      if (gitChanged) {
        const git = {
          enabled: e.SEED_GIT_ENABLED === 'true',
          repoUrl: e.SEED_GIT_REPO_URL ?? '',
          accessToken: e.SEED_GIT_ACCESS_TOKEN ?? '',
          syncOn: (e.SEED_GIT_SYNC_ON as 'save' | 'deploy' | 'manual') ?? 'manual',
        };
        updates.push(`git_integration_config = $${idx++}`);
        values.push(JSON.stringify(git));
      }

      // AI integration
      if (aiChanged) {
        const ai = {
          enabled: e.SEED_AI_ENABLED === 'true',
          provider: (e.SEED_AI_PROVIDER as 'ollama' | 'openai' | 'google' | 'anthropic' | 'custom') ?? 'ollama',
          baseUrl: e.SEED_AI_BASE_URL ?? 'http://host.docker.internal:11434',
          apiKey: e.SEED_AI_API_KEY ?? '',
          model: e.SEED_AI_MODEL ?? 'llama3.1',
          treatAsLocal: e.SEED_AI_TREAT_AS_LOCAL === undefined ? true : e.SEED_AI_TREAT_AS_LOCAL === 'true',
          allowEnvToLocal: e.SEED_AI_ALLOW_ENV_TO_LOCAL === 'true',
        };
        updates.push(`ai_config = $${idx++}`);
        values.push(JSON.stringify(ai));
      }

      if (updates.length > 0) {
        await pool.query(
          `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`,
          values
        );
        logger.info(`Settings seeded from environment (${updates.length} field(s) updated)`);
      }
    }
  }

  // ── Notification services seed ───────────────────────────────────────────
  // Each service is created at most once per type (idempotent).
  type SvcSeed = { name: string; type: string; config: Record<string, string> };
  const toCreate: SvcSeed[] = [];

  if (e.SEED_TELEGRAM_BOT_TOKEN && e.SEED_TELEGRAM_CHAT_ID) {
    toCreate.push({
      name: 'Telegram',
      type: 'telegram',
      config: { botToken: e.SEED_TELEGRAM_BOT_TOKEN, chatId: e.SEED_TELEGRAM_CHAT_ID },
    });
  }
  if (e.SEED_DISCORD_WEBHOOK_URL) {
    toCreate.push({
      name: 'Discord',
      type: 'discord',
      config: { webhookUrl: e.SEED_DISCORD_WEBHOOK_URL },
    });
  }
  if (e.SEED_SLACK_WEBHOOK_URL) {
    toCreate.push({
      name: 'Slack',
      type: 'slack',
      config: { webhookUrl: e.SEED_SLACK_WEBHOOK_URL },
    });
  }
  if (e.SEED_WEBHOOK_URL) {
    toCreate.push({
      name: 'Webhook',
      type: 'webhook',
      config: { url: e.SEED_WEBHOOK_URL },
    });
  }

  for (const svc of toCreate) {
    const { rows } = await pool.query(
      'SELECT id FROM notification_services WHERE type = $1 LIMIT 1',
      [svc.type]
    );
    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO notification_services (name, type, enabled, config) VALUES ($1, $2, true, $3)',
        [svc.name, svc.type, JSON.stringify(svc.config)]
      );
      logger.info({ type: svc.type }, 'Notification service seeded from environment');
    }
  }
}
