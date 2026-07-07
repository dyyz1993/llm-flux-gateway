/**
 * 格式保真度测试
 *
 * 以上游（opencode.ai）的原始响应格式为标准，
 * 验证我们的网关输出与上游一致。
 *
 * 包含 SSE 和非 SSE 两种模式。
 */
import { describe, it, expect } from 'vitest';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { piEventToOpenaiSSE, piResponseToOpenaiJson, createOpenaiSSEConverter } from '../../output/openai.adapter';
import type { AssistantMessage } from '@earendil-works/pi-ai';

function makeMsg(text: string, overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'test',
    model: 'deepseek-v4-flash',
    usage: { input: 10, output: 5, totalTokens: 15, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
    ...overrides,
  } as AssistantMessage;
}

// ============================================================
// 非流式格式验证
// ============================================================

describe('非流式 - 格式保真度', () => {
  it('必需字段与上游一致', () => {
    const msg = makeMsg('Hello');
    const output = piResponseToOpenaiJson(msg);

    expect(output).toHaveProperty('id');
    expect(output.object).toBe('chat.completion');
    expect(typeof output.created).toBe('number');
    expect(output.model).toBeTruthy();
    expect(Array.isArray(output.choices)).toBe(true);
    expect(output.choices[0]).toHaveProperty('index');
    expect(output.choices[0].message.role).toBe('assistant');
    expect(typeof output.choices[0].finish_reason).toBe('string');
    expect(output).toHaveProperty('usage');
    expect(output.usage).toHaveProperty('prompt_tokens');
    expect(output.usage).toHaveProperty('completion_tokens');
    expect(output.usage).toHaveProperty('total_tokens');
  });

  it('finish_reason 映射正确: toolUse → tool_calls', () => {
    const msg = makeMsg('', { stopReason: 'toolUse' as any });
    const output = piResponseToOpenaiJson(msg);
    expect(output.choices[0].finish_reason).toBe('tool_calls');
  });

  it('finish_reason 映射正确: stop → stop', () => {
    const msg = makeMsg('ok');
    const output = piResponseToOpenaiJson(msg);
    expect(output.choices[0].finish_reason).toBe('stop');
  });
});

// ============================================================
// 流式 SSE 格式验证
// ============================================================

describe('流式 SSE - 格式保真度', () => {
  it('首条 chunk 必须包含 delta.role = "assistant"', () => {
    const lines = [...piEventToOpenaiSSE({ type: 'start', partial: null as any })];
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^data: /);
    expect(lines[0]).toMatch(/\n\n$/);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.choices[0].delta.role).toBe('assistant');
  });

  it('text_delta → choices[0].delta.content', () => {
    const lines = [...piEventToOpenaiSSE({ type: 'text_delta', contentIndex: 0, delta: 'Hello', partial: null as any })];
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.choices[0].delta.content).toBe('Hello');
  });

  it('thinking_delta → choices[0].delta.reasoning_content', () => {
    const lines = [...piEventToOpenaiSSE({ type: 'thinking_delta', contentIndex: 0, delta: 'Thinking...', partial: null as any })];
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.choices[0].delta.reasoning_content).toBe('Thinking...');
  });

  it('done 事件包含 finish_reason 和 usage', () => {
    const msg = makeMsg('ok');
    const lines = [...piEventToOpenaiSSE({ type: 'done', reason: 'stop', message: msg })];
    expect(lines).toHaveLength(2);
    const usageChunk = JSON.parse(lines[0]!.slice(6));
    expect(usageChunk.choices[0].finish_reason).toBe('stop');
    expect(usageChunk.usage.prompt_tokens).toBe(10);
    expect(usageChunk.usage.completion_tokens).toBe(5);
    expect(lines[1]).toBe('data: [DONE]\n\n');
  });

  it('SSE 以 [DONE] 结尾', () => {
    const msg = makeMsg('test');
    const lines = [
      ...piEventToOpenaiSSE({ type: 'start', partial: msg }),
      ...piEventToOpenaiSSE({ type: 'text_delta', contentIndex: 0, delta: 't', partial: msg }),
      ...piEventToOpenaiSSE({ type: 'done', reason: 'stop', message: msg }),
    ];
    expect(lines[lines.length - 1]).toBe('data: [DONE]\n\n');
  });
});

// ============================================================
// reasoning + content 合并验证
// ============================================================

describe('reasoning + content 合并', () => {
  it('thinking_delta 输出为独立 reasoning_content chunk，匹配上游实时行为', () => {
    const converter = createOpenaiSSEConverter();
    const msg = makeMsg('result');

    const lines = [
      ...converter.eventToSSE({ type: 'thinking_delta', contentIndex: 0, delta: 'Reasoning step...', partial: msg }),
      ...converter.eventToSSE({ type: 'text_delta', contentIndex: 0, delta: 'Answer', partial: msg }),
    ];

    expect(lines).toHaveLength(2);
    // thinking_delta → 独立 reasoning_content chunk
    const thinkingChunk = JSON.parse(lines[0]!.slice(6));
    expect(thinkingChunk.choices[0].delta.reasoning_content).toBe('Reasoning step...');
    expect(thinkingChunk.choices[0].delta.content).toBeUndefined();
    // text_delta → 独立 content chunk
    const textChunk = JSON.parse(lines[1]!.slice(6));
    expect(textChunk.choices[0].delta.content).toBe('Answer');
    expect(textChunk.choices[0].delta.reasoning_content).toBeUndefined();
  });

  it('只有 text_delta（无 reasoning）不合并', () => {
    const converter = createOpenaiSSEConverter();
    const msg = makeMsg('hi');

    const lines = [...converter.eventToSSE({ type: 'text_delta', contentIndex: 0, delta: 'Just text', partial: msg })];
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.slice(6));
    expect(parsed.choices[0].delta.content).toBe('Just text');
    expect(parsed.choices[0].delta.reasoning_content).toBeUndefined();
  });
});
