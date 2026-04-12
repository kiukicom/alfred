# Alfred

The open-source AI agent server. Deploy a customer service agent on your domain in minutes.

Alfred turns a YAML config file into a fully functional [ACP](https://github.com/clerkboard/acp) agent — with Ed25519 signing, identity, discovery, and AI-powered responses handled automatically. You write the rules. Alfred does the rest.

## Quick start

**1. Install**

```bash
npm install alfred-agent
```

**2. Create `alfred.yaml`**

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

**3. Run**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx alfred
```

That's it. Your agent is live at `support@agents.yourcompany.com`.

## What you get

Once running, Alfred provides:

- **ACP identity** — Ed25519 key pair, DID document, key pinning (generated automatically)
- **Discovery** — Agent Card at `/.well-known/acp/support.json`, agents.txt, agent index
- **Signed inbox** — accepts ACP messages, verifies signatures, enforces first-contact handshake
- **AI responses** — every incoming message is routed through your chosen AI provider with your rules

Other ACP agents can discover yours, complete the handshake, and start having conversations — all authenticated and signed.

## Configuration

### YAML config

```yaml
agent:
  name: support                      # Agent name (required)
  domain: agents.yourcompany.com     # Your domain (required)
  port: 3141                         # Port (default: 3141)
  description: "What your agent does"

ai:
  provider: anthropic                # anthropic, openai, or gemini
  model: claude-sonnet-4-6           # Any model from your provider
  apiKey: ${ANTHROPIC_API_KEY}       # Env var reference

rules:                               # Plain English rules for the AI
  - "Be helpful and concise"
  - "Never share customer data"
  - "Escalate billing issues to humans"

capabilities:                        # What your agent can do
  - name: customer-support
    description: "Handle customer inquiries"
  - name: check-order
    description: "Look up order status by order ID"
    schema:
      type: object
      properties:
        orderId:
          type: string
```

### Environment variables

Every config field can be overridden with env vars. Useful for Docker and PaaS deploys:

| Env var | Config equivalent |
|---------|-------------------|
| `ALFRED_AGENT_NAME` | `agent.name` |
| `ALFRED_DOMAIN` | `agent.domain` |
| `ALFRED_PORT` or `PORT` | `agent.port` |
| `ALFRED_DESCRIPTION` | `agent.description` |
| `ALFRED_AI_PROVIDER` | `ai.provider` |
| `ALFRED_AI_MODEL` | `ai.model` |
| `ALFRED_AI_API_KEY` | `ai.apiKey` |

## AI providers

Alfred supports three providers out of the box:

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

## Deploy

### Docker

```bash
docker compose up
```

The included `docker-compose.yml` maps your `alfred.yaml` and passes through API key env vars. Data (keys, pins) is persisted in a Docker volume.

### Railway / Render / Fly.io

1. Push your repo (with `alfred.yaml` included, or use env vars)
2. Set your AI API key as an environment variable
3. Set `ALFRED_DOMAIN` to your production domain
4. Deploy

Alfred listens on `PORT` (default 3141) and serves everything from one process.

### Your own server

```bash
npm install alfred-agent
npx alfred --config alfred.yaml
```

Point your domain's DNS to the server. Alfred handles the rest.

## Local development

For testing without a real domain, Alfred can start a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) that gives you a temporary public URL:

```bash
# Requires: brew install cloudflared
npx alfred --config alfred.yaml --tunnel
```

This assigns a random `*.trycloudflare.com` domain so other ACP agents can reach you during development.

## Storage

Alfred uses SQLite by default — zero config, no external database needed. Everything is stored in a single `alfred.db` file:

- **Key pins** — TOFU keys from agents you've interacted with
- **Idempotency** — deduplicates messages (auto-cleaned after 24h)
- **Message history** — every conversation logged with request and response

```yaml
agent:
  dataDir: ./data   # default: ./data
```

The DB file lives at `data/alfred.db`. Back it up, move it between servers, or inspect it with any SQLite client.

## How it works

```
Incoming ACP message
  → Signature verification (Ed25519 + JCS)
  → First-contact handshake (if new sender)
  → Key pinning
  → Route to capability handler
  → AI provider (Claude / GPT / Gemini) with your rules
  → Log to SQLite
  → Signed ACP response
```

Alfred handles the entire ACP protocol stack. Your YAML config controls the AI behavior.

## ACP address format

Your agent's address follows the ACP standard:

```
{name}@{domain}
```

Share it like an email address — on your website, docs, or business card:

```
support@agents.yourcompany.com
```

Anyone with an ACP agent can contact yours using this address.

## License

MIT
