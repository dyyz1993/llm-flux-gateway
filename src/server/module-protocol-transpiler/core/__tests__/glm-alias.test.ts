import { describe, it, expect } from 'vitest';
import { ProtocolTranspiler } from '../protocol-transpiler';
import { OpenAIConverter } from '../../converters/openai.converter';

describe('ProtocolTranspiler - GLM Format Alias', () => {
  it('should convert GLM response to OpenAI format with snake_case usage', () => {
    const transpiler = new ProtocolTranspiler();
    transpiler.registerConverter(new OpenAIConverter());

    // GLM format should be handled by OpenAI converter
    const glmResponse = {
      id: 'msg_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'glm-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Hello!' },
              { type: 'tool_use', id: 'call_123', name: 'weather', input: { city: 'Beijing' } }
            ],
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'weather',
                  arguments: '{"city":"Beijing"}'
                }
              }
            ]
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      }
    };

    // Convert from GLM to OpenAI format
    const result = transpiler.transpile(glmResponse, 'glm', 'openai');

    expect(result.success).toBe(true);
    if (result.success) {
      const openaiResponse = result.data! as any;
      // Content array should be converted to string
      expect(openaiResponse.choices[0]?.message.content).toBe('Hello!');
      // Tool calls should be extracted
      expect(openaiResponse.choices[0]?.message.tool_calls).toHaveLength(1);
      expect(openaiResponse.choices[0]?.message.tool_calls?.[0]?.id).toBe('call_123');
      // ✅ IMPORTANT: usage should be snake_case (OpenAI API format)
      expect(openaiResponse.usage).toBeDefined();
      expect(openaiResponse.usage.prompt_tokens).toBe(10);
      expect(openaiResponse.usage.completion_tokens).toBe(20);
      expect(openaiResponse.usage.total_tokens).toBe(30);
      // Should NOT have camelCase fields
      expect(openaiResponse.usage.promptTokens).toBeUndefined();
      expect(openaiResponse.usage.completionTokens).toBeUndefined();
      expect(openaiResponse.usage.totalTokens).toBeUndefined();
    }
  });

  it('should handle glm → glm conversion (alias to openai)', () => {
    const transpiler = new ProtocolTranspiler();
    transpiler.registerConverter(new OpenAIConverter());

    const glmRequest = {
      model: 'glm-4',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    };

    // GLM to GLM should work (both resolve to openai)
    const result = transpiler.transpile(glmRequest, 'glm', 'glm');

    expect(result.success).toBe(true);
  });
});
