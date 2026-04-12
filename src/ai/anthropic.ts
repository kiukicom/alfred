import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIMessage } from './types.js';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages: AIMessage[]): Promise<string> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: userMessages,
    });

    const block = response.content[0];
    if (block.type === 'text') return block.text;
    return '';
  }
}
