/**
 * Protocol Transpiler Integration Tests
 *
 * Real-world conversion tests with actual API request/response data
 */

import { describe, it, expect } from 'vitest';
import { expectSuccess } from '../../__tests__/test-helpers';
import { protocolTranspiler } from '../../protocol-transpiler-singleton';

describe('ProtocolTranspiler - Integration Tests', () => {
  describe('OpenAI → Anthropic', () => {
    it('should convert a basic chat request', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' },
        ],
        temperature: 0.7,
        maxTokens: 100,
      };

      const result = protocolTranspiler.transpile(openaiRequest, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(result.data! as any as any).toBeDefined();
      expect(data.model).toBe('gpt-4');
      expect(data.system).toBe('You are a helpful assistant.');
      expect(data.messages).toHaveLength(1);
      expect(data.messages?.[0].role).toBe('user');
      expect(data.messages?.[0].content).toBe('Hello!');
      expect(data.temperature).toBe(0.7);
      expect(data.max_tokens).toBe(100);
      expect(result.metadata!?.fieldsConverted).toBeGreaterThan(0);
    });

    it('should convert a request with tools', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What is the weather in SF?' },
        ],
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
              },
            },
          },
        ],
      };

      const result = protocolTranspiler.transpile(openaiRequest, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools).toHaveLength(1);
      expect(data.tools[0].name).toBe('get_weather');
      expect(data.tools[0].input_schema).toBeDefined();
    });

    it('should convert response with tool calls', () => {
      const anthropicResponse = {
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-123',
            name: 'get_weather',
            input: { location: 'SF', temperature: 72 },
          },
        ],
        model: 'claude-3-opus',
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      const result = protocolTranspiler.transpile(anthropicResponse, 'anthropic', 'openai');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.id).toBe('msg-123');
      expect(data.choices).toHaveLength(1);
      expect(data.choices?.[0].message.role).toBe('assistant');
      expect(data.choices?.[0].message.tool_calls).toHaveLength(1);
      expect(data.choices?.[0].message.tool_calls[0].function.name).toBe('get_weather');
      expect(data.choices?.[0].finish_reason).toBe('tool_calls');
    });
  });

  describe('OpenAI → Gemini', () => {
    it('should convert a basic chat request', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello!' },
        ],
        temperature: 0.7,
        maxTokens: 100,
      };

      const result = protocolTranspiler.transpile(openaiRequest, 'openai', 'gemini');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.contents).toHaveLength(1);
      expect(data.contents[0].role).toBe('user');
      expect(data.contents[0].parts[0].text).toBe('Hello!');
      expect(data.generationConfig.temperature).toBe(0.7);
      expect(data.generationConfig.maxOutputTokens).toBe(100);
    });

    it('should convert response from Gemini', () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello! How can I help you today?' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
        model: 'gemini-pro',
      };

      const result = protocolTranspiler.transpile(geminiResponse, 'gemini', 'openai');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.choices).toHaveLength(1);
      expect(data.choices?.[0].message.content).toBe('Hello! How can I help you today?');
      expect(data.choices?.[0].finish_reason).toBe('stop');
      expect(data.usage.prompt_tokens).toBe(10);
      expect(data.usage.completion_tokens).toBe(20);
    });
  });

  describe('Anthropic → OpenAI', () => {
    it('should convert Anthropic request to OpenAI format', () => {
      const anthropicRequest = {
        model: 'claude-3-opus',
        messages: [
          { role: 'user', content: 'Hello!' },
        ],
        maxTokens: 100,
        system: 'You are a helpful assistant.',
      };

      const result = protocolTranspiler.transpile(anthropicRequest, 'anthropic', 'openai');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.model).toBe('claude-3-opus');
      expect(data.messages).toHaveLength(2);
      expect(data.messages?.[0].role).toBe('system');
      expect(data.messages?.[0].content).toBe('You are a helpful assistant.');
      expect(data.messages[1].role).toBe('user');
      expect(data.messages[1].content).toBe('Hello!');
    });
  });

  describe('Gemini → OpenAI', () => {
    it('should convert Gemini request to OpenAI format', () => {
      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello!' }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 100,
        },
      };

      const result = protocolTranspiler.transpile(geminiRequest, 'gemini', 'openai');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toHaveLength(1);
      expect(data.messages?.[0].role).toBe('user');
      expect(data.messages?.[0].content).toBe('Hello!');
      expect(data.temperature).toBe(0.7);
      expect(data.max_tokens).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required fields', () => {
      const invalidRequest = {
        messages: [
          { role: 'user', content: 'Hello!' },
        ],
        // Missing model field
      };

      const result = protocolTranspiler.transpile(invalidRequest as any, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      // Error path comes from validation
      expect(result.errors![0]!.code).toBeTruthy();
    });

    it('should handle invalid data types', () => {
      const invalidRequest = 'not an object';

      const result = protocolTranspiler.transpile(invalidRequest as any, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]!.code).toBeTruthy();
    });
  });

  describe('Metadata Tracking', () => {
    it('should track conversion metadata', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
        maxTokens: 100,
      };

      const result = protocolTranspiler.transpile(request, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!?.fromVendor).toBe('openai');
      expect(result.metadata!?.toVendor).toBe('anthropic');
      expect(result.metadata!?.fieldsConverted).toBeGreaterThan(0);
      expect(result.metadata!?.conversionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata!?.convertedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Streaming Support', () => {
    it('should convert Anthropic streaming chunks', () => {
      const sseChunk = `event: message_start
data: {"type":"message_start","message":{"id":"msg-123","type":"message","role":"assistant","content":[],"model":"claude-3-opus","stop_reason":null}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

`;

      const lines = sseChunk.trim().split('\n\n');
      const results = lines.map(line =>
        protocolTranspiler.transpileStreamChunk(line, 'anthropic', 'openai')
      );

      // First chunk - message_start
      expect(results[0]!.success).toBe(true);
      if (results[0]!.data && Object.keys(results[0]!.data).length > 0) {
        expect(results[0]!.data?.choices?.[0]?.delta?.role).toBe('assistant');
      }

      // Second chunk - content delta
      expect(results[1]!.success).toBe(true);
      if (results[1]!.data && Object.keys(results[1]!.data).length > 0) {
        expect(results[1]!.data?.choices?.[0]?.delta?.content).toBe('Hello');
      }
    });

    it('should convert OpenAI streaming chunks to Anthropic', () => {
      const openaiChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      };

      const result = protocolTranspiler.transpileStreamChunk(openaiChunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      // OpenAI→Anthropic returns SSE string format
      expect(typeof result.data! as any as any).toBe('string');
      if (result.data! as any && typeof result.data! as any === 'string') {
        // Check for SSE format markers
        expect(result.data! as any as any).toContain('event:');
        expect(result.data! as any as any).toContain('data:');
        expect(result.data! as any as any).toContain('Hello');
      }
    });
  });
});
