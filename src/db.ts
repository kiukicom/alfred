import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export class AlfredDB {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'alfred.db'));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pins (
        did TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        first_contact TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS idempotency (
        message_id TEXT PRIMARY KEY,
        received_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        from_did TEXT NOT NULL,
        to_did TEXT NOT NULL,
        type TEXT NOT NULL,
        capability TEXT,
        body TEXT,
        response TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_did);
      CREATE INDEX IF NOT EXISTS idx_messages_capability ON messages(capability);
    `);
  }

  // -- Pins ------------------------------------------------------------------

  hasPin(did: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM pins WHERE did = ?').get(did);
    return !!row;
  }

  getPin(did: string): { publicKey: string; firstContact: string } | undefined {
    const row = this.db.prepare('SELECT public_key, first_contact FROM pins WHERE did = ?').get(did) as
      | { public_key: string; first_contact: string }
      | undefined;
    if (!row) return undefined;
    return { publicKey: row.public_key, firstContact: row.first_contact };
  }

  setPin(did: string, publicKey: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO pins (did, public_key, first_contact) VALUES (?, ?, ?)',
    ).run(did, publicKey, new Date().toISOString());
  }

  // -- Idempotency -----------------------------------------------------------

  hasMessage(messageId: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM idempotency WHERE message_id = ?').get(messageId);
    return !!row;
  }

  addMessage(messageId: string): void {
    this.db.prepare(
      'INSERT OR IGNORE INTO idempotency (message_id, received_at) VALUES (?, ?)',
    ).run(messageId, Date.now());
  }

  reapStaleMessages(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM idempotency WHERE received_at < ?').run(cutoff);
  }

  // -- Message history -------------------------------------------------------

  logMessage(msg: {
    messageId: string;
    direction: 'inbound' | 'outbound';
    from: string;
    to: string;
    type: string;
    capability?: string;
    body?: Record<string, unknown>;
    response?: Record<string, unknown>;
    createdAt: string;
  }): void {
    this.db.prepare(`
      INSERT INTO messages (message_id, direction, from_did, to_did, type, capability, body, response, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.messageId,
      msg.direction,
      msg.from,
      msg.to,
      msg.type,
      msg.capability ?? null,
      msg.body ? JSON.stringify(msg.body) : null,
      msg.response ? JSON.stringify(msg.response) : null,
      msg.createdAt,
    );
  }

  getRecentMessages(limit = 50): Array<Record<string, unknown>> {
    return this.db.prepare(
      'SELECT * FROM messages ORDER BY id DESC LIMIT ?',
    ).all(limit) as Array<Record<string, unknown>>;
  }

  close(): void {
    this.db.close();
  }
}
