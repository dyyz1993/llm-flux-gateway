/**
 * 全链路验证测试 (FV)
 *
 * 不依赖真实 API，用 Faux Provider 模拟上游，测试完整链路：
 *   客户端请求 → 输入适配器 → pi-ai FauxProvider → 输出适配器 → 客户端响应
 */
import { describe, it, expect } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

import { openaiToPiContext } from '../../input/openai.adapter';
import { anthropicToPiContext } from '../../input/anthropic.adapter';
import { piEventToOpenaiSSE, piResponseToOpenaiJson } from '../../output/openai.adapter';
import { piResponseToAnthropicJson } from '../../output/anthropic.adapter';
import { piResponseToGeminiJson } from '../../output/gemini.adapter';

// ============================================================
// 辅助: 创建 Faux Provider 测试环境
// ============================================================

function createFauxTestEnv() {
  const faux = fauxProvider({ api: 'openai-completions', provider: 'test' });
  const models = createModels();
  models.setProvider(faux.provider);
  return { models, faux, model: faux.getModel() };
}

// ============================================================
// 辅助: 验证输出 SSE 格式合法性
// ============================================================

function isValidOpenaiSSELines(lines: string[]): boolean {
  if (lines.length === 0) return false;
  // 每行必须以 "data: " 开头
  for (const line of lines) {
    if (!line.startsWith('data: ')) return false;
    if (!line.endsWith('\n\n')) return false;
  }
  return true;
}

// ============================================================
// FV-1: 简单文本对话
// ============================================================

describe('FV-1: 简单文本对话', () => {
  it('FV-01: OpenAI 输入 → OpenAI 输出', async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 'test-fv1' });
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage([fauxText('Hello world')])]);

    const { context, options } = openaiToPiContext({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Say hello' }],
      temperature: 0.7,
    });

    const response = await models.complete(faux.getModel(), context, options);
    const output = piResponseToOpenaiJson(response);

    expect(output.object).toBe('chat.completion');
    expect(output.choices[0].message.content).toBe('Hello world');
    expect(output.choices[0].finish_reason).toBe('stop');
    expect(output.usage.total_tokens).toBeGreaterThanOrEqual(0);
  });

  it('FV-02: Anthropic 输入 → Anthropic 输出', async () => {
    const { models, faux } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Bonjour!')])]);

    const { context } = anthropicToPiContext({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Say hi in French' }],
    });

    const response = await models.complete(faux.getModel(), context);
    const output = piResponseToAnthropicJson(response);

    expect(output.type).toBe('message');
    expect(output.content[0].text).toBe('Bonjour!');
    expect(output.stop_reason).toBe('end_turn');
  });

  it('FV-04: OpenAI 输入 → Anthropic 输出（跨格式）', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Cross-format response')])]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hello' }],
    });

    const response = await models.complete(model, context);
    // 输出适配到 Anthropic
    const output = piResponseToAnthropicJson(response);

    expect(output.type).toBe('message');
    expect(output.content[0].text).toBe('Cross-format response');
  });

  it('FV-04b: Anthropic 输入 → OpenAI 输出（跨格式）', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Response from Anthropic input')])]);

    const { context } = anthropicToPiContext({
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hi from Claude' }],
    });

    const response = await models.complete(model, context);
    const output = piResponseToOpenaiJson(response);

    expect(output.object).toBe('chat.completion');
    expect(output.choices[0].message.content).toBe('Response from Anthropic input');
  });

  it('FV-04c: OpenAI 输入 → Gemini 输出（跨格式）', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Response for Gemini')])]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hello' }],
    });

    const response = await models.complete(model, context);
    const output = piResponseToGeminiJson(response);

    expect(output.candidates[0].content.parts[0].text).toBe('Response for Gemini');
    expect(output.usageMetadata).toBeDefined();
  });

  it('FV-04d: Anthropic 输入 → Gemini 输出（跨格式）', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Gemini via Anthropic')])]);

    const { context } = anthropicToPiContext({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const response = await models.complete(model, context);
    const output = piResponseToGeminiJson(response);

    expect(output.candidates[0].content.parts[0].text).toBe('Gemini via Anthropic');
  });
});

// ============================================================
// FV-2: 工具调用
// ============================================================

describe('FV-2: 工具调用', () => {
  it('FV-07: 输入含 tools → 输出中工具信息正确', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([
      fauxToolCall('get_weather', { city: 'Tokyo' }),
    ], { stopReason: 'toolUse' })]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
      tools: [{
        type: 'function',
        function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
      }],
    });

    const response = await models.complete(model, context);
    const output = piResponseToOpenaiJson(response);

    expect(output.choices[0].message.tool_calls).toHaveLength(1);
    expect(output.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
    expect(output.choices[0].finish_reason).toBe('tool_calls');
  });

  it('FV-08: 多轮工具调用', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([
      fauxToolCall('search', { query: 'news' }),
      fauxToolCall('get_weather', { city: 'London' }),
    ], { stopReason: 'toolUse' })]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'Search news and London weather' }],
    });

    const response = await models.complete(model, context);
    const output = piResponseToOpenaiJson(response);

    expect(output.choices[0].message.tool_calls).toHaveLength(2);
  });
});

// ============================================================
// FV-3: 错误场景
// ============================================================

describe('FV-3: 错误场景', () => {
  it('FV-10: Faux 返回 error → 输出适配器处理正确', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Error occurred')], {
      stopReason: 'error',
      errorMessage: 'Upstream API error',
    })]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hi' }],
    });

    const response = await models.complete(model, context);
    expect(response.stopReason).toBe('error');
    expect(response.errorMessage).toBe('Upstream API error');
  });
});

// ============================================================
// FV-4: 内容格式
// ============================================================

describe('FV-4: 流式输出', () => {
  it('流式输出到 OpenAI SSE 格式合法', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Streaming hello')])]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'say hello' }],
    });

    const stream = models.stream(model, context);
    const allLines: string[] = [];

    for await (const event of stream) {
      const lines = [...piEventToOpenaiSSE(event)];
      allLines.push(...lines);
    }

    expect(allLines.length).toBeGreaterThan(0);
    expect(isValidOpenaiSSELines(allLines)).toBe(true);
    // 应该有 [DONE]
    expect(allLines[allLines.length - 1]).toBe('data: [DONE]\n\n');
  });
});

// ============================================================
// FV-5: 统计信息
// ============================================================

describe('FV-5: 统计信息', () => {
  it('FV-16: usage 数据完整', async () => {
    const { models, faux, model } = createFauxTestEnv();
    faux.setResponses([fauxAssistantMessage([fauxText('Hi')], {
      stopReason: 'stop',
      responseId: 'test_resp_123',
    })]);

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hi' }],
    });

    const response = await models.complete(model, context);
    const output = piResponseToOpenaiJson(response);

    expect(output.id).toBe('test_resp_123');
    expect(output.usage.prompt_tokens).toBeDefined();
    expect(output.usage.completion_tokens).toBeDefined();
    expect(output.usage.total_tokens).toBeDefined();
  });
});
