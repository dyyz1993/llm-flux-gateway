/**
 * Request Params Storage Format Test
 *
 * 验证参数存储格式转换流程：
 * 1. 客户端请求 (snake_case) → Internal Format (camelCase)
 * 2. Internal Format (camelCase) → 存入数据库 (camelCase)
 * 3. Internal Format (camelCase) → 目标厂商格式 (snake_case)
 */

import { describe, it, expect } from 'vitest';
import { protocolTranspiler } from '../../../module-protocol-transpiler/protocol-transpiler-singleton';

describe('Request Params Storage Format', () => {
  describe('OpenAI → Internal → Database', () => {
    it('should convert snake_case to camelCase for storage', () => {
      // 1️⃣ 客户端请求 (OpenAI 格式，snake_case)
      const clientRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        max_tokens: 500,
        top_p: 0.9,
        top_k: 40,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
      };

      console.log('📤 客户端请求 (snake_case):');
      console.log(JSON.stringify(clientRequest, null, 2));

      // 2️⃣ 转换为 Internal Format (应该是 camelCase)
      // ⭐ FIX: Use converter directly to avoid double conversion
      // When sourceFormat === targetFormat, transpile() would do:
      // snake_case → camelCase → snake_case (back to original!)
      // We want: snake_case → camelCase (Internal Format) only
      const openaiConverter = (protocolTranspiler as any).converters?.get('openai');
      const internalResult = openaiConverter.convertRequestToInternal(clientRequest);

      expect(internalResult.success).toBe(true);
      const internalRequest = internalResult.data!;

      console.log('🔄 Internal Format (应该是 camelCase):');
      console.log(JSON.stringify(internalRequest, null, 2));

      // 3️⃣ 验证字段转换为 camelCase
      expect(internalRequest).toMatchObject({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        maxTokens: 500,      // ✅ camelCase
        topP: 0.9,           // ✅ camelCase
        topK: 40,            // ✅ camelCase
        frequencyPenalty: 0.5,  // ✅ camelCase
        presencePenalty: 0.5,   // ✅ camelCase
      });

      // 4️⃣ 模拟 gateway-controller.ts 的解构逻辑
      const { model, messages, stream, tools, tool_choice, ...requestParams } = internalRequest as any;

      console.log('💾 存入数据库的 request_params (应该是 camelCase):');
      console.log(JSON.stringify(requestParams, null, 2));

      // 5️⃣ 验证 request_params 是 camelCase
      expect(requestParams).toMatchObject({
        temperature: 0.7,
        maxTokens: 500,      // ✅ camelCase
        topP: 0.9,           // ✅ camelCase
        topK: 40,            // ✅ camelCase
        frequencyPenalty: 0.5,  // ✅ camelCase
        presencePenalty: 0.5,   // ✅ camelCase
      });

      // 6️⃣ ❌ 不应该有 snake_case 字段
      expect(requestParams).not.toHaveProperty('max_tokens');
      expect(requestParams).not.toHaveProperty('top_p');
      expect(requestParams).not.toHaveProperty('top_k');
      expect(requestParams).not.toHaveProperty('frequency_penalty');
      expect(requestParams).not.toHaveProperty('presence_penalty');
    });

    it('should convert from Internal Format to GLM format', () => {
      // 1️⃣ Internal Format (camelCase)
      const internalRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        maxTokens: 500,
        topP: 0.9,
        topK: 40,
      };

      // 2️⃣ 转换为目标厂商格式 (GLM，应该是 snake_case)
      // ⭐ 注意：transpile() 的语义是 "从 from 格式转换到 to 格式"
      // 当 to='glm' 时，输出应该是 GLM 格式 (snake_case)
      const vendorResult = protocolTranspiler.transpile(
        internalRequest,
        'openai',  // Internal format
        'glm'      // 目标厂商格式
      );

      expect(vendorResult.success).toBe(true);
      const vendorRequest = vendorResult.data!;

      console.log('📡 发送给上游的请求 (GLM 格式，应该是 snake_case):');
      console.log(JSON.stringify(vendorRequest, null, 2));

      // 3️⃣ 验证转换到 GLM 格式 (snake_case)
      expect(vendorRequest).toMatchObject({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.7,
        max_tokens: 500,    // ✅ snake_case (GLM 格式)
        top_p: 0.9,         // ✅ snake_case (GLM 格式)
        top_k: 40,          // ✅ snake_case (GLM 格式)
      });

      // 4️⃣ ❌ 不应该有 camelCase 字段
      expect(vendorRequest).not.toHaveProperty('maxTokens');
      expect(vendorRequest).not.toHaveProperty('topP');
      expect(vendorRequest).not.toHaveProperty('topK');
    });
  });

  describe('Anthropic → OpenAI (Cross-vendor conversion)', () => {
    it('should convert Anthropic format to OpenAI format', () => {
      // 1️⃣ 客户端请求 (Anthropic 格式，snake_case)
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1000,
        temperature: 0.8,
        top_p: 0.95,
        top_k: 40,
      };

      // 2️⃣ 跨厂商转换：Anthropic → OpenAI
      // ⭐ 注意：这里输出应该是 OpenAI 格式 (snake_case)
      // 因为 transpile() 的语义是 "转换到目标格式"
      const openaiResult = protocolTranspiler.transpile(
        anthropicRequest,
        'anthropic',
        'openai'  // 目标格式
      );

      expect(openaiResult.success).toBe(true);
      const openaiRequest = openaiResult.data!;

      console.log('Anthropic → OpenAI:');
      console.log(JSON.stringify(openaiRequest, null, 2));

      // 3️⃣ 验证转换到 OpenAI 格式 (snake_case)
      expect(openaiRequest).toMatchObject({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,    // ✅ snake_case (OpenAI 格式)
        temperature: 0.8,
        top_p: 0.95,         // ✅ snake_case (OpenAI 格式)
        top_k: 40,           // ✅ snake_case (OpenAI 格式)
      });
    });
  });

  describe('Vendor-specific handling', () => {
    it('should handle GLM-specific fields correctly', () => {
      // 1️⃣ GLM 请求（使用 snake_case）
      const glmRequest = {
        model: 'glm-4',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1000,
        temperature: 0.8,
        top_p: 0.95,
      };

      // 2️⃣ 使用 converter 直接转换为 Internal Format (camelCase)
      const openaiConverter = (protocolTranspiler as any).converters?.get('openai');
      const internalResult = openaiConverter.convertRequestToInternal(glmRequest);

      expect(internalResult.success).toBe(true);
      const internalRequest = internalResult.data!;

      console.log('GLM → Internal Format:');
      console.log(JSON.stringify(internalRequest, null, 2));

      // 3️⃣ 验证转换为 camelCase
      expect(internalRequest).toMatchObject({
        model: 'glm-4',
        maxTokens: 1000,     // ✅ camelCase
        temperature: 0.8,
        topP: 0.95,          // ✅ camelCase
      });

      // 4️⃣ 验证存储到数据库
      const { model, messages, stream, tools, ...requestParams } = internalRequest as any;

      console.log('GLM 存入数据库的 request_params (应该是 camelCase):');
      console.log(JSON.stringify(requestParams, null, 2));

      expect(requestParams).toMatchObject({
        maxTokens: 1000,     // ✅ camelCase
        temperature: 0.8,
        topP: 0.95,          // ✅ camelCase
      });

      // ❌ 不应该有 snake_case 字段
      expect(requestParams).not.toHaveProperty('max_tokens');
      expect(requestParams).not.toHaveProperty('top_p');
    });
  });
});
