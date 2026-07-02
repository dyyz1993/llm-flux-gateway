/**
 * Anthropic 输出适配器测试
 *
 * 覆盖 AGENTS.md T23-T35
 */
import { describe, it, expect } from 'vitest';
import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';
import { piEventToAnthropicSSE, piResponseToAnthropicJson } from '../../output/anthropic.adapter';

// ============================================================
// SSE 格式验证辅助
// ============================================================

function validateAnthropicSSE(sseLine: string): { valid: boolean; errors: string[]; eventType?: string; parsed?: any } {
  const errors: string[] = [];

  // 必须包含 "event: " 和 "\ndata: "
  if (!sseLine.startsWith('event: ')) {
    errors.push(`Must start with "event: ", got: ${sseLine.slice(0, 20)}`);
    return { valid: false, errors };
  }

  const dataStart = sseLine.indexOf('\ndata: ');
  if (dataStart === -1) {
    errors.push('Must contain "\\ndata: "');
    return { valid: false, errors };
  }

  if (!sseLine.endsWith('\n\n')) {
    errors.push('Must end with "\\n\\n"');
    return { valid: false, errors };
  }

  const eventType = sseLine.slice(7, dataStart); // "event: " 后到 "\ndata: "
  const jsonStr = sseLine.slice(dataStart + 7, -2); // "\ndata: " 后到 "\n\n"

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e: any) {
    errors.push(`Invalid JSON: ${e.message}`);
    return { valid: false, errors };
  }

  // 按事件类型验证
  const validEvents = ['message_start', 'message_delta', 'message_stop', 'content_block_start', 'content_block_delta', 'content_block_stop', 'ping', 'error'];
  if (!validEvents.includes(eventType)) {
    errors.push(`Unknown event type: ${eventType}`);
  }
  if (parsed.type !== eventType) {
    errors.push(`Event type mismatch: "${eventType}" vs data.type "${parsed.type}"`);
  }

  return { valid: errors.length === 0, errors, eventType, parsed };
}

// ============================================================
// Mock 事件辅助
// ============================================================

