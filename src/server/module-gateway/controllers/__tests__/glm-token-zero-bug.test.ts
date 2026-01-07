// @ts-nocheck
/**
 * GLM Token 统计为 0 问题 - 根因分析测试
 *
 * 问题：用户报告 GLM 请求的 token 统计显示为 0
 * 实测 GLM API 返回：{ usage: { prompt_tokens: 161, completion_tokens: 61, total_tokens: 222 } }
 *
 * 根因：gateway-controller.ts 使用了错误的转换方法
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';
import { ProtocolTranspiler } from '../../../module-protocol-transpiler/core/protocol-transpiler';

describe('GLM Token Zero Bug - Root Cause Analysis', () => {
  // 真实的 GLM API 响应（OpenAI 兼容格式）
  const realGLMResponse = {
    id: 'msg_202601071234567890abcdef',
    object: 'chat.completion',
    created: 1767722719,
    model: 'glm-4-flash',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello, how can I help you today?'
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 161,
      completion_tokens: 61,
      total_tokens: 222
    }
  };

  describe('Root Cause: transpile() returns wrong format', () => {
    it('transpile(glm, openai) returns OpenAI API format (snake_case), not Internal Format (camelCase)', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // 这是 gateway-controller.ts 第 598-602 行的做法
      const transpileResult = transpiler.transpile(realGLMResponse, 'openai', 'openai');

      expect(transpileResult.success).toBe(true);

      const transpiledResponse = transpileResult.data! as any;

      console.log('\n=== transpile() Result ===');
      console.log('Response usage:', transpiledResponse.usage);

      // ❌ transpile() 返回的是 OpenAI API 格式（snake_case）
      expect(transpiledResponse.usage).toBeDefined();
      expect(transpiledResponse.usage.prompt_tokens).toBe(161);
      expect(transpiledResponse.usage.completion_tokens).toBe(61);
      expect(transpiledResponse.usage.total_tokens).toBe(222);

      // ❌ 没有 camelCase 字段
      expect(transpiledResponse.usage.promptTokens).toBeUndefined();
      expect(transpiledResponse.usage.completionTokens).toBeUndefined();

      console.log('❌ transpile() returns OpenAI API format (snake_case)');
      console.log('❌ Field names: prompt_tokens, completion_tokens');
      console.log('❌ This is NOT Internal Format!');
    });

    it('Gateway controller fails to extract tokens from transpile() result', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // 模拟 gateway-controller.ts 的流程
      const internalResponseResult = transpiler.transpile(realGLMResponse, 'openai', 'openai');
      const internalResponse = internalResponseResult.success ? internalResponseResult.data! : undefined;

      // 模拟 gateway-controller.ts 第 719 行的提取逻辑
      let promptTokens = 0;
      let completionTokens = 0;

      if (internalResponse?.usage) {
        // ❌ 这里访问的是 camelCase 字段，但 transpile() 返回的是 snake_case
        promptTokens = internalResponse.usage.promptTokens || 0;
        completionTokens = internalResponse.usage.completionTokens || 0;
      }

      console.log('\n=== Gateway Token Extraction (Current Implementation) ===');
      console.log('internalResponse exists:', internalResponse !== undefined);
      console.log('internalResponse.usage exists:', internalResponse?.usage !== undefined);
      console.log('promptTokens:', promptTokens);
      console.log('completionTokens:', completionTokens);

      // ❌ 结果是 0，因为字段名不匹配
      expect(promptTokens).toBe(0);
      expect(completionTokens).toBe(0);

      console.log('❌ Token extraction FAILED - got 0 instead of 161/61');
    });

    it('Direct converter call returns Internal Format (camelCase)', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // ✅ 正确的做法：直接调用 converter
      const openaiConverter = (transpiler).converters.get('openai');
      const convertResult = openaiConverter!.convertResponseToInternal(realGLMResponse);

      expect(convertResult.success).toBe(true);

      const internalResponse = convertResult.data!;

      console.log('\n=== convertResponseToInternal() Result ===');
      console.log('Response usage:', internalResponse.usage);

      // ✅ convertResponseToInternal() 返回的是 Internal Format（camelCase）
      expect(internalResponse.usage).toBeDefined();
      expect(internalResponse!.usage.promptTokens).toBe(161);
      expect(internalResponse!.usage.completionTokens).toBe(61);
      expect(internalResponse!.usage.totalTokens).toBe(222);

      // ✅ 没有 snake_case 字段（已转换）
      expect((internalResponse!.usage).prompt_tokens).toBeUndefined();
      expect((internalResponse!.usage).completion_tokens).toBeUndefined();

      console.log('✅ convertResponseToInternal() returns Internal Format (camelCase)');
      console.log('✅ Field names: promptTokens, completionTokens');
    });

    it('Gateway can extract tokens from convertResponseToInternal() result', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // ✅ 正确的做法：直接调用 converter
      const openaiConverter = (transpiler).converters.get('openai');
      const convertResult = openaiConverter!.convertResponseToInternal(realGLMResponse);

      const internalResponse = convertResult.success ? convertResult.data! : undefined;

      // 模拟 gateway-controller.ts 第 719 行的提取逻辑
      let promptTokens = 0;
      let completionTokens = 0;

      if (internalResponse?.usage) {
        promptTokens = internalResponse.usage.promptTokens || 0;
        completionTokens = internalResponse.usage.completionTokens || 0;
      }

      console.log('\n=== Gateway Token Extraction (Correct Implementation) ===');
      console.log('internalResponse exists:', internalResponse !== undefined);
      console.log('internalResponse.usage exists:', internalResponse?.usage !== undefined);
      console.log('promptTokens:', promptTokens);
      console.log('completionTokens:', completionTokens);

      // ✅ 结果正确
      expect(promptTokens).toBe(161);
      expect(completionTokens).toBe(61);

      console.log('✅ Token extraction SUCCESS - got 161/61 as expected');
    });
  });

  describe('Solution Comparison', () => {
    it('Solution 1: Use convertResponseToInternal() directly (RECOMMENDED)', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      const openaiConverter = (transpiler).converters.get('openai');
      const result = openaiConverter!.convertResponseToInternal(realGLMResponse);

      expect(result.success).toBe(true);
      expect(result!.data!.usage.promptTokens).toBe(161);

      console.log('\n✅ Solution 1: Direct converter call');
      console.log('✅ Pros: Clean, efficient, follows architecture');
      console.log('✅ Cons: None');
    });

    it('Solution 2: Defensive fallback in gateway controller', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // 模拟当前错误的流程
      const transpileResult = transpiler.transpile(realGLMResponse, 'openai', 'openai');
      const response = transpileResult.data! as any;

      // 添加 defensive fallback
      let promptTokens = 0;
      if (response.usage) {
        // 尝试 camelCase（Internal Format）
        promptTokens = response.usage.promptTokens ||
                      // fallback to snake_case（OpenAI API 格式）
                      response.usage.prompt_tokens || 0;
      }

      expect(promptTokens).toBe(161);

      console.log('\n⚠️  Solution 2: Defensive fallback');
      console.log('⚠️  Pros: Works with current code');
      console.log('⚠️  Cons: Hack, violates architecture principles');
    });

    it('Solution 3: Double transpile (NOT RECOMMENDED)', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // 先转为 OpenAI API 格式
      const openaiFormatResult = transpiler.transpile(realGLMResponse, 'openai', 'openai');
      // 再转为 Internal Format（但这是错的，transpile 不返回 Internal Format）
      const internalFormatResult = transpiler.transpile(openaiFormatResult.data!, 'openai', 'openai');

      const response = internalFormatResult.data! as any;

      // 这仍然不会工作，因为 transpile() 不返回 Internal Format
      expect(response.usage.promptTokens).toBeUndefined();

      console.log('\n❌ Solution 3: Double transpile');
      console.log('❌ Pros: None');
      console.log('❌ Cons: Does not work, wasteful, confusing');
    });
  });

  describe('Impact Analysis', () => {
    it('Current implementation affects all GLM requests', () => {
      console.log('\n=== Impact Analysis ===');
      console.log('Affected vendors:');
      console.log('  - GLM (all models)');
      console.log('  - Any vendor using OpenAI format with transpile()');
      console.log('');
      console.log('Affected data:');
      console.log('  - promptTokens stored as 0 in database');
      console.log('  - completionTokens stored as 0 in database');
      console.log('  - cachedTokens may also be affected');
      console.log('');
      console.log('User impact:');
      console.log('  - Incorrect token usage statistics');
      console.log('  - Billing calculations may be wrong');
      console.log('  - Analytics data is corrupted');
    });

    it('Verify fix does not break other vendors', () => {
      const transpiler = new ProtocolTranspiler();
      transpiler.registerConverter(new OpenAIConverter());

      // 测试标准 OpenAI 响应
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      const openaiConverter = (transpiler).converters.get('openai');
      const result = openaiConverter!.convertResponseToInternal(openaiResponse);

      expect(result.success).toBe(true);
      expect(result!.data!.usage.promptTokens).toBe(10);
      expect(result!.data!.usage.completionTokens).toBe(5);

      console.log('\n✅ Fix does not break standard OpenAI responses');
    });
  });
});
