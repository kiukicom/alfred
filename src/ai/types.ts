export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIChatResult {
  text: string | null;
  toolCalls: AIToolCall[];
}

export interface AIProvider {
  chat(messages: AIMessage[], tools?: AIToolDefinition[]): Promise<AIChatResult>;
}
