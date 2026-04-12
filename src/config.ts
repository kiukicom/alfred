import fs from 'node:fs';
import { parse } from 'yaml';

export interface AlfredCapability {
  name: string;
  description: string;
  schema?: Record<string, unknown>;
}

export interface AlfredConfig {
  agent: {
    name: string;
    domain: string;
    port?: number;
    dataDir?: string;
    description: string;
  };
  ai: {
    provider: 'anthropic' | 'openai' | 'gemini';
    model: string;
    apiKey: string;
  };
  rules: string[];
  capabilities: AlfredCapability[];
}

/**
 * Load config from YAML file. Env vars in ${VAR} syntax are resolved.
 */
export function loadConfig(path: string): AlfredConfig {
  const raw = fs.readFileSync(path, 'utf-8');
  const config = parse(raw) as AlfredConfig;

  // Resolve ${ENV_VAR} references in all string values
  resolveEnvVars(config as unknown as Record<string, unknown>);

  // Env var overrides — production deploys can skip the YAML entirely
  if (process.env.ALFRED_AGENT_NAME) config.agent.name = process.env.ALFRED_AGENT_NAME;
  if (process.env.ALFRED_DOMAIN) config.agent.domain = process.env.ALFRED_DOMAIN;
  if (process.env.ALFRED_PORT) config.agent.port = parseInt(process.env.ALFRED_PORT, 10);
  if (process.env.ALFRED_DESCRIPTION) config.agent.description = process.env.ALFRED_DESCRIPTION;
  if (process.env.ALFRED_AI_PROVIDER) config.ai.provider = process.env.ALFRED_AI_PROVIDER as AlfredConfig['ai']['provider'];
  if (process.env.ALFRED_AI_MODEL) config.ai.model = process.env.ALFRED_AI_MODEL;
  if (process.env.ALFRED_AI_API_KEY) config.ai.apiKey = process.env.ALFRED_AI_API_KEY;

  // Defaults
  config.agent.port ??= parseInt(process.env.PORT ?? '3141', 10);
  config.capabilities ??= [];
  config.rules ??= [];

  // Validate required fields
  if (!config.agent.name) die('agent.name is required');
  if (!config.agent.domain) die('agent.domain is required');
  if (!config.ai.apiKey) die('ai.apiKey is required (set in YAML or ALFRED_AI_API_KEY env var)');

  return config;
}

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function resolveEnvVars(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && val.startsWith('${') && val.endsWith('}')) {
      const envVar = val.slice(2, -1);
      const resolved = process.env[envVar];
      if (resolved) obj[key] = resolved;
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      resolveEnvVars(val as Record<string, unknown>);
    }
  }
}
