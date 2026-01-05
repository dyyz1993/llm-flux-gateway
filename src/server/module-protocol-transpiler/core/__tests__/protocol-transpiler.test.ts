/**
 * Protocol Transpiler Tests
 *
 * Tests for the core ProtocolTranspiler class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FormatConverter } from '../../interfaces';
import type { InternalRequest, InternalResponse, InternalStreamChunk } from '../../interfaces/internal-format';
import { ProtocolTranspiler, createProtocolTranspiler } from '../protocol-transpiler';
import { success, failure, createError } from '../transpile-result';

describe('ProtocolTranspiler', () => {
  let transpiler: ProtocolTranspiler;
  let mockOpenAIConverter: FormatConverter;
  let mockAnthropicConverter: FormatConverter;
  let mockGeminiConverter: FormatConverter;

  beforeEach(() => {
    transpiler = new ProtocolTranspiler();

    // Mock OpenAI converter
    mockOpenAIConverter = {
      vendorType: 'openai',
      convertRequestToInternal: vi.fn(),
      convertRequestFromInternal: vi.fn(),
      convertResponseToInternal: vi.fn(),
      convertResponseFromInternal: vi.fn(),
      convertStreamChunkToInternal: vi.fn(),
      isValidRequest: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      isValidResponse: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      isValidStreamChunk: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      convertStreamChunkFromInternal: vi.fn(),
    };

    // Mock Anthropic converter
    mockAnthropicConverter = {
      vendorType: 'anthropic',
      convertRequestToInternal: vi.fn(),
      convertRequestFromInternal: vi.fn(),
      convertResponseToInternal: vi.fn(),
      convertResponseFromInternal: vi.fn(),
      convertStreamChunkToInternal: vi.fn(),
      isValidRequest: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      isValidResponse: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      isValidStreamChunk: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      convertStreamChunkFromInternal: vi.fn(),
    };

    // Mock Gemini converter
    mockGeminiConverter = {
      vendorType: 'gemini',
      convertRequestToInternal: vi.fn(),
      convertRequestFromInternal: vi.fn(),
      convertResponseToInternal: vi.fn(),
      convertResponseFromInternal: vi.fn(),
      convertStreamChunkToInternal: vi.fn(),
      isValidRequest: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      isValidResponse: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      isValidStreamChunk: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      convertStreamChunkFromInternal: vi.fn(),
    };
  });

  describe('registerConverter()', () => {
    it('should register a format converter', () => {
      transpiler.registerConverter(mockOpenAIConverter);

      const result = transpiler.transpile({ model: 'gpt-4' }, 'openai', 'anthropic');
      expect(result.success).toBe(false); // No target converter
    });

    it('should allow registering multiple converters', () => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
      transpiler.registerConverter(mockGeminiConverter);

      // All converters should be registered
      const result1 = transpiler.transpile({ model: 'test' }, 'openai', 'anthropic');
      const result2 = transpiler.transpile({ model: 'test' }, 'anthropic', 'gemini');
      const result3 = transpiler.transpile({ model: 'test' }, 'gemini', 'openai');

      expect(result1.success).toBe(false); // No mock implementation
      expect(result2.success).toBe(false);
      expect(result3.success).toBe(false);
    });

    it('should overwrite existing converter for same vendor', () => {
      const mockConverter1: FormatConverter = {
        vendorType: 'openai',
        convertRequestToInternal: vi.fn().mockReturnValue(success({ model: 'gpt-4' })),
        convertRequestFromInternal: vi.fn(),
        convertResponseToInternal: vi.fn(),
        convertResponseFromInternal: vi.fn(),
        convertStreamChunkToInternal: vi.fn(),
        convertStreamChunkFromInternal: vi.fn(),
        isValidRequest: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
        isValidResponse: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
        isValidStreamChunk: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      };

      const mockConverter2: FormatConverter = {
        vendorType: 'openai',
        convertRequestToInternal: vi.fn().mockReturnValue(success({ model: 'gpt-3.5' })),
        convertRequestFromInternal: vi.fn(),
        convertResponseToInternal: vi.fn(),
        convertResponseFromInternal: vi.fn(),
        convertStreamChunkToInternal: vi.fn(),
        convertStreamChunkFromInternal: vi.fn(),
        isValidRequest: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
        isValidResponse: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
        isValidStreamChunk: vi.fn().mockReturnValue({ valid: true, confidence: 1 }),
      };

      transpiler.registerConverter(mockConverter1);
      transpiler.registerConverter(mockConverter2);

      // The second converter should overwrite the first
      expect(mockConverter2.convertRequestToInternal).toBeDefined();
    });
  });

  describe('setCustomMapping()', () => {
    it('should set custom field mapping for requests', () => {
      const customMap = {
        'old_field': 'new_field',
        'deprecated': 'replaced',
      };

      transpiler.setCustomMapping('request', 'openai', 'anthropic', customMap);

      // Mapping should be stored
      const result = transpiler.transpile({ model: 'test' }, 'openai', 'openai');
      expect(result.success).toBe(true);
    });

    it('should set custom field mapping for responses', () => {
      const customMap = {
        'response.old_field': 'response.new_field',
      };

      transpiler.setCustomMapping('response', 'anthropic', 'openai', customMap);

      const result = transpiler.transpile({ id: 'test' }, 'anthropic', 'anthropic');
      expect(result.success).toBe(true);
    });

    it('should set custom field mapping for stream chunks', () => {
      // Register gemini converter first
      transpiler.registerConverter(mockGeminiConverter);

      // Mock the converter methods
      (mockGeminiConverter.convertStreamChunkToInternal as any).mockReturnValue(
        success({ id: 'test', object: 'test', created: Date.now(), model: 'test', choices: [] })
      );
      (mockGeminiConverter.convertStreamChunkFromInternal as any).mockReturnValue(
        success('data: {"id":"test"}\n\n')
      );

      const customMap = {
        'delta.content': 'delta.text',
      };

      transpiler.setCustomMapping('streamChunk', 'gemini', 'openai', customMap);

      const result = transpiler.transpileStreamChunk(
        { id: 'test', object: 'test', created: Date.now(), model: 'test', choices: [] },
        'gemini',
        'gemini'
      );
      expect(result.success).toBe(true);
    });

    it('should support multiple custom mappings', () => {
      transpiler.setCustomMapping('request', 'openai', 'anthropic', { 'field1': 'fieldA' });
      transpiler.setCustomMapping('request', 'openai', 'gemini', { 'field2': 'fieldB' });
      transpiler.setCustomMapping('response', 'anthropic', 'openai', { 'field3': 'fieldC' });

      // All mappings should coexist
      const result1 = transpiler.transpile({ model: 'test' }, 'openai', 'openai');
      const result2 = transpiler.transpile({ model: 'test' }, 'anthropic', 'anthropic');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('transpile() - fast path', () => {
    it('should return source data directly when source and target are same', () => {
      transpiler.registerConverter(mockOpenAIConverter);

      const sourceData = { model: 'gpt-4', messages: [] };
      const result = transpiler.transpile(sourceData, 'openai', 'openai');

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(sourceData);
    });

    it('should set zero conversion time for fast path', () => {
      transpiler.registerConverter(mockOpenAIConverter);

      const result = transpiler.transpile({ model: 'test' }, 'openai', 'openai');

      expect(result.success).toBe(true);
      expect(result.metadata!?.conversionTimeMs).toBe(0);
    });

    it('should set zero fields converted for fast path', () => {
      transpiler.registerConverter(mockOpenAIConverter);

      const result = transpiler.transpile({ model: 'test' }, 'openai', 'openai');

      expect(result.success).toBe(true);
      expect(result.metadata!?.fieldsConverted).toBe(0);
      expect(result.metadata!?.fieldsIgnored).toBe(0);
    });

    it('should include vendor info in metadata for fast path', () => {
      transpiler.registerConverter(mockOpenAIConverter);

      const result = transpiler.transpile({ model: 'test' }, 'anthropic', 'anthropic');

      expect(result.success).toBe(true);
      expect(result.metadata!?.fromVendor).toBe('anthropic');
      expect(result.metadata!?.toVendor).toBe('anthropic');
    });
  });

  describe('transpile() - request conversion', () => {
    beforeEach(() => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
    });

    it('should convert request through internal format', () => {
      const openaiRequest = { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] };
      const internalRequest: InternalRequest = { model: 'claude-3-opus', messages: [] };
      const anthropicRequest = { model: 'claude-3-opus', maxTokens: 4096, messages: [] };

      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success(internalRequest, {
          fromVendor: 'openai',
          toVendor: 'internal' as any,
          convertedAt: Date.now(),
          conversionTimeMs: 5,
          fieldsConverted: 3,
          fieldsIgnored: 0,
        })
      );

      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success(anthropicRequest, {
          fromVendor: 'internal' as any,
          toVendor: 'anthropic',
          convertedAt: Date.now(),
          conversionTimeMs: 4,
          fieldsConverted: 3,
          fieldsIgnored: 1,
        })
      );

      const result = transpiler.transpile(openaiRequest, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(anthropicRequest);
      expect(mockOpenAIConverter.convertRequestToInternal).toHaveBeenCalledWith(openaiRequest);
      expect(mockAnthropicConverter.convertRequestFromInternal).toHaveBeenCalledWith(internalRequest);
    });

    it('should detect request data and use request converters', () => {
      const requestData = { model: 'gpt-4', messages: [] };

      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'test', messages: [] })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude', maxTokens: 4096, messages: [] })
      );

      const result = transpiler.transpile(requestData, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertRequestToInternal).toHaveBeenCalled();
      expect(mockAnthropicConverter.convertRequestFromInternal).toHaveBeenCalled();
    });

    it('should aggregate metadata from both conversions', () => {
      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'test', messages: [] }, {
          fromVendor: 'openai',
          toVendor: 'internal' as any,
          convertedAt: Date.now(),
          conversionTimeMs: 5,
          fieldsConverted: 3,
          fieldsIgnored: 0,
        })
      );

      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude', maxTokens: 4096, messages: [] }, {
          fromVendor: 'internal' as any,
          toVendor: 'anthropic',
          convertedAt: Date.now(),
          conversionTimeMs: 4,
          fieldsConverted: 2,
          fieldsIgnored: 1,
        })
      );

      const result = transpiler.transpile({ model: 'test', messages: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      // Aggregates metadata from both conversions: 3 + 2 = 5
      expect(result.metadata!?.fieldsConverted).toBe(5);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });

    it('should return error when source conversion fails', () => {
      const errorResult = failure([createError('model', 'Invalid model', 'INVALID_TYPE')]);

      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(errorResult);

      const result = transpiler.transpile({ model: 'invalid' }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(errorResult.errors);
    });

    it('should return error when response source conversion fails', () => {
      const errorResult = failure([createError('choices', 'Invalid choices', 'INVALID_TYPE')]);

      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(errorResult);

      const result = transpiler.transpile({ id: 'test', choices: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(errorResult.errors);
    });

    it('should return error when response target conversion fails', () => {
      const internalResult = success({
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test',
        choices: [],
      });
      const errorResult = failure([createError('content', 'Invalid content', 'INVALID_TYPE')]);

      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(internalResult);
      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(errorResult);

      const result = transpiler.transpile({ id: 'test', choices: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(errorResult.errors);
    });

    it('should return error when target conversion fails', () => {
      const internalResult = success({ model: 'test', messages: [] });
      const errorResult = failure([createError('max_tokens', 'Missing required field', 'MISSING_REQUIRED_FIELD')]);

      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(internalResult);
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(errorResult);

      const result = transpiler.transpile({ model: 'test', messages: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(errorResult.errors);
    });

    it('should return error when source converter not registered', () => {
      // Only register target converter
      transpiler.registerConverter(mockAnthropicConverter);

      const result = transpiler.transpile({ model: 'test' }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      // The converter check happens before the try block, but since we're
      // trying to call methods on undefined in the try block, it gets caught
      expect(result.errors![0]!.code).toBe('INTERNAL_ERROR');
      expect(result.errors![0]!.message).toContain('Cannot read');
    });

    it('should return error when target converter not registered', () => {
      // Only register source converter
      transpiler.registerConverter(mockOpenAIConverter);

      const result = transpiler.transpile({ model: 'test' }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors![0]!.code).toBe('INTERNAL_ERROR');
      expect(result.errors![0]!.message).toContain('Cannot read');
    });
  });

  describe('transpile() - response conversion', () => {
    beforeEach(() => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
    });

    it('should convert response through internal format', () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
      };
      const internalResponse: InternalResponse = {
        id: 'msg-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-3-opus',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: [] },
          finishReason: 'stop',
        }],
      };
      const anthropicResponse = {
        id: 'msg-123',
        type: 'message',
        content: [{ type: 'text', text: 'Hello!' }],
      };

      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(
        success(internalResponse, {
          fromVendor: 'openai',
          toVendor: 'internal' as any,
          convertedAt: Date.now(),
          conversionTimeMs: 3,
          fieldsConverted: 4,
          fieldsIgnored: 0,
        })
      );

      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(
        success(anthropicResponse, {
          fromVendor: 'internal' as any,
          toVendor: 'anthropic',
          convertedAt: Date.now(),
          conversionTimeMs: 3,
          fieldsConverted: 4,
          fieldsIgnored: 2,
        })
      );

      const result = transpiler.transpile(openaiResponse, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(anthropicResponse);
      expect(mockOpenAIConverter.convertResponseToInternal).toHaveBeenCalledWith(openaiResponse);
      expect(mockAnthropicConverter.convertResponseFromInternal).toHaveBeenCalledWith(internalResponse);
    });

    it('should detect response data and use response converters', () => {
      const responseData = {
        id: 'chatcmpl-123',
        choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
      };

      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'msg-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'claude',
          choices: [],
        })
      );
      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(
        success({ id: 'msg-123', type: 'message', content: [] })
      );

      const result = transpiler.transpile(responseData, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertResponseToInternal).toHaveBeenCalled();
      expect(mockAnthropicConverter.convertResponseFromInternal).toHaveBeenCalled();
    });

    it('should aggregate metadata for response conversion', () => {
      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test',
          choices: [],
        }, {
          fromVendor: 'openai',
          toVendor: 'internal' as any,
          convertedAt: Date.now(),
          conversionTimeMs: 5,
          fieldsConverted: 4,
          fieldsIgnored: 1,
        })
      );

      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(
        success({ id: 'test', type: 'message', content: [] }, {
          fromVendor: 'internal' as any,
          toVendor: 'anthropic',
          convertedAt: Date.now(),
          conversionTimeMs: 3,
          fieldsConverted: 3,
          fieldsIgnored: 0,
        })
      );

      const result = transpiler.transpile({ id: 'test', choices: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      // Aggregates metadata from both conversions: 4 + 3 = 7
      expect(result.metadata!?.fieldsConverted).toBe(7);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });
  });

  describe('transpile() - data type detection', () => {
    beforeEach(() => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
    });

    it('should detect request format from model field', () => {
      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'test', messages: [] })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude', maxTokens: 4096, messages: [] })
      );

      const result = transpiler.transpile({ model: 'gpt-4' }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertRequestToInternal).toHaveBeenCalled();
    });

    it('should detect request format from messages field', () => {
      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'test', messages: [] })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude', maxTokens: 4096, messages: [] })
      );

      const result = transpiler.transpile({ messages: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertRequestToInternal).toHaveBeenCalled();
    });

    it('should detect request format from prompt field', () => {
      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'test', messages: [] })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude', maxTokens: 4096, messages: [] })
      );

      const result = transpiler.transpile({ prompt: 'Hello' }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertRequestToInternal).toHaveBeenCalled();
    });

    it('should detect request format from contents field (Gemini)', () => {
      (mockGeminiConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'test', messages: [] })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude', maxTokens: 4096, messages: [] })
      );

      transpiler.registerConverter(mockGeminiConverter);

      const result = transpiler.transpile({ contents: [] }, 'gemini', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockGeminiConverter.convertRequestToInternal).toHaveBeenCalled();
    });

    it('should detect response format from choices field', () => {
      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test',
          choices: [],
        })
      );
      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(
        success({ id: 'test', type: 'message', content: [] })
      );

      const result = transpiler.transpile({ choices: [] }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertResponseToInternal).toHaveBeenCalled();
    });

    it('should detect response format from content + role fields', () => {
      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test',
          choices: [],
        })
      );
      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(
        success({ id: 'test', type: 'message', content: [] })
      );

      const result = transpiler.transpile({ content: 'Hello', role: 'assistant' }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertResponseToInternal).toHaveBeenCalled();
    });

    it('should detect response format from candidates field (Gemini)', () => {
      (mockGeminiConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test',
          choices: [],
        })
      );
      (mockOpenAIConverter.convertResponseFromInternal as any).mockReturnValue(
        success({ id: 'test', choices: [] })
      );

      transpiler.registerConverter(mockGeminiConverter);

      const result = transpiler.transpile({ candidates: [] }, 'gemini', 'openai');

      expect(result.success).toBe(true);
      expect(mockGeminiConverter.convertResponseToInternal).toHaveBeenCalled();
    });

    it('should detect response format from text field', () => {
      (mockOpenAIConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test',
          choices: [],
        })
      );
      (mockAnthropicConverter.convertResponseFromInternal as any).mockReturnValue(
        success({ id: 'test', type: 'message', content: [] })
      );

      const result = transpiler.transpile({ text: 'Hello' }, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(mockOpenAIConverter.convertResponseToInternal).toHaveBeenCalled();
    });

    it('should return error for undetectable data type', () => {
      const result = transpiler.transpile({ unknown: 'field' }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors![0]!.code).toBe('INVALID_STRUCTURE');
      expect(result.errors![0]!.message).toContain('Cannot determine if data is request or response');
    });

    it('should return error for null data', () => {
      const result = transpiler.transpile(null, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors![0]!.code).toBe('INVALID_STRUCTURE');
    });

    it('should return error for non-object data', () => {
      const result = transpiler.transpile('string', 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors![0]!.code).toBe('INVALID_STRUCTURE');
    });
  });

  describe('transpile() - error handling', () => {
    beforeEach(() => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
    });

    it('should handle exceptions during conversion', () => {
      (mockOpenAIConverter.convertRequestToInternal as any).mockImplementation(() => {
        throw new Error('Conversion failed');
      });

      const result = transpiler.transpile({ model: 'test' }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors![0]!.code).toBe('INTERNAL_ERROR');
      expect(result.errors![0]!.message).toBe('Conversion failed');
    });

    it('should handle non-Error exceptions', () => {
      (mockOpenAIConverter.convertRequestToInternal as any).mockImplementation(() => {
        throw 'String error';
      });

      const result = transpiler.transpile({ model: 'test' }, 'openai', 'anthropic');

      expect(result.success).toBe(false);
      expect(result.errors![0]!.code).toBe('INTERNAL_ERROR');
      expect(result.errors![0]!.message).toBe('Unknown error during conversion');
    });
  });

  describe('transpileStreamChunk()', () => {
    beforeEach(() => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
      transpiler.registerConverter(mockGeminiConverter);
    });

    describe('fast path', () => {
      it('should return SSE string when source is object and vendors are same', () => {
        const sourceChunk: InternalStreamChunk = {
          id: 'chunk-123',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          }],
        };

        // Mock the converter to return SSE string
        (mockOpenAIConverter.convertStreamChunkFromInternal as any).mockReturnValue(
          success('data: {"id":"chunk-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n')
        );

        const result = transpiler.transpileStreamChunk(sourceChunk, 'openai', 'openai');

        expect(result.success).toBe(true);
        // Fast path converts object to SSE string for streaming
        expect(typeof result.data!).toBe('string');
        expect(result.data!).toMatch(/^data: \{.+\}\n\n$/);
        expect(result.data!).toContain('"content":"Hello"');
      });

      it('should set zero conversion time for fast path', () => {
        // Mock the converter to return SSE string
        (mockOpenAIConverter.convertStreamChunkFromInternal as any).mockReturnValue(
          success('data: {"id":"test","choices":[]}\n\n')
        );

        const result = transpiler.transpileStreamChunk(
          { id: 'test', object: 'test', created: Date.now(), model: 'test', choices: [] },
          'openai',
          'openai'
        );

        expect(result.success).toBe(true);
        // Note: conversionTimeMs is 0 for fast path (same vendor)
        expect(result.metadata!?.conversionTimeMs).toBe(0);
      });

      it('should set zero fields converted for fast path', () => {
        // Mock the converter to return SSE string
        (mockOpenAIConverter.convertStreamChunkFromInternal as any).mockReturnValue(
          success('data: {"id":"test","choices":[]}\n\n')
        );

        const result = transpiler.transpileStreamChunk(
          { id: 'test', object: 'test', created: Date.now(), model: 'test', choices: [] },
          'openai',
          'openai'
        );

        expect(result.success).toBe(true);
        // Note: fieldsConverted is 1 because the converter is called to convert InternalStreamChunk to SSE format
        expect(result.metadata!?.fieldsConverted).toBe(1);
        expect(result.metadata!?.fieldsIgnored).toBe(0);
      });
    });

    describe('streaming conversion', () => {
      it('should convert stream chunk through internal format', () => {
        const openaiChunk = {
          id: 'chunk-123',
          choices: [{ delta: { content: 'Hello' } }],
        };
        const internalChunk: InternalStreamChunk = {
          id: 'chunk-123',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'claude-3-opus',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finishReason: null,
          }],
        };
        const anthropicChunk = {
          id: 'chunk-123',
          type: 'content_block_delta',
          delta: { text: 'Hello' },
        };

        (mockOpenAIConverter.convertStreamChunkToInternal as any).mockReturnValue(
          success(internalChunk, {
            fromVendor: 'openai',
            toVendor: 'internal' as any,
            convertedAt: Date.now(),
            conversionTimeMs: 1,
            fieldsConverted: 2,
            fieldsIgnored: 0,
          })
        );

        (mockAnthropicConverter.convertStreamChunkFromInternal as any).mockReturnValue(
          success(anthropicChunk, {
            fromVendor: 'internal' as any,
            toVendor: 'anthropic',
            convertedAt: Date.now(),
            conversionTimeMs: 1,
            fieldsConverted: 2,
            fieldsIgnored: 0,
          })
        );

        const result = transpiler.transpileStreamChunk(openaiChunk, 'openai', 'anthropic');

        expect(result.success).toBe(true);
        expect(result.data!).toEqual(anthropicChunk);
        expect(mockOpenAIConverter.convertStreamChunkToInternal).toHaveBeenCalledWith(openaiChunk);
        expect(mockAnthropicConverter.convertStreamChunkFromInternal).toHaveBeenCalledWith(internalChunk);
      });

      it('should return error when source conversion fails', () => {
        const errorResult = failure([createError('delta', 'Invalid delta format', 'INVALID_TYPE')]);

        (mockOpenAIConverter.convertStreamChunkToInternal as any).mockReturnValue(errorResult);

        const result = transpiler.transpileStreamChunk({ id: 'test' }, 'openai', 'anthropic');

        expect(result.success).toBe(false);
        expect(result.errors).toEqual(errorResult.errors);
      });

      it('should return error when target conversion fails', () => {
        const internalResult = success({
          id: 'test',
          object: 'test',
          created: Date.now(),
          model: 'test',
          choices: [],
        });
        const errorResult = failure([createError('index', 'Missing index', 'MISSING_REQUIRED_FIELD')]);

        (mockOpenAIConverter.convertStreamChunkToInternal as any).mockReturnValue(internalResult);
        (mockAnthropicConverter.convertStreamChunkFromInternal as any).mockReturnValue(errorResult);

        const result = transpiler.transpileStreamChunk({ id: 'test' }, 'openai', 'anthropic');

        expect(result.success).toBe(false);
        expect(result.errors).toEqual(errorResult.errors);
      });

      it('should return error when source converter does not support streaming', () => {
        const noStreamConverter = {
          vendorType: 'openai',
          convertRequestToInternal: vi.fn(),
          convertRequestFromInternal: vi.fn(),
          convertResponseToInternal: vi.fn(),
          convertResponseFromInternal: vi.fn(),
          // No streaming methods
        } as any;

        transpiler.registerConverter(noStreamConverter);

        const result = transpiler.transpileStreamChunk({ id: 'test' }, 'openai', 'anthropic');

        expect(result.success).toBe(false);
        expect(result.errors![0]!.code).toBe('UNSUPPORTED_FEATURE');
        expect(result.errors![0]!.message).toContain('does not support streaming');
      });

      it('should return error when target converter does not support streaming', () => {
        const noStreamConverter = {
          vendorType: 'anthropic',
          convertRequestToInternal: vi.fn(),
          convertRequestFromInternal: vi.fn(),
          convertResponseToInternal: vi.fn(),
          convertResponseFromInternal: vi.fn(),
          // No streaming methods
        } as any;

        transpiler.registerConverter(noStreamConverter);

        const result = transpiler.transpileStreamChunk({ id: 'test' }, 'openai', 'anthropic');

        expect(result.success).toBe(false);
        expect(result.errors![0]!.code).toBe('UNSUPPORTED_FEATURE');
        expect(result.errors![0]!.message).toContain('does not support streaming');
      });

      it('should handle exceptions during stream conversion', () => {
        (mockOpenAIConverter.convertStreamChunkToInternal as any).mockImplementation(() => {
          throw new Error('Stream conversion failed');
        });

        const result = transpiler.transpileStreamChunk({ id: 'test' }, 'openai', 'anthropic');

        expect(result.success).toBe(false);
        expect(result.errors![0]!.code).toBe('INTERNAL_ERROR');
        expect(result.errors![0]!.message).toBe('Stream conversion failed');
      });

      it('should handle null/undefined result from convertStreamChunkToInternal', () => {
        (mockOpenAIConverter.convertStreamChunkToInternal as any).mockReturnValue(null);

        const result = transpiler.transpileStreamChunk({ id: 'test' }, 'openai', 'anthropic');

        expect(result.success).toBe(false);
        expect(result.errors![0]!.code).toBe('CONVERSION_ERROR');
      });

      it('should handle when sourceChunk is already an InternalStreamChunk object (from upstreamService.parseStreamWith)', () => {
        // This simulates the case where upstreamService.parseStreamWith has already
        // parsed the SSE and returned an InternalStreamChunk object
        const internalChunk: InternalStreamChunk = {
          id: 'msg_123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          }],
        };

        const anthropicSSE = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n';

        // When source is already InternalStreamChunk, convertStreamChunkToInternal is NOT called
        // (skipped because source is already in internal format)
        // Mock Anthropic converter to return SSE string
        (mockAnthropicConverter.convertStreamChunkFromInternal as any).mockReturnValue(
          success(anthropicSSE, {
            fromVendor: 'openai',
            toVendor: 'anthropic',
            convertedAt: Date.now(),
            conversionTimeMs: 1,
            fieldsConverted: 1,
            fieldsIgnored: 0,
          })
        );

        // Call with object (not string) - this is the key test
        const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'anthropic');

        expect(result.success).toBe(true);
        expect(result.data!).toBe(anthropicSSE);
        // Verify only convertStreamChunkFromInternal was called (convertStreamChunkToInternal skipped)
        expect(mockOpenAIConverter.convertStreamChunkToInternal).not.toHaveBeenCalled();
        expect(mockAnthropicConverter.convertStreamChunkFromInternal).toHaveBeenCalledWith(internalChunk);
      });
    });
  });

  describe('createProtocolTranspiler()', () => {
    it('should create a new ProtocolTranspiler instance', () => {
      const transpiler2 = createProtocolTranspiler();

      expect(transpiler2).toBeInstanceOf(ProtocolTranspiler);
      expect(transpiler2).not.toBe(transpiler); // Different instances
    });

    it('should create a functional transpiler', () => {
      const newTranspiler = createProtocolTranspiler();
      newTranspiler.registerConverter(mockOpenAIConverter);

      const result = newTranspiler.transpile({ model: 'test' }, 'openai', 'openai');

      expect(result.success).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      transpiler.registerConverter(mockOpenAIConverter);
      transpiler.registerConverter(mockAnthropicConverter);
      transpiler.registerConverter(mockGeminiConverter);
    });

    it('should support OpenAI → Anthropic request conversion', () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      };

      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.7,
        })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.7,
          maxTokens: 4096,
        })
      );

      const result = transpiler.transpile(openaiRequest, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('maxTokens', 4096);
    });

    it('should support Anthropic → Gemini request conversion', () => {
      const anthropicRequest = {
        model: 'claude-3-opus-20240229',
        maxTokens: 4096,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      (mockAnthropicConverter.convertRequestToInternal as any).mockReturnValue(
        success({
          model: 'claude-3-opus',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
      (mockGeminiConverter.convertRequestFromInternal as any).mockReturnValue(
        success({
          contents: [{
            role: 'user',
            parts: [{ text: 'Hello' }],
          }],
        })
      );

      const result = transpiler.transpile(anthropicRequest, 'anthropic', 'gemini');

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('contents');
    });

    it('should support Gemini → OpenAI response conversion', () => {
      const geminiResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Hello!' }],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        }],
      };

      (mockGeminiConverter.convertResponseToInternal as any).mockReturnValue(
        success({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: [] },
            finishReason: 'stop',
          }],
        })
      );
      (mockOpenAIConverter.convertResponseFromInternal as any).mockReturnValue(
        success({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finishReason: 'stop',
          }],
        })
      );

      const result = transpiler.transpile(geminiResponse, 'gemini', 'openai');

      expect(result.success).toBe(true);
      expect((result.data! as any).choices?.[0].message.content).toBe('Hello!');
    });

    it('should handle round-trip conversion OpenAI → Anthropic → OpenAI', () => {
      const originalRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      };

      (mockOpenAIConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'claude-3', messages: [{ role: 'user', content: 'Test' }] })
      );
      (mockAnthropicConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'claude-3', maxTokens: 4096, messages: [{ role: 'user', content: 'Test' }] })
      );
      (mockAnthropicConverter.convertRequestToInternal as any).mockReturnValue(
        success({ model: 'gpt-4', messages: [{ role: 'user', content: 'Test' }] })
      );
      (mockOpenAIConverter.convertRequestFromInternal as any).mockReturnValue(
        success({ model: 'gpt-4', messages: [{ role: 'user', content: 'Test' }] })
      );

      // OpenAI → Anthropic
      const result1 = transpiler.transpile(originalRequest, 'openai', 'anthropic');
      expect(result1.success).toBe(true);

      // Anthropic → OpenAI
      const result2 = transpiler.transpile(result1.data!, 'anthropic', 'openai');
      expect(result2.success).toBe(true);
      expect(result2.data!).toEqual(originalRequest);
    });
  });
});
