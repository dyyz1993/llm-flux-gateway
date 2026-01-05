/**
 * OpenAI → Anthropic Format Conversion Unit Tests
 *
 * Tests the protocol transpiler's ability to convert OpenAI format requests to Anthropic format.
 * Uses real-world test data extracted from actual gateway requests.
 */

import { describe, it, expect } from 'vitest';
import { expectSuccess } from '../../__tests__/test-helpers';
import { protocolTranspiler } from '../../protocol-transpiler-singleton';
import testData_4af0d2 from './test-data/openai-to-anthropic-4af0d2.json';
import testData_8defcc from './test-data/openai-to-anthropic-8defcc.json';

describe('Protocol Transpiler: OpenAI → Anthropic', () => {
  describe('Real Data Test - Request 4af0d2', () => {
    it('should convert OpenAI format to Anthropic format correctly', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;

      // Verify core fields match
      expect(data.model).toBe(testData_4af0d2.expected.data!.model);
      expect(data.max_tokens).toBe(testData_4af0d2.expected.data!.max_tokens);
      expect(data.messages).toEqual(testData_4af0d2.expected.data!.messages);
      expect(data.tools).toEqual(testData_4af0d2.expected.data!.tools);

      // Note: stream field may be preserved by the transpiler
      expect(result.data!).toHaveProperty('stream');
    });

    it('should convert tool structure: {type, function} → {name, input_schema}', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const tools = data.tools;
      expect(tools).toBeDefined();
      expect(tools.length).toBe(8);

      // Verify first tool structure
      const firstTool = tools[0];
      expect(firstTool).toHaveProperty('name', 'web_search');
      expect(firstTool).toHaveProperty('description');
      expect(firstTool).toHaveProperty('input_schema');
      expect(firstTool).not.toHaveProperty('type');
      expect(firstTool).not.toHaveProperty('function');
    });

    it('should preserve tool schema properties as-is (bc93cb fix)', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const webSearchTool = data.tools.find((t: any) => t.name === 'web_search');
      expect(webSearchTool).toBeDefined();

      // num_results should remain as snake_case (not converted to camelCase)
      // This is the fix for bc93cb - tool schema properties should NOT be normalized
      expect(webSearchTool.input_schema.properties).toHaveProperty('num_results');
      expect(webSearchTool.input_schema.properties).not.toHaveProperty('numResults');

      // Verify the property has correct structure
      expect(webSearchTool.input_schema.properties.num_results).toEqual({
        type: 'number',
        description: '返回结果数量',
        default: 5
      });
    });

    it('should preserve all 8 tools with correct structure', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const tools = data.tools;

      const expectedTools = [
        'web_search',
        'calculator',
        'get_weather',
        'code_interpreter',
        'get_current_time',
        'database_query',
        'send_email',
        'file_operations'
      ];

      expectedTools.forEach((toolName, index) => {
        expect(tools[index]).toHaveProperty('name', toolName);
        expect(tools[index]).toHaveProperty('description');
        expect(tools[index]).toHaveProperty('input_schema');
        expect(tools[index].input_schema).toHaveProperty('type', 'object');
        expect(tools[index].input_schema).toHaveProperty('properties');
      });
    });

    it('should add max_tokens field with default value', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('max_tokens', 4096);
    });

    it('should preserve messages array', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toEqual([
        {
          role: 'user',
          content: 'What is the current weather in San Francisco?'
        }
      ]);
    });

    it('should preserve model name', () => {
      const result = protocolTranspiler.transpile(
        testData_4af0d2.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.model).toBe('glm-4-air');
    });
  });

  describe('Real Data Test - Request 8defcc', () => {
    it('should convert tool role messages to tool_result content blocks', () => {
      const result = protocolTranspiler.transpile(
        testData_8defcc.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toBeDefined();
      expect(data.messages.length).toBe(3);

      expect(data.messages?.[0].role).toBe('user');
      expect(data.messages[1].role).toBe('assistant');
      expect(data.messages[2].role).toBe('user'); // Tool results become user messages

      // The third message should have tool_result content blocks
      const thirdMessage = data.messages[2];
      expect(Array.isArray(thirdMessage.content)).toBe(true);
      expect(thirdMessage.content[0].type).toBe('tool_result');
      expect(thirdMessage.content[0].content).toBe('{"location":"San Francisco","temperature":"15°C","condition":"Sunny"}');
    });

    it('should preserve tool response content in tool_result blocks', () => {
      const result = protocolTranspiler.transpile(
        testData_8defcc.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const toolResultMessage = data.messages[2];

      expect(toolResultMessage.role).toBe('user');
      expect(Array.isArray(toolResultMessage.content)).toBe(true);
      expect(toolResultMessage.content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'unknown_0',
        content: '{"location":"San Francisco","temperature":"15°C","condition":"Sunny"}'
      });
    });

    it('should preserve assistant empty content', () => {
      const result = protocolTranspiler.transpile(
        testData_8defcc.input.data!,
        'openai',
        'anthropic'
      );

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMessage = data.messages[1];

      expect(assistantMessage.role).toBe('assistant');
      expect(assistantMessage.content).toBe('');
    });
  });

  describe('Tool Schema Conversion', () => {
    it('should convert parameters → input_schema and preserve property names', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'test_func',
            description: 'Test function',
            parameters: {
              type: 'object',
              properties: {
                test_param: { type: 'string' }
              }
            }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools[0]).toHaveProperty('input_schema');

      // bc93cb fix: Tool schema properties should NOT be normalized
      expect(data.tools[0].input_schema.type).toBe('object');
      expect(data.tools[0].input_schema.properties).toHaveProperty('test_param');
      expect(data.tools[0].input_schema.properties).not.toHaveProperty('testParam');
    });

    it('should handle complex parameter types (enum, array, nested objects)', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'complex_tool',
            description: 'Tool with complex parameters',
            parameters: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['json', 'xml', 'csv']
                },
                items: {
                  type: 'array',
                  items: { type: 'string' }
                },
                nested: {
                  type: 'object',
                  properties: {
                    field1: { type: 'string' },
                    field2: { type: 'number' }
                  }
                }
              }
            }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const schema = data.tools[0].input_schema;

      expect(schema.properties.format.enum).toEqual(['json', 'xml', 'csv']);
      expect(schema.properties.items.type).toBe('array');
      expect(schema.properties.nested.type).toBe('object');
    });
  });

  describe('Field Name Normalization', () => {
    it('should preserve tool schema property names (bc93cb fix)', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test',
            parameters: {
              type: 'object',
              properties: {
                num_results: { type: 'number' },
                maxTokens: { type: 'number' },
                temperature: { type: 'number' },
                top_p: { type: 'number' }
              }
            }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const props = data.tools[0].input_schema.properties;

      // bc93cb fix: Tool schema properties should NOT be converted
      expect(props).toHaveProperty('num_results');
      expect(props).toHaveProperty('maxTokens');
      expect(props).toHaveProperty('temperature');
      expect(props).toHaveProperty('top_p');

      // Verify they were NOT converted to camelCase
      expect(props).not.toHaveProperty('numResults');
      expect(props).not.toHaveProperty('max_tokens');
      expect(props).not.toHaveProperty('topP');
    });
  });

  describe('Edge Cases', () => {
    it('should handle request with no tools', () => {
      const input = {
        model: 'test',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools).toBeUndefined();
    });

    it('should handle tool with no parameters', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'no_params_tool',
            description: 'Tool with no parameters',
            parameters: {
              type: 'object',
              properties: {}
            }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools[0].input_schema.properties).toEqual({});
    });

    it('should handle tool with optional parameters (no required field)', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'optional_tool',
            description: 'Tool with optional parameters',
            parameters: {
              type: 'object',
              properties: {
                optional_param: { type: 'string' }
              },
              required: []
            }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools[0].input_schema.required).toEqual([]);
    });

    it('should handle multiple required parameters', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'multi_required',
            description: 'Tool with multiple required parameters',
            parameters: {
              type: 'object',
              properties: {
                param1: { type: 'string' },
                param2: { type: 'number' },
                param3: { type: 'boolean' }
              },
              required: ['param1', 'param2', 'param3']
            }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools[0].input_schema.required).toEqual([
        'param1',
        'param2',
        'param3'
      ]);
    });
  });

  describe('Structure Validation', () => {
    it('should remove type field from tool definition', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'test',
            description: 'Test',
            parameters: { type: 'object', properties: {} }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools[0]).not.toHaveProperty('type');
      expect(data.tools[0]).not.toHaveProperty('function');
    });

    it('should flatten function properties to tool level', () => {
      const input = {
        model: 'test',
        messages: [],
        tools: [{
          type: 'function',
          function: {
            name: 'test_func',
            description: 'Test function',
            parameters: { type: 'object', properties: {} }
          }
        }]
      };

      const result = protocolTranspiler.transpile(input, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.tools[0]).toHaveProperty('name', 'test_func');
      expect(data.tools[0]).toHaveProperty('description', 'Test function');
      expect(data.tools[0]).toHaveProperty('input_schema');
    });
  });
});
