import { pool } from '../database.js';

type AiProvider = 'ollama' | 'openai' | 'google' | 'anthropic' | 'custom';

interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  treatAsLocal: boolean;
  allowEnvToLocal: boolean;
}

interface ComposeAiContext {
  composeContent?: string;
  envContent?: string;
}

interface ComposeAiResult {
  message: string;
  composeContent?: string;
  redactionMode: 'full-local' | 'redacted-remote';
}

interface AnthropicContentPart {
  text?: string;
}

interface GoogleContentPart {
  text?: string;
}

const SECRET_KEY_PATTERN = /(pass(word)?|secret|token|api[_-]?key|auth|credential|private[_-]?key|client[_-]?secret)/i;

export async function generateComposeWithAi(prompt: string, context: ComposeAiContext): Promise<ComposeAiResult> {
  const ai = await loadAiConfig();
  const prepared = prepareContext(ai, context);
  const system = [
    'You are a Docker Compose assistant.',
    'Generate a valid docker-compose.yml file only unless the user explicitly asks for explanation.',
    'Never invent secrets. Use obvious placeholders like CHANGE_ME or example values.',
    'Prefer a concise but production-usable compose file.',
  ].join(' ');

  const user = [
    `Task: ${prompt}`,
    prepared.composeSection,
    prepared.envSection,
    'If you return YAML, return only the compose YAML without markdown fences.',
  ].filter(Boolean).join('\n\n');

  const raw = await callProvider(ai, system, user);
  return {
    message: raw,
    composeContent: extractCompose(raw),
    redactionMode: prepared.redactionMode,
  };
}

export async function validateComposeWithAi(prompt: string, context: Required<Pick<ComposeAiContext, 'composeContent'>> & ComposeAiContext): Promise<ComposeAiResult> {
  const ai = await loadAiConfig();
  const prepared = prepareContext(ai, context);
  const system = [
    'You are a Docker Compose reviewer.',
    'Review the compose for correctness, missing volumes, networking, restart policy, healthchecks, and likely service mistakes.',
    'Do not expose or request secrets.',
    'Respond concisely with findings and suggested fixes.',
  ].join(' ');

  const user = [
    prompt ? `Extra instruction: ${prompt}` : '',
    'Please review this compose definition:',
    prepared.composeSection,
    prepared.envSection,
  ].filter(Boolean).join('\n\n');

  const raw = await callProvider(ai, system, user);
  return {
    message: raw,
    redactionMode: prepared.redactionMode,
  };
}

async function loadAiConfig(): Promise<AiConfig> {
  const { rows: [settings] } = await pool.query('SELECT ai_config FROM settings WHERE id = 1');
  const ai = settings?.ai_config || {};
  const config: AiConfig = {
    enabled: ai.enabled ?? false,
    provider: ai.provider || 'ollama',
    baseUrl: ai.baseUrl || 'http://host.docker.internal:11434',
    apiKey: ai.apiKey || '',
    model: ai.model || 'llama3.1',
    treatAsLocal: ai.treatAsLocal ?? true,
    allowEnvToLocal: ai.allowEnvToLocal ?? false,
  };

  if (!config.enabled) {
    const error = new Error('AI is not enabled in Settings -> AI');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  return config;
}

function prepareContext(
  ai: AiConfig,
  context: ComposeAiContext,
): { composeSection: string; envSection: string; redactionMode: 'full-local' | 'redacted-remote' } {
  const isLocal = ai.provider === 'ollama' || ai.treatAsLocal;
  if (isLocal) {
    return {
      composeSection: context.composeContent ? `Compose:\n${context.composeContent}` : '',
      envSection: context.envContent
        ? ai.allowEnvToLocal
          ? `Env file:\n${context.envContent}`
          : formatEnvSummary(context.envContent)
        : '',
      redactionMode: 'full-local',
    };
  }

  return {
    composeSection: context.composeContent ? `Compose (redacted):\n${redactSecrets(context.composeContent)}` : '',
    envSection: context.envContent ? formatEnvSummary(context.envContent) : '',
    redactionMode: 'redacted-remote',
  };
}

function formatEnvSummary(envContent: string): string {
  const keys = envContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean);

  if (keys.length === 0) return 'Env file: none';
  return `Env keys only (values omitted):\n${keys.join('\n')}`;
}

