#!/usr/bin/env node

import path from 'node:path';
import { loadConfig } from './config.js';
import { startAlfred } from './agent.js';

const args = process.argv.slice(2);

// Parse flags
const tunnel = args.includes('--tunnel');
let configPath = 'alfred.yaml';
const configIdx = args.indexOf('--config');
if (configIdx !== -1 && args[configIdx + 1]) {
  configPath = args[configIdx + 1];
}

configPath = path.resolve(process.cwd(), configPath);

try {
  const config = loadConfig(configPath);
  await startAlfred(config, { tunnel });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error(`Config file not found: ${configPath}`);
    console.error('');
    console.error('Usage:');
    console.error('  alfred --config agent.yaml');
    console.error('  alfred --config agent.yaml --tunnel   # auto-tunnel for local dev');
    console.error('');
    console.error('Or set env vars: ALFRED_AGENT_NAME, ALFRED_DOMAIN, ALFRED_AI_PROVIDER, etc.');
    process.exit(1);
  }
  throw err;
}
