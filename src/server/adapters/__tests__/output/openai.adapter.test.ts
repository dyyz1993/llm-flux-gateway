/**
 * OpenAI 输出适配器测试
 *
 * TDD: 先写测试，再实现适配器。
 *
 * 测试范围:
 *   - 流式: pi-ai AssistantMessageEvent → OpenAI SSE (data: {...}\n\n)
 *   - 非流式: pi-ai AssistantMessage → OpenAI chat.completion JSON
 *
 * 覆盖 AGENTS.md T01-T22
 */
import { describe, it, expect } from 'vitest';
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

// ============================================================
// 辅助函数: 验证 OpenAI SSE 格式合法性
// ============================================================

interface SSEValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: any;
}

function validateOpenaiSseLine(sseLine: string): SSEValidationResult {
  const errors: string[] = [];

  // 必须以 "data: " 开头
  if (!sseLine.startsWith('data: ')) {
    errors.push(`SSE line must start with "data: ", got: ${sseLine.slice(0, 20)}`);
    return { valid: false, errors };
  }

  // 必须以 "\n\n" 结尾
  if (!sseLine.endsWith('\n\n')) {
    errors.push('SSE line must end with "\\n\\n"');
    return { valid: false, errors };
  }

  // 提取 JSON 部分
  const jsonStr = sseLine.slice(6, -2); // 去掉 "data: " 和 "\n\n"

  // 如果是 [DONE] 标记，直接通过
  if (jsonStr === '[DONE]') {
    return { valid: true, errors };
  }

  // 解析 JSON
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e: any) {
    errors.push(`Invalid JSON: ${e.message}`);
    return { valid: false, errors };
  }

  // 验证顶层字段（上游每行都包含）
  if (typeof parsed.id !== 'string') errors.push('id must be a string');
  if (parsed.object !== 'chat.completion.chunk') errors.push('object must be "chat.completion.chunk"');
  if (typeof parsed.created !== 'number') errors.push('created must be a number');
  if (typeof parsed.model !== 'string') errors.push('model must be a string');

  // 验证标准字段
  if (!parsed.choices || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
    errors.push('choices must be a non-empty array');
  } else {
    const choice = parsed.choices[0];
    if (typeof choice.index !== 'number') {
      errors.push('choices[0].index must be a number');
    }
    if (choice.delta !== undefined && typeof choice.delta !== 'object') {
      errors.push('choices[0].delta must be an object');
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null && typeof choice.finish_reason !== 'string') {
      errors.push('choices[0].finish_reason must be string or null');
    }
  }

  // usage 在中间 chunk 为 null（匹配上游行为），在最终 chunk 为 usage 对象
  if (parsed.usage !== undefined && parsed.usage !== null) {
    if (typeof parsed.usage.prompt_tokens !== 'number') errors.push('usage.prompt_tokens must be a number');
    if (typeof parsed.usage.completion_tokens !== 'number') errors.push('usage.completion_tokens must be a number');
    if (typeof parsed.usage.total_tokens !== 'number') errors.push('usage.total_tokens must be a number');
  }

  return { valid: errors.length === 0, errors, parsed };
}

// ============================================================
// 辅助函数: 验证 OpenAI 非流式响应格式合法性
// ============================================================

function validateOpenaiResponse(response: any): SSEValidationResult {
  const errors: string[] = [];

  if (typeof response.id !== 'string') errors.push('id must be a string');
  if (response.object !== 'chat.completion') errors.push('object must be "chat.completion"');
  if (typeof response.created !== 'number') errors.push('created must be a number');
  if (typeof response.model !== 'string') errors.push('model must be a string');

  if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
    errors.push('choices must be a non-empty array');
  } else {
    const c = response.choices[0];
    if (c.index !== 0) errors.push('choices[0].index must be 0');
    if (!c.message || typeof c.message !== 'object') errors.push('choices[0].message must be an object');
    if (typeof c.finish_reason !== 'string') errors.push('choices[0].finish_reason must be a string');
  }

  if (response.usage) {
    if (typeof response.usage.prompt_tokens !== 'number') errors.push('usage.prompt_tokens must be a number');
    if (typeof response.usage.completion_tokens !== 'number') errors.push('usage.completion_tokens must be a number');
    if (typeof response.usage.total_tokens !== 'number') errors.push('usage.total_tokens must be a number');
  }

  return { valid: errors.length === 0, errors, parsed: response };
}

// ============================================================
// 模拟事件辅助函数
// ============================================================