function makeEmptyUsage(): AssistantMessage['usage'] {
  return { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

function makeStartEvent(model = 'claude-sonnet-4-5'): AssistantMessageEvent {
  return {
    type: 'start',
    partial: { role: 'assistant', content: [], api: 'anthropic-messages', provider: 'anthropic', model, usage: makeEmptyUsage(), stopReason: null as any, timestamp: Date.now() },
  };
}

function makeTextStartEvent(ci = 0): AssistantMessageEvent {
  return { type: 'text_start', contentIndex: ci, partial: null as any };
}

function makeTextDeltaEvent(delta: string, ci = 0): AssistantMessageEvent {
  return { type: 'text_delta', contentIndex: ci, delta, partial: null as any };
}

function makeTextEndEvent(text: string, ci = 0): AssistantMessageEvent {
  return { type: 'text_end', contentIndex: ci, content: text, partial: null as any };
}

function makeThinkingStartEvent(ci = 0): AssistantMessageEvent {
  return { type: 'thinking_start', contentIndex: ci, partial: null as any };
}

function makeThinkingDeltaEvent(delta: string, ci = 0): AssistantMessageEvent {
  return { type: 'thinking_delta', contentIndex: ci, delta, partial: null as any };
}

function makeThinkingEndEvent(text: string, ci = 0): AssistantMessageEvent {
  return { type: 'thinking_end', contentIndex: ci, content: text, partial: null as any };
}

function makeToolCallEndEvent(name: string, args: Record<string, any>, ci = 0): AssistantMessageEvent {
  return { type: 'toolcall_end', contentIndex: ci, toolCall: { type: 'toolCall', id: `toolu_${ci}`, name, arguments: args }, partial: null as any };
}

function makeDoneEvent(reason: 'stop' | 'length' | 'toolUse', msg?: Partial<AssistantMessage>): AssistantMessageEvent {
  const defaultMsg: AssistantMessage = {
    role: 'assistant', content: [], api: 'anthropic-messages', provider: 'anthropic', model: 'claude-sonnet-4-5',
    usage: { input: 50, output: 100, totalTokens: 150, cacheRead: 10, cacheWrite: 5, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } },
    stopReason: reason, timestamp: Date.now(),
  };
  return { type: 'done', reason, message: { ...defaultMsg, ...msg } };
}

function makeErrorEvent(errorMessage = 'Upstream error'): AssistantMessageEvent {
  return {
    type: 'error', reason: 'error',
    error: { role: 'assistant', content: [], api: 'anthropic-messages', provider: 'anthropic', model: 'claude-sonnet-4-5',
      usage: makeEmptyUsage(), stopReason: 'error', errorMessage, timestamp: Date.now() },
  };
}

// ============================================================
// 测试
// ============================================================

describe('Anthropic 输出适配器 — 流式 (SSE)', () => {
  it('T23: start → message_start 事件', () => {
    const lines = [...piEventToAnthropicSSE(makeStartEvent())];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('message_start');
    expect(result.parsed!.message.role).toBe('assistant');
  });

  it('T24: text_start → content_block_start (type: text)', () => {
    const lines = [...piEventToAnthropicSSE(makeTextStartEvent())];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('content_block_start');
    expect(result.parsed!.content_block.type).toBe('text');
  });

  it('T25: text_delta → content_block_delta (delta.type: text_delta)', () => {
    const lines = [...piEventToAnthropicSSE(makeTextDeltaEvent('Hello'))];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('content_block_delta');
    expect(result.parsed!.delta.type).toBe('text_delta');
    expect(result.parsed!.delta.text).toBe('Hello');
  });

  it('T26: text_end → content_block_stop', () => {
    const lines = [...piEventToAnthropicSSE(makeTextEndEvent('Hello'))];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('content_block_stop');
  });

  it('T27: thinking_start → content_block_start (type: thinking)', () => {
    const lines = [...piEventToAnthropicSSE(makeThinkingStartEvent(1))];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('content_block_start');
    expect(result.parsed!.content_block.type).toBe('thinking');
    expect(result.parsed!.index).toBe(1);
  });

  it('T28: thinking_delta → content_block_delta (delta.type: thinking_delta)', () => {
    const lines = [...piEventToAnthropicSSE(makeThinkingDeltaEvent('Let me think...', 1))];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('content_block_delta');
    expect(result.parsed!.delta.type).toBe('thinking_delta');
    expect(result.parsed!.delta.thinking).toBe('Let me think...');
  });

  it('T29: thinking_end → content_block_stop', () => {
    const lines = [...piEventToAnthropicSSE(makeThinkingEndEvent('Done', 1))];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('content_block_stop');
  });

  it('T30-T32: toolcall_end → content_block_start (tool_use) + content_block_stop', () => {
    const lines = [...piEventToAnthropicSSE(makeToolCallEndEvent('get_weather', { city: 'Tokyo' }))];
    expect(lines).toHaveLength(2);
    // start
    const startResult = validateAnthropicSSE(lines[0]!);
    expect(startResult.valid).toBe(true);
    expect(startResult.eventType).toBe('content_block_start');
    expect(startResult.parsed!.content_block.type).toBe('tool_use');
    expect(startResult.parsed!.content_block.name).toBe('get_weather');
    expect(startResult.parsed!.content_block.input).toEqual({ city: 'Tokyo' });
    // stop
    const stopResult = validateAnthropicSSE(lines[1]!);
    expect(stopResult.valid).toBe(true);
    expect(stopResult.eventType).toBe('content_block_stop');
  });

  it('T33: done → message_delta (stop_reason) + message_stop', () => {
    const lines = [...piEventToAnthropicSSE(makeDoneEvent('stop'))];
    expect(lines).toHaveLength(2);
    // message_delta
    const deltaResult = validateAnthropicSSE(lines[0]!);
    expect(deltaResult.valid).toBe(true);
    expect(deltaResult.eventType).toBe('message_delta');
    expect(deltaResult.parsed!.delta.stop_reason).toBe('end_turn');
    expect(deltaResult.parsed!.usage.input_tokens).toBe(50);
    // message_stop
    const stopResult = validateAnthropicSSE(lines[1]!);
    expect(stopResult.valid).toBe(true);
    expect(stopResult.eventType).toBe('message_stop');
  });

  it('T33b: done (toolUse) → stop_reason: "tool_use"', () => {
    const lines = [...piEventToAnthropicSSE(makeDoneEvent('toolUse'))];
    const deltaResult = validateAnthropicSSE(lines[0]!);
    expect(deltaResult.parsed!.delta.stop_reason).toBe('tool_use');
  });

  it('T33c: done (length) → stop_reason: "max_tokens"', () => {
    const lines = [...piEventToAnthropicSSE(makeDoneEvent('length'))];
    const deltaResult = validateAnthropicSSE(lines[0]!);
    expect(deltaResult.parsed!.delta.stop_reason).toBe('max_tokens');
  });

  it('T34: error → error 事件', () => {
    const lines = [...piEventToAnthropicSSE(makeErrorEvent('Rate limit exceeded'))];
    expect(lines).toHaveLength(1);
    const result = validateAnthropicSSE(lines[0]!);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('error');
    expect(result.parsed!.error.message).toBe('Rate limit exceeded');
  });

  it('T35: usage 字段映射：cacheRead → cache_read_input_tokens', () => {
    const lines = [...piEventToAnthropicSSE(makeDoneEvent('stop'))];
    const deltaResult = validateAnthropicSSE(lines[0]!);
    expect(deltaResult.parsed!.usage.cache_read_input_tokens).toBe(10);
  });
});

describe('Anthropic 输出适配器 — 非流式 (JSON)', () => {
  it('Anthropic Message 响应结构', () => {
    const msg = fauxAssistantMessage([fauxText('Hello')], { stopReason: 'stop' });
    const resp = piResponseToAnthropicJson(msg);
    expect(resp.type).toBe('message');
    expect(resp.role).toBe('assistant');
    expect(resp.content).toHaveLength(1);
    expect(resp.content[0].type).toBe('text');
    expect(resp.content[0].text).toBe('Hello');
    expect(resp.stop_reason).toBe('end_turn');
  });

  it('工具调用 → tool_use content block', () => {
    const msg = fauxAssistantMessage([fauxToolCall('get_weather', { city: 'Tokyo' })], { stopReason: 'toolUse' });
    const resp = piResponseToAnthropicJson(msg);
    expect(resp.content).toHaveLength(1);
    expect(resp.content[0].type).toBe('tool_use');
    expect(resp.content[0].name).toBe('get_weather');
    expect(resp.content[0].input).toEqual({ city: 'Tokyo' });
    expect(resp.stop_reason).toBe('tool_use');
  });

  it('thinking 块 → thinking content block', () => {
    const msg = fauxAssistantMessage([fauxThinking('Step by step...')], { stopReason: 'stop' });
    const resp = piResponseToAnthropicJson(msg);
    expect(resp.content[0].type).toBe('thinking');
    expect(resp.content[0].thinking).toBe('Step by step...');
  });

  it('混合内容: text + tool_use', () => {
    const msg = fauxAssistantMessage([
      fauxText('I will check'),
      fauxToolCall('get_weather', { city: 'Tokyo' }),
    ], { stopReason: 'toolUse' });
    const resp = piResponseToAnthropicJson(msg);
    expect(resp.content).toHaveLength(2);
    expect(resp.content[0].type).toBe('text');
    expect(resp.content[1].type).toBe('tool_use');
    expect(resp.stop_reason).toBe('tool_use');
  });

  it('usage 字段正确映射', () => {
    const msg = fauxAssistantMessage([fauxText('Hi')]);
    const resp = piResponseToAnthropicJson(msg);
    expect(resp.usage.input_tokens).toBe(msg.usage.input);
    expect(resp.usage.output_tokens).toBe(msg.usage.output);
    expect(resp.usage.cache_read_input_tokens).toBe(msg.usage.cacheRead);
    expect(resp.usage.cache_write_input_tokens).toBe(msg.usage.cacheWrite);
  });
});
