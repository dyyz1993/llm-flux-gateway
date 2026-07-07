/**
 * 输出适配器注册表
 *
 * 根据 responseFormat 选择对应的输出适配器。
 *
 * 注意：流式转换器（eventToSSE）是带状态的（thinking 标记、响应元数据等），
 * 因此每次流式请求前需要创建新的 converter 实例。
 * 使用 createStreamConverter() 工厂方法创建。
 */
import { piResponseToOpenaiJson, createOpenaiSSEConverter } from './openai.adapter';
import { piEventToAnthropicSSE, piResponseToAnthropicJson } from './anthropic.adapter';
import { piEventToGeminiSSE, piResponseToGeminiJson } from './gemini.adapter';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

export type ResponseFormat = 'openai' | 'anthropic' | 'gemini';

/**
 * SSE 流式转换器实例。
 * 每个流式请求创建一个新实例，包含独立的 state。
 */
export interface SSEConverter {
  eventToSSE(event: AssistantMessageEvent): Generator<string>;
}

export interface OutputAdapter {
  /**
   * 为流式请求创建新的 SSE 转换器实例。
   * 每次流式响应前调用，返回带独立 state 的转换器。
   */
  createStreamConverter(): SSEConverter;
  responseToJson(msg: AssistantMessage): Record<string, any>;
}

const openaiAdapter: OutputAdapter = {
  createStreamConverter: () => createOpenaiSSEConverter(),
  responseToJson: piResponseToOpenaiJson,
};

const registry: Partial<Record<ResponseFormat, OutputAdapter>> = {
  openai: openaiAdapter,
  anthropic: {
    createStreamConverter: () => ({
      eventToSSE: piEventToAnthropicSSE,
    }),
    responseToJson: piResponseToAnthropicJson,
  },
  gemini: {
    createStreamConverter: () => ({
      eventToSSE: piEventToGeminiSSE,
    }),
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