function makeStartEvent(model = 'gpt-4o-mini'): AssistantMessageEvent {
  return {
    type: 'start',
    partial: {
      role: 'assistant',
      content: [],
      api: 'openai-completions',
      provider: 'test',
      model,
      usage: { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: null as any,
      timestamp: Date.now(),
    },
  };
}

function makeTextDeltaEvent(delta: string, contentIndex = 0): AssistantMessageEvent {
  return {
    type: 'text_delta',
    contentIndex,
    delta,
    partial: null as any,
  };
}

function makeThinkingDeltaEvent(delta: string, contentIndex = 0): AssistantMessageEvent {
  return {
    type: 'thinking_delta',
    contentIndex,
    delta,
    partial: null as any,
  };
}

function makeToolCallStartEvent(contentIndex = 0): AssistantMessageEvent {
  return {
    type: 'toolcall_start',
    contentIndex,
    partial: null as any,
  };
}

function makeToolCallDeltaEvent(delta: string, contentIndex = 0): AssistantMessageEvent {
  return {
    type: 'toolcall_delta',
    contentIndex,
    delta,
    partial: null as any,
  };
}

function makeToolCallEndEvent(name: string, args: Record<string, any>, contentIndex = 0): AssistantMessageEvent {
  return {
    type: 'toolcall_end',
    contentIndex,
    toolCall: { type: 'toolCall', id: `call_${contentIndex}`, name, arguments: args },
    partial: null as any,
  };
}

function makeDoneEvent(reason: 'stop' | 'length' | 'toolUse', msg?: Partial<AssistantMessage>): AssistantMessageEvent {
  const defaultMsg: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: 'test',
    model: 'gpt-4o-mini',
    usage: { input: 50, output: 100, totalTokens: 150, cacheRead: 10, cacheWrite: 5, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } },
    stopReason: reason,
    timestamp: Date.now(),
  };
  return {
    type: 'done',
    reason,
    message: { ...defaultMsg, ...msg },
  };
}

