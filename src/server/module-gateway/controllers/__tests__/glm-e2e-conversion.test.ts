import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('GLM to OpenAI E2E Conversion', () => {
  it('should convert GLM response to OpenAI API format with snake_case', () => {
    const converter = new OpenAIConverter();

    // Step 1: Simulate GLM upstream response (mixed format)
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

    // Step 2: Convert to Internal Format (camelCase)
    const toInternalResult = converter.convertResponseToInternal(glmResponse);
    expect(toInternalResult.success).toBe(true);

    const internalResponse = toInternalResult.data!;
    // Verify internal format uses camelCase
    expect(internalResponse.usage?.promptTokens).toBe(10);
    expect(internalResponse.usage?.completionTokens).toBe(20);
    expect(internalResponse.usage?.totalTokens).toBe(30);
    // Content array should be converted to string
    expect(internalResponse.choices[0]?.message.content).toBe('Hello!');
    // Tool calls should be extracted
    expect(internalResponse.choices[0]?.message.toolCalls).toHaveLength(1);
    expect(internalResponse.choices[0]?.message.toolCalls?.[0]?.id).toBe('call_123');

    // Step 3: Convert from Internal Format to OpenAI API format (snake_case)
    const fromInternalResult = converter.convertResponseFromInternal(internalResponse);
    expect(fromInternalResult.success).toBe(true);

    const finalResponse = fromInternalResult.data!;

    // ✅ CRITICAL: Final response MUST use snake_case for OpenAI API format
    expect(finalResponse.usage).toBeDefined();
    expect(finalResponse.usage.prompt_tokens).toBe(10);
    expect(finalResponse.usage.completion_tokens).toBe(20);
    expect(finalResponse.usage.total_tokens).toBe(30);

    // Should NOT have camelCase fields
    expect(finalResponse.usage.promptTokens).toBeUndefined();
    expect(finalResponse.usage.completionTokens).toBeUndefined();
    expect(finalResponse.usage.totalTokens).toBeUndefined();

    // Message should also use snake_case
    expect(finalResponse.choices[0].message.tool_calls).toBeDefined();
    expect(finalResponse.choices[0].message.tool_calls).toHaveLength(1);
    expect(finalResponse.choices[0].message.tool_calls[0].id).toBe('call_123');

    // finish_reason should be snake_case
    expect(finalResponse.choices[0].finish_reason).toBe('stop');
    expect(finalResponse.choices[0].finishReason).toBeUndefined();
  });
});
