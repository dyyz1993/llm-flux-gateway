/**
 * Anthropic Field Normalization Test
 *
 * Tests that tool schema properties are preserved correctly during
 * Anthropic → Internal → Anthropic conversion.
 *
 * Issue: bc93cb analysis showed that `num_results` was incorrectly
 * converted to `numResults` when sending to GLM's Anthropic-compatible API.
 *
 * Expected: Tool schema properties should remain in snake_case for Anthropic format.
 */

import { describe, it, expect } from 'vitest';
import { getDataAndAssert } from '../../__tests__/test-helpers';
import { AnthropicConverter } from '../anthropic.converter';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AnthropicConverter - Field Normalization', () => {
  const converter = new AnthropicConverter();

  // Load test data from bc93cb analysis
  const testData = JSON.parse(
    readFileSync(
      join(__dirname, 'test-data', 'anthropic-to-anthropic-bc93cb.json'),
      'utf-8'
    )
  );

  describe('Tool Schema Property Preservation', () => {
    it('should preserve snake_case in tool input_schema when converting Anthropic → Internal', () => {
      const result = converter.convertRequestToInternal(testData.originalAnthropicRequest);

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();

      const internalRequest = getDataAndAssert(result);
      const tool = internalRequest.tools?.[0];

      expect(tool).toBeDefined();
      expect(tool?.function).toBeDefined();

      const parameters = tool?.function?.parameters;
      expect(parameters).toBeDefined();
      expect(parameters?.properties).toBeDefined();

      // The bug: num_results was being converted to numResults
      // Expected: num_results should remain as-is in the internal format
      expect(parameters?.properties).toHaveProperty('num_results');
      expect(parameters?.properties).not.toHaveProperty('numResults');
    });

    it('should preserve snake_case in tool input_schema when converting Internal → Anthropic', () => {
      // First convert Anthropic → Internal
      const toInternalResult = converter.convertRequestToInternal(testData.originalAnthropicRequest);
      expect(toInternalResult.success).toBe(true);

      const internalRequest = toInternalResult.data!;
      if (!internalRequest) {
        throw new Error('internalRequest is undefined');
      }

      // Then convert Internal → Anthropic
      const fromInternalResult = converter.convertRequestFromInternal(internalRequest as any);
      expect(fromInternalResult.success).toBe(true);
      expect(fromInternalResult.errors).toBeUndefined();

      const anthropicRequest = fromInternalResult.data!;
      if (!anthropicRequest) {
        throw new Error('anthropicRequest is undefined');
      }

      const tools = anthropicRequest.tools as any[];
      const tool = tools?.[0];

      expect(tool).toBeDefined();
      expect(tool?.input_schema).toBeDefined();

      const properties = tool?.input_schema?.properties;
      expect(properties).toBeDefined();

      // The bug: num_results was converted to numResults
      // Expected: num_results should remain in snake_case for Anthropic format
      expect(properties).toHaveProperty('num_results');
      expect(properties).not.toHaveProperty('numResults');
    });

    it('should preserve all tool schema properties in round-trip conversion', () => {
      const toInternalResult = converter.convertRequestToInternal(testData.originalAnthropicRequest);
      const internalRequest = toInternalResult.data!;
      if (!internalRequest) {
        throw new Error('internalRequest is undefined');
      }

      const fromInternalResult = converter.convertRequestFromInternal(internalRequest as any);

      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = fromInternalResult.data!;
      if (!anthropicRequest || !((anthropicRequest.tools) as any)) {
        throw new Error('anthropicRequest or tools is undefined');
      }

      const originalTool = testData.originalAnthropicRequest.tools[0];
      const tools = anthropicRequest.tools as any[];
      const convertedTool = tools[0];

      // Compare the entire tool schema
      expect(convertedTool.name).toBe(originalTool.name);
      expect(convertedTool.description).toBe(originalTool.description);

      // Check that input_schema properties are preserved exactly
      expect(convertedTool.input_schema).toEqual(originalTool.input_schema);
    });
  });

  describe('Field Normalization Edge Cases', () => {
    it('should handle multiple tools with snake_case properties', () => {
      const requestWithMultipleTools = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            name: 'tool1',
            description: 'Tool 1',
            input_schema: {
              type: 'object',
              properties: {
                max_results: { type: 'number' },
                search_query: { type: 'string' }
              }
            }
          },
          {
            name: 'tool2',
            description: 'Tool 2',
            input_schema: {
              type: 'object',
              properties: {
                timeout_seconds: { type: 'number' },
                retry_count: { type: 'number' }
              }
            }
          }
        ]
      };

      const toInternalResult = converter.convertRequestToInternal(requestWithMultipleTools);
      const internalRequest = toInternalResult.data!;
      if (!internalRequest) {
        throw new Error('internalRequest is undefined');
      }

      const fromInternalResult = converter.convertRequestFromInternal(internalRequest as any);

      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = fromInternalResult.data!;
      if (!anthropicRequest || !((anthropicRequest.tools) as any)) {
        throw new Error('anthropicRequest or tools is undefined');
      }

      const tools = anthropicRequest.tools as any[];

      // Check first tool
      expect(tools[0]?.input_schema?.properties).toHaveProperty('max_results');
      expect(tools[0]?.input_schema?.properties).toHaveProperty('search_query');
      expect(tools[0]?.input_schema?.properties).not.toHaveProperty('maxResults');
      expect(tools[0]?.input_schema?.properties).not.toHaveProperty('searchQuery');

      // Check second tool
      expect(tools[1]?.input_schema?.properties).toHaveProperty('timeout_seconds');
      expect(tools[1]?.input_schema?.properties).toHaveProperty('retry_count');
      expect(tools[1]?.input_schema?.properties).not.toHaveProperty('timeoutSeconds');
      expect(tools[1]?.input_schema?.properties).not.toHaveProperty('retryCount');
    });

    it('should handle nested objects in tool properties', () => {
      const requestWithNestedProperties = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            name: 'complex_tool',
            description: 'Tool with nested properties',
            input_schema: {
              type: 'object',
              properties: {
                config: {
                  type: 'object',
                  properties: {
                    max_retries: { type: 'number' },
                    timeout_ms: { type: 'number' }
                  }
                },
                filter_options: {
                  type: 'object',
                  properties: {
                    sort_by: { type: 'string' },
                    order_desc: { type: 'boolean' }
                  }
                }
              }
            }
          }
        ]
      };

      const toInternalResult = converter.convertRequestToInternal(requestWithNestedProperties);
      const internalRequest = toInternalResult.data!;
      if (!internalRequest) {
        throw new Error('internalRequest is undefined');
      }

      const fromInternalResult = converter.convertRequestFromInternal(internalRequest as any);

      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = fromInternalResult.data!;
      if (!anthropicRequest || !((anthropicRequest.tools) as any)) {
        throw new Error('anthropicRequest or tools is undefined');
      }

      const tools = anthropicRequest.tools as any[];
      const tool = tools[0];
      const properties = tool?.input_schema?.properties;

      if (!properties) {
        throw new Error('properties is undefined');
      }

      // Check nested objects preserve snake_case
      expect(properties.config?.properties).toHaveProperty('max_retries');
      expect(properties.config?.properties).toHaveProperty('timeout_ms');
      expect(properties.filter_options?.properties).toHaveProperty('sort_by');
      expect(properties.filter_options?.properties).toHaveProperty('order_desc');
    });

    it('should handle arrays in tool properties', () => {
      const requestWithArrayProperties = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            name: 'array_tool',
            description: 'Tool with array properties',
            input_schema: {
              type: 'object',
              properties: {
                item_ids: {
                  type: 'array',
                  items: { type: 'string' }
                },
                filter_tags: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        ]
      };

      const toInternalResult = converter.convertRequestToInternal(requestWithArrayProperties);
      const fromInternalResult = converter.convertRequestFromInternal(toInternalResult.data!);

      expect(fromInternalResult.success).toBe(true);

      const tool = (fromInternalResult.data!.tools as any)[0];
      const properties = (tool as any).input_schema.properties;

      // Check array property names preserve snake_case
      expect(properties).toHaveProperty('item_ids');
      expect(properties).toHaveProperty('filter_tags');
      expect(properties).not.toHaveProperty('itemIds');
      expect(properties).not.toHaveProperty('filterTags');
    });
  });

  describe('BC93CB Regression Test', () => {
    it('should reproduce the bc93cb issue and verify the fix', () => {
      // This is the exact scenario from bc93cb analysis
      const originalRequest = testData.originalAnthropicRequest;

      // Step 1: Anthropic → Internal
      const toInternalResult = converter.convertRequestToInternal(originalRequest);
      expect(toInternalResult.success).toBe(true);

      const internalRequest = toInternalResult.data!;
      const internalTool = internalRequest.tools?.[0];

      // Verify internal format has snake_case tool properties
      expect((internalTool as any).function?.parameters.properties).toHaveProperty('num_results');

      // Step 2: Internal → Anthropic (for GLM)
      const fromInternalResult = converter.convertRequestFromInternal(internalRequest as any);
      expect(fromInternalResult.success).toBe(true);

      const anthropicRequest = fromInternalResult.data!;
      const anthropicTool = (anthropicRequest.tools as any)[0];

      // Verify Anthropic format preserves snake_case tool properties
      expect(anthropicTool.input_schema.properties).toHaveProperty('num_results');
      expect(anthropicTool.input_schema.properties).not.toHaveProperty('numResults');

      // Verify the entire tool schema matches the original
      expect(anthropicTool.input_schema).toEqual(originalRequest.tools[0].input_schema);
    });
  });
});