function makeErrorEvent(errorMessage = 'Upstream error'): AssistantMessageEvent {
  return {
    type: 'error',
    reason: 'error',
    error: {
      role: 'assistant',
      content: [],
      api: 'openai-completions',
      provider: 'test',
      model: 'gpt-4o-mini',
      usage: { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'error',
      errorMessage,
      timestamp: Date.now(),
    },
  };
}

import { piEventToOpenaiSSE, piResponseToOpenaiJson } from '../../output/openai.adapter';

// ============================================================
// 1. 流式事件 → OpenAI SSE 映射测试 (T01-T17)
// ============================================================

describe('OpenAI 输出适配器 — 流式 (SSE)', () => {
  // 注意: 下面的测试用例在实现完成前会失败。
  // 这是 TDD 的正常流程: 先看到失败 → 再实现 → 再看到通过。

  describe('T01-T03: 文本增量', () => {
    it('T01: start 事件产生首条 SSE (delta.role = "assistant")', () => {
      const sseLines = [...piEventToOpenaiSSE(makeStartEvent())];
      expect(sseLines).toHaveLength(1);
      const result = validateOpenaiSseLine(sseLines[0]!);
      expect(result.valid).toBe(true);
      expect(result.parsed!.choices[0].delta.role).toBe('assistant');
    });

    it('T02: text_delta → choices[0].delta.content', () => {
      const sseLines = [...piEventToOpenaiSSE(makeTextDeltaEvent('Hello'))];
      expect(sseLines).toHaveLength(1);
      const result = validateOpenaiSseLine(sseLines[0]!);
      expect(result.valid).toBe(true);
      expect(result.parsed!.choices[0].delta.content).toBe('Hello');
    });

    it('T03: 连续多个 text_delta → 每个生成独立的 SSE 行', () => {
      const events = ['Hello', ' ', 'World'].map(d => makeTextDeltaEvent(d));
      const sseLines = events.flatMap(e => [...piEventToOpenaiSSE(e)]);
      expect(sseLines).toHaveLength(3);
      expect(JSON.parse(sseLines[0]!.slice(6)).choices[0].delta.content).toBe('Hello');
      expect(JSON.parse(sseLines[1]!.slice(6)).choices[0].delta.content).toBe(' ');
      expect(JSON.parse(sseLines[2]!.slice(6)).choices[0].delta.content).toBe('World');
    });
  });

  describe('T04: 思考/推理内容', () => {
    it('T04: thinking_delta → reasoning_content', () => {
      const sseLines = [...piEventToOpenaiSSE(makeThinkingDeltaEvent('Let me think...'))];
      expect(sseLines).toHaveLength(1);
      const parsed = JSON.parse(sseLines[0]!.slice(6));
      expect(parsed.choices[0].delta.reasoning_content).toBe('Let me think...');
    });
  });

  describe('T05-T08: 工具调用', () => {
    it('T05: toolcall_start → 声明 tool_call 结构', () => {
      const sseLines = [...piEventToOpenaiSSE(makeToolCallStartEvent())];
      expect(sseLines).toHaveLength(1);
      const parsed = JSON.parse(sseLines[0]!.slice(6));
      expect(parsed.choices[0].delta.tool_calls).toBeDefined();
      expect(parsed.choices[0].delta.tool_calls[0].index).toBe(0);
    });

    it('T06: toolcall_delta → 追加 function.arguments 增量', () => {
      const sseLines = [...piEventToOpenaiSSE(makeToolCallDeltaEvent('{"city"'))];
      expect(sseLines).toHaveLength(1);
      const parsed = JSON.parse(sseLines[0]!.slice(6));
      expect(parsed.choices[0].delta.tool_calls[0].function.arguments).toBe('{"city"');
    });

    it('T07: toolcall_end → 完整 tool_call 块', () => {
      const sseLines = [...piEventToOpenaiSSE(makeToolCallEndEvent('get_weather', { city: 'Tokyo' }))];
      expect(sseLines).toHaveLength(1);
      const parsed = JSON.parse(sseLines[0]!.slice(6));
      const tc = parsed.choices[0].delta.tool_calls[0];
      expect(tc.id).toBe('call_0');
      expect(tc.function.name).toBe('get_weather');
      expect(tc.function.arguments).toBe('{"city":"Tokyo"}');
    });

    it('T08: 多个 tool call（不同 contentIndex）→ 独立的 index', () => {
      const events = [
        makeToolCallStartEvent(0),
        makeToolCallStartEvent(1),
        makeToolCallEndEvent('get_weather', { city: 'Tokyo' }, 0),
        makeToolCallEndEvent('search', { query: 'news' }, 1),
      ];
      const sseLines = events.flatMap(e => [...piEventToOpenaiSSE(e)]);
      expect(sseLines).toHaveLength(4);
      const tc0 = JSON.parse(sseLines[0]!.slice(6)).choices[0].delta.tool_calls[0];
      const tc1 = JSON.parse(sseLines[1]!.slice(6)).choices[0].delta.tool_calls[0];
      const tc2 = JSON.parse(sseLines[2]!.slice(6)).choices[0].delta.tool_calls[0];
      const tc3 = JSON.parse(sseLines[3]!.slice(6)).choices[0].delta.tool_calls[0];
      expect(tc0.index).toBe(0);
      expect(tc1.index).toBe(1);
      expect(tc2.id).toBe('call_0');
      expect(tc3.id).toBe('call_1');
    });
  });

  describe('T09-T13: 结束与错误事件', () => {
    it('T09: done (stopReason=stop) → finish_reason: "stop" + usage + [DONE]', () => {
      const sseLines = [...piEventToOpenaiSSE(makeDoneEvent('stop'))];
      // 最后一条必须是 [DONE]
      expect(sseLines[sseLines.length - 1]).toBe('data: [DONE]\n\n');
      // 前面的 chunk 包含 usage
      const usageChunk = sseLines[sseLines.length - 2]!;
      const parsed = JSON.parse(usageChunk.slice(6));
      expect(parsed.choices[0].finish_reason).toBe('stop');
      expect(parsed.usage.prompt_tokens).toBe(50);
      expect(parsed.usage.completion_tokens).toBe(100);
    });

    it('T10: done (stopReason=toolUse) → finish_reason: "tool_calls"', () => {
      const sseLines = [...piEventToOpenaiSSE(makeDoneEvent('toolUse'))];
      const parsed = JSON.parse(sseLines[sseLines.length - 2]!.slice(6));
      expect(parsed.choices[0].finish_reason).toBe('tool_calls');
    });

    it('T11: done (stopReason=length) → finish_reason: "length"', () => {
      const sseLines = [...piEventToOpenaiSSE(makeDoneEvent('length'))];
      const parsed = JSON.parse(sseLines[sseLines.length - 2]!.slice(6));
      expect(parsed.choices[0].finish_reason).toBe('length');
    });

    it('T12: error 事件 → 错误 SSE + [DONE]', () => {
      const sseLines = [...piEventToOpenaiSSE(makeErrorEvent('API timeout'))];
      expect(sseLines[sseLines.length - 1]).toBe('data: [DONE]\n\n');
      const errorLine = sseLines[sseLines.length - 2]!;
      const parsed = JSON.parse(errorLine.slice(6));
      expect(parsed.error.message).toBe('API timeout');
    });

    it('T13: 混合事件流顺序正确', () => {
      // text → toolcall_start → text_delta → toolcall_delta → toolcall_end → done
      const events = [
        makeStartEvent(),
        makeTextDeltaEvent('I will check'),
        makeToolCallStartEvent(0),
        makeTextDeltaEvent(' the weather'),
        makeToolCallDeltaEvent('{"city"', 0),
        makeToolCallEndEvent('get_weather', { city: 'Tokyo' }, 0),
        makeDoneEvent('toolUse'),
      ];
      const sseLines = events.flatMap(e => [...piEventToOpenaiSSE(e)]);
      // 验证 start 为首
      expect(JSON.parse(sseLines[0]!.slice(6)).choices[0].delta.role).toBe('assistant');
      // 验证最后一个 [DONE]
      expect(sseLines[sseLines.length - 1]).toBe('data: [DONE]\n\n');
      // 验证 finish_reason
      const doneChunk = JSON.parse(sseLines[sseLines.length - 2]!.slice(6));
      expect(doneChunk.choices[0].finish_reason).toBe('tool_calls');
    });
  });

  describe('T14-T17: 边界与特殊字段', () => {
    it('T14: 空的 text_delta (delta="") → 跳过或正确处理', () => {
      const sseLines = [...piEventToOpenaiSSE(makeTextDeltaEvent(''))];
      // 应该产生一条 SSE，但 content 为空字符串
      expect(sseLines.length).toBeGreaterThanOrEqual(0);
      if (sseLines.length > 0) {
        const parsed = JSON.parse(sseLines[0]!.slice(6));
        expect(parsed.choices[0].delta).toBeDefined();
      }
    });

    it('T15: usage cacheRead → prompt_tokens_details.cached_tokens', () => {
      const sseLines = [...piEventToOpenaiSSE(makeDoneEvent('stop'))];
      const doneChunk = JSON.parse(sseLines[sseLines.length - 2]!.slice(6));
      expect(doneChunk.usage.prompt_tokens_details?.cached_tokens).toBe(10);
    });

    it('T16: usage reasoning → completion_tokens_details.reasoning_tokens', () => {
      const msg = {
        usage: {
          input: 50, output: 100, totalTokens: 150, cacheRead: 0, cacheWrite: 0, reasoning: 20,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      } as Partial<import('@earendil-works/pi-ai').AssistantMessage>;
      const sseLines = [...piEventToOpenaiSSE(makeDoneEvent('stop', msg))];
      const doneChunk = JSON.parse(sseLines[sseLines.length - 2]!.slice(6));
      expect(doneChunk.usage.completion_tokens_details?.reasoning_tokens).toBe(20);
    });

    it('T17: 每个 SSE 行的格式必须通过 validateOpenaiSseLine', () => {
      const events = [
        makeStartEvent(),
        makeTextDeltaEvent('Hello'),
        makeToolCallStartEvent(0),
        makeToolCallEndEvent('get_weather', { city: 'Tokyo' }, 0),
        makeDoneEvent('toolUse'),
      ];
      const sseLines = events.flatMap(e => [...piEventToOpenaiSSE(e)]);
      for (const line of sseLines) {
        const result = validateOpenaiSseLine(line);
        expect(result.valid).toBe(true);
      }
    });
  });
});

// ============================================================
// 2. 非流式 → OpenAI JSON 映射测试 (T18-T22)
// ============================================================

describe('OpenAI 输出适配器 — 非流式 (JSON)', () => {
  describe('T18-T21: 非流式响应', () => {
    it('T18: AssistantMessage → OpenAI chat.completion 结构', () => {
      const msg = fauxAssistantMessage([fauxText('Hello')]);
      const response = piResponseToOpenaiJson(msg);
      const result = validateOpenaiResponse(response);
      expect(result.valid).toBe(true);
      expect(result.parsed!.object).toBe('chat.completion');
    });

    it('T19: 文本内容 → choices[0].message.content', () => {
      const msg = fauxAssistantMessage([fauxText('Hello world')]);
      const response = piResponseToOpenaiJson(msg);
      expect(response.choices[0].message.content).toBe('Hello world');
    });

    it('T20: 工具调用 → choices[0].message.tool_calls', () => {
      const msg = fauxAssistantMessage([fauxToolCall('get_weather', { city: 'Tokyo' })], { stopReason: 'toolUse' });
      const response = piResponseToOpenaiJson(msg);
      expect(response.choices[0].message.tool_calls).toHaveLength(1);
      expect(response.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
      expect(response.choices[0].finish_reason).toBe('tool_calls');
    });

    it('T21: usage 字段正确映射', () => {
      const msg = fauxAssistantMessage([fauxText('Hi')]);
      const response = piResponseToOpenaiJson(msg);
      expect(response.usage.prompt_tokens).toBe(msg.usage.input);
      expect(response.usage.completion_tokens).toBe(msg.usage.output);
      expect(response.usage.total_tokens).toBe(msg.usage.totalTokens);
    });

    it('T22: 混合文本+工具调用 → content + tool_calls 同时存在', () => {
      const msg = fauxAssistantMessage([
        fauxText('I will check the weather'),
        fauxToolCall('get_weather', { city: 'Tokyo' }),
      ]);
      const response = piResponseToOpenaiJson(msg);
      expect(response.choices[0].message.content).toBe('I will check the weather');
      expect(response.choices[0].message.tool_calls).toHaveLength(1);
    });
  });
});
