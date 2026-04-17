import OpenAI from 'openai';
import type { AIProvider, AIMessage, AIToolDefinition, AIChatResult } from './types.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages: AIMessage[], tools?: AIToolDefinition[]): Promise<AIChatResult> {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId! };
      }
      return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
    });

    const params: OpenAI.ChatCompletionCreateParams = {
      model: this.model,
      messages: openaiMessages,
    };

    if (tools?.length) {
      params.tools = tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    const result: AIChatResult = { text: choice?.message?.content ?? null, toolCalls: [] };

    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        result.toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return result;
  }
}
