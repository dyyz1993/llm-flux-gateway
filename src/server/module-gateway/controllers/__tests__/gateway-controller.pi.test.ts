/**
 * 新网关控制器集成测试
 *
 * 使用 pi-ai Faux Provider 模拟上游，验证完整请求处理流程：
 *   请求 → 输入适配 → pi-ai 调用 → 输出适配 → 响应
 */
import { describe, it, expect } from 'vitest';

import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createModels } from '@earendil-works/pi-ai';

// 由于新控制器依赖 routeMatcherService（读取数据库），
// 这些测试验证适配器和 pi-ai 调用逻辑的正确性，
// 不依赖完整 HTTP 路由。

describe('新控制器核心逻辑', () => {
  it('输入适配 → pi-ai 调用 → 输出适配 完整链路', async () => {
    const { openaiToPiContext } = await import('../../../adapters/input/openai.adapter');
    const { piResponseToOpenaiJson } = await import('../../../adapters/output/openai.adapter');

    // 1. 输入适配
    const { context, options } = openaiToPiContext({
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello!' },
      ],
      temperature: 0.5,
    });

    expect(context.messages).toHaveLength(1);
    expect(options.temperature).toBe(0.5);

    // 2. pi-ai 调用（Faux Provider）
    const faux = fauxProvider({ api: 'openai-completions', provider: 'test-pi' });
    faux.setResponses([fauxAssistantMessage([fauxText('Hi there!')], { stopReason: 'stop' })]);

    const models = createModels();
    models.setProvider(faux.provider);
    const response = await models.complete(faux.getModel(), context, options);

    expect(response.content[0]).toMatchObject({ type: 'text', text: 'Hi there!' });
    expect(response.stopReason).toBe('stop');

    // 3. 输出适配
    const output = piResponseToOpenaiJson(response);

    expect(output.choices[0].message.content).toBe('Hi there!');
    expect(output.choices[0].finish_reason).toBe('stop');
  });

  it('流式完整链路 — 文本输出', async () => {
    const { openaiToPiContext } = await import('../../../adapters/input/openai.adapter');
    const { piEventToOpenaiSSE } = await import('../../../adapters/output/openai.adapter');

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'Stream test' }],
    });

    const faux = fauxProvider({ api: 'openai-completions', provider: 'test-stream' });
    faux.setResponses([fauxAssistantMessage([fauxText('Streaming output')])]);

    const models = createModels();
    models.setProvider(faux.provider);
    const stream = models.stream(faux.getModel(), context);

    let textContent = '';
    let foundDone = false;

    for await (const event of stream) {
      const sseLines = [...piEventToOpenaiSSE(event)];
      for (const line of sseLines) {
        if (line === 'data: [DONE]\n\n') {
          foundDone = true;
        } else if (line.startsWith('data: ')) {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.choices?.[0]?.delta?.content) {
            textContent += parsed.choices[0].delta.content;
          }
        }
      }
    }

    expect(textContent).toBe('Streaming output');
    expect(foundDone).toBe(true);
  });

  it('工具调用链路', async () => {
    const { openaiToPiContext } = await import('../../../adapters/input/openai.adapter');
    const { piResponseToOpenaiJson } = await import('../../../adapters/output/openai.adapter');

    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather info',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      }],
    });

    const faux = fauxProvider({ api: 'openai-completions', provider: 'test-tools' });
    faux.setResponses([fauxAssistantMessage([
      fauxToolCall('get_weather', { city: 'Tokyo' }),
    ], { stopReason: 'toolUse' })]);

    const models = createModels();
    models.setProvider(faux.provider);
    const response = await models.complete(faux.getModel(), context);

    const output = piResponseToOpenaiJson(response);
    expect(output.choices[0].message.tool_calls).toHaveLength(1);
    expect(output.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
    expect(output.choices[0].finish_reason).toBe('tool_calls');
  });
});
