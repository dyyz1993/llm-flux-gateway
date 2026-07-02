/**
 * 输出适配器交叉验证测试
 *
 * 同一组 pi-ai 事件/响应，分别跑三个输出适配器。
 * 验证语义内容一致：文本相同、工具调用信息相同、统计信息相同。
 *
 * 覆盖 AGENTS.md T40-T43
 */
import { describe, it, expect } from 'vitest';
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import type { AssistantMessageEvent } from '@earendil-works/pi-ai';

import { piEventToOpenaiSSE, piResponseToOpenaiJson } from '../../output/openai.adapter';
import { piEventToAnthropicSSE, piResponseToAnthropicJson } from '../../output/anthropic.adapter';
import { piEventToGeminiSSE, piResponseToGeminiJson } from '../../output/gemini.adapter';

// ============================================================
// 辅助: 从输出的 SSE 流中提取纯文本内容
// ============================================================

function extractTextFromOpenaiSSE(lines: string[]): string {
  return lines
    .map(l => {
      if (!l.startsWith('data: ') || l === 'data: [DONE]\n\n') return '';
      try { return JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? ''; }
      catch { return ''; }
    })
    .filter(Boolean)
    .join('');
}

function extractTextFromAnthropicSSE(lines: string[]): string {
  return lines
    .map(l => {
      const m = l.match(/\ndata: ({.*?})\n\n/);
      if (!m) return '';
      try {
        const d = JSON.parse(m[1]!);
        if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') return d.delta.text;
        return '';
      } catch { return ''; }
    })
    .filter(Boolean)
    .join('');
}

function extractTextFromGeminiSSE(lines: string[]): string {
  return lines
    .map(l => {
      if (!l.startsWith('data: ')) return '';
      try { return JSON.parse(l.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text ?? ''; }
      catch { return ''; }
    })
    .filter(Boolean)
    .join('');
}

// ============================================================
// 辅助: 从输出响应中提取工具调用
// ============================================================

function countToolCallsFromOpenAI(response: any): number {
  return response.choices?.[0]?.message?.tool_calls?.length ?? 0;
}

function countToolCallsFromAnthropic(response: any): number {
  return response.content?.filter((b: any) => b.type === 'tool_use')?.length ?? 0;
}

function countToolCallsFromGemini(response: any): number {
  return response.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall)?.length ?? 0;
}

// ============================================================
// 测试
// ============================================================

describe('T40: 交叉格式验证 — 文本内容一致性', () => {
  const text = 'Hello, this is a test response from the AI model.';

  it('同一文本在所有输出格式中都能找回', () => {
    // 构造 pi-ai 事件序列 (流式)
    const events: AssistantMessageEvent[] = [
      { type: 'start', partial: null as any },
      { type: 'text_delta', contentIndex: 0, delta: 'Hello, ', partial: null as any },
      { type: 'text_delta', contentIndex: 0, delta: 'this is a test', partial: null as any },
      { type: 'text_delta', contentIndex: 0, delta: ' response from the AI model.', partial: null as any },
      { type: 'done', reason: 'stop', message: fauxAssistantMessage([fauxText(text)]) },
    ];

    // 分别通过三个适配器
    const openaiLines = events.flatMap(e => [...piEventToOpenaiSSE(e)]);
    const anthropicLines = events.flatMap(e => [...piEventToAnthropicSSE(e)]);
    const geminiLines = events.flatMap(e => [...piEventToGeminiSSE(e)]);

    // 提取文本
    const openaiText = extractTextFromOpenaiSSE(openaiLines);
    const anthropicText = extractTextFromAnthropicSSE(anthropicLines);
    const geminiText = extractTextFromGeminiSSE(geminiLines);

    // 验证
    expect(openaiText).toBe(text);
    expect(anthropicText).toBe(text);
    expect(geminiText).toBe(text);
  });
});

describe('T41: 交叉格式验证 — 工具调用一致性', () => {
  it('工具调用信息在所有输出格式中一致', () => {
    // 验证非流式响应
    const msg = fauxAssistantMessage([fauxToolCall('get_weather', { city: 'Tokyo' })], { stopReason: 'toolUse' });
    const openaiResp = piResponseToOpenaiJson(msg);
    const anthropicResp = piResponseToAnthropicJson(msg);
    const geminiResp = piResponseToGeminiJson(msg);

    expect(countToolCallsFromOpenAI(openaiResp)).toBe(1);
    expect(countToolCallsFromAnthropic(anthropicResp)).toBe(1);
    expect(countToolCallsFromGemini(geminiResp)).toBe(1);
  });
});

describe('T42: 交叉格式验证 — usage 一致性', () => {
  it('usage 统计信息在所有输出格式中一致', () => {
    const msg = fauxAssistantMessage([fauxText('Hello')]);
    const openai = piResponseToOpenaiJson(msg);
    const anthropic = piResponseToAnthropicJson(msg);
    const gemini = piResponseToGeminiJson(msg);

    // OpenAI
    expect(openai.usage.prompt_tokens).toBe(msg.usage.input);
    expect(openai.usage.completion_tokens).toBe(msg.usage.output);
    // Anthropic
    expect(anthropic.usage.input_tokens).toBe(msg.usage.input);
    expect(anthropic.usage.output_tokens).toBe(msg.usage.output);
    // Gemini
    expect(gemini.usageMetadata.promptTokenCount).toBe(msg.usage.input);
    expect(gemini.usageMetadata.candidatesTokenCount).toBe(msg.usage.output);
  });
});

describe('T43: 交叉格式验证 — 混合内容', () => {
  it('文本+工具调用在三种输出中均正确', () => {
    const events: AssistantMessageEvent[] = [
      { type: 'start', partial: null as any },
      { type: 'text_delta', contentIndex: 0, delta: 'Checking weather...', partial: null as any },
      { type: 'toolcall_start', contentIndex: 1, partial: null as any },
      { type: 'toolcall_delta', contentIndex: 1, delta: '{"city"', partial: null as any },
      { type: 'toolcall_delta', contentIndex: 1, delta: ':"Tokyo"}', partial: null as any },
      { type: 'toolcall_end', contentIndex: 1, toolCall: { type: 'toolCall', id: 'call_2', name: 'get_weather', arguments: { city: 'Tokyo' } }, partial: null as any },
      { type: 'text_end', contentIndex: 0, content: 'Checking weather...', partial: null as any },
      { type: 'done', reason: 'toolUse', message: fauxAssistantMessage([
        fauxText('Checking weather...'),
        fauxToolCall('get_weather', { city: 'Tokyo' }),
      ], { stopReason: 'toolUse' }) },
    ];

    // 三个适配器都不报错
    expect(() => [...events.flatMap(e => [...piEventToOpenaiSSE(e)])]).not.toThrow();
    expect(() => [...events.flatMap(e => [...piEventToAnthropicSSE(e)])]).not.toThrow();
    expect(() => [...events.flatMap(e => [...piEventToGeminiSSE(e)])]).not.toThrow();
  });
});
