/**
 * 测试：非流式响应中的 index 字段
 *
 * 验证 convertResponseFromInternal 为 tool_calls 添加 index 字段
 * 这是为了兼容 GLM 官方 API 的格式
 */

// @ts-nocheck - TypeScript strict null checks conflict with test assertions, but tests pass
import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../openai.converter';
import type { InternalResponse } from '../../interfaces/internal-format';

describe('OpenAIConverter - index field (非流式响应)', () => {
  const converter = new OpenAIConverter();

  describe('convertResponseFromInternal', () => {
    it('应该为 tool_calls 数组中的每个元素添加 index 字段', () => {
      const internalResponse: InternalResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null as any,  // OpenAI allows null for tool-only responses
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'Glob',
                  arguments: '{"pattern": "*.ts"}'
                }
                // 注意：没有 index 字段
              },
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'Read',
                  arguments: '{"file": "test.ts"}'
                }
                // 注意：没有 index 字段
              }
            ]
          },
          finishReason: 'tool_calls'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const apiResponse = result.data!;

      // 验证 tool_calls 数组
      expect(apiResponse.choices[0].message.tool_calls).toBeDefined();
      expect(apiResponse.choices[0].message.tool_calls).toHaveLength(2);

      const toolCalls = apiResponse.choices[0].message.tool_calls!;

      // 验证每个 tool_call 都有 index 字段
      expect(toolCalls[0]).toHaveProperty('index', 0);
      expect(toolCalls[1]).toHaveProperty('index', 1);

      // 验证其他字段也被正确转换
      expect(toolCalls[0].id).toBe('call_1');
      expect(toolCalls[0].type).toBe('function');
      expect(toolCalls[0].function.name).toBe('Glob');
    });

    it('应该保留已有的 index 字段', () => {
      const internalResponse: InternalResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null as any,  // OpenAI allows null for tool-only responses
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                index: 5,  // 已有的 index 值
                function: {
                  name: 'Glob',
                  arguments: '{"pattern": "*.ts"}'
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const apiResponse = result.data!;

      // 应该保留原有的 index 值
      expect(apiResponse.choices[0].message.tool_calls[0].index).toBe(5);
    });

    it('当没有 tool_calls 时不应该报错', () => {
      const internalResponse: InternalResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello',
            toolCalls: undefined
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const apiResponse = result.data!;
      expect(apiResponse.choices[0].message.tool_calls).toBeUndefined();
    });
  });

  describe('convertResponseToInternal - content 数组格式', () => {
    it('应该在转换 tool_use 块时添加 index 字段', () => {
      // 模拟 GLM 返回的 content 数组格式（Anthropic 风格）
      const glmResponse = {
        id: 'chatcmpl-123',
        choices: [{
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_1',
                name: 'Glob',
                input: { pattern: '*.ts' }
              },
              {
                type: 'tool_use',
                id: 'call_2',
                name: 'Read',
                input: { file: 'test.ts' }
              }
            ]
          }
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      };

      const result = converter.convertResponseToInternal(glmResponse);

      expect(result.success).toBe(true);
      const internalResponse = result.data!;

      // 验证 toolCalls 被正确创建
      expect(internalResponse.choices![0].message.toolCalls).toBeDefined();
      expect(internalResponse.choices![0].message.toolCalls).toHaveLength(2);

      const toolCalls = internalResponse.choices![0].message.toolCalls!;

      // 验证每个 toolCall 都有 index 字段
      expect(toolCalls[0]).toHaveProperty('index', 0);
      expect(toolCalls[1]).toHaveProperty('index', 1);

      // 验证其他字段也被正确转换
      expect(toolCalls[0].id).toBe('call_1');
      expect(toolCalls[0].type).toBe('function');
      expect(toolCalls[0].function.name).toBe('Glob');
    });
  });
});
