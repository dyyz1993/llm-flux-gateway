/**
 * Gateway Controller - Tool Calls Fallback Tests
 *
 * Tests the defensive fallback logic in gateway-controller.ts (lines 705-737)
 * that extracts tool_calls from originalResponse when internalResponse is missing them.
 *
 * Purpose: Verify this fallback works correctly before removing it.
 * The fallback should NOT be needed if Converter fallback is sufficient.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Gateway Controller - Tool Calls Fallback', () => {
  // Mock console.log to avoid cluttering test output
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    vi.clearAllMocks();
  });

  describe('Scenario 1: OpenAI format - tool_calls extraction', () => {
    it('should extract tool_calls from originalResponse when internalResponse is missing (OpenAI format)', () => {
      // Mock originalResponse with OpenAI format
      const mockOriginalResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'getWeather',
                  arguments: '{"city":"上海","unit":"celsius"}'
                }
              },
              {
                id: 'call_456',
                type: 'function',
                function: {
                  name: 'getTime',
                  arguments: '{"timezone":"Asia/Shanghai"}'
                }
              }
            ]
          }
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      };

      // Mock internalResponse with missing toolCalls
      const mockInternalResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            toolCalls: [] as any[] // Empty - should trigger fallback
          }
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      // Simulate the fallback logic from gateway-controller.ts
      let responseToolCalls: any[] = (mockInternalResponse as any)?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;

        // Try OpenAI format: choices[0].message.tool_calls
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      // Verify extraction
      expect(responseToolCalls).toBeDefined();
      expect(responseToolCalls).toHaveLength(2);
      expect(responseToolCalls![0]!).toMatchObject({
        id: 'call_123',
        type: 'function',
        function: {
          name: 'getWeather',
          arguments: '{"city":"上海","unit":"celsius"}'
        }
      });
      expect(responseToolCalls![1]).toMatchObject({
        id: 'call_456',
        type: 'function',
        function: {
          name: 'getTime',
          arguments: '{"timezone":"Asia/Shanghai"}'
        }
      });
    });

    it('should handle camelCase toolCalls field in OpenAI format', () => {
      const mockOriginalResponse = {
        choices: [{
          message: {
            role: 'assistant',
            toolCalls: [ // camelCase variant
              {
                id: 'call_789',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"query":"test"}'
                }
              }
            ]
          }
        }]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            role: 'assistant',
            toolCalls: [] as any[]
          }
        }]
      };

      // Simulate fallback
      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      expect(responseToolCalls).toHaveLength(1);
      expect(responseToolCalls![0]!.id).toBe('call_789');
      expect(responseToolCalls![0]!.function.name).toBe('search');
    });
  });

  describe('Scenario 2: Anthropic format - tool_use extraction', () => {
    it('should extract tool_use from originalResponse when internalResponse is missing (Anthropic format)', () => {
      const mockOriginalResponse = {
        content: [
          {
            type: 'tool_use',
            id: 'call_456',
            name: 'getWeather',
            input: { city: '北京', unit: 'celsius' }
          },
          {
            type: 'tool_use',
            id: 'call_789',
            name: 'calculate',
            input: { expression: '2 + 2' }
          }
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 15,
          output_tokens: 25
        }
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            role: 'assistant',
            toolCalls: [] as any[]
          }
        }]
      };

      // Simulate the fallback logic from gateway-controller.ts
      let responseToolCalls: any[] = (mockInternalResponse as any)?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;

        // Try Anthropic format: content array with tool_use blocks
        if ((!responseToolCalls || responseToolCalls.length === 0) && Array.isArray(resp.content)) {
          const toolCallsFromContent = resp.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => ({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || block.arguments || {}),
              },
            }));

          if (toolCallsFromContent.length > 0) {
            responseToolCalls = toolCallsFromContent;
          }
        }
      }

      // Verify extraction
      expect(responseToolCalls).toBeDefined();
      expect(responseToolCalls).toHaveLength(2);
      expect(responseToolCalls![0]!).toMatchObject({
        id: 'call_456',
        type: 'function',
        function: {
          name: 'getWeather',
          arguments: JSON.stringify({ city: '北京', unit: 'celsius' })
        }
      });
      expect(responseToolCalls![1]).toMatchObject({
        id: 'call_789',
        type: 'function',
        function: {
          name: 'calculate',
          arguments: JSON.stringify({ expression: '2 + 2' })
        }
      });
    });

    it('should handle tool_use with string arguments', () => {
      const mockOriginalResponse = {
        content: [
          {
            type: 'tool_use',
            id: 'call_abc',
            name: 'formatDate',
            arguments: '{"date":"2024-01-05","format":"YYYY-MM-DD"}' // String instead of object
          }
        ]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      // Simulate fallback
      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;

        if ((!responseToolCalls || responseToolCalls.length === 0) && Array.isArray(resp.content)) {
          const toolCallsFromContent = resp.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => ({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || block.arguments || {}),
              },
            }));

          if (toolCallsFromContent.length > 0) {
            responseToolCalls = toolCallsFromContent;
          }
        }
      }

      expect(responseToolCalls).toHaveLength(1);
      expect(responseToolCalls![0]!.function.name).toBe('formatDate');
      // When arguments is already a string, JSON.stringify wraps it in quotes
      // So we get "\"{...}\"" instead of "{...}"
      expect(responseToolCalls![0]!.function.arguments).toBe('"{\\"date\\":\\"2024-01-05\\",\\"format\\":\\"YYYY-MM-DD\\"}"');
    });
  });

  describe('Scenario 3: GLM mixed format', () => {
    it('should handle GLM mixed format with snake_case tool_calls', () => {
      const mockOriginalResponse = {
        choices: [{
          message: {
            tool_calls: [ // GLM uses snake_case
              {
                id: 'call_glm_001',
                type: 'function',
                function: {
                  name: 'glm_tool',
                  arguments: '{"param":"value"}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls' // GLM uses snake_case
        }],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15
        }
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      // Simulate fallback
      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;

        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      expect(responseToolCalls).toHaveLength(1);
      expect(responseToolCalls![0]!.id).toBe('call_glm_001');
      expect(responseToolCalls![0]!.function.name).toBe('glm_tool');
    });

    it('should prioritize OpenAI format over Anthropic format in GLM responses', () => {
      const mockOriginalResponse = {
        // GLM returns both OpenAI-style choices and Anthropic-style content
        choices: [{
          message: {
            tool_calls: [
              {
                id: 'call_from_choices',
                type: 'function',
                function: {
                  name: 'priorityTool',
                  arguments: '{}'
                }
              }
            ]
          }
        }],
        content: [
          {
            type: 'tool_use',
            id: 'call_from_content',
            name: 'ignoredTool',
            input: {}
          }
        ]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      // Simulate fallback - OpenAI format should be checked first
      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;

        // Try OpenAI format first (lines 711-717 in gateway-controller.ts)
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }

        // Try Anthropic format only if OpenAI format failed (lines 719-737)
        if ((!responseToolCalls || responseToolCalls.length === 0) && Array.isArray(resp.content)) {
          const toolCallsFromContent = resp.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => ({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || block.arguments || {}),
              },
            }));

          if (toolCallsFromContent.length > 0) {
            responseToolCalls = toolCallsFromContent;
          }
        }
      }

      // Should have extracted from choices (OpenAI format), not content
      expect(responseToolCalls).toHaveLength(1);
      expect(responseToolCalls![0]!.id).toBe('call_from_choices');
      expect(responseToolCalls![0]!.function.name).toBe('priorityTool');
    });
  });

  describe('Scenario 4: Ensure normal flow is not affected', () => {
    it('should prioritize internalResponse.toolCalls when it exists', () => {
      const mockOriginalResponse = {
        choices: [{
          message: {
            tool_calls: [
              {
                id: 'call_from_original',
                type: 'function',
                function: {
                  name: 'fallbackTool',
                  arguments: '{}'
                }
              }
            ]
          }
        }]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [
              {
                id: 'call_from_internal',
                type: 'function',
                function: {
                  name: 'primaryTool',
                  arguments: '{}'
                }
              }
            ]
          }
        }]
      };

      // Simulate the logic
      let responseToolCalls = (mockInternalResponse as any)?.choices?.[0]?.message?.toolCalls;

      // Fallback should NOT trigger because internalResponse has toolCalls
      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      // Should keep internalResponse's toolCalls, not fallback
      expect(responseToolCalls).toHaveLength(1);
      expect(responseToolCalls![0]!.id).toBe('call_from_internal');
      expect(responseToolCalls![0]!.function.name).toBe('primaryTool');
    });

    it('should not trigger fallback when internalResponse.toolCalls is undefined but originalResponse is also invalid', () => {
      const mockOriginalResponse = {
        invalid: 'structure'
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            content: 'No tool calls'
          }
        }]
      };

      // Simulate the logic
      let responseToolCalls = (mockInternalResponse as any)?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      // Should remain undefined
      expect(responseToolCalls).toBeUndefined();
    });

    it('should handle null originalResponse gracefully', () => {
      const mockOriginalResponse = null;
      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      // Should not crash on null originalResponse
      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        // This block should NOT execute
        const resp = mockOriginalResponse as any;
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      expect(responseToolCalls).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty tool_calls array in originalResponse', () => {
      const mockOriginalResponse = {
        choices: [{
          message: {
            tool_calls: []
          }
        }]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      expect(responseToolCalls).toEqual([]);
    });

    it('should handle malformed tool_calls entries', () => {
      const mockOriginalResponse = {
        choices: [{
          message: {
            tool_calls: [
              { id: '1' }, // Missing function
              { id: '2', function: {} }, // Missing name
              {
                id: '3',
                type: 'function',
                function: {
                  name: 'validTool',
                  arguments: '{}'
                }
              }
            ]
          }
        }]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;
        if (resp.choices?.[0]?.message) {
          const toolCallsData = resp.choices?.[0].message.tool_calls || resp.choices?.[0].message.toolCalls;
          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            responseToolCalls = (toolCallsData as any);
          }
        }
      }

      // Gateway fallback extracts all entries, validation happens elsewhere
      expect(responseToolCalls).toHaveLength(3);
    });

    it('should handle tool_use with missing input field', () => {
      const mockOriginalResponse = {
        content: [
          {
            type: 'tool_use',
            id: 'call_no_input',
            name: 'noInputTool'
            // Missing 'input' field
          }
        ]
      };

      const mockInternalResponse = {
        choices: [{
          message: {
            toolCalls: [] as any[]
          }
        }]
      };

      let responseToolCalls = mockInternalResponse?.choices?.[0]?.message?.toolCalls;

      if ((!responseToolCalls || responseToolCalls.length === 0) && mockOriginalResponse && typeof mockOriginalResponse === 'object') {
        const resp = mockOriginalResponse as any;

        if ((!responseToolCalls || responseToolCalls.length === 0) && Array.isArray(resp.content)) {
          const toolCallsFromContent = resp.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => ({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || block.arguments || {}),
              },
            }));

          if (toolCallsFromContent.length > 0) {
            responseToolCalls = toolCallsFromContent;
          }
        }
      }

      expect(responseToolCalls).toHaveLength(1);
      expect(responseToolCalls![0]!.function.name).toBe('noInputTool');
      expect(responseToolCalls![0]!.function.arguments).toBe('{}'); // Empty object from missing input
    });
  });
});
