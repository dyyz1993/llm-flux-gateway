/**
 * Gemini 输出适配器测试
 *
 * 覆盖 AGENTS.md T36-T39
 */
import { describe, it, expect } from 'vitest';
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';
import { piEventToGeminiSSE, piResponseToGeminiJson } from '../../output/gemini.adapter';

function makeEmptyUsage(): AssistantMessage['usage'] {
  return { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

function makeTextDeltaEvent(delta: string): AssistantMessageEvent {
  return { type: 'text_delta', contentIndex: 0, delta, partial: null as any };
}

function makeToolCallEndEvent(name: string, args: Record<string, any>): AssistantMessageEvent {
  return { type: 'toolcall_end', contentIndex: 0, toolCall: { type: 'toolCall', id: `call_0`, name, arguments: args }, partial: null as any };
}

function makeDoneEvent(reason: 'stop' | 'length' | 'toolUse'): AssistantMessageEvent {
  return {
    type: 'done', reason,
    message: {
      role: 'assistant', content: [], api: 'gemini', provider: 'google', model: 'gemini-2.0-flash',
      usage: { input: 50, output: 100, totalTokens: 150, cacheRead: 10, cacheWrite: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: reason, timestamp: Date.now(),
    },
  };
}

function makeErrorEvent(msg = 'Error'): AssistantMessageEvent {
  return {
    type: 'error', reason: 'error',
    error: { role: 'assistant', content: [], api: 'gemini', provider: 'google', model: 'gemini-2.0-flash',
      usage: makeEmptyUsage(), stopReason: 'error', errorMessage: msg, timestamp: Date.now() },
  };
}

describe('Gemini 输出适配器 — 流式', () => {
  it('T36: text_delta → candidates[0].content.parts[0].text', () => {
    const lines = [...piEventToGeminiSSE(makeTextDeltaEvent('Hello'))];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^data: /);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.candidates[0].content.parts[0].text).toBe('Hello');
  });

  it('T37: done → finishReason + usageMetadata', () => {
    const lines = [...piEventToGeminiSSE(makeDoneEvent('stop'))];
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.candidates[0].finish_reason).toBe('STOP');
    expect(parsed.usageMetadata.promptTokenCount).toBe(50);
    expect(parsed.usageMetadata.candidatesTokenCount).toBe(100);
  });

  it('T37b: done (toolUse) → finish_reason: STOP', () => {
    const lines = [...piEventToGeminiSSE(makeDoneEvent('toolUse'))];
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.candidates[0].finish_reason).toBe('STOP');
  });

  it('T38: toolcall_end → functionCall', () => {
    const lines = [...piEventToGeminiSSE(makeToolCallEndEvent('get_weather', { city: 'Tokyo' }))];
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.candidates[0].content.parts[0].functionCall.name).toBe('get_weather');
    expect(parsed.candidates[0].content.parts[0].functionCall.args).toEqual({ city: 'Tokyo' });
  });

  it('error → error 结构', () => {
    const lines = [...piEventToGeminiSSE(makeErrorEvent('Internal error'))];
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.error.message).toBe('Internal error');
  });
});

describe('Gemini 输出适配器 — 非流式', () => {
  it('T39: AssistantMessage → GenerateContentResponse', () => {
    const msg = fauxAssistantMessage([fauxText('Hello')], { stopReason: 'stop' });
    const resp = piResponseToGeminiJson(msg);
    expect(resp.candidates).toHaveLength(1);
    expect(resp.candidates[0].content.parts[0].text).toBe('Hello');
    expect(resp.candidates[0].finish_reason).toBe('STOP');
  });

  it('工具调用 → functionCall', () => {
    const msg = fauxAssistantMessage([fauxToolCall('get_weather', { city: 'Tokyo' })], { stopReason: 'toolUse' });
    const resp = piResponseToGeminiJson(msg);
    expect(resp.candidates[0].content.parts[0].functionCall.name).toBe('get_weather');
    expect(resp.candidates[0].content.parts[0].functionCall.args).toEqual({ city: 'Tokyo' });
  });

  it('usage 字段正确映射', () => {
    const msg = fauxAssistantMessage([fauxText('Hi')]);
    const resp = piResponseToGeminiJson(msg);
    expect(resp.usageMetadata.promptTokenCount).toBe(msg.usage.input);
    expect(resp.usageMetadata.candidatesTokenCount).toBe(msg.usage.output);
    expect(resp.usageMetadata.cachedContentTokenCount).toBe(msg.usage.cacheRead);
  });
});
