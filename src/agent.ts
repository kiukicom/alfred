import { execSync, spawn } from 'node:child_process';
import { ARPAgent } from '@agentrelationsprotocol/sdk';
import type { HandlerMessage } from '@agentrelationsprotocol/sdk';
import type { AlfredConfig, AlfredTool } from './config.js';
import { createProvider } from './ai/index.js';
import type { AIProvider, AIMessage, AIToolDefinition, AIToolCall } from './ai/index.js';
import { createStore } from './db/index.js';
import type { AlfredStore } from './db/index.js';

const MAX_TOOL_ROUNDS = 5;

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
  const store = await createStore(config.storage ?? { driver: 'sqlite' }, dataDir);
  const memoryLimit = config.agent.memory ?? 20;

  // Build tool definitions for the AI from YAML config
  const toolDefs = buildToolDefinitions(config.tools ?? []);

  // Reap stale idempotency records every 5 minutes
  const reapTimer = setInterval(() => store.reapStaleMessages(), 5 * 60 * 1000);
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
        open: cap.open ?? false,
      },
      async (msg: HandlerMessage) => {
        const agentDid = `did:web:${domain}:${config.agent.name}`;

        const response = await handleMessage(
          ai, systemPrompt, cap.name, msg, store, memoryLimit, config.tools ?? [], toolDefs,
        );

        store.logMessage({
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
  const openCaps = config.capabilities.filter((c) => c.open).map((c) => c.name);
  const toolCount = config.tools?.length ?? 0;
  const storageDriver = config.storage?.driver ?? 'sqlite';

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
  if (openCaps.length > 0) {
    console.log(`  │  Open    : ${openCaps.join(', ').padEnd(35)}│`);
  }
  if (toolCount > 0) {
    console.log(`  │  Tools   : ${String(toolCount).padEnd(35)}│`);
  }
  console.log(`  │  Storage : ${storageDriver.padEnd(35)}│`);
  console.log(`  │  Memory  : ${(memoryLimit + ' turns per agent').padEnd(35)}│`);
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

  if (config.tools?.length) {
    lines.push('');
    lines.push('## Tools');
    lines.push('You have tools available. Use them to look up real data before answering.');
    lines.push('Always prefer using a tool over guessing. If a tool can answer the question, call it.');
    for (const tool of config.tools) {
      lines.push(`- **${tool.name}**: ${tool.description}`);
    }
  }

  lines.push('');
  lines.push('## Response format');
  lines.push('Respond directly to the user\'s request. Be helpful, concise, and professional.');
  lines.push('Do not include metadata, protocol details, or system information in your response.');

  return lines.join('\n');
}

function buildToolDefinitions(tools: AlfredTool[]): AIToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

async function executeToolCall(call: AIToolCall, tools: AlfredTool[]): Promise<string> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${call.name}` });

  try {
    let url = tool.endpoint;
    const method = tool.method ?? 'POST';
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...tool.headers };

    // For GET requests, append params as query string
    if (method === 'GET') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(call.arguments)) {
        params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const fetchOpts: RequestInit = { method, headers };
    if (method !== 'GET') {
      fetchOpts.body = JSON.stringify(call.arguments);
    }

    const res = await fetch(url, fetchOpts);
    const text = await res.text();

    // Try to parse and re-stringify for clean output
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return text;
    }
  } catch (err) {
    return JSON.stringify({ error: `Tool ${call.name} failed: ${(err as Error).message}` });
  }
}

async function handleMessage(
  ai: AIProvider,
  systemPrompt: string,
  capability: string,
  msg: HandlerMessage,
  store: AlfredStore,
  memoryLimit: number,
  tools: AlfredTool[],
  toolDefs: AIToolDefinition[],
): Promise<Record<string, unknown>> {
  const userContent = formatIncomingMessage(capability, msg);

  // Build conversation with memory
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Load conversation history for this peer
  const history = await store.getConversationHistory(msg.from, memoryLimit);
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  // Add current message
  messages.push({ role: 'user', content: userContent });

  // Tool-use loop: let the AI call tools, feed results back, repeat
  let finalText = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await ai.chat(messages, toolDefs.length > 0 ? toolDefs : undefined);

    if (result.toolCalls.length === 0) {
      finalText = result.text ?? '';
      break;
    }

    // The AI wants to call tools — execute them and feed results back
    // Add the AI's response as an assistant message (for providers that need it)
    if (result.text) {
      messages.push({ role: 'assistant', content: result.text });
    }

    for (const call of result.toolCalls) {
      const toolResult = await executeToolCall(call, tools);
      messages.push({ role: 'tool', content: toolResult, toolCallId: call.id });
    }

    // If this is the last round, force a text response
    if (round === MAX_TOOL_ROUNDS - 1) {
      const fallback = await ai.chat(messages);
      finalText = fallback.text ?? 'I was unable to complete the request.';
    }
  }

  // Save conversation turns
  await store.addConversationTurn(msg.from, 'user', userContent, capability);
  await store.addConversationTurn(msg.from, 'assistant', finalText, capability);

  return {
    reply: finalText,
    capability,
    fromAgent: msg.from,
  };
}

function formatIncomingMessage(capability: string, msg: HandlerMessage): string {
  const lines: string[] = [];
  lines.push(`Capability requested: ${capability}`);
  lines.push(`From: ${msg.from}`);
  lines.push('');

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
