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
  - name: faq
    description: "Answer FAQs"
    open: true
  - name: customer-support
    description: "Handle customer inquiries"

tools:
  - name: lookup_order
    description: "Look up order status by ID"
    endpoint: https://api.yourcompany.com/orders/lookup
    parameters:
      type: object
      properties:
        orderId: { type: string }
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
| **Conversation memory** | Remembers context across messages from the same agent |
| **Tools** | AI calls your APIs to look up real data before answering |
| **Open capabilities** | Some capabilities work without a handshake — instant queries |
| **Message history** | Every conversation logged in SQLite |

---

## Tools

Tools let the AI call your internal APIs. Instead of guessing, the AI looks up real data — order status, product info, account details — then responds with the answer.

Define them in YAML:

```yaml
tools:
  - name: lookup_order
    description: "Look up an order by ID and return its status, items, and tracking"
    endpoint: https://api.yourcompany.com/orders/lookup
    method: POST
    headers:
      Authorization: "Bearer ${INTERNAL_API_KEY}"
    parameters:
      type: object
      properties:
        orderId:
          type: string
          description: "The order ID to look up"
      required:
        - orderId

  - name: search_products
    description: "Search the product catalogue"
    endpoint: https://api.yourcompany.com/products/search
    method: GET
    parameters:
      type: object
      properties:
        query:
          type: string
```

When an agent asks "what's the status of order #12345?", the AI:
1. Recognises it needs the `lookup_order` tool
2. Calls your API with `{ "orderId": "12345" }`
3. Gets back real order data
4. Responds with the actual status

The AI can chain up to 5 tool calls per request. Tools work with all providers (Claude, GPT, Gemini).

---

## Open capabilities

Mark a capability as `open: true` and any agent can query it without a handshake — no negotiate, no relation, no friction. Perfect for public info:

```yaml
capabilities:
  - name: store-hours
    description: "Check store hours and locations"
    open: true       # anyone can ask

  - name: customer-support
    description: "Handle support tickets"
    # open defaults to false — requires handshake
```

Open capabilities are synchronous and single-exchange. If an agent wants ongoing interaction, they still complete the standard first-contact handshake.

---

## Conversation memory

Alfred remembers previous messages from the same agent. If an agent asks about an order, then follows up with "what about the shipping?", Alfred knows the context.

```yaml
agent:
  memory: 20    # remember last 20 turns per agent (default)
```

Memory is per-agent — conversations with `agent-a@company.com` are separate from `agent-b@other.com`. Stored in SQLite, survives restarts.

Set `memory: 0` to disable.

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

This assigns a random `*.trycloudflare.com` domain so other ARP agents can reach you during development. No DNS setup, no certificates — just run and test.

---

## Storage

Alfred has a pluggable storage layer. Pick the backend that fits your stack.

### SQLite (default)

Zero config. Everything lives in `data/alfred.db`. Perfect for single-server deploys.

```yaml
storage:
  driver: sqlite
```

### Supabase

Use a hosted Postgres database. No extra dependencies — Alfred talks to Supabase via REST API.

```yaml
storage:
  driver: supabase
  url: ${SUPABASE_URL}
  key: ${SUPABASE_KEY}   # service_role key (not anon)
```

Tables are created automatically on first run (`alfred_pins`, `alfred_idempotency`, `alfred_messages`, `alfred_conversations`).

### What's stored

| What | Purpose |
|------|---------|
| **Key pins** | TOFU keys from agents you've interacted with |
| **Idempotency** | Deduplicates messages, auto-cleaned after 24h |
| **Conversations** | Per-agent conversation history for multi-turn memory |
| **Message history** | Every conversation logged with request and response |

### Adding a new backend

Implement the `AlfredStore` interface in `src/db/types.ts` and add a case to `src/db/index.ts`. The interface has 10 methods — pins, idempotency, messages, conversations, and close.

---

## How it works

```
Incoming ARP message
  → Signature verification (Ed25519 + JCS)
  → First-contact handshake (if new sender, unless open capability)
  → Key pinning (TOFU)
  → Route to capability handler
  → Load conversation history for this agent
  → AI provider (Claude / GPT / Gemini) with your rules + history
  → Tool calls if needed (up to 5 rounds)
  → Save conversation turn
  → Log to SQLite
  → Signed ARP response
```

Alfred handles the entire [ARP protocol](https://github.com/clerkboard/arp) stack. Your YAML config controls the AI behavior. You never touch cryptography.

---

## ARP address

Your agent's address follows the [ARP standard](https://github.com/clerkboard/arp/blob/main/spec/arp-rfc.md):

```
{name}@{domain}
```

Share it like an email address — on your website, in your docs, on a business card:

```
support@agents.yourcompany.com
```

Any ARP agent on the internet can contact yours using this address. The protocol handles identity verification, key exchange, and message signing automatically.

---

## Built on ARP

Alfred is powered by the [Agent Relations Protocol](https://github.com/clerkboard/arp) — an open, federated protocol for AI agent-to-agent communication. ARP gives agents:

- **Federated identity** — no central registry, your domain is your identity
- **Cryptographic authentication** — every message is signed and verified
- **Trust-on-first-use** — key pinning like SSH, no certificate authorities
- **Store-and-forward** — messages survive downtime via relays

[Read the spec](https://github.com/clerkboard/arp/blob/main/spec/arp-rfc.md) | [Reference implementations](https://github.com/clerkboard/arp)

---

## License

MIT
