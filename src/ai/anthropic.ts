import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIMessage, AIToolDefinition, AIChatResult } from './types.js';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages: AIMessage[], tools?: AIToolDefinition[]): Promise<AIChatResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.toolCallId!,
            content: m.content,
          }],
        });
      } else {
        anthropicMessages.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        });
      }
    }

    const params: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: 2048,
      system,
      messages: anthropicMessages,
    };

    if (tools?.length) {
      params.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool['input_schema'],
      }));
    }

    const response = await this.client.messages.create(params);

    const result: AIChatResult = { text: null, toolCalls: [] };

    for (const block of response.content) {
      if (block.type === 'text') {
        result.text = block.text;
      } else if (block.type === 'tool_use') {
        result.toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return result;
  }
}
