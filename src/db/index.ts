import type { AlfredStore } from './types.js';
import type { StorageConfig } from '../config.js';
import { SQLiteStore } from './sqlite.js';

export type { AlfredStore, ConversationTurn, MessageLog } from './types.js';

export async function createStore(config: StorageConfig, dataDir: string): Promise<AlfredStore> {
  switch (config.driver) {
    case 'sqlite': {
      return new SQLiteStore(dataDir);
    }
    case 'supabase': {
      if (!config.url || !config.key) {
        throw new Error('storage.url and storage.key are required for Supabase');
      }
      // Dynamic import so sqlite-only users don't need supabase deps
      const { SupabaseStore } = await import('./supabase.js');
      const store = new SupabaseStore(config.url, config.key);
      await store.init();
      return store;
    }
    default:
      throw new Error(`Unknown storage driver: ${config.driver}`);
  }
}
