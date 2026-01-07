// @ts-nocheck
/**
 * Scenario 4.1: OpenAI → Anthropic → OpenAI (非流式)
 *
 * 多层验证测试 - 验证每一层转换的正确性
 *
 * 转换链路:
 * OpenAI Request → Internal → Anthropic Request → Anthropic Response → Internal → OpenAI Response
 *
 * 测试目标:
 * - Layer 1: OpenAI Request → Internal Format
 * - Layer 2: Internal Format → Anthropic Request
 * - Layer 3: Anthropic Response → Internal Format
 * - Layer 4: Internal Format → OpenAI Response
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';

describe('Scenario 4.1: OpenAI → Anthropic → OpenAI (非流式)', () => {
  const openaiConverter = new OpenAIConverter();
  const anthropicConverter = new AnthropicConverter();

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
      console.log('✅ tools 格式正确转换到 Internal');
      console.log('  - type:', internal.tools![0]!.type);
      console.log('  - function.name:', internal.tools![0]!.function.name);
    });
  });

  // ==========================================
  // Layer 2: Internal Format → Anthropic Request
  // ==========================================

  describe('Layer 2: Internal Format → Anthropic Request', () => {
    it('应当正确转换 Internal Format 到 Anthropic 请求', () => {
      // 先得到 Internal Format
      const layer1Result = openaiConverter.convertRequestToInternal(openaiRequest);
      const internalRequest = layer1Result.data!;

      // 再转换到 Anthropic
      const result = anthropicConverter.convertRequestFromInternal(internalRequest);

      expect(result.success).toBe(true);
      const anthropicReq = result.data!;

      console.log('\n=== Layer 2: Internal → Anthropic Request ===');
      console.log('Input (Internal):', JSON.stringify(internalRequest, null, 2));
      console.log('Output (Anthropic):', JSON.stringify(anthropicReq, null, 2));

      // ✅ 验证: maxTokens → max_tokens
      expect(anthropicReq.max_tokens).toBe(1024);
      console.log('✅ maxTokens → max_tokens:', 1024);

      // ✅ 验证: messages[0].role='system' → system
      expect(anthropicReq.system).toBe('You are a helpful assistant');
      console.log('✅ messages[0].role="system" → system');

      // ✅ 验证: tools 格式转换到 Anthropic
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
      console.log('✅ tools 格式正确转换到 Anthropic');
      console.log('  - name:', anthropicReq.tools![0].name);
      console.log('  - input_schema.type:', anthropicReq.tools![0].input_schema.type);
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
      console.log('  - type:', internal!!.choices![0]!.message!.toolCalls![0].type);
      console.log('  - function.name:', internal!!.choices![0]!.message!.toolCalls![0].function!.name);

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
  // Layer 4: Internal Format → OpenAI Response
  // ==========================================

  describe('Layer 4: Internal Format → OpenAI Response', () => {
    it('应当正确转换 Internal Format 到 OpenAI 响应', () => {
      // 先得到 Internal Format
      const layer3Result = anthropicConverter.convertResponseToInternal(anthropicResponse);
      const internalResponse = layer3Result.data!;

      // 再转换到 OpenAI
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
        id: 'toolu_xyz789',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });
      console.log('✅ toolCalls → tool_calls');
      console.log('  - id:', openaiResp.choices![0].message.tool_calls![0].id);
      console.log('  - type:', openaiResp.choices![0].message.tool_calls![0].type);

      // ✅ 验证: finishReason → finish_reason (tool_use → tool_calls)
      expect(openaiResp.choices![0].finish_reason).toBe('tool_calls');
      console.log('✅ finishReason → finish_reason:', 'tool_calls (映射自 tool_use)');

      // ✅ 验证: content 为 null (tool_only response)
      expect(openaiResp.choices![0].message.content).toBe(null);
      console.log('✅ content is null (tool_only response)');
    });
  });

  // ==========================================
  // 端到端验证
  // ==========================================

  describe('端到端验证: 完整往返转换', () => {
    it('OpenAI → Anthropic → OpenAI 完整转换链路验证', () => {
      console.log('\n=== 端到端验证 ===');

      // Layer 1: OpenAI → Internal
      const layer1 = openaiConverter.convertRequestToInternal(openaiRequest).data!;
      console.log('\nLayer 1 (OpenAI → Internal):');
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

      // Layer 4: Internal → OpenAI
      const layer4 = openaiConverter.convertResponseFromInternal(layer3).data!;
      console.log('\nLayer 4 (Internal → OpenAI):');
      console.log('  - prompt_tokens:', layer4.usage?.prompt_tokens);
      console.log('  - tool_calls count:', layer4.choices![0].message.tool_calls?.length);

      // ✅ 验证: tool_use 信息保持一致
      const originalTool = openaiRequest.tools[0]!.function;
      const anthroTool = layer2.tools![0] as any;

      expect(anthroTool.name).toBe(originalTool.name);
      console.log('\n✅ 工具名称一致:', originalTool.name, '→', anthroTool.name);

      expect(anthroTool.input_schema.properties).toEqual(originalTool.parameters.properties);
      console.log('✅ 工具参数结构一致');

      // ✅ 验证: 响应中的 tool_calls 信息保持一致
      const originalResponseTool = anthropicResponse.content[0];
      const finalResponseTool = layer4.choices![0].message.tool_calls![0];

      expect(finalResponseTool.function.name).toBe(originalResponseTool!.name);
      expect(finalResponseTool.function.arguments).toBe(JSON.stringify(originalResponseTool!.input));
      console.log('✅ 响应 tool_calls 信息一致');

      // ✅ 验证: finish_reason 映射
      expect(layer4.choices![0].finish_reason).toBe('tool_calls');
      expect(anthropicResponse.stop_reason).toBe('tool_use');
      console.log('✅ finish_reason 正确映射: tool_use → tool_calls');

      // ✅ 验证: 所有层转换成功
      expect(layer1).toBeDefined();
      expect(layer2).toBeDefined();
      expect(layer3).toBeDefined();
      expect(layer4).toBeDefined();
      console.log('\n✅ 所有 4 层转换成功');
    });

    it('token 统计在整个链路中正确传递', () => {
      // 完整转换链
      const layer1 = openaiConverter.convertRequestToInternal(openaiRequest).data!;
      const _layer2 = anthropicConverter.convertRequestFromInternal(layer1).data!;
      const layer3 = anthropicConverter.convertResponseToInternal(anthropicResponse).data!;
      const layer4 = openaiConverter.convertResponseFromInternal(layer3).data!;

      // Anthropic 响应的 token 统计
      const anthropicUsage = anthropicResponse.usage;
      console.log('\nAnthropic usage (原始):', anthropicUsage);

      // Layer 3: Anthropic → Internal
      const internalUsage = layer3.usage;
      console.log('Internal usage (Layer 3):', internalUsage);
      expect(internalUsage?.promptTokens).toBe(anthropicUsage.input_tokens);
      expect(internalUsage?.completionTokens).toBe(anthropicUsage.output_tokens);

      // Layer 4: Internal → OpenAI
      const openaiUsage = layer4.usage;
      console.log('OpenAI usage (Layer 4):', openaiUsage);
      expect(openaiUsage?.prompt_tokens).toBe(anthropicUsage.input_tokens);
      expect(openaiUsage?.completion_tokens).toBe(anthropicUsage.output_tokens);

      console.log('\n✅ token 统计在整个链路中正确传递');
      console.log('  input_tokens:', anthropicUsage.input_tokens, '→', 'prompt_tokens:', openaiUsage.prompt_tokens);
      console.log('  output_tokens:', anthropicUsage.output_tokens, '→', 'completion_tokens:', openaiUsage.completion_tokens);
    });
  });
});
