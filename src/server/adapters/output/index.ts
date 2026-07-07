/**
 * 输出适配器注册表
 *
 * 根据 responseFormat 选择对应的输出适配器。
 */
import { piResponseToOpenaiJson, createOpenaiSSEConverter } from './openai.adapter';
import { piEventToAnthropicSSE, piResponseToAnthropicJson } from './anthropic.adapter';
import { piEventToGeminiSSE, piResponseToGeminiJson } from './gemini.adapter';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

export type ResponseFormat = 'openai' | 'anthropic' | 'gemini';

export interface OutputAdapter {
  eventToSSE(event: AssistantMessageEvent): Generator<string>;
  responseToJson(msg: AssistantMessage): Record<string, any>;
}

// 每个 adapter 实例可以有自己的状态（如 reasoning 合并）
const openaiAdapter: OutputAdapter = {
  eventToSSE: createOpenaiSSEConverter().eventToSSE,
  responseToJson: piResponseToOpenaiJson,
};

const registry: Partial<Record<ResponseFormat, OutputAdapter>> = {
  openai: openaiAdapter,
  anthropic: {
    eventToSSE: piEventToAnthropicSSE,
    responseToJson: piResponseToAnthropicJson,
  },
  gemini: {
    eventToSSE: piEventToGeminiSSE,
    responseToJson: piResponseToGeminiJson,
  },
};

export function getOutputAdapter(format: ResponseFormat): OutputAdapter {
  const adapter = registry[format];
  if (!adapter) {
    throw new Error(`No output adapter registered for format: ${format}`);
  }
  return adapter;
}

export function registerOutputAdapter(format: ResponseFormat, adapter: OutputAdapter): void {
  registry[format] = adapter;
}
