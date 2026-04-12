import type { AIProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';

export type { AIProvider, AIMessage } from './types.js';

export function createProvider(
  provider: 'anthropic' | 'openai' | 'gemini',
  apiKey: string,
  model: string,
): AIProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'gemini':
      return new GeminiProvider(apiKey, model);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
