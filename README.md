# Alfred

**Deploy an AI agent on your domain in 5 minutes.**

```yaml
agent:
  name: support
  domain: agents.yourcompany.com
  description: "Customer support agent"

ai:
  provider: anthropic
  model: claude-sonnet-4-6
  apiKey: ${ANTHROPIC_API_KEY}

rules:
  - "You are a helpful customer support agent"
  - "Be polite, professional, and concise"
  - "Never share internal system details"

capabilities:
  - name: customer-support
    description: "Handle customer inquiries"
```

```bash
npx alfred
```

Your agent is live at `support@agents.yourcompany.com`. Any AI agent on the internet can discover it, verify its identity, and start a conversation — all cryptographically signed, no API keys to share, no platform lock-in.

---

## Why Alfred?

Every company will need an AI agent that other agents can talk to. Not a chatbot on your website — an agent with its own identity, its own cryptographic keys, living on your domain.

Alfred makes that trivial.

You write rules in plain English. Alfred handles the protocol: Ed25519 signing, DID identity, key pinning, first-contact handshake, message verification, and AI-powered responses. One YAML file. One command. Done.

**No platform account.** Your agent runs on your infrastructure, under your domain.

**No vendor lock-in.** Switch between Claude, GPT, and Gemini with one line change.

**No protocol expertise.** You don't need to know what JCS canonicalization is. Alfred does.

---

## Quick start

### 1. Install

```bash
npm install alfred-agent
```

### 2. Create `alfred.yaml`

```yaml
agent:
  name: support
  domain: agents.yourcompany.com
  description: "Customer support agent for Acme Corp"

ai:
  provider: anthropic
  model: claude-sonnet-4-6
  apiKey: ${ANTHROPIC_API_KEY}

rules:
  - "You are a helpful customer support agent for Acme Corp"
  - "Be polite, professional, and concise"
  - "Never share internal system details or customer data"
  - "Escalate billing disputes to human support"

capabilities:
  - name: customer-support
    description: "Handle general customer inquiries"
  - name: order-status
    description: "Check the status of an order by order ID"
    schema:
      type: object
      properties:
        orderId:
          type: string
```

### 3. Run

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx alfred
```

```
  ┌──────────────────────────────────────────────┐
  │  Alfred                                       │
  ├──────────────────────────────────────────────┤
  │  Agent   : support                            │
  │  Address : support@agents.yourcompany.com     │
  │  AI      : anthropic / claude-sonnet-4-6      │
  │  Port    : 3141                               │
  │  Rules   : 4                                  │
  │  Caps    : customer-support, order-status      │
  └──────────────────────────────────────────────┘
```

That's it. Your agent is discoverable, authenticated, and responding to messages.

---

## What you get

Once running, Alfred gives your company:

| What | How |
|------|-----|
| **An address** | `support@agents.yourcompany.com` — share it like email |
| **An identity** | Ed25519 key pair + DID document, generated automatically |
| **Discovery** | Agent Card, agents.txt, agent index — other agents find you |
| **A signed inbox** | Verifies every incoming message, rejects forgeries |
| **AI-powered responses** | Your rules, your AI provider, your data |
| **Message history** | Every conversation logged in SQLite |

---

## AI providers

Switch providers with one line. No code changes.

### Anthropic (Claude)

```yaml
ai:
  provider: anthropic
  model: claude-sonnet-4-6
  apiKey: ${ANTHROPIC_API_KEY}
```

### OpenAI

```yaml
ai:
  provider: openai
  model: gpt-4o
  apiKey: ${OPENAI_API_KEY}
```

### Google Gemini

```yaml
ai:
  provider: gemini
  model: gemini-2.5-pro
  apiKey: ${GEMINI_API_KEY}
```

---

## Deploy

### Docker

```bash
docker compose up
```

The included `docker-compose.yml` maps your `alfred.yaml` and passes through API key env vars. Data is persisted in a Docker volume.

### Railway / Render / Fly.io

1. Push your repo with `alfred.yaml`
2. Set your AI API key as an environment variable
3. Set `ALFRED_DOMAIN` to your production domain
4. Deploy

Alfred listens on `PORT` (default 3141) and serves everything from one process.

### Your own server

```bash
npm install alfred-agent
npx alfred --config alfred.yaml
```

Point your domain's DNS to the server. Done.

### Environment variables

Every config field can be overridden with env vars — no YAML needed in production:

| Env var | Config equivalent |
|---------|-------------------|
| `ALFRED_AGENT_NAME` | `agent.name` |
| `ALFRED_DOMAIN` | `agent.domain` |
| `ALFRED_PORT` or `PORT` | `agent.port` |
| `ALFRED_DESCRIPTION` | `agent.description` |
| `ALFRED_AI_PROVIDER` | `ai.provider` |
| `ALFRED_AI_MODEL` | `ai.model` |
| `ALFRED_AI_API_KEY` | `ai.apiKey` |

---

## Local development

For testing without a real domain, Alfred can start a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) that gives you a temporary public URL:

```bash
# Requires: brew install cloudflared
npx alfred --config alfred.yaml --tunnel
```

This assigns a random `*.trycloudflare.com` domain so other ACP agents can reach you during development. No DNS setup, no certificates — just run and test.

---

## Storage

Alfred uses **SQLite** by default — zero config, no external database.

| What | Purpose |
|------|---------|
| **Key pins** | TOFU keys from agents you've interacted with |
| **Idempotency** | Deduplicates messages, auto-cleaned after 24h |
| **Message history** | Every conversation logged with request and response |

Everything lives in `data/alfred.db`. Back it up, move it between servers, or inspect it with any SQLite client.

---

## How it works

```
Incoming ACP message
  → Signature verification (Ed25519 + JCS)
  → First-contact handshake (if new sender)
  → Key pinning (TOFU)
  → Route to capability handler
  → AI provider (Claude / GPT / Gemini) with your rules
  → Log to SQLite
  → Signed ACP response
```

Alfred handles the entire [ACP protocol](https://github.com/clerkboard/acp) stack. Your YAML config controls the AI behavior. You never touch cryptography.

---

## ACP address

Your agent's address follows the [ACP standard](https://github.com/clerkboard/acp/blob/main/spec/acp-rfc.md):

```
{name}@{domain}
```

Share it like an email address — on your website, in your docs, on a business card:

```
support@agents.yourcompany.com
```

Any ACP agent on the internet can contact yours using this address. The protocol handles identity verification, key exchange, and message signing automatically.

---

## Built on ACP

Alfred is powered by the [Agent Communication Protocol](https://github.com/clerkboard/acp) — an open, federated protocol for AI agent-to-agent communication. ACP gives agents:

- **Federated identity** — no central registry, your domain is your identity
- **Cryptographic authentication** — every message is signed and verified
- **Trust-on-first-use** — key pinning like SSH, no certificate authorities
- **Store-and-forward** — messages survive downtime via relays

[Read the spec](https://github.com/clerkboard/acp/blob/main/spec/acp-rfc.md) | [Reference implementations](https://github.com/clerkboard/acp)

---

## License

MIT
