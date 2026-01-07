// @ts-nocheck
/**
 * Scenario 3.1: Anthropic → Anthropic → Anthropic (非流式)
 *
 * 多层验证测试 - 验证每一层转换的正确性
 *
 * 转换链路:
 * Anthropic Request → Internal → Anthropic Request → Anthropic Response → Internal → Anthropic Response
 *
 * 测试目标:
 * - Layer 1: Anthropic Request → Internal Format
 * - Layer 2: Internal Format → Anthropic Request (should be identical)
 * - Layer 3: Anthropic Response → Internal Format
 * - Layer 4: Internal Format → Anthropic Response (should be identical)
 */

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';

describe('Scenario 3.1: Anthropic → Anthropic → Anthropic (非流式)', () => {
  const anthropicConverter = new AnthropicConverter();

  // ==========================================
  // 测试数据: 真实 Anthropic 请求格式
  // ==========================================

  const anthropicRequest = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: 'You are a helpful assistant',
    messages: [
      { role: 'user', content: 'What is the weather in Tokyo?' }
    ],
    tools: [{
      name: 'get_weather',
      description: 'Get weather information',
      input_schema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' }
        },
        required: ['city']
      }
    }]
  };

  // ==========================================
  // 测试数据: 真实 Anthropic 响应格式（模拟上游返回）
  // ==========================================

  const anthropicResponse = {
    id: 'msg_abc123',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_xyz789',
        name: 'get_weather',
        input: { city: 'Tokyo' }
      }
    ],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 20,
      output_tokens: 10
    }
  };

  // ==========================================
  // Layer 1: Anthropic Request → Internal Format
  // ==========================================

  describe('Layer 1: Anthropic Request → Internal Format', () => {
    it('应当正确转换 Anthropic 请求到 Internal Format', () => {
      const result = anthropicConverter.convertRequestToInternal(anthropicRequest);

      expect(result.success).toBe(true);
      const internal = result.data!;

      console.log('\n=== Layer 1: Anthropic → Internal ===');
      console.log('Input:', JSON.stringify(anthropicRequest, null, 2));
      console.log('Output:', JSON.stringify(internal, null, 2));

      // ✅ 验证: max_tokens → maxTokens
      expect(internal.maxTokens).toBe(1024);
      console.log('✅ max_tokens → maxTokens:', 1024);

      // ✅ 验证: system → messages[0].role='system'
      expect(internal.messages[0]!.role).toBe('system');
      expect(internal.messages[0]!.content).toBe('You are a helpful assistant');
      console.log('✅ system → messages[0].role="system"');

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
      console.log('  - name:', internal.tools![0]!.function.name);
      console.log('  - parameters.type:', internal!!.tools![0]!.function!.parameters.type);
    });
  });

  // ==========================================
  // Layer 2: Internal Format → Anthropic Request
  // ==========================================

  describe('Layer 2: Internal Format → Anthropic Request', () => {
    it('应当正确转换 Internal Format 到 Anthropic 请求（往返转换）', () => {
      // 先得到 Internal Format
      const layer1Result = anthropicConverter.convertRequestToInternal(anthropicRequest);
      const internalRequest = layer1Result.data!;

      // 再转换回 Anthropic
      const result = anthropicConverter.convertRequestFromInternal(internalRequest);

      expect(result.success).toBe(true);
      const anthropicReq = result.data!;

      console.log('\n=== Layer 2: Internal → Anthropic Request ===');
      console.log('Input (Internal):', JSON.stringify(internalRequest, null, 2));
      console.log('Output (Anthropic):', JSON.stringify(anthropicReq, null, 2));

      // ✅ 验证: maxTokens → max_tokens
      expect(anthropicReq.max_tokens).toBe(1024);
      console.log('✅ maxTokens → max_tokens:', 1024);

      // ✅ 验证: messages[0] → system
      expect(anthropicReq.messages).toBeDefined();
      expect(anthropicReq.messages[0]).toEqual({
        role: 'user',
        content: 'What is the weather in Tokyo?'
      });
      expect(anthropicReq.system).toBe('You are a helpful assistant');
      console.log('✅ messages[0].role="system" → system');

      // ✅ 验证: tools 格式转换回 Anthropic
      expect(anthropicReq.tools).toBeDefined();
      expect(anthropicReq.tools![0]).toMatchObject({
        name: 'get_weather',
        description: 'Get weather information',
        input_schema: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name' }
          }
        }
      });
      console.log('✅ tools 格式正确转换回 Anthropic');
      console.log('  - name:', anthropicReq.tools![0].name);

      // ✅ 验证: 往返转换后，Anthropic 请求应该基本一致
      expect(anthropicReq.model).toBe(anthropicRequest.model);
      expect(anthropicReq.max_tokens).toBe(anthropicRequest.max_tokens);
      console.log('✅ 往返转换后 Anthropic 请求保持一致');
    });
  });

  // ==========================================
  // Layer 3: Anthropic Response → Internal Format
  // ==========================================

  describe('Layer 3: Anthropic Response → Internal Format', () => {
    it('应当正确转换 Anthropic 响应到 Internal Format', () => {
      const result = anthropicConverter.convertResponseToInternal(anthropicResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      console.log('\n=== Layer 3: Anthropic Response → Internal ===');
      console.log('Input:', JSON.stringify(anthropicResponse, null, 2));
      console.log('Output:', JSON.stringify(internal, null, 2));

      // ✅ 验证: input_tokens → promptTokens
      expect(internal.usage?.promptTokens).toBe(20);
      console.log('✅ input_tokens → promptTokens:', 20);

      // ✅ 验证: output_tokens → completionTokens
      expect(internal.usage?.completionTokens).toBe(10);
      console.log('✅ output_tokens → completionTokens:', 10);

      // ✅ 验证: total_tokens 计算
      expect(internal.usage?.totalTokens).toBe(30);
      console.log('✅ totalTokens (计算):', 30);

      // ✅ 验证: tool_use → toolCalls
      expect(internal.choices![0]!.message.toolCalls).toBeDefined();
      expect(internal.choices![0]!.message.toolCalls![0]).toMatchObject({
        id: 'toolu_xyz789',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });
      console.log('✅ tool_use → toolCalls');
      console.log('  - id:', internal!!.choices![0]!.message!.toolCalls![0].id);
      console.log('  - name:', internal!!.choices![0]!.message!.toolCalls![0].function!.name);

      // ✅ 验证: stop_reason → finishReason
      // Anthropic 'tool_use' → Internal 'tool_calls' (OpenAI-like format)
      expect(internal.choices![0]!.finishReason).toBe('tool_calls');
      console.log('✅ stop_reason → finishReason:', 'tool_calls');
      console.log('  Anthropic: tool_use → Internal: tool_calls');

      // ✅ 验证: content 数组保留（同时有 content[] 和 toolCalls）
      // Internal Format 可能同时保留原始 content[] 和提取的 toolCalls
      if (Array.isArray(internal.choices![0]!.message.content)) {
        expect(internal!!.choices![0]!.message!.content[0].type).toBe('tool_use');
        console.log('✅ content[] 保留为原始数组格式');
      } else {
        expect(internal.choices![0]!.message.content).toBe(null);
        console.log('✅ content[] 转换为 null');
      }
    });
  });

  // ==========================================
  // Layer 4: Internal Format → Anthropic Response
  // ==========================================

  describe('Layer 4: Internal Format → Anthropic Response', () => {
    it('应当正确转换 Internal Format 到 Anthropic 响应（往返转换）', () => {
      // 先得到 Internal Format
      const layer3Result = anthropicConverter.convertResponseToInternal(anthropicResponse);
      const internalResponse = layer3Result.data!;

      // 再转换回 Anthropic
      const result = anthropicConverter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResp = result.data!;

      console.log('\n=== Layer 4: Internal → Anthropic Response ===');
      console.log('Input (Internal):', JSON.stringify(internalResponse, null, 2));
      console.log('Output (Anthropic):', JSON.stringify(anthropicResp, null, 2));

      // ✅ 验证: 基本结构
      expect(anthropicResp.type).toBe('message');
      expect(anthropicResp.role).toBe('assistant');
      console.log('✅ type:', anthropicResp.type);
      console.log('✅ role:', anthropicResp.role);

      // ✅ 验证: content 数组包含 tool_use 块
      expect(Array.isArray(anthropicResp.content)).toBe(true);
      const toolUseBlock = anthropicResp.content.find((b: any) => b.type === 'tool_use');
      expect(toolUseBlock).toBeDefined();
      console.log('✅ content[] 包含 tool_use 块');

      // ✅ 验证: tool_use 块格式
      expect(toolUseBlock).toMatchObject({
        type: 'tool_use',
        id: 'toolu_xyz789',
        name: 'get_weather',
      });
      console.log('✅ tool_use 块格式:');
      console.log('  - type:', toolUseBlock.type);
      console.log('  - id:', toolUseBlock.id);
      console.log('  - name:', toolUseBlock.name);

      // ✅ 验证: input 是对象 (不是 JSON 字符串)
      expect(typeof toolUseBlock.input).toBe('object');
      expect(toolUseBlock.input).toEqual({ city: 'Tokyo' });
      console.log('✅ input 是对象 (不是字符串):', JSON.stringify(toolUseBlock.input));

      // ✅ 验证: promptTokens → input_tokens
      expect(anthropicResp.usage.input_tokens).toBe(20);
      console.log('✅ promptTokens → input_tokens:', 20);

      // ✅ 验证: completionTokens → output_tokens
      expect(anthropicResp.usage.output_tokens).toBe(10);
      console.log('✅ completionTokens → output_tokens:', 10);

      // ✅ 验证: finishReason → stop_reason
      expect(anthropicResp.stop_reason).toBe('tool_use');
      console.log('✅ finishReason → stop_reason:', 'tool_use');

      // ✅ 验证: 往返转换后，Anthropic 响应应该基本一致
      expect(anthropicResp.id).toBe(anthropicResponse.id);
      expect(anthropicResp.model).toBe(anthropicResponse.model);
      console.log('✅ 往返转换后 Anthropic 响应保持一致');
    });
  });

  // ==========================================
  // 端到端验证
  // ==========================================

  describe('端到端验证: 完整往返转换', () => {
    it('Anthropic → Anthropic 往返转换后关键字段应当一致', () => {
      console.log('\n=== 端到端验证 ===');

      // Layer 1: Anthropic → Internal
      const layer1 = anthropicConverter.convertRequestToInternal(anthropicRequest).data!;
      console.log('\nLayer 1 (Anthropic → Internal):');
      console.log('  - maxTokens:', layer1.maxTokens);
      console.log('  - tools count:', layer1.tools?.length);

      // Layer 2: Internal → Anthropic
      const layer2 = anthropicConverter.convertRequestFromInternal(layer1).data!;
      console.log('\nLayer 2 (Internal → Anthropic):');
      console.log('  - max_tokens:', layer2.max_tokens);
      console.log('  - tools count:', layer2.tools?.length);

      // Layer 3: Anthropic → Internal
      const layer3 = anthropicConverter.convertResponseToInternal(anthropicResponse).data!;
      console.log('\nLayer 3 (Anthropic → Internal):');
      console.log('  - promptTokens:', layer3.usage?.promptTokens);
      console.log('  - toolCalls count:', layer3.choices![0]!.message.toolCalls?.length);

      // Layer 4: Internal → Anthropic
      const layer4 = anthropicConverter.convertResponseFromInternal(layer3).data!;
      console.log('\nLayer 4 (Internal → Anthropic):');
      console.log('  - input_tokens:', layer4.usage.input_tokens);
      console.log('  - content[] length:', layer4.content?.length);

      // ✅ 验证: tool_use 信息保持一致
      const originalTool = anthropicRequest.tools[0];
      const finalTool = layer2.tools![0] as any;

      expect(finalTool.name).toBe(originalTool!.name);
      console.log('\n✅ 工具名称一致:', originalTool!.name, '→', finalTool.name);

      expect(finalTool.input_schema).toEqual(originalTool!.input_schema);
      console.log('✅ 工具参数一致');

      // ✅ 验证: 响应中的 tool_use 信息保持一致
      const originalResponseTool = anthropicResponse.content[0];
      const finalResponseTool = (layer4.content as any).find((b: any) => b.type === 'tool_use');

      expect(finalResponseTool.id).toBe(originalResponseTool!.id);
      expect(finalResponseTool.name).toBe(originalResponseTool!.name);
      expect(finalResponseTool.input).toEqual(originalResponseTool!.input);
      console.log('✅ 响应 tool_use 信息一致');

      // ✅ 验证: 所有层转换成功
      expect(layer1).toBeDefined();
      expect(layer2).toBeDefined();
      expect(layer3).toBeDefined();
      expect(layer4).toBeDefined();
      console.log('\n✅ 所有 4 层转换成功');
    });

    it('token 统计在整个链路中正确传递', () => {
      // 完整转换链
      const layer3 = anthropicConverter.convertResponseToInternal(anthropicResponse).data!;
      const layer4 = anthropicConverter.convertResponseFromInternal(layer3).data!;

      // Anthropic 响应的 token 统计
      const anthropicUsage = anthropicResponse.usage;
      console.log('\nAnthropic usage (原始):', anthropicUsage);

      // Layer 3: Anthropic → Internal
      const internalUsage = layer3.usage;
      console.log('Internal usage (Layer 3):', internalUsage);
      expect(internalUsage?.promptTokens).toBe(anthropicUsage.input_tokens);
      expect(internalUsage?.completionTokens).toBe(anthropicUsage.output_tokens);

      // Layer 4: Internal → Anthropic
      const finalAnthropicUsage = layer4.usage;
      console.log('Anthropic usage (Layer 4):', finalAnthropicUsage);
      expect(finalAnthropicUsage.input_tokens).toBe(anthropicUsage.input_tokens);
      expect(finalAnthropicUsage.output_tokens).toBe(anthropicUsage.output_tokens);

      console.log('\n✅ token 统计在整个链路中正确传递');
      console.log('  input_tokens:', anthropicUsage.input_tokens, '→', 'input_tokens:', finalAnthropicUsage.input_tokens);
      console.log('  output_tokens:', anthropicUsage.output_tokens, '→', 'output_tokens:', finalAnthropicUsage.output_tokens);
    });
  });
});
