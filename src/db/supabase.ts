import type { AlfredStore, ConversationTurn, MessageLog } from './types.js';

/**
 * Supabase storage backend for Alfred.
 * Uses the Supabase REST API directly — no SDK dependency needed.
 */
export class SupabaseStore implements AlfredStore {
  private url: string;
  private key: string;
  private headers: Record<string, string>;

  constructor(url: string, key: string) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  }

  /**
   * Call this once on startup to create tables if they don't exist.
   * Requires the service_role key (not anon).
   */
  async init(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS alfred_pins (
        did TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        first_contact TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alfred_idempotency (
        message_id TEXT PRIMARY KEY,
        received_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alfred_messages (
        id BIGSERIAL PRIMARY KEY,
        message_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        from_did TEXT NOT NULL,
        to_did TEXT NOT NULL,
        type TEXT NOT NULL,
        capability TEXT,
        body JSONB,
        response JSONB,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_alfred_messages_from ON alfred_messages(from_did);

      CREATE TABLE IF NOT EXISTS alfred_conversations (
        id BIGSERIAL PRIMARY KEY,
        peer_did TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        capability TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_alfred_conversations_peer ON alfred_conversations(peer_did, created_at);
    `;

    await this.rpc('', sql);
  }

  private async query(table: string, params: string): Promise<unknown[]> {
    const res = await fetch(`${this.url}/rest/v1/${table}?${params}`, {
      headers: { ...this.headers, 'Prefer': 'return=representation' },
    });
    if (!res.ok) return [];
    return res.json() as Promise<unknown[]>;
  }

  private async insert(table: string, data: Record<string, unknown>): Promise<void> {
    await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.headers, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(data),
    });
  }

  private async rpc(fn: string, sql: string): Promise<unknown> {
    const res = await fetch(`${this.url}/rest/v1/rpc/${fn || 'exec_sql'}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      // If the RPC doesn't exist, try raw SQL via the SQL endpoint
      const sqlRes = await fetch(`${this.url}/rest/v1/`, {
        method: 'POST',
        headers: this.headers,
        body: sql,
      });
      return sqlRes.ok ? sqlRes.json() : null;
    }
    return res.json();
  }

  private async del(table: string, params: string): Promise<void> {
    await fetch(`${this.url}/rest/v1/${table}?${params}`, {
      method: 'DELETE',
      headers: this.headers,
    });
  }

  // -- Pins --

  async hasPin(did: string): Promise<boolean> {
    const rows = await this.query('alfred_pins', `did=eq.${encodeURIComponent(did)}&select=did&limit=1`);
    return rows.length > 0;
  }

  async getPin(did: string): Promise<{ publicKey: string; firstContact: string } | undefined> {
    const rows = await this.query('alfred_pins', `did=eq.${encodeURIComponent(did)}&select=public_key,first_contact&limit=1`) as Array<{ public_key: string; first_contact: string }>;
    if (rows.length === 0) return undefined;
    return { publicKey: rows[0].public_key, firstContact: rows[0].first_contact };
  }

  async setPin(did: string, publicKey: string): Promise<void> {
    await this.insert('alfred_pins', { did, public_key: publicKey, first_contact: new Date().toISOString() });
  }

  // -- Idempotency --

  async hasMessage(messageId: string): Promise<boolean> {
    const rows = await this.query('alfred_idempotency', `message_id=eq.${encodeURIComponent(messageId)}&select=message_id&limit=1`);
    return rows.length > 0;
  }

  async addMessage(messageId: string): Promise<void> {
    await this.insert('alfred_idempotency', { message_id: messageId, received_at: Date.now() });
  }

  async reapStaleMessages(): Promise<void> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    await this.del('alfred_idempotency', `received_at=lt.${cutoff}`);
  }

  // -- Message history --

  async logMessage(msg: MessageLog): Promise<void> {
    await this.insert('alfred_messages', {
      message_id: msg.messageId,
      direction: msg.direction,
      from_did: msg.from,
      to_did: msg.to,
      type: msg.type,
      capability: msg.capability ?? null,
      body: msg.body ?? null,
      response: msg.response ?? null,
      created_at: msg.createdAt,
    });
  }

  async getRecentMessages(limit = 50): Promise<Array<Record<string, unknown>>> {
    return this.query('alfred_messages', `order=id.desc&limit=${limit}`) as Promise<Array<Record<string, unknown>>>;
  }

  // -- Conversation memory --

  async addConversationTurn(peerDid: string, role: 'user' | 'assistant', content: string, capability: string): Promise<void> {
    await this.insert('alfred_conversations', {
      peer_did: peerDid,
      role,
      content,
      capability,
      created_at: new Date().toISOString(),
    });
  }

  async getConversationHistory(peerDid: string, limit = 20): Promise<ConversationTurn[]> {
    const rows = await this.query(
      'alfred_conversations',
      `peer_did=eq.${encodeURIComponent(peerDid)}&select=role,content,capability,created_at&order=id.desc&limit=${limit}`,
    ) as Array<{ role: string; content: string; capability: string; created_at: string }>;

    return rows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
      capability: r.capability,
      createdAt: r.created_at,
    }));
  }

  async close(): Promise<void> {
    // No persistent connection to close with REST API
  }
}
