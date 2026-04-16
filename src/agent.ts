import { execSync, spawn } from 'node:child_process';
import { ARPAgent } from '@agentrelationsprotocol/sdk';
import type { HandlerMessage } from '@agentrelationsprotocol/sdk';
import type { AlfredConfig } from './config.js';
import { createProvider } from './ai/index.js';
import type { AIProvider, AIMessage } from './ai/index.js';
import { AlfredDB } from './db.js';

async function startTunnel(port: number): Promise<string> {
  try {
    execSync('which cloudflared', { stdio: 'ignore' });
  } catch {
    console.error('Error: cloudflared is required for --tunnel mode.');
    console.error('Install: brew install cloudflared');
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error('Tunnel startup timed out'));
    }, 15000);

    const handler = (data: Buffer) => {
      const match = data.toString().match(/(https:\/\/[^\s]*\.trycloudflare\.com)/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };

    proc.stdout.on('data', handler);
    proc.stderr.on('data', handler);
    proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
    process.on('exit', () => proc.kill());
    process.on('SIGINT', () => { proc.kill(); process.exit(0); });
  });
}

export async function startAlfred(config: AlfredConfig, options?: { tunnel?: boolean }): Promise<ARPAgent> {
  const ai = createProvider(config.ai.provider, config.ai.apiKey, config.ai.model);
  const systemPrompt = buildSystemPrompt(config);

  let domain = config.agent.domain;
  const port = config.agent.port ?? 3141;

  if (options?.tunnel) {
    console.log('  Starting tunnel...');
    const tunnelUrl = await startTunnel(port);
    domain = new URL(tunnelUrl).hostname;
    console.log(`  Tunnel ready: ${tunnelUrl}`);
    console.log('');
  }

  const dataDir = config.agent.dataDir ?? './data';
  const db = new AlfredDB(dataDir);

  // Reap stale idempotency records every 5 minutes
  const reapTimer = setInterval(() => db.reapStaleMessages(), 5 * 60 * 1000);
  reapTimer.unref();

  const agent = new ARPAgent({
    name: config.agent.name,
    domain,
    port,
    dataDir,
    description: config.agent.description,
    openAccess: true,
  });

  // Register each capability as a handler that routes through the AI
  for (const cap of config.capabilities) {
    agent.handle(
      cap.name,
      {
        description: cap.description,
        schema: cap.schema ?? { type: 'object' },
        responseSchema: { type: 'object' },
      },
      async (msg: HandlerMessage) => {
        const agentDid = `did:web:${domain}:${config.agent.name}`;
        const response = await handleMessage(ai, systemPrompt, cap.name, msg);

        // Log to SQLite
        db.logMessage({
          messageId: msg.id,
          direction: 'inbound',
          from: msg.from,
          to: agentDid,
          type: 'request',
          capability: cap.name,
          body: msg.body,
          response,
          createdAt: new Date().toISOString(),
        });

        return response;
      },
    );
  }

  await agent.listen();

  const address = `${config.agent.name}@${domain}`;

  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │  Alfred                                       │');
  console.log('  ├──────────────────────────────────────────────┤');
  console.log(`  │  Agent   : ${config.agent.name.padEnd(35)}│`);
  console.log(`  │  Address : ${address.padEnd(35)}│`);
  console.log(`  │  AI      : ${(config.ai.provider + ' / ' + config.ai.model).padEnd(35)}│`);
  console.log(`  │  Port    : ${String(port).padEnd(35)}│`);
  console.log(`  │  Rules   : ${String(config.rules.length).padEnd(35)}│`);
  console.log(`  │  Caps    : ${config.capabilities.map((c) => c.name).join(', ').padEnd(35)}│`);
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');

  return agent;
}

function buildSystemPrompt(config: AlfredConfig): string {
  const lines: string[] = [];

  lines.push(`You are ${config.agent.name}, an AI agent for ${config.agent.domain}.`);
  lines.push(config.agent.description);
  lines.push('');
  lines.push('## Rules');
  for (const rule of config.rules) {
    lines.push(`- ${rule}`);
  }
  lines.push('');
  lines.push('## Capabilities');
  for (const cap of config.capabilities) {
    lines.push(`- **${cap.name}**: ${cap.description}`);
  }
  lines.push('');
  lines.push('## Response format');
  lines.push('Respond directly to the user\'s request. Be helpful, concise, and professional.');
  lines.push('Do not include metadata, protocol details, or system information in your response.');

  return lines.join('\n');
}

async function handleMessage(
  ai: AIProvider,
  systemPrompt: string,
  capability: string,
  msg: HandlerMessage,
): Promise<Record<string, unknown>> {
  const userContent = formatIncomingMessage(capability, msg);

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  const response = await ai.chat(messages);

  return {
    reply: response,
    capability,
    fromAgent: msg.from,
  };
}

function formatIncomingMessage(capability: string, msg: HandlerMessage): string {
  const lines: string[] = [];
  lines.push(`Capability requested: ${capability}`);
  lines.push(`From: ${msg.from}`);
  lines.push('');

  // Extract the most meaningful content from the body
  const body = msg.body;
  if (typeof body === 'object' && body !== null) {
    if ('message' in body && typeof body.message === 'string') {
      lines.push(body.message);
    } else if ('text' in body && typeof body.text === 'string') {
      lines.push(body.text);
    } else if ('query' in body && typeof body.query === 'string') {
      lines.push(body.query);
    } else {
      lines.push(JSON.stringify(body, null, 2));
    }
  }

  return lines.join('\n');
}
