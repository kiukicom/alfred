import type { AIProvider, AIMessage, AIToolDefinition, AIChatResult } from './types.js';

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: AIMessage[], tools?: AIToolDefinition[]): Promise<AIChatResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = messages
      .filter((m) => m.role !== 'system' && m.role !== 'tool')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: system }] },
      contents,
    };

    if (tools?.length) {
      body.tools = [{
        function_declarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> } }[];
    };

    const result: AIChatResult = { text: null, toolCalls: [] };
    const parts = data.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (part.text) {
        result.text = part.text;
      } else if (part.functionCall) {
        result.toolCalls.push({
          id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }

    return result;
  }
}
