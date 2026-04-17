export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  capability: string;
  createdAt: string;
}

export interface MessageLog {
  messageId: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  type: string;
  capability?: string;
  body?: Record<string, unknown>;
  response?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Storage interface for Alfred.
 * Implement this to add a new database backend.
 */
export interface AlfredStore {
  // -- Pins --
  hasPin(did: string): boolean | Promise<boolean>;
  getPin(did: string): { publicKey: string; firstContact: string } | undefined | Promise<{ publicKey: string; firstContact: string } | undefined>;
  setPin(did: string, publicKey: string): void | Promise<void>;

  // -- Idempotency --
  hasMessage(messageId: string): boolean | Promise<boolean>;
  addMessage(messageId: string): void | Promise<void>;
  reapStaleMessages(): void | Promise<void>;

  // -- Message history --
  logMessage(msg: MessageLog): void | Promise<void>;
  getRecentMessages(limit?: number): Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;

  // -- Conversation memory --
  addConversationTurn(peerDid: string, role: 'user' | 'assistant', content: string, capability: string): void | Promise<void>;
  getConversationHistory(peerDid: string, limit?: number): ConversationTurn[] | Promise<ConversationTurn[]>;

  // -- Lifecycle --
  close(): void | Promise<void>;
}
