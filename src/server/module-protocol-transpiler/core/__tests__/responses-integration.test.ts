/**
 * Responses API Integration Tests
 *
 * Tests cross-format conversion involving OpenAI Responses API format.
 * This is critical because Responses API uses different field names (input vs messages).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { protocolTranspiler, isVendorRegistered } from '../../protocol-transpiler-singleton';
import type { TranspileResult } from '../../core/transpile-result';

describe('Responses API Cross-Format Integration', () => {
  beforeEach(() => {
    // Ensure all converters are registered
    expect(isVendorRegistered('openai')).toBe(true);
    expect(isVendorRegistered('openai-responses')).toBe(true);
    expect(isVendorRegistered('anthropic')).toBe(true);
    expect(isVendorRegistered('gemini')).toBe(true);
  });

  // ==========================================
  // Test Data
  // ==========================================

  const responsesRequestWithStringInput = {
    model: 'gpt-4',
    input: 'Hello, how are you?',
    temperature: 0.7,
  };

  const responsesRequestWithArrayInput = {
    model: 'gpt-4',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'What is the capital of France?' }],
      },
    ],
    temperature: 0.5,
  };

  const responsesRequestWithTools = {
    model: 'gpt-4',
    input: 'What is the weather in Tokyo?',
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        },
      },
    ],
    tool_choice: 'auto',
  };

  const responsesRequestWithRequiredTool = {
    model: 'gpt-4',
    input: 'Get weather for Tokyo',
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'get_weather' } },
  };

  // ==========================================
  // Responses → OpenAI Conversion Tests
  // ==========================================

  describe('Responses → OpenAI', () => {
    it('should convert string input to messages array', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithStringInput,
        'openai-responses',
        'openai'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data!).toBeDefined();
      expect(result.data!.messages).toHaveLength(1);
      expect(result.data!.messages?.[0].role).toBe('user');
      expect(result.data!.messages?.[0].content).toBe('Hello, how are you?');
      expect(result.data!.temperature).toBe(0.7);
      expect(result.data!.model).toBe('gpt-4');
    });

    it('should convert array input to messages array', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithArrayInput,
        'openai-responses',
        'openai'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.data!.messages).toHaveLength(1);
      expect(result.data!.messages?.[0].content).toBe('What is the capital of France?');
    });

    it('should convert tools to OpenAI format', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithTools,
        'openai-responses',
        'openai'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.data!.tools).toBeDefined();
      expect(result.data!.tools).toHaveLength(1);
      expect(result.data!.tools[0].type).toBe('function');
      expect(result.data!.tools[0].function.name).toBe('get_weather');
      expect(result.data!.tools[0].function.parameters).toBeDefined();
      expect(result.data!.tool_choice).toBe('auto');
    });

    it('should convert tool_choice required correctly', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithRequiredTool,
        'openai-responses',
        'openai'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.data!.tool_choice).toBeDefined();
      // tool_choice 'required' should be converted to function type
      expect(result.data!.tool_choice.type).toBe('function');
    });

    it('should handle response conversion back to Responses format', () => {
      // First convert request to OpenAI format
      const requestResult = protocolTranspiler.transpile(
        responsesRequestWithStringInput,
        'openai-responses',
        'openai'
      ) as TranspileResult<any>;

      expect(requestResult.success).toBe(true);

      // Simulate OpenAI response
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I am doing well, thank you!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      // Convert response back to Responses format
      const responseResult = protocolTranspiler.transpile(
        openaiResponse,
        'openai',
        'openai-responses'
      ) as TranspileResult<any>;

      expect(responseResult.success).toBe(true);
      expect(responseResult.data!.id).toBe('chatcmpl-123');
      expect(responseResult.data!.status).toBe('completed');
      expect(responseResult.data!.output).toBeDefined();
      expect(responseResult.data!.output).toHaveLength(1);
      expect(responseResult.data!.output[0].role).toBe('assistant');
    });
  });

  // ==========================================
  // Responses → Anthropic Conversion Tests
  // ==========================================

  describe('Responses → Anthropic', () => {
    it('should convert string input to Anthropic messages format', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithStringInput,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data!).toBeDefined();
      // Anthropic uses messages array with specific structure
      expect(result.data!.messages).toBeDefined();
      expect(Array.isArray(result.data!.messages)).toBe(true);
    });

    it('should convert tools to Anthropic format without errors', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithTools,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      // This should NOT throw "Cannot read properties of undefined (reading 'name')"
      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();

      // Verify tools are converted to Anthropic format
      expect(result.data!.tools).toBeDefined();
      expect(Array.isArray(result.data!.tools)).toBe(true);
      expect(result.data!.tools.length).toBeGreaterThan(0);

      // Anthropic tool structure
      const firstTool = result.data!.tools[0];
      expect(firstTool.name).toBeDefined();
      expect(firstTool.description).toBeDefined();
      expect(firstTool.input_schema).toBeDefined();
    });

    it('should convert tool_choice auto correctly', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithTools,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      // Anthropic uses different tool_choice values
      expect(result.data!.tool_choice).toBeDefined();
    });

    it('should convert tool_choice required correctly', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithRequiredTool,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      // Should handle required tool_choice
      expect(result.data!.tool_choice).toBeDefined();
    });

    it('should handle response conversion from Anthropic back to Responses', () => {
      // Convert request to Anthropic format
      const requestResult = protocolTranspiler.transpile(
        responsesRequestWithStringInput,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(requestResult.success).toBe(true);

      // Simulate Anthropic response
      const anthropicResponse = {
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I am doing well, thank you for asking!',
          },
        ],
        model: 'claude-3-sonnet',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      // Convert response back to Responses format
      const responseResult = protocolTranspiler.transpile(
        anthropicResponse,
        'anthropic',
        'openai-responses'
      ) as TranspileResult<any>;

      expect(responseResult.success).toBe(true);
      expect(responseResult.data!.id).toBe('msg-123');
      expect(responseResult.data!.status).toBe('completed');
      expect(responseResult.data!.output).toBeDefined();
    });
  });

  // ==========================================
  // Responses → Gemini Conversion Tests
  // ==========================================

  describe('Responses → Gemini', () => {
    it('should convert string input to Gemini contents format', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithStringInput,
        'openai-responses',
        'gemini'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data!).toBeDefined();
      // Gemini uses contents array
      expect(result.data!.contents).toBeDefined();
      expect(Array.isArray(result.data!.contents)).toBe(true);
    });

    it('should convert tools to Gemini format', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithTools,
        'openai-responses',
        'gemini'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      // Gemini has a different tool declaration format
      expect(result.data!.tools).toBeDefined();
    });

    it('should handle tool_choice conversions', () => {
      const result = protocolTranspiler.transpile(
        responsesRequestWithTools,
        'openai-responses',
        'gemini'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      // Gemini uses tool_config for tool choice
      expect(result.data!).toBeDefined();
    });

    it('should handle response conversion from Gemini back to Responses', () => {
      const requestResult = protocolTranspiler.transpile(
        responsesRequestWithStringInput,
        'openai-responses',
        'gemini'
      ) as TranspileResult<any>;

      expect(requestResult.success).toBe(true);

      // Simulate Gemini response
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'I am doing well! Thank you for asking.',
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      };

      const responseResult = protocolTranspiler.transpile(
        geminiResponse,
        'gemini',
        'openai-responses'
      ) as TranspileResult<any>;

      expect(responseResult.success).toBe(true);
      expect(responseResult.data!.status).toBe('completed');
    });
  });

  // ==========================================
  // Edge Cases and Error Handling
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle empty tools array', () => {
      const requestWithEmptyTools = {
        model: 'gpt-4',
        input: 'Hello',
        tools: [],
      };

      const result = protocolTranspiler.transpile(
        requestWithEmptyTools,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      // Empty tools array might be undefined or empty array depending on converter
      if (result.data!.tools !== undefined) {
        expect(Array.isArray(result.data!.tools)).toBe(true);
      }
    });

    it('should handle missing optional fields', () => {
      const minimalRequest = {
        model: 'gpt-4',
        input: 'Test',
      };

      const result = protocolTranspiler.transpile(
        minimalRequest,
        'openai-responses',
        'openai'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.data!.model).toBe('gpt-4');
    });

    it('should handle tool_choice none', () => {
      const requestWithNoTools = {
        model: 'gpt-4',
        input: 'Hello',
        tools: [],
        tool_choice: 'none',
      };

      const result = protocolTranspiler.transpile(
        requestWithNoTools,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should handle complex nested tool parameters', () => {
      const complexToolRequest = {
        model: 'gpt-4',
        input: 'Get weather for multiple cities',
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather_batch',
              description: 'Get weather for multiple cities',
              parameters: {
                type: 'object',
                properties: {
                  cities: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        country: { type: 'string' },
                      },
                    },
                  },
                },
                required: ['cities'],
              },
            },
          },
        ],
      };

      const result = protocolTranspiler.transpile(
        complexToolRequest,
        'openai-responses',
        'anthropic'
      ) as TranspileResult<any>;

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.data!.tools).toBeDefined();
      expect(result.data!.tools[0].input_schema).toBeDefined();
    });
  });
});
