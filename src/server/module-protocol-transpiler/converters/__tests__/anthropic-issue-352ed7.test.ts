/**
 * Test for Issue 352ed7 - JSON Schema Standard Field Preservation
 *
 * This test verifies the fixes for issues discovered in log 352ed7:
 * 1. additionalProperties should NOT be converted to additional_properties
 * 2. Grep tool parameters (-B, -A, -C) should be preserved as-is
 * 3. Tool schema properties should remain unchanged
 */

import { describe, it, expect } from 'vitest';
import { expectSuccess } from '../../__tests__/test-helpers';
import { AnthropicConverter } from '../anthropic.converter';
import { OpenAIConverter } from '../openai.converter';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Protocol Converters - Issue 352ed7 Fixes', () => {
  const anthropicConverter = new AnthropicConverter();
  const openaiConverter = new OpenAIConverter();

  // Load test data from 352ed7 analysis
  const testData = JSON.parse(
    readFileSync(
      join(__dirname, 'test-data', 'anthropic-to-openai-352ed7.json'),
      'utf-8'
    )
  );

  describe('JSON Schema Standard Field Preservation', () => {
    it('should preserve additionalProperties in tool schemas (Anthropic round-trip)', () => {
      const toInternalResult = anthropicConverter.convertRequestToInternal(testData.originalAnthropicRequest);
      expect(toInternalResult.success).toBe(true);

      const fromInternalResult = anthropicConverter.convertRequestFromInternal(toInternalResult.data!);
      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = expectSuccess(fromInternalResult);
      const taskTool = (anthropicRequest.tools as any)[0];
      expect(taskTool).toBeDefined();

      // Verify additionalProperties is preserved (not converted to additional_properties)
      expect(taskTool.input_schema).toHaveProperty('additionalProperties');
      expect(taskTool.input_schema).not.toHaveProperty('additional_properties');
      expect(taskTool.input_schema.additionalProperties).toBe(false);

      // Verify $schema is also preserved
      expect(taskTool.input_schema).toHaveProperty('$schema');
      expect(taskTool.input_schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    });

    it('should preserve Grep tool command-line flags (-B, -A, -C)', () => {
      const toInternalResult = anthropicConverter.convertRequestToInternal(testData.originalAnthropicRequest);
      expect(toInternalResult.success).toBe(true);

      const fromInternalResult = anthropicConverter.convertRequestFromInternal(toInternalResult.data!);
      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = expectSuccess(fromInternalResult);
      const grepTool = (anthropicRequest.tools as any)[1];
      expect(grepTool).toBeDefined();

      // Verify command-line flags are preserved as-is
      expect(grepTool.input_schema.properties).toHaveProperty('-B');
      expect(grepTool.input_schema.properties).toHaveProperty('-A');
      expect(grepTool.input_schema.properties).toHaveProperty('-C');

      // Verify they were NOT converted
      expect(grepTool.input_schema.properties).not.toHaveProperty('_b');
      expect(grepTool.input_schema.properties).not.toHaveProperty('_a');
      expect(grepTool.input_schema.properties).not.toHaveProperty('_c');
    });

    it('should preserve all tool schema properties in round-trip conversion', () => {
      const toInternalResult = anthropicConverter.convertRequestToInternal(testData.originalAnthropicRequest);
      expect(toInternalResult.success).toBe(true);

      const fromInternalResult = anthropicConverter.convertRequestFromInternal(toInternalResult.data!);
      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = expectSuccess(fromInternalResult);

      // Check Task tool
      const taskTool = (anthropicRequest.tools as any)[0];
      expect(taskTool.input_schema).toHaveProperty('additionalProperties');
      expect(taskTool.input_schema.additionalProperties).toBe(false);
      expect(taskTool.input_schema).not.toHaveProperty('additional_properties');

      // Check Grep tool
      const grepTool = (anthropicRequest.tools as any)[1];
      expect(grepTool.input_schema.properties).toHaveProperty('-B');
      expect(grepTool.input_schema.properties).toHaveProperty('-A');
      expect(grepTool.input_schema.properties).toHaveProperty('-C');
    });
  });

  describe('OpenAI Converter - JSON Schema Fields', () => {
    it('should preserve additionalProperties in OpenAI round-trip', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'Test tool',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' }
                },
                required: ['query'],
                additionalProperties: false
              }
            }
          }
        ]
      };

      const toInternalResult = openaiConverter.convertRequestToInternal(openaiRequest);
      expect(toInternalResult.success).toBe(true);

      const fromInternalResult = openaiConverter.convertRequestFromInternal(toInternalResult.data!);
      expect(fromInternalResult.success).toBe(true);

      const convertedRequest = fromInternalResult.data!;

      const tool = convertedRequest.tools[0].function;
      expect(tool.parameters).toHaveProperty('additionalProperties');
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(tool.parameters).not.toHaveProperty('additional_properties');
    });
  });

  describe('Edge Cases', () => {
    it('should handle nested additionalProperties in tool schemas', () => {
      const request = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            name: 'complex_tool',
            description: 'Tool with nested schema',
            input_schema: {
              type: 'object',
              properties: {
                config: {
                  type: 'object',
                  properties: {
                    max_retries: { type: 'number' }
                  },
                  additionalProperties: true
                }
              },
              additionalProperties: false
            }
          }
        ]
      };

      const toInternalResult = anthropicConverter.convertRequestToInternal(request);
      const fromInternalResult = anthropicConverter.convertRequestFromInternal(toInternalResult.data!);

      expect(fromInternalResult.success).toBe(true);

      const tool = (fromInternalResult.data!.tools as any)[0];

      // Verify both levels of additionalProperties are preserved
      expect((tool as any).input_schema.additionalProperties).toBe(false);
      expect((tool as any).input_schema.properties.config.additionalProperties).toBe(true);
    });

    it('should preserve additionalProperties with object value', () => {
      const request = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            name: 'schema_tool',
            description: 'Tool with schema validation',
            input_schema: {
              type: 'object',
              properties: {
                data: { type: 'string' }
              },
              required: ['data'],
              additionalProperties: {
                type: 'string',
                minLength: 1
              }
            }
          }
        ]
      };

      const toInternalResult = anthropicConverter.convertRequestToInternal(request);
      const fromInternalResult = anthropicConverter.convertRequestFromInternal(toInternalResult.data!);

      expect(fromInternalResult.success).toBe(true);

      const tool = (fromInternalResult.data!.tools as any)[0];
      const additionalProps = (tool as any).input_schema.additionalProperties;

      // Verify additionalProperties object is preserved
      expect(additionalProps).toBeDefined();
      expect(typeof additionalProps).toBe('object');
      expect(additionalProps.type).toBe('string');
      expect(additionalProps.minLength).toBe(1);
    });
  });

  describe('Regression Test for 352ed7', () => {
    it('should reproduce the 352ed7 issue and verify the fix', () => {
      // This is the exact scenario from 352ed7 log analysis
      const originalRequest = testData.originalAnthropicRequest;

      // Step 1: Anthropic → Internal
      const toInternalResult = anthropicConverter.convertRequestToInternal(originalRequest);
      expect(toInternalResult.success).toBe(true);

      const internalRequest = toInternalResult.data!;

      // Step 2: Internal → Anthropic (simulating round-trip)
      const fromInternalResult = anthropicConverter.convertRequestFromInternal(internalRequest);
      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = expectSuccess(fromInternalResult);

      // Verify Task tool
      const taskTool = (anthropicRequest.tools as any)[0];
      expect(taskTool.input_schema).toHaveProperty('additionalProperties');
      expect(taskTool.input_schema.additionalProperties).toBe(false);
      expect(taskTool.input_schema).not.toHaveProperty('additional_properties');

      // Verify Grep tool
      const grepTool = (anthropicRequest.tools as any)[1];
      expect(grepTool.input_schema.properties).toHaveProperty('-B');
      expect(grepTool.input_schema.properties).toHaveProperty('-A');
      expect(grepTool.input_schema.properties).toHaveProperty('-C');
      expect(grepTool.input_schema.properties).not.toHaveProperty('_b');
      expect(grepTool.input_schema.properties).not.toHaveProperty('_a');
      expect(grepTool.input_schema.properties).not.toHaveProperty('_c');
    });
  });
});
