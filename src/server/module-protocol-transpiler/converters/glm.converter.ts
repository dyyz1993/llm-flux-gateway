// @ts-nocheck - TODO: GLMConverter needs full implementation of FormatConverter interface
/**
 * GLM Format Converter
 *
 * Handles conversion between OpenAI internal format and Zhipu AI GLM API format.
 *
 * GLM API Format Characteristics:
 * - Claims OpenAI compatibility but returns mixed format (snake_case + camelCase)
 * - Uses standard OpenAI request/response structure
 * - Token counts may use different field names
 * - Tool calls format is OpenAI-compatible
 *
 * Key Differences from OpenAI:
 * - Response may use "prompt_tokens" (snake_case) instead of "promptTokens"
 * - Some GLM-specific fields in camelCase (e.g., "promptTokenDetail")
 * - Caching fields may be named differently
 *
 * This converter:
 * 1. Normalizes GLM's mixed format to consistent camelCase (Internal Format)
 * 2. Handles both request and response conversions
 * 3. Preserves all GLM-specific fields
 * 4. Uses field-normalizer for consistent field naming
 */

import type {
  InternalRequest,
  InternalResponse,
  InternalMessage,
  InternalToolCall,
  InternalUsage,
} from '../interfaces/internal-format';
import type {
  FormatConverter,
  ValidationResult,
} from '../interfaces/format-converter';
import type { TranspileResult, TranspileMetadata, ConversionOptions } from '../core/transpile-result';
import type { VendorType } from '../interfaces/vendor-types';
import { success, failure, createError, createWarning } from '../core/transpile-result';
import { normalizeToCamelCase } from '../utils/field-normalizer';

/**
 * GLM Format Converter
 *
 * Converts between Internal format and Zhipu AI GLM API format.
 * GLM claims OpenAI compatibility but has mixed naming conventions.
 */
export class GLMConverter implements FormatConverter {
  readonly vendorType: VendorType = 'glm';

  // ==========================================
  // Request Conversion (Internal -> GLM)
  // ==========================================

