// @ts-nocheck
/**
 * Scenario 1.1: Anthropic → OpenAI → Anthropic (非流式)
 *
 * 多层验证测试 - 验证每一层转换的正确性
 *
 * 转换链路:
 * Anthropic Request → Internal → OpenAI Request → OpenAI Response → Internal → Anthropic Response
 *
 * 测试目标:
 * - Layer 1: Anthropic Request → Internal Format
 * - Layer 2: Internal Format → OpenAI Request
 * - Layer 3: OpenAI Response → Internal Format
 * - Layer 4: Internal Format → Anthropic Response
 */

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('Scenario 1.1: Anthropic → OpenAI → Anthropic (非流式)', () => {
  const anthropicConverter = new AnthropicConverter();
  const openaiConverter = new OpenAIConverter();

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
      console.log('  - parameters.type:', internal.tools![0]!.function.parameters!.type);

      // ✅ 验证: messages 保持不变 (除了 system)
      expect(internal.messages[1]).toEqual({
        role: 'user',
        content: 'What is the weather in Tokyo?'
      });
      console.log('✅ messages[1] 保持不变');
    });
  });

  // ==========================================
  // Layer 2: Internal Format → OpenAI Request
  // ==========================================

  describe('Layer 2: Internal Format → OpenAI Request', () => {
    it('应当正确转换 Internal Format 到 OpenAI 请求', () => {
      // 先得到 Internal Format
      const layer1Result = anthropicConverter.convertRequestToInternal(anthropicRequest);
      const internalRequest = layer1Result.data!;

      // 再转换到 OpenAI
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
  // Layer 4: Internal Format → Anthropic Response
  // ==========================================

  describe('Layer 4: Internal Format → Anthropic Response', () => {
    it('应当正确转换 Internal Format 到 Anthropic 响应', () => {
      // 先得到 Internal Format
      const layer3Result = openaiConverter.convertResponseToInternal(openaiResponse);
      const internalResponse = layer3Result.data!;

      // 再转换到 Anthropic
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
        id: 'call_abc123',
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
    });
  });

  // ==========================================
  // 端到端验证
  // ==========================================

  describe('端到端验证: 完整往返转换', () => {
    it('完整往返转换后关键字段应当一致', () => {
      console.log('\n=== 端到端验证 ===');

      // Layer 1: Anthropic → Internal
      const layer1 = anthropicConverter.convertRequestToInternal(anthropicRequest).data!;
      console.log('\nLayer 1 (Anthropic → Internal):');
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

      // Layer 4: Internal → Anthropic
      const layer4 = anthropicConverter.convertResponseFromInternal(layer3).data!;
      console.log('\nLayer 4 (Internal → Anthropic):');
      console.log('  - input_tokens:', layer4.usage.input_tokens);
      console.log('  - content[] length:', layer4.content?.length);

      // ✅ 验证: tool_use 信息保持一致
      const originalTool = anthropicRequest.tools[0];
      const finalToolUse = (layer4.content as any).find((b: any) => b.type === 'tool_use');

      expect(finalToolUse.name).toBe(originalTool!.name);
      console.log('\n✅ 工具名称一致:', originalTool!.name, '→', finalToolUse.name);

      expect(finalToolUse.input).toEqual({ city: 'Tokyo' });
      console.log('✅ 工具参数一致:', JSON.stringify(finalToolUse.input));

      // ✅ 验证: 所有层转换成功
      expect(layer1).toBeDefined();
      expect(layer2).toBeDefined();
      expect(layer3).toBeDefined();
      expect(layer4).toBeDefined();
      console.log('\n✅ 所有 4 层转换成功');
    });

    it('token 统计在整个链路中正确传递', () => {
      // 完整转换链
      const layer1 = anthropicConverter.convertRequestToInternal(anthropicRequest).data!;
      const _layer2 = openaiConverter.convertRequestFromInternal(layer1).data!;
      const layer3 = openaiConverter.convertResponseToInternal(openaiResponse).data!;
      const layer4 = anthropicConverter.convertResponseFromInternal(layer3).data!;

      // OpenAI 响应的 token 统计
      const openaiUsage = openaiResponse.usage;
      console.log('\nOpenAI usage (原始):', openaiUsage);

      // Layer 3: OpenAI → Internal
      const internalUsage = layer3.usage;
      console.log('Internal usage (Layer 3):', internalUsage);
      expect(internalUsage?.promptTokens).toBe(openaiUsage.prompt_tokens);
      expect(internalUsage?.completionTokens).toBe(openaiUsage.completion_tokens);

      // Layer 4: Internal → Anthropic
      const anthropicUsage = layer4.usage;
      console.log('Anthropic usage (Layer 4):', anthropicUsage);
      expect(anthropicUsage.input_tokens).toBe(openaiUsage.prompt_tokens);
      expect(anthropicUsage.output_tokens).toBe(openaiUsage.completion_tokens);

      console.log('\n✅ token 统计在整个链路中正确传递');
      console.log('  prompt_tokens:', openaiUsage.prompt_tokens, '→', 'input_tokens:', anthropicUsage.input_tokens);
      console.log('  completion_tokens:', openaiUsage.completion_tokens, '→', 'output_tokens:', anthropicUsage.output_tokens);
    });
  });
});
