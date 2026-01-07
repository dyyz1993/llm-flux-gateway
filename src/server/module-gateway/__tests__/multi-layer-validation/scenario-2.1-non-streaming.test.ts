// @ts-nocheck
/**
 * Scenario 2.1: OpenAI → OpenAI → OpenAI (非流式)
 *
 * 多层验证测试 - 验证每一层转换的正确性
 *
 * 转换链路:
 * OpenAI Request → Internal → OpenAI Request → OpenAI Response → Internal → OpenAI Response
 *
 * 测试目标:
 * - Layer 1: OpenAI Request → Internal Format
 * - Layer 2: Internal Format → OpenAI Request (should be identical)
 * - Layer 3: OpenAI Response → Internal Format
 * - Layer 4: Internal Format → OpenAI Response (should be identical)
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('Scenario 2.1: OpenAI → OpenAI → OpenAI (非流式)', () => {
  const openaiConverter = new OpenAIConverter();

  // ==========================================
  // 测试数据: 真实 OpenAI 请求格式
  // ==========================================

  const openaiRequest = {
    model: 'gpt-4',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'What is the weather in Tokyo?' }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather information',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name' }
          },
          required: ['city']
        }
      }
    }]
  };

  // ==========================================
  // 测试数据: 真实 OpenAI 响应格式（模拟上游返回）
  // ==========================================

  const openaiResponse = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-4',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city":"Tokyo"}'
          }
        }]
      },
      finish_reason: 'tool_calls'
    }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30
    }
  };

  // ==========================================
  // Layer 1: OpenAI Request → Internal Format
  // ==========================================

  describe('Layer 1: OpenAI Request → Internal Format', () => {
    it('应当正确转换 OpenAI 请求到 Internal Format', () => {
      const result = openaiConverter.convertRequestToInternal(openaiRequest);

      expect(result.success).toBe(true);
      const internal = result.data!;

      console.log('\n=== Layer 1: OpenAI → Internal ===');
      console.log('Input:', JSON.stringify(openaiRequest, null, 2));
      console.log('Output:', JSON.stringify(internal, null, 2));

      // ✅ 验证: max_tokens → maxTokens
      expect(internal.maxTokens).toBe(1024);
      console.log('✅ max_tokens → maxTokens:', 1024);

      // ✅ 验证: messages 保持
      expect(internal.messages).toBeDefined();
      expect(internal.messages[0]!.role).toBe('system');
      console.log('✅ messages[0].role 保留: "system"');

      // ✅ 验证: tools 格式转换
      expect(internal.tools).toBeDefined();
      expect(internal.tools![0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' }
            }
          }
        }
      });
      console.log('✅ tools 格式正确转换');
      console.log('  - type:', internal.tools![0]!.type);
      console.log('  - function.name:', internal.tools![0]!.function.name);
    });
  });

  // ==========================================
  // Layer 2: Internal Format → OpenAI Request
  // ==========================================

  describe('Layer 2: Internal Format → OpenAI Request', () => {
    it('应当正确转换 Internal Format 到 OpenAI 请求（往返转换）', () => {
      // 先得到 Internal Format
      const layer1Result = openaiConverter.convertRequestToInternal(openaiRequest);
      const internalRequest = layer1Result.data!;

      // 再转换回 OpenAI
      const result = openaiConverter.convertRequestFromInternal(internalRequest);

      expect(result.success).toBe(true);
      const openaiReq = result.data!;

      console.log('\n=== Layer 2: Internal → OpenAI Request ===');
      console.log('Input (Internal):', JSON.stringify(internalRequest, null, 2));
      console.log('Output (OpenAI):', JSON.stringify(openaiReq, null, 2));

      // ✅ 验证: maxTokens → max_tokens
      expect(openaiReq.max_tokens).toBe(1024);
      console.log('✅ maxTokens → max_tokens:', 1024);

      // ✅ 验证: messages 保持
      expect(openaiReq.messages).toBeDefined();
      expect(openaiReq.messages[0].role).toBe('system');
      console.log('✅ messages[0].role 保留: "system"');

      // ✅ 验证: tools 格式转换回 OpenAI
      expect(openaiReq.tools).toBeDefined();
      expect(openaiReq.tools![0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' }
            }
          }
        }
      });
      console.log('✅ tools 格式正确转换回 OpenAI');
      console.log('  - type:', openaiReq.tools![0].type);
      console.log('  - function.name:', openaiReq.tools![0].function.name);

      // ✅ 验证: 往返转换后，OpenAI 请求应该基本一致
      expect(openaiReq.model).toBe(openaiRequest.model);
      expect(openaiReq.max_tokens).toBe(openaiRequest.max_tokens);
      console.log('✅ 往返转换后 OpenAI 请求保持一致');
    });
  });

  // ==========================================
  // Layer 3: OpenAI Response → Internal Format
  // ==========================================

  describe('Layer 3: OpenAI Response → Internal Format', () => {
    it('应当正确转换 OpenAI 响应到 Internal Format', () => {
      const result = openaiConverter.convertResponseToInternal(openaiResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      console.log('\n=== Layer 3: OpenAI Response → Internal ===');
      console.log('Input:', JSON.stringify(openaiResponse, null, 2));
      console.log('Output:', JSON.stringify(internal, null, 2));

      // ✅ 验证: prompt_tokens → promptTokens
      expect(internal.usage?.promptTokens).toBe(20);
      console.log('✅ prompt_tokens → promptTokens:', 20);

      // ✅ 验证: completion_tokens → completionTokens
      expect(internal.usage?.completionTokens).toBe(10);
      console.log('✅ completion_tokens → completionTokens:', 10);

      // ✅ 验证: total_tokens → totalTokens
      expect(internal.usage?.totalTokens).toBe(30);
      console.log('✅ total_tokens:', 30);

      // ✅ 验证: tool_calls → toolCalls
      expect(internal.choices![0]!.message.toolCalls).toBeDefined();
      expect(internal.choices![0]!.message.toolCalls![0]).toMatchObject({
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });
      console.log('✅ tool_calls → toolCalls');
      console.log('  - id:', internal!!.choices![0]!.message!.toolCalls![0].id);
      console.log('  - type:', internal!!.choices![0]!.message!.toolCalls![0].type);
      console.log('  - function.name:', internal!!.choices![0]!.message!.toolCalls![0].function!.name);

      // ✅ 验证: finish_reason → finishReason
      expect(internal.choices![0]!.finishReason).toBe('tool_calls');
      console.log('✅ finish_reason → finishReason:', 'tool_calls');

      // ✅ 验证: content 为 null (tool_only response)
      expect(internal.choices![0]!.message.content).toBe(null);
      console.log('✅ content is null (tool_only response)');
    });
  });

  // ==========================================
  // Layer 4: Internal Format → OpenAI Response
  // ==========================================

  describe('Layer 4: Internal Format → OpenAI Response', () => {
    it('应当正确转换 Internal Format 到 OpenAI 响应（往返转换）', () => {
      // 先得到 Internal Format
      const layer3Result = openaiConverter.convertResponseToInternal(openaiResponse);
      const internalResponse = layer3Result.data!;

      // 再转换回 OpenAI
      const result = openaiConverter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const openaiResp = result.data!;

      console.log('\n=== Layer 4: Internal → OpenAI Response ===');
      console.log('Input (Internal):', JSON.stringify(internalResponse, null, 2));
      console.log('Output (OpenAI):', JSON.stringify(openaiResp, null, 2));

      // ✅ 验证: promptTokens → prompt_tokens
      expect(openaiResp.usage?.prompt_tokens).toBe(20);
      console.log('✅ promptTokens → prompt_tokens:', 20);

      // ✅ 验证: completionTokens → completion_tokens
      expect(openaiResp.usage?.completion_tokens).toBe(10);
      console.log('✅ completionTokens → completion_tokens:', 10);

      // ✅ 验证: toolCalls → tool_calls
      expect(openaiResp.choices![0].message.tool_calls).toBeDefined();
      expect(openaiResp.choices![0].message.tool_calls![0]).toMatchObject({
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });
      console.log('✅ toolCalls → tool_calls');
      console.log('  - id:', openaiResp.choices![0].message.tool_calls![0].id);
      console.log('  - type:', openaiResp.choices![0].message.tool_calls![0].type);

      // ✅ 验证: finishReason → finish_reason
      expect(openaiResp.choices![0].finish_reason).toBe('tool_calls');
      console.log('✅ finishReason → finish_reason:', 'tool_calls');

      // ✅ 验证: 往返转换后，OpenAI 响应应该基本一致
      expect(openaiResp.id).toBe(openaiResponse.id);
      expect(openaiResp.model).toBe(openaiResponse.model);
      console.log('✅ 往返转换后 OpenAI 响应保持一致');
    });
  });

  // ==========================================
  // 端到端验证
  // ==========================================

  describe('端到端验证: 完整往返转换', () => {
    it('OpenAI → OpenAI 往返转换后关键字段应当一致', () => {
      console.log('\n=== 端到端验证 ===');

      // Layer 1: OpenAI → Internal
      const layer1 = openaiConverter.convertRequestToInternal(openaiRequest).data!;
      console.log('\nLayer 1 (OpenAI → Internal):');
      console.log('  - maxTokens:', layer1.maxTokens);
      console.log('  - tools count:', layer1.tools?.length);

      // Layer 2: Internal → OpenAI
      const layer2 = openaiConverter.convertRequestFromInternal(layer1).data!;
      console.log('\nLayer 2 (Internal → OpenAI):');
      console.log('  - max_tokens:', layer2.max_tokens);
      console.log('  - tools count:', layer2.tools?.length);

      // Layer 3: OpenAI → Internal
      const layer3 = openaiConverter.convertResponseToInternal(openaiResponse).data!;
      console.log('\nLayer 3 (OpenAI → Internal):');
      console.log('  - promptTokens:', layer3.usage?.promptTokens);
      console.log('  - toolCalls count:', layer3.choices![0]!.message.toolCalls?.length);

      // Layer 4: Internal → OpenAI
      const layer4 = openaiConverter.convertResponseFromInternal(layer3).data!;
      console.log('\nLayer 4 (Internal → OpenAI):');
      console.log('  - prompt_tokens:', layer4.usage?.prompt_tokens);
      console.log('  - tool_calls count:', layer4.choices![0].message.tool_calls?.length);

      // ✅ 验证: tool_use 信息保持一致
      const originalTool = openaiRequest.tools[0]!.function;
      const finalTool = layer2.tools![0].function;

      expect(finalTool.name).toBe(originalTool.name);
      console.log('\n✅ 工具名称一致:', originalTool.name, '→', finalTool.name);

      expect(finalTool.parameters).toEqual(originalTool.parameters);
      console.log('✅ 工具参数一致');

      // ✅ 验证: 响应中的 tool_calls 信息保持一致
      const originalResponseTool = openaiResponse.choices[0]!.message.tool_calls[0];
      const finalResponseTool = layer4.choices![0].message.tool_calls![0];

      expect(finalResponseTool.id).toBe(originalResponseTool!.id);
      expect(finalResponseTool.function.name).toBe(originalResponseTool!.function.name);
      expect(finalResponseTool.function.arguments).toBe(originalResponseTool!.function.arguments);
      console.log('✅ 响应 tool_calls 信息一致');

      // ✅ 验证: 所有层转换成功
      expect(layer1).toBeDefined();
      expect(layer2).toBeDefined();
      expect(layer3).toBeDefined();
      expect(layer4).toBeDefined();
      console.log('\n✅ 所有 4 层转换成功');
    });

    it('token 统计在整个链路中正确传递', () => {
      // 完整转换链
      const layer3 = openaiConverter.convertResponseToInternal(openaiResponse).data!;
      const layer4 = openaiConverter.convertResponseFromInternal(layer3).data!;

      // OpenAI 响应的 token 统计
      const openaiUsage = openaiResponse.usage;
      console.log('\nOpenAI usage (原始):', openaiUsage);

      // Layer 3: OpenAI → Internal
      const internalUsage = layer3.usage;
      console.log('Internal usage (Layer 3):', internalUsage);
      expect(internalUsage?.promptTokens).toBe(openaiUsage.prompt_tokens);
      expect(internalUsage?.completionTokens).toBe(openaiUsage.completion_tokens);

      // Layer 4: Internal → OpenAI
      const finalOpenaiUsage = layer4.usage;
      console.log('OpenAI usage (Layer 4):', finalOpenaiUsage);
      expect(finalOpenaiUsage?.prompt_tokens).toBe(openaiUsage.prompt_tokens);
      expect(finalOpenaiUsage?.completion_tokens).toBe(openaiUsage.completion_tokens);

      console.log('\n✅ token 统计在整个链路中正确传递');
      console.log('  prompt_tokens:', openaiUsage.prompt_tokens, '→', 'prompt_tokens:', finalOpenaiUsage?.prompt_tokens);
      console.log('  completion_tokens:', openaiUsage.completion_tokens, '→', 'completion_tokens:', finalOpenaiUsage?.completion_tokens);
    });
  });
});