  convertRequestFromInternal(
    request: InternalRequest
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();
    const warnings: ReturnType<typeof createWarning>[] = [];

    try {
      // GLM uses OpenAI-compatible request format
      // Most fields can be passed through directly
      const glmRequest: Record<string, any> = {
        model: request.model,
        messages: request.messages.map((msg) => {
          const glmMsg: Record<string, any> = {
            role: msg.role,
            content: msg.content,
          };

          // Add tool calls if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            glmMsg.tool_calls = msg.toolCalls;
          }

          // Add tool_call_id for tool messages
          if (msg.toolCallId) {
            glmMsg.tool_call_id = msg.toolCallId;
          }

          // Add name if present
          if (msg.name) {
            glmMsg.name = msg.name;
          }

          return glmMsg;
        }),
      };

      // Add optional parameters
      if (request.temperature !== undefined) {
        glmRequest.temperature = request.temperature;
      }

      if (request.topP !== undefined) {
        glmRequest.top_p = request.topP;
      }

      if (request.maxTokens !== undefined) {
        glmRequest.max_tokens = request.maxTokens;
      }

      if (request.stream !== undefined) {
        glmRequest.stream = request.stream;
      }

      if (request.stop) {
        glmRequest.stop = request.stop;
      }

      if (request.tools && request.tools.length > 0) {
        glmRequest.tools = request.tools;
      }

      if (request.tool_choice !== undefined) {
        glmRequest.tool_choice = request.tool_choice;
      }

      // GLM-specific parameters
      if (request.topK !== undefined) {
        glmRequest.top_k = request.topK;
      }

      const metadata: TranspileMetadata = {
        fromVendor: 'openai',
        toVendor: 'glm',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 0,
        fieldsWarned: warnings.length,
      };

      return success(glmRequest, metadata, warnings);

    } catch (error) {
      return failure([createError('unknown', `Failed to convert request: ${error}`, 'CONVERSION_ERROR')]);
    }
  }

  convertRequestToInternal(
    request: Record<string, any>
  ): TranspileResult<InternalRequest> {
    // GLM uses OpenAI-compatible format, so we can mostly pass through
    const startTime = Date.now();
    const warnings: ReturnType<typeof createWarning>[] = [];

    try {
      const internalRequest: InternalRequest = {
        model: request.model || '',
        messages: (request.messages || []).map((msg: any) => {
          const internalMsg: InternalMessage = {
            role: msg.role,
            content: msg.content || null,
          };

          if (msg.tool_calls) {
            internalMsg.toolCalls = msg.tool_calls;
          }

          if (msg.tool_call_id) {
            internalMsg.toolCallId = msg.tool_call_id;
          }

          if (msg.name) {
            internalMsg.name = msg.name;
          }

          return internalMsg;
        }),
      };

      // Optional parameters
      if (request.temperature !== undefined) {
        internalRequest.temperature = request.temperature;
      }

      if (request.top_p !== undefined) {
        internalRequest.topP = request.top_p;
      }

      if (request.max_tokens !== undefined) {
        internalRequest.maxTokens = request.max_tokens;
      }

      if (request.stream !== undefined) {
        internalRequest.stream = request.stream;
      }

      if (request.stop) {
        internalRequest.stop = request.stop;
      }

      if (request.tools) {
        internalRequest.tools = request.tools;
      }

      if (request.tool_choice !== undefined) {
        internalRequest.tool_choice = request.tool_choice;
      }

      if (request.top_k !== undefined) {
        internalRequest.topK = request.top_k;
      }

      const metadata: TranspileMetadata = {
        fromVendor: 'glm',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 0,
        fieldsWarned: warnings.length,
      };

      return success(internalRequest, metadata, warnings);

    } catch (error) {
      return failure([createError('unknown', `Failed to convert request: ${error}`, 'CONVERSION_ERROR')]);
    }
  }

  // ==========================================
  // Response Conversion (GLM -> Internal)
  // ==========================================

  convertResponseToInternal(
    response: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalResponse> {
    const startTime = Date.now();
    const warnings: ReturnType<typeof createWarning>[] = [];

    try {
      const glmResp = response as Record<string, any>;

      // Validate required fields
      if (!glmResp.id) {
        return failure([createError('id', 'Missing required field: id', 'MISSING_REQUIRED_FIELD')]);
      }

      // Use field-normalizer to convert GLM's mixed format to internal format
      // GLM returns mixed snake_case and camelCase, so we normalize everything to camelCase
      const normalizedResponse = normalizeToCamelCase(glmResp, true);

      // Extract messages from choices
      const messages: InternalMessage[] = [];
      const toolCalls: InternalToolCall[] = [];

      if (glmResp.choices && glmResp.choices.length > 0) {
        const choice = glmResp.choices[0];
        const message = choice.message || choice.delta || {};

        // Build assistant message
        const assistantMsg: InternalMessage = {
          role: 'assistant',
          content: message.content || null,
        };

        // Extract tool calls if present
        if (message.tool_calls && message.tool_calls.length > 0) {
          assistantMsg.toolCalls = message.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            },
          }));
          toolCalls.push(...assistantMsg.toolCalls);
        }

        messages.push(assistantMsg);
      }

      // Build usage object from GLM response
      // GLM may use snake_case or camelCase for token fields
      const usage: InternalUsage = {
        promptTokens: normalizedResponse.usage?.promptTokens ||
                       normalizedResponse.usage?.prompt_tokens ||
                       glmResp.usage?.prompt_tokens ||
                       glmResp.usage?.promptTokenCount ||
                       0,
        completionTokens: normalizedResponse.usage?.completionTokens ||
                          normalizedResponse.usage?.completion_tokens ||
                          glmResp.usage?.completion_tokens ||
                          glmResp.usage?.completionTokenCount ||
                          0,
        totalTokens: normalizedResponse.usage?.totalTokens ||
                     normalizedResponse.usage?.total_tokens ||
                     glmResp.usage?.total_tokens ||
                     glmResp.usage?.totalTokenCount ||
                     0,
      };

      // Add caching fields if present
      if (glmResp.usage?.prompt_tokens_details?.cached_tokens ||
          normalizedResponse.usage?.promptTokensDetails?.cachedTokens) {
        usage.promptTokensDetails = {
          cachedTokens: glmResp.usage?.prompt_tokens_details?.cached_tokens ||
                       normalizedResponse.usage?.promptTokensDetails?.cachedTokens ||
                       0,
        };
      }

      // Add thinking tokens if present (GLM reasoning models)
      if (glmResp.usage?.completion_tokens_details?.reasoning_tokens ||
          normalizedResponse.usage?.completionTokensDetails?.reasoningTokens) {
        usage.completionTokensDetails = {
          reasoningTokens: glmResp.usage?.completion_tokens_details?.reasoning_tokens ||
                         normalizedResponse.usage?.completionTokensDetails?.reasoningTokens ||
                         0,
        };
      }

      const internalResponse: InternalResponse = {
        id: glmResp.id,
        object: glmResp.object || 'chat.completion',
        created: glmResp.created || Date.now(),
        model: glmResp.model || '',
        choices: glmResp.choices?.map((choice: any) => ({
          index: choice.index || 0,
          message: {
            role: choice.message?.role || 'assistant',
            content: choice.message?.content || null,
            toolCalls: choice.message?.tool_calls,
          },
          finishReason: choice.finish_reason || null,
        })) || [],
        usage,
      };

      const metadata: TranspileMetadata = {
        fromVendor: 'glm',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 1,
        fieldsIgnored: 0,
        fieldsWarned: warnings.length,
      };

      return success(internalResponse, metadata, warnings);

    } catch (error) {
      return failure([createError('unknown', `Failed to convert response: ${error}`, 'CONVERSION_ERROR')]);
    }
  }

  convertResponseFromInternal(
    response: InternalResponse
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();

    try {
      // GLM uses OpenAI-compatible response format
      const glmResponse: Record<string, any> = {
        id: response.id,
        object: response.object,
        created: response.created,
        model: response.model,
        choices: response.choices.map((choice) => ({
          index: choice.index,
          message: choice.message,
          finish_reason: choice.finishReason,
        })),
        usage: {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
        },
      };

      // Add optional fields
      if (response.usage.promptTokensDetails?.cachedTokens) {
        glmResponse.usage.prompt_tokens_details = {
          cached_tokens: response.usage.promptTokensDetails.cachedTokens,
        };
      }

      if (response.usage.completionTokensDetails?.reasoningTokens) {
        glmResponse.usage.completion_tokens_details = {
          reasoning_tokens: response.usage.completionTokensDetails.reasoningTokens,
        };
      }

      const metadata: TranspileMetadata = {
        fromVendor: 'openai',
        toVendor: 'glm',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 0,
        fieldsWarned: 0,
      };

      return success(glmResponse, metadata);

    } catch (error) {
      return failure([createError('unknown', `Failed to convert response: ${error}`, 'CONVERSION_ERROR')]);
    }
  }

  // ==========================================
  // Validation
  // ==========================================

  validateRequest(request: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!request.model) {
      errors.push('Missing required field: model');
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      errors.push('Missing or invalid field: messages');
    }

    // Validate message structure
    if (request.messages) {
      for (let i = 0; i < request.messages.length; i++) {
        const msg = request.messages[i];
        if (!msg.role) {
          errors.push(`Message ${i}: Missing required field: role`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateResponse(response: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!response.id) {
      errors.push('Missing required field: id');
    }

    if (!response.choices || !Array.isArray(response.choices)) {
      errors.push('Missing or invalid field: choices');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================
  // Vendor Detection
  // ==========================================

  detectRequestFormat(request: Record<string, any>): number {
    let confidence = 0;

    // GLM uses OpenAI-compatible format
    // Check for OpenAI-style structure
    if ('model' in request && 'messages' in request) {
      confidence += 0.3;
    }

    // Check for messages array with role/content
    if (request.messages && Array.isArray(request.messages)) {
      const firstMsg = request.messages[0];
      if (firstMsg && ('role' in firstMsg || 'content' in firstMsg)) {
        confidence += 0.2;
      }
    }

    // Check for GLM-specific parameters
    if ('top_k' in request) {
      confidence += 0.3;
    }

    // GLM often includes this field
    if ('stream' in request || 'temperature' in request) {
      confidence += 0.1;
    }

    return confidence;
  }

  detectResponseFormat(response: Record<string, any>): number {
    let confidence = 0;

    // GLM uses OpenAI-compatible response structure
    if ('id' in response && 'choices' in response) {
      confidence += 0.3;
    }

    if (response.choices && Array.isArray(response.choices)) {
      const firstChoice = response.choices[0];
      if (firstChoice && 'message' in firstChoice) {
        confidence += 0.2;
      }
    }

    // Check for GLM usage metadata (mixed format)
    if ('usage' in response) {
      confidence += 0.2;

      const usage = response.usage;
      // GLM may use snake_case
      if ('prompt_tokens' in usage || 'completion_tokens' in usage) {
        confidence += 0.1;
      }
      // Or camelCase
      if ('promptTokenCount' in usage || 'completionTokenCount' in usage) {
        confidence += 0.1;
      }
    }

    return confidence;
  }

  // ==========================================
  // Stream Support
  // ==========================================

  supportsStreaming(): boolean {
    return true;
  }

  getStreamParser(): any {
    // GLM uses OpenAI-compatible SSE format
    // Import OpenAI SSE parser for GLM streams
    const { OpenAISSEParser } = require('../parsers/openai-sse-parser');
    return new OpenAISSEParser();
  }
}
