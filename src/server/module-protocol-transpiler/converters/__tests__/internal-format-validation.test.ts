/**
 * Internal Format Validation Tests
 *
 * 目的: 验证所有 Converter 输出符合 Internal Format 定义
 *
 * 核心原则:
 * 1. 所有 Converter 必须输出 camelCase 字段
 * 2. 通用字段必须映射到统一命名
 * 3. 厂商特有字段使用描述性命名（不加厂商前缀）
 *
 * 参考: /docs/PROTOCOL_TRANSFORMATION_ARCHITECTURE.md
 *
 * ⚠️ 重要：这些测试预期会失败，因为代码还未修改为输出 camelCase
 * 这是 "单测先行" 的 TDD 原则 - 先写测试，再修改代码
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { InternalResponse, InternalUsage } from '../../interfaces/internal-format';
import { AnthropicConverter } from '../anthropic.converter';
import { OpenAIConverter } from '../openai.converter';
import { GeminiConverter } from '../gemini.converter';

describe('Internal Format Validation - Output Format', () => {
  let anthropicConverter: AnthropicConverter;
  let openaiConverter: OpenAIConverter;
  let geminiConverter: GeminiConverter;

  beforeEach(() => {
    // 创建新的 converter 实例
    anthropicConverter = new AnthropicConverter();
    openaiConverter = new OpenAIConverter();
    geminiConverter = new GeminiConverter();
  });

  describe('必须输出 camelCase 字段', () => {
    describe('Anthropic Converter', () => {
      const mockAnthropicResponse = {
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' }
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 100,
        }
      };

      it('应该输出 promptTokens 而不是 prompt_tokens', () => {
        const result = anthropicConverter.convertResponseToInternal(mockAnthropicResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        // ✅ 必须有 camelCase 字段
        expect(internalResponse.usage!).toHaveProperty('promptTokens');

        // ❌ 不应该有 snake_case 字段
        expect(internalResponse.usage!).not.toHaveProperty('prompt_tokens');
      });

      it('应该输出 completionTokens 而不是 completion_tokens', () => {
        const result = anthropicConverter.convertResponseToInternal(mockAnthropicResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        expect(internalResponse.usage!).toHaveProperty('completionTokens');
        expect(internalResponse.usage!).not.toHaveProperty('completion_tokens');
      });

      it('应该输出 totalTokens 而不是 total_tokens', () => {
        const result = anthropicConverter.convertResponseToInternal(mockAnthropicResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        expect(internalResponse.usage!).toHaveProperty('totalTokens');
        expect(internalResponse.usage!).not.toHaveProperty('total_tokens');
      });

      it('厂商特有字段应该使用 camelCase', () => {
        const result = anthropicConverter.convertResponseToInternal(mockAnthropicResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        // ✅ 正确: camelCase
        expect(internalResponse.usage!).toHaveProperty('cacheReadTokens');

        // ❌ 错误: snake_case
        expect(internalResponse.usage!).not.toHaveProperty('cache_read_input_tokens');
        expect(internalResponse.usage!).not.toHaveProperty('cache_read_tokens');
      });
    });

    describe('OpenAI Converter', () => {
      const mockOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello'
            },
            finishReason: 'stop'
          }
        ],
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500
        }
      };

      it('应该输出 camelCase 字段', () => {
        const result = openaiConverter.convertResponseToInternal(mockOpenAIResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        expect(internalResponse.usage!).toHaveProperty('promptTokens');
        expect(internalResponse.usage!).toHaveProperty('completionTokens');
        expect(internalResponse.usage!).toHaveProperty('totalTokens');

        // 不应该有 snake_case
        expect(internalResponse.usage!).not.toHaveProperty('prompt_tokens');
        expect(internalResponse.usage!).not.toHaveProperty('completion_tokens');
      });
    });

    describe('Gemini Converter', () => {
      const mockGeminiResponse = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'Hello' }]
            },
            finishReason: 'STOP'
          }
        ],
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 500,
          totalTokenCount: 1500
        }
      };

      it('应该输出 camelCase 字段', () => {
        const result = geminiConverter.convertResponseToInternal(mockGeminiResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        expect(internalResponse.usage!).toHaveProperty('promptTokens');
        expect(internalResponse.usage!).toHaveProperty('completionTokens');
        expect(internalResponse.usage!).toHaveProperty('totalTokens');
      });

      it('不应该保留原始字段名', () => {
        const result = geminiConverter.convertResponseToInternal(mockGeminiResponse);

        expect(result.success).toBe(true);

        const internalResponse = result.data! as InternalResponse;

        // Gemini 原始字段
        expect(internalResponse.usage!).not.toHaveProperty('promptTokenCount');
        expect(internalResponse.usage!).not.toHaveProperty('candidatesTokenCount');
      });
    });
  });

  describe('通用字段必须正确映射', () => {
    it('Anthropic: input_tokens → promptTokens', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1234, output_tokens: 0 }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect(internalResponse.usage!.promptTokens).toBe(1234);
    });

    it('Anthropic: output_tokens → completionTokens', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 567 }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect(internalResponse.usage!.completionTokens).toBe(567);
    });

    it('Anthropic: total_tokens 应该是计算值', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect(internalResponse.usage!.totalTokens).toBe(1500);
    });

    it('OpenAI: prompt_tokens → promptTokens', () => {
      const result = openaiConverter.convertResponseToInternal({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello' },
            finishReason: 'stop'
          }
        ],
        usage: { promptTokens: 999, completionTokens: 0, totalTokens: 999 }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect(internalResponse.usage!.promptTokens).toBe(999);
    });

    it('OpenAI: completion_tokens → completionTokens', () => {
      const result = openaiConverter.convertResponseToInternal({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello' },
            finishReason: 'stop'
          }
        ],
        usage: { promptTokens: 0, completionTokens: 888, totalTokens: 888 }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect(internalResponse.usage!.completionTokens).toBe(888);
    });
  });

  describe('厂商特有字段处理', () => {
    it('Anthropic: cache_read_input_tokens → cacheReadTokens', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 100
        }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect((internalResponse.usage as any)!.cacheReadTokens).toBe(100);
    });

    it('Anthropic: cache_creation_input_tokens → cacheWriteTokens', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 50
        }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect((internalResponse.usage as any)!.cacheWriteTokens).toBe(50);
    });

    it('Anthropic: thinking_tokens → thinkingTokens', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          thinking_tokens: 75
        }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect((internalResponse.usage as any)!.thinkingTokens).toBe(75);
    });
  });

  describe('字段完整性检查', () => {
    it('Anthropic converter 应该包含所有必需字段', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      const usage = internalResponse.usage as InternalUsage;

      // 必需字段
      expect(usage).toHaveProperty('promptTokens');
      expect(usage).toHaveProperty('completionTokens');
      expect(usage).toHaveProperty('totalTokens');

      // 类型检查
      expect(typeof usage.promptTokens).toBe('number');
      expect(typeof usage.completionTokens).toBe('number');
      expect(typeof usage.totalTokens).toBe('number');
    });

    it('应该正确处理缺失的 usage 字段', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn'
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;
      expect(internalResponse.usage!.promptTokens).toBe(0);
      expect(internalResponse.usage!.completionTokens).toBe(0);
      expect(internalResponse.usage!.totalTokens).toBe(0);
    });
  });

  describe('禁止使用厂商前缀', () => {
    it('不应该有 anthropic_ 前缀的字段', () => {
      const result = anthropicConverter.convertResponseToInternal({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      });

      expect(result.success).toBe(true);

      const internalResponse = result.data! as InternalResponse;

      // 检查所有字段名
      const fieldNames = Object.keys(internalResponse.usage!);
      const hasVendorPrefix = fieldNames.some(name =>
        name.startsWith('anthropic_') ||
        name.startsWith('openai_') ||
        name.startsWith('gemini_') ||
        name.startsWith('glm_')
      );

      expect(hasVendorPrefix).toBe(false);
    });
  });
});
