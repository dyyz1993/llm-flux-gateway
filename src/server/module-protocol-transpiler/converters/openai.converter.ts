/**
 * OpenAI Format Converter
 *
 * OpenAI format IS the internal format, so this is essentially a pass-through.
 * Provides validation and normalization.
 *
 * Extended to support:
 * - max_completion_tokens (for o1 reasoning models)
 * - reasoning_effort (controls reasoning intensity)
 * - Detailed usage metadata (reasoning_tokens, cached_tokens)
 *
 * Field Normalization:
 * - Internal format uses camelCase (toolCalls, finishReason, maxTokens)
 * - OpenAI API format uses snake_case (tool_calls, finish_reason, max_tokens)
 * - This converter handles bidirectional conversion
 */

import type {
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalContentBlock,
  TextContentBlock,
  InternalToolCall,
} from '../interfaces/internal-format';
import type {
  FormatConverter,
  ValidationResult,
} from '../interfaces/format-converter';
import type { ConversionOptions } from '../core/transpile-result';
import type { TranspileResult, TranspileMetadata } from '../core/transpile-result';
import type { VendorType } from '../interfaces/vendor-types';
import { success, failure, createError, createWarning } from '../core/transpile-result';
import { normalizeToCamelCase, normalizeToSnakeCase } from '../utils/field-normalizer';

/**
 * OpenAI Format Converter
 *
 * OpenAI format is used as the internal format, so conversions are pass-through.
 */
export class OpenAIConverter implements FormatConverter {
  readonly vendorType: VendorType = 'openai';

  // ==========================================
  // Request Conversion
  // ==========================================

  convertRequestToInternal(
    request: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalRequest> {
    const startTime = Date.now();
    const warnings: ReturnType<typeof createWarning>[] = [];

    // Validate that the request has required fields
    if (typeof request !== 'object' || request === null) {
      return failure([createError('', 'Request must be an object', 'INVALID_TYPE' as const)]);
    }

    const req = request as Record<string, any>;

    if (!req.model) {
      return failure([createError('model', 'Missing required field: model', 'MISSING_REQUIRED_FIELD' as const)]);
    }

    if (!req.messages || !Array.isArray(req.messages)) {
      return failure([createError('messages', 'Missing or invalid field: messages', 'MISSING_REQUIRED_FIELD' as const)]);
    }

    // Check for unknown fields
    const knownFields = new Set([
      'model', 'messages', 'temperature', 'max_tokens', 'max_completion_tokens',
      'top_p', 'top_k', 'frequency_penalty', 'presence_penalty', 'n', 'stop',
      'stream', 'tools', 'tool_choice', 'reasoning_effort',
      // Extended thinking (for future compatibility)
      'thinking',
    ]);

    for (const key of Object.keys(req)) {
      if (!knownFields.has(key)) {
        warnings.push(createWarning(key, `Unknown field: ${key}`, 'UNKNOWN_FIELD' as const));
      }
    }

    // ⭐ FIX: Normalize snake_case to camelCase for internal format
    // OpenAI API uses snake_case (tool_calls, finish_reason)
    // Internal format uses camelCase (toolCalls, finishReason)
    const normalizedRequest = normalizeToCamelCase(req, true) as InternalRequest;

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Field normalization
      fieldsIgnored: 0,
      fieldsWarned: warnings.length,
    };

    const result = success(normalizedRequest, metadata);
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  }

  convertRequestFromInternal(
    request: InternalRequest,
    _options?: ConversionOptions
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();

    // ⭐ FIX: Normalize camelCase to snake_case for OpenAI API format
    // Internal format uses camelCase (toolCalls, finishReason)
    // OpenAI API uses snake_case (tool_calls, finish_reason)
    const normalizedRequest = normalizeToSnakeCase(request, true);

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Field normalization
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(normalizedRequest, metadata);
  }

  // ==========================================
  // Response Conversion
  // ==========================================