function redactSecrets(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      const equalsIndex = line.indexOf('=');
      const colonIndex = line.indexOf(':');
      const listEnvMatch = line.match(/^(\s*-\s*)([A-Z0-9_\-.]+)=(.*)$/i);

      if (listEnvMatch && SECRET_KEY_PATTERN.test(listEnvMatch[2])) {
        return `${listEnvMatch[1]}${listEnvMatch[2]}=<redacted>`;
      }

      if (equalsIndex > 0) {
        const key = line.slice(0, equalsIndex).trim();
        if (SECRET_KEY_PATTERN.test(key)) {
          return `${line.slice(0, equalsIndex + 1)}<redacted>`;
        }
      }

      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().replace(/^[-\s]+/, '');
        if (SECRET_KEY_PATTERN.test(key)) {
          return `${line.slice(0, colonIndex + 1)} <redacted>`;
        }
      }

      return line;
    })
    .join('\n');
}

function extractCompose(message: string): string | undefined {
  const fenced = message.match(/```(?:ya?ml)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || message).trim();
  if (!candidate) return undefined;
  if (/^version:|^services:/m.test(candidate)) return candidate;
  return undefined;
}

async function callProvider(ai: AiConfig, system: string, user: string): Promise<string> {
  switch (ai.provider) {
    case 'ollama':
      return callOllama(ai, system, user);
    case 'openai':
      return callOpenAiCompatible(ai, system, user, ai.baseUrl || 'https://api.openai.com/v1', ai.apiKey || '');
    case 'custom':
      return callOpenAiCompatible(ai, system, user, ai.baseUrl, ai.apiKey || '');
    case 'anthropic':
      return callAnthropic(ai, system, user);
    case 'google':
      return callGoogle(ai, system, user);
    default:
      throw new Error(`Unsupported AI provider: ${ai.provider}`);
  }
}

async function callOllama(ai: AiConfig, system: string, user: string): Promise<string> {
  const res = await fetch(`${stripTrailingSlash(ai.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ai.model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  const body = await res.json().catch(() => ({})) as { error?: string; message?: { content?: string } };
  if (!res.ok) {
    throw new Error(body.error || 'Ollama request failed');
  }
  return body.message?.content || '';
}

async function callOpenAiCompatible(
  ai: AiConfig,
  system: string,
  user: string,
  baseUrl: string,
  apiKey: string,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${stripTrailingSlash(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: ai.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    }),
  });

  const body = await res.json().catch(() => ({})) as {
    error?: { message?: string } | string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'AI request failed');
  }
  return body.choices?.[0]?.message?.content || '';
}

async function callAnthropic(ai: AiConfig, system: string, user: string): Promise<string> {
  const res = await fetch(`${stripTrailingSlash(ai.baseUrl || 'https://api.anthropic.com/v1')}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ai.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ai.model,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const body = await res.json().catch(() => ({})) as {
    error?: { message?: string } | string;
    content?: AnthropicContentPart[];
  };
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : body.error?.message || 'Anthropic request failed');
  }
  return Array.isArray(body.content) ? body.content.map((part) => part.text || '').join('\n') : '';
}

async function callGoogle(ai: AiConfig, system: string, user: string): Promise<string> {
  const model = ai.model || 'gemini-2.5-pro';
  const res = await fetch(`${stripTrailingSlash(ai.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')}/models/${model}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  const body = await res.json().catch(() => ({})) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: GoogleContentPart[] } }>;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || 'Google AI request failed');
  }
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}