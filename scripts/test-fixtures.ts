/**
 * 测试数据工厂
 *
 * 生成完整的测试数据集，覆盖所有关键场景：
 * - OpenAI / Anthropic / Gemini 三种输入格式
 * - 文本 / 工具 / 混合 / thinking 四种内容类型
 * - SSE 流式 / JSON 非流式两种传输方式
 * - 错误场景
 *
 * 包含从真实 API（opencode-go）捕获的数据验证。
 * 真实数据参考: scripts/captured-data/
 *
 * 生成的数据直接在 Harness 中使用，无需真实 API key。
 */
export {};

import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { AssistantMessage, Context } from '@earendil-works/pi-ai';

// ============================================================
// 测试场景定义
// ============================================================

export interface TestFixture {
  id: string;
  name: string;
  description: string;
  /** 输入格式 */
  input: {
    format: 'openai' | 'anthropic' | 'gemini';
    body: Record<string, any>;
  };
  /** Faux Provider 模拟的响应 */
  fauxResponse: AssistantMessage;
  /** 期望的输出格式列表 */
  outputFormats: ('openai' | 'anthropic' | 'gemini')[];
}

export function generateFixtures(): TestFixture[] {
  return [
    // ========================================
    // 1. 纯文本 OpenAI → 三种格式
    // ========================================
    {
      id: 'text-openai-to-all',
      name: '纯文本 OpenAI 输入 → 三种输出格式',
      description: '最简单的文本对话，验证三种输出格式都能正确转换',
      input: {
        format: 'openai',
        body: {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is the capital of France?' },
          ],
          temperature: 0.7,
          max_tokens: 500,
        },
      },
      fauxResponse: fauxAssistantMessage([fauxText('The capital of France is Paris.')]),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 2. 纯文本 Anthropic 输入 → 三种格式
    // ========================================
    {
      id: 'text-anthropic-to-all',
      name: '纯文本 Anthropic 输入 → 三种输出格式',
      description: '验证 Anthropic 格式输入在三种输出格式下的转换',
      input: {
        format: 'anthropic',
        body: {
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: 'You are Claude.',
          messages: [
            { role: 'user', content: 'What is 2+2?' },
          ],
        },
      },
      fauxResponse: fauxAssistantMessage([fauxText('2 + 2 = 4')]),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 3. 工具调用 OpenAI → 三种格式
    // ========================================
    {
      id: 'tool-call-openai-to-all',
      name: '工具调用 OpenAI 输入 → 三种输出格式',
      description: '含工具定义的请求，模型返回工具调用',
      input: {
        format: 'openai',
        body: {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'What is the weather in Tokyo?' },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get current weather for a city',
                parameters: {
                  type: 'object',
                  properties: { city: { type: 'string', description: 'City name' } },
                  required: ['city'],
                },
              },
            },
          ],
        },
      },
      fauxResponse: fauxAssistantMessage([
        fauxToolCall('get_weather', { city: 'Tokyo' }),
      ], { stopReason: 'toolUse' }),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 4. 混合内容（文本+工具调用）× 三种格式
    // ========================================
    {
      id: 'mixed-openai-to-all',
      name: '混合内容（文本+多个工具调用）× 三种格式',
      description: '验证文本和工具调用同时存在时输出格式正确',
      input: {
        format: 'openai',
        body: {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Check weather in Tokyo and London' },
          ],
          tools: [
            { type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } } },
            { type: 'function', function: { name: 'search_web', description: 'Search web', parameters: { type: 'object', properties: { query: { type: 'string' } } } } },
          ],
        },
      },
      fauxResponse: fauxAssistantMessage([
        fauxText("I'll check both cities."),
        fauxToolCall('get_weather', { city: 'Tokyo' }),
        fauxToolCall('get_weather', { city: 'London' }),
      ], { stopReason: 'toolUse' }),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 5. 多轮对话（含 tool_result）
    // ========================================
    {
      id: 'multi-turn-openai-to-all',
      name: '多轮对话（含 tool_result 历史）× 三种格式',
      description: '验证多轮工具调用历史的正确传递',
      input: {
        format: 'openai',
        body: {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Weather in Tokyo?' },
            { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' } }] },
            { role: 'tool', tool_call_id: 'call_1', content: 'Sunny, 25°C' },
            { role: 'user', content: 'What about London?' },
          ],
        },
      },
      fauxResponse: fauxAssistantMessage([fauxText('London is 18°C and cloudy.')]),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 6. Thinking/Reasoning 内容
    // ========================================
    {
      id: 'thinking-openai-to-all',
      name: 'Thinking/Reasoning 推理内容 × 三种格式',
      description: '验证 thinking content block 在三种输出格式中正确映射',
      input: {
        format: 'openai',
        body: {
          model: 'o1-mini',
          messages: [
            { role: 'user', content: 'Solve: 23 × 45' },
          ],
        },
      },
      fauxResponse: fauxAssistantMessage([
        fauxThinking('Let me calculate step by step:\n23 × 45 = 23 × (40 + 5) = 920 + 115 = 1035'),
        fauxText('The result is 1035.'),
      ]),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 7. 流式 SSE 输出验证
    // ========================================
    {
      id: 'streaming-openai-sse',
      name: '流式 SSE 输出验证',
      description: '验证流式事件系列产生的 SSE 文本格式正确',
      input: {
        format: 'openai',
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Count 1 to 3' }],
          stream: true,
        },
      },
      fauxResponse: fauxAssistantMessage([fauxText('One. Two. Three.')]),
      outputFormats: ['openai'],
    },

    // ========================================
    // 8. 空内容响应
    // ========================================
    {
      id: 'empty-response',
      name: '空内容响应',
      description: '模型返回空文本时的边界情况',
      input: {
        format: 'openai',
        body: { messages: [{ role: 'user', content: 'Say nothing' }] },
      },
      fauxResponse: fauxAssistantMessage([]),
      outputFormats: ['openai', 'anthropic'],
    },

    // ========================================
    // 9. 错误响应
    // ========================================
    {
      id: 'error-response',
      name: '错误响应',
      description: '上游返回错误时的响应格式',
      input: {
        format: 'openai',
        body: { messages: [{ role: 'user', content: 'Trigger error' }] },
      },
      fauxResponse: fauxAssistantMessage([fauxText('')], { stopReason: 'error', errorMessage: 'Upstream API rate limit exceeded' }),
      outputFormats: ['openai', 'anthropic'],
    },

    // ========================================
    // 10. 系统提示+长文本
    // ========================================
    {
      id: 'system-prompt-long',
      name: '系统提示 + 长文本响应',
      description: '验证 system prompt 和较长响应内容的完整性',
      input: {
        format: 'openai',
        body: {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a knowledgeable historian. Provide detailed answers.' },
            { role: 'user', content: 'Explain the significance of the Silk Road.' },
          ],
        },
      },
      fauxResponse: fauxAssistantMessage([fauxText(
        'The Silk Road was a network of trade routes that connected the East and West for over 1,500 years. ' +
        'It facilitated the exchange of goods such as silk, spices, tea, and precious metals, ' +
        'as well as ideas, technologies, religions, and cultures between civilizations. ' +
        'The Silk Road played a crucial role in the development of the great civilizations of China, India, Persia, Europe, and Arabia.'
      )]),
      outputFormats: ['openai', 'anthropic'],
    },

    // ========================================
    // 11. Gemini 输入 → 三种格式输出
    // ========================================
    {
      id: 'gemini-input-to-all',
      name: 'Gemini 输入 → 三种输出格式',
      description: '验证 Gemini 格式输入在三种输出格式下都正确',
      input: {
        format: 'gemini',
        body: {
          contents: [
            { role: 'user', parts: [{ text: 'What is the speed of light?' }] },
          ],
          generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
        },
      },
      fauxResponse: fauxAssistantMessage([fauxText('The speed of light is approximately 299,792,458 meters per second.')]),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },

    // ========================================
    // 12. Gemini 输入含工具 → 三种格式输出
    // ========================================
    {
      id: 'gemini-tool-to-all',
      name: 'Gemini 输入含工具 → 三种输出格式',
      description: '验证 Gemini 格式含 function_declarations 的请求',
      input: {
        format: 'gemini',
        body: {
          contents: [{ role: 'user', parts: [{ text: 'Weather in Tokyo?' }] }],
          tools: [{
            functionDeclarations: [{
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: { city: { type: 'string' } } },
            }],
          }],
        },
      },
      fauxResponse: fauxAssistantMessage([
        fauxToolCall('get_weather', { city: 'Tokyo' }),
      ], { stopReason: 'toolUse' }),
      outputFormats: ['openai', 'anthropic', 'gemini'],
    },
  ];
}