  convertResponseToInternal(
    response: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalResponse> {
    const startTime = Date.now();

    // Validate required fields
    if (typeof response !== 'object' || response === null) {
      return failure([createError('', 'Response must be an object', 'INVALID_TYPE' as const)]);
    }

    const resp = response as Record<string, any>;

    if (!resp.id) {
      return failure([createError('id', 'Missing required field: id', 'MISSING_REQUIRED_FIELD' as const)]);
    }

    if (!resp.choices || !Array.isArray(resp.choices)) {
      return failure([createError('choices', 'Missing or invalid field: choices', 'MISSING_REQUIRED_FIELD' as const)]);
    }

    if (!resp.usage) {
      return failure([createError('usage', 'Missing required field: usage', 'MISSING_REQUIRED_FIELD' as const)]);
    }

    // ⭐ FIX: Normalize snake_case to camelCase for internal format
    const normalizedResponse = normalizeToCamelCase(resp, true) as InternalResponse;

    // 🔧 GLM/MIXED FORMAT HANDLING: Handle vendors that return mixed formats
    // GLM and some vendors return content arrays with tool_use blocks
    if (normalizedResponse.choices && normalizedResponse.choices.length > 0) {
      const choice = normalizedResponse.choices[0]!;
      const originalMessage = resp.choices?.[0]?.message;

      if (originalMessage) {
        // Handle content array format (Anthropic/GLM style)
        if (Array.isArray(originalMessage.content)) {
          const textBlocks: string[] = [];
          const toolCalls: InternalToolCall[] = [];

          for (const block of originalMessage.content) {
            if (block.type === 'text') {
              textBlocks.push(block.text || '');
            } else if (block.type === 'tool_use') {
              // Convert Anthropic/GLM tool_use to OpenAI tool_call format
              const toolCall: InternalToolCall = {
                id: block.id || `call_${Date.now()}`,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}),
                },
              };
              toolCalls.push(toolCall);
            }
          }

          // Update message with extracted content and tool calls
          // ⭐ FIX: Use null instead of empty string for tool-only responses (OpenAI standard)
          choice.message.content = textBlocks.length > 0 ? textBlocks.join('') : null as any;
          if (toolCalls.length > 0) {
            choice.message.toolCalls = toolCalls;
          }
        }

        // 🔧 DEFENSIVE FALLBACK: Ensure toolCalls is extracted even if normalizeToCamelCase missed it
        // This handles edge cases with GLM and other vendors that return mixed formats
        if (!choice.message.toolCalls || choice.message.toolCalls.length === 0) {
          // Try multiple field naming conventions (snake_case vs camelCase)
          const toolCallsData = originalMessage.tool_calls || originalMessage.toolCalls;

          if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            choice.message.toolCalls = toolCallsData;
          }
        }
      }
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Field normalization
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(normalizedResponse, metadata);
  }

  convertResponseFromInternal(
    response: InternalResponse,
    _options?: ConversionOptions
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();

    // ⭐ FIX: Handle content array format (e.g., from Anthropic/GLM)
    // When content is an array of content blocks, extract text from TextContentBlock
    const processedResponse = {
      ...response,
      choices: response.choices?.map(choice => ({
        ...choice,
        message: {
          ...choice.message,
          // If content is an array, extract and join text from TextContentBlock
          content: Array.isArray(choice.message.content)
            ? (choice.message.content as InternalContentBlock[])
                .filter((block): block is TextContentBlock => block.type === 'text')
                .map(block => block.text)
                .join('')
            : choice.message.content
        }
      }))
    };

    // Normalize camelCase to snake_case for OpenAI API format
    const normalizedResponse = normalizeToSnakeCase(processedResponse, true);

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Field normalization
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(normalizedResponse, metadata);
  }

  // ==========================================
  // Stream Conversion
  // ==========================================

  convertStreamChunkToInternal(
    chunk: string,
    _options?: ConversionOptions
  ): TranspileResult<InternalStreamChunk> {
    const startTime = Date.now();

    try {
      // Handle both string and object inputs
      let parsed: any;
      if (typeof chunk === 'string') {
        parsed = JSON.parse(chunk);
      } else {
        parsed = chunk;
      }

      // Basic validation
      if (parsed.id && parsed.choices && parsed.object === 'chat.completion.chunk') {
        // ⭐ FIX: Normalize snake_case to camelCase for internal format
        const normalizedChunk = normalizeToCamelCase(parsed, true) as InternalStreamChunk;

        const metadata: TranspileMetadata = {
          fromVendor: 'openai',
          toVendor: 'openai',
          convertedAt: Date.now(),
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 1, // Field normalization
          fieldsIgnored: 0,
          fieldsWarned: 0,
        };
        return success(normalizedChunk, metadata);
      }

      return failure([createError('chunk', 'Invalid OpenAI stream chunk format', 'INVALID_STRUCTURE' as const)]);
    } catch (e) {
      return failure([createError('chunk', 'Failed to parse JSON chunk', 'INVALID_TYPE' as const)]);
    }
  }

  /**
   * Check if an internal chunk has meaningful content worth sending
   */
  private isChunkMeaningful(chunk: InternalStreamChunk): boolean {
    // Check for __empty marker (chunks marked as empty should be filtered)
    if ('__empty' in chunk && chunk.__empty) {
      return false;
    }

    // Has role delta (first chunk with assistant role)
    if (chunk.choices?.[0]?.delta?.role) {
      return true;
    }

    // Has content delta (actual text content)
    if (chunk.choices?.[0]?.delta?.content) {
      return true;
    }

    // Has reasoning_content (GLM-4 and other models with reasoning)
    if ((chunk.choices?.[0]?.delta as Record<string, unknown> | undefined)?.reasoning_content) {
      return true;
    }

    // Has finishReason (stream end)
    if (chunk.choices?.[0]?.finishReason) {
      return true;
    }

    // Has tool calls (check both camelCase and snake_case for vendor compatibility)
    if (chunk.choices?.[0]?.delta?.toolCalls || (chunk.choices?.[0]?.delta as Record<string, unknown> | undefined)?.tool_calls) {
      return true;
    }

    // Has usage information
    if (chunk.usage) {
      return true;
    }

    // Metadata fields (id, model, created, object) are ONLY meaningful if combined with other content
    // A chunk with ONLY metadata but no actual delta/finishReason/usage is considered empty
    // This is important because in OpenAI streaming, id is present in almost all chunks
    // but a chunk with only id (and no role/content/finishReason) should be filtered

    // Empty chunk - skip it
    return false;
  }

  convertStreamChunkFromInternal(
    chunk: InternalStreamChunk,
    _options?: ConversionOptions
  ): TranspileResult<string> {
    const startTime = Date.now();

    // Skip empty chunks - return empty string
    if (!this.isChunkMeaningful(chunk)) {
      const metadata: TranspileMetadata = {
        fromVendor: 'openai',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
        fieldsWarned: 0,
      };
      return success('', metadata);
    }

    // ⭐ FIX: Use field normalizer to convert camelCase to snake_case
    // Internal format uses: toolCalls, finishReason (camelCase)
    // OpenAI API format uses: tool_calls, finish_reason (snake_case)
    const apiFormatChunk = normalizeToSnakeCase(chunk, true);

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1,
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    // Return standard SSE format with snake_case field names
    const sseFormat = `data: ${JSON.stringify(apiFormatChunk)}\n\n`;
    return success(sseFormat, metadata);
  }

  // ==========================================
  // Detection & Validation
  // ==========================================

  isValidRequest(data: unknown): ValidationResult {
    const confidence = this.detect(data);
    const validation = this.validate(data);

    return {
      valid: validation.valid && confidence > 0.5,
      confidence,
      errors: validation.errors.length > 0 ? validation.errors.map(e => ({
        path: e.path,
        message: e.message,
        code: 'VALIDATION_FAILED' as const,
        severity: 'error' as const,
      })) : undefined,
    };
  }

  isValidResponse(data: unknown): ValidationResult {
    let confidence = 0;

    if (typeof data !== 'object' || data === null) {
      return {
        valid: false,
        confidence: 0,
        errors: [{
          path: '',
          message: 'Data must be an object',
          code: 'INVALID_TYPE',
          severity: 'error',
        }],
      };
    }

    const obj = data as Record<string, unknown>;

    // Check for OpenAI response structure
    if ('id' in obj && 'object' in obj && obj.object === 'chat.completion') {
      confidence += 0.4;
    }
    if ('choices' in obj && Array.isArray(obj.choices)) {
      confidence += 0.4;
    }
    if ('usage' in obj) {
      confidence += 0.2;
    }

    return {
      valid: confidence > 0.5,
      confidence,
    };
  }

  isValidStreamChunk(data: unknown): ValidationResult {
    let confidence = 0;

    if (typeof data !== 'string' && (typeof data !== 'object' || data === null)) {
      return {
        valid: false,
        confidence: 0,
        errors: [{
          path: '',
          message: 'Data must be a string or object',
          code: 'INVALID_TYPE',
          severity: 'error',
        }],
      };
    }

    // Try to parse as SSE event
    let parsed: unknown = data;
    if (typeof data === 'string') {
      try {
        const dataLine = data.split('\n').find((line: string) => line.startsWith('data: '));
        if (dataLine) {
          const jsonStr = dataLine.substring(6);
          parsed = JSON.parse(jsonStr);
          confidence += 0.3; // Successfully parsed SSE data
        }
      } catch {
        return { valid: false, confidence: 0 };
      }
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;

      // Check for OpenAI SSE event structure
      if ('id' in obj && 'object' in obj && obj.object === 'chat.completion.chunk') {
        confidence += 0.5;
      }
      if ('choices' in obj && Array.isArray(obj.choices)) {
        confidence += 0.2;
      }
    }

    return {
      valid: confidence > 0.5,
      confidence: Math.min(confidence, 1),
    };
  }

  detect(data: unknown): number {
    if (typeof data !== 'object' || data === null) {
      return 0;
    }

    const obj = data as Record<string, unknown>;
    let confidence = 0;

    // Check for OpenAI-specific fields
    if ('model' in obj && 'messages' in obj) {
      confidence += 0.4;
    }
    if ('function_call' in obj || 'tool_calls' in obj) {
      confidence += 0.3;
    }
    if ('max_completion_tokens' in obj || 'reasoning_effort' in obj) {
      confidence += 0.3; // OpenAI o1-specific fields
    }

    return confidence;
  }

  validate(data: unknown): { valid: boolean; errors: Array<{ path: string; message: string }> } {
    const errors: Array<{ path: string; message: string }> = [];

    if (typeof data !== 'object' || data === null) {
      errors.push({ path: '', message: 'Data must be an object' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    if (!('model' in obj)) {
      errors.push({ path: 'model', message: 'Missing required field: model' });
    }

    if (!('messages' in obj)) {
      errors.push({ path: 'messages', message: 'Missing required field: messages' });
    } else if (!Array.isArray(obj.messages)) {
      errors.push({ path: 'messages', message: 'messages must be an array' });
    }

    return { valid: errors.length === 0, errors };
  }
}
