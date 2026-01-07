// @ts-nocheck
/**
 * GLM 原生格式转换问题分析
 *
 * 问题：GLM 返回原生格式（Anthropic 风格：content 数组 + tool_use）
 * 经过 OpenAI converter 转换后，变成了 OpenAI 格式（tool_calls 数组）
 *
 * 期望：保持 GLM 原生格式，或者正确处理双向转换
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('GLM Native Format Conversion Issue', () => {
  // GLM 原生响应格式（Anthropic 风格）
  const glmNativeResponse = {
    id: 'msg_20260107131610ae4107434e2944f8',
    type: 'message',
    role: 'assistant',
    model: 'glm-4.7',
    content: [
      {
        type: 'tool_use',
        id: 'call_326f82523b21434ba5dfe827',
        name: 'get_weather',
        input: {
          city: 'San Francisco'
        }
      }
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 786,
      output_tokens: 12,
      cache_read_input_tokens: 0,
      server_tool_use: {
        web_search_requests: 0
      },
      service_tier: 'standard'
    }
  };

  describe('Problem: GLM native format is changed', () => {
    it('should detect that GLM uses Anthropic-style format', () => {
      console.log('\n=== GLM Native Format ===');
      console.log('Has content array:', Array.isArray(glmNativeResponse.content));
      console.log('Content type:', glmNativeResponse.content?.[0]?.type);
      console.log('Has tool_calls:', 'tool_calls' in glmNativeResponse);

      // GLM 使用 content 数组，不是 tool_calls
      expect(Array.isArray(glmNativeResponse.content)).toBe(true);
      expect(glmNativeResponse.content?.[0]?.type).toBe('tool_use');
      expect('tool_calls' in glmNativeResponse).toBe(false);
    });

    it.skip('OpenAI converter converts GLM format to OpenAI format (待修复: GLM 格式已改用 OpenAI converter)', () => {
      const converter = new OpenAIConverter();

      // 转换为 Internal Format
      const toInternalResult = converter.convertResponseToInternal(glmNativeResponse);
      expect(toInternalResult.success).toBe(true);

      const internalResponse = toInternalResult.data!;
      console.log('\n=== After convertResponseToInternal() ===');
      console.log('Has content array:', Array.isArray(internalResponse.choices?.[0]?.message?.content));
      console.log('Content value:', internalResponse.choices?.[0]?.message?.content);
      console.log('Has toolCalls:', 'toolCalls' in (internalResponse.choices?.[0]?.message || {}));
      console.log('ToolCalls count:', internalResponse.choices?.[0]?.message?.toolCalls?.length);

      // Internal Format 使用 toolCalls
      expect(internalResponse.choices?.[0]?.message?.toolCalls).toBeDefined();
      expect(internalResponse.choices?.[0]?.message?.toolCalls).toHaveLength(1);

      // 转换回 OpenAI API 格式
      const fromInternalResult = converter.convertResponseFromInternal(internalResponse);
      expect(fromInternalResult.success).toBe(true);

      const apiFormatResponse = fromInternalResult.data!;
      console.log('\n=== After convertResponseFromInternal() ===');
      console.log('Has content:', apiFormatResponse.choices?.[0]?.message?.hasOwnProperty('content'));
      console.log('Content value:', apiFormatResponse.choices?.[0]?.message?.content);
      console.log('Has tool_calls:', 'tool_calls' in (apiFormatResponse.choices?.[0]?.message || {}));
      console.log('Tool_calls count:', apiFormatResponse.choices?.[0]?.message?.tool_calls?.length);

      // 转换后的格式使用 tool_calls
      expect(apiFormatResponse.choices?.[0]?.message?.tool_calls).toBeDefined();
      expect(apiFormatResponse.choices?.[0]?.message?.tool_calls).toHaveLength(1);

      console.log('\n❌ Format changed: content[tool_use] → tool_calls');
      console.log('❌ GLM native format is lost');
    });
  });

  describe('Root cause analysis', () => {
    it('OpenAI converter always outputs OpenAI format, not original format', () => {
      const converter = new OpenAIConverter();

      const result = converter.convertResponseFromInternal({
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'glm-4.7',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            toolCalls: [{
              id: 'call_123',
              type: 'function',
              index: 0,
              function: {
                name: 'get_weather',
                arguments: '{"city":"San Francisco"}'
              }
            }]
          },
          finishReason: 'tool_calls'
        }]
      });

      expect(result.success).toBe(true);

      const output = result.data!;

      console.log('\n=== OpenAI Converter Output Format ===');
      console.log('Response structure:', JSON.stringify(output, null, 2));

      // OpenAI converter 总是输出 OpenAI 格式（tool_calls）
      // 它不会输出 content 数组格式（Anthropic/GLM 原生格式）
      expect(output.choices?.[0]?.message?.tool_calls).toBeDefined();
      expect(Array.isArray(output.choices?.[0]?.message?.content)).toBe(false);

      console.log('\n❌ OpenAI converter cannot preserve GLM native format');
      console.log('❌ It always converts to OpenAI standard format');
    });
  });

  describe('Impact on different request formats', () => {
    it('User sends Anthropic format request, gets OpenAI format response', () => {
      console.log('\n=== Scenario: Mixed Format Conversion ===');
      console.log('Step 1: User sends request with content[tool_use]');
      console.log('Step 2: Gateway converts to Internal Format (toolCalls)');
      console.log('Step 3: Gateway sends to upstream (format depends on vendor)');
      console.log('Step 4: GLM returns content[tool_use] (native format)');
      console.log('Step 5: OpenAI converter converts to toolCalls (Internal Format)');
      console.log('Step 6: OpenAI converter converts to tool_calls (API format)');
      console.log('');
      console.log('❌ Request format: content[tool_use]');
      console.log('❌ Response format: tool_calls');
      console.log('❌ Format mismatch!');
    });
  });

  describe('Potential solutions', () => {
    it('Solution 1: Use Anthropic converter for GLM native format', () => {
      console.log('\n✅ Solution 1: Create GLM converter that handles both formats');
      console.log('✅ - Detect input format (content array vs tool_calls)');
      console.log('✅ - Preserve format when converting');
      console.log('✅ - Convert between formats when needed');
    });

    it('Solution 2: Always use OpenAI format for GLM', () => {
      console.log('\n⚠️  Solution 2: Force GLM to use OpenAI-compatible endpoint');
      console.log('⚠️  - Change API endpoint to OpenAI format');
      console.log('⚠️  - Consistent format, but loses native capabilities');
    });

    it('Solution 3: Format detection in converter', () => {
      console.log('\n⚠️  Solution 3: Enhance OpenAI converter to detect GLM format');
      console.log('⚠️  - Check if response has content array');
      console.log('⚠️  - Preserve GLM format in convertResponseFromInternal');
      console.log('⚠️  - More complex, but maintains compatibility');
    });
  });
});
