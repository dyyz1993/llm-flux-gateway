/**
 * 输出适配器注册表
 *
 * 根据 responseFormat 选择对应的输出适配器。
 */
import { piEventToOpenaiSSE, piResponseToOpenaiJson } from './openai.adapter';
import { piEventToAnthropicSSE, piResponseToAnthropicJson } from './anthropic.adapter';
import { piEventToGeminiSSE, piResponseToGeminiJson } from './gemini.adapter';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

export type ResponseFormat = 'openai' | 'anthropic' | 'gemini';

export interface OutputAdapter {
  /** 流式: pi-ai 事件 → 厂商 SSE 文本行 */
  eventToSSE(event: AssistantMessageEvent): Generator<string>;
  /** 非流式: pi-ai AssistantMessage → 厂商 JSON */
  responseToJson(msg: AssistantMessage): Record<string, any>;
}

const registry: Partial<Record<ResponseFormat, OutputAdapter>> = {
  openai: {
    eventToSSE: piEventToOpenaiSSE,
    responseToJson: piResponseToOpenaiJson,
  },
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
