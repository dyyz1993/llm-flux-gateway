/**
 * Gemini Format Converter
 *
 * Handles conversion between OpenAI and Google Gemini API formats.
 *
 * Key differences:
 * - Gemini uses "contents" with "parts" structure
 * - "user" role is "user", "assistant" role is "model"
 * - System prompt is separate from contents
 * - Tools use "function_declarations" format
 * - Response uses "candidates" array
 *
 * Extended to support:
 * - ThinkingConfig (Gemini 2.0/Flash Thinking) for reasoning features
 * - thoughtsTokenCount for reasoning token statistics
 * - cachedContentTokenCount for cache statistics
 */

import type {
  InternalRequest,
  InternalResponse,
  InternalMessage,
  InternalToolCall,
  InternalContentBlock,
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
 * Gemini Format Converter
 *
 * Converts between OpenAI internal format and Google Gemini API format.
 */
export class GeminiConverter implements FormatConverter {
  readonly vendorType: VendorType = 'gemini';

  // ==========================================
  // Request Conversion (Internal -> Gemini)
  // ==========================================

  convertRequestFromInternal(
    request: InternalRequest
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();
    const warnings: ReturnType<typeof createWarning>[] = [];

    // Extract system message
    let systemInstruction: string | undefined;
    const contents: any[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        const contentText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (systemInstruction) {
          systemInstruction += '\n\n' + (contentText || '');
          warnings.push(createWarning('messages', 'Multiple system messages combined', 'UNKNOWN_FIELD'));
        } else {
          systemInstruction = contentText || undefined;
        }
      } else {
        // Convert role names
        const role = msg.role === 'assistant' ? 'model' : msg.role;

        // Build parts array
        const parts: any[] = [];

        if (msg.content) {
          const contentText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          parts.push({ text: contentText });
        }

        // Handle tool calls in assistant messages
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tool_call of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tool_call.function.name,
                args: JSON.parse(tool_call.function.arguments || '{}'),
              },
            });
          }
        }

        // Handle tool responses
        if (msg.role === 'tool' && msg.toolCallId) {
          const contentText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          parts.push({
            functionResponse: {
              name: msg.name || 'unknown',
              response: JSON.parse(contentText || '{}'),
            },
          });
        }

        if (parts.length > 0) {
          contents.push({ role, parts });
        }
      }
    }

    // Build Gemini request
    const geminiRequest: Record<string, any> = {
      contents,
    };

    if (systemInstruction) {
      geminiRequest.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    // Generation config
    const generationConfig: any = {};

    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }

    if (request.topP !== undefined) {
      generationConfig.topP = request.topP;
    }

    if (request.topK !== undefined) {
      generationConfig.topK = request.topK;
    }

    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }

    if (request.stop) {
      generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    // ThinkingConfig support (Gemini 2.0 Flash Thinking)
    if (request.thinkingConfig) {
      generationConfig.thinkingConfig = {
        includeThoughts: request.thinkingConfig.includeThoughts,
        thinkingBudget: request.thinkingConfig.thinkingBudget,
        thinkingLevel: request.thinkingConfig.thinkingLevel,
      };
    }

    if (Object.keys(generationConfig).length > 0) {
      geminiRequest.generationConfig = generationConfig;
    }

    // Convert tools to Gemini format
    if (request.tools && request.tools.length > 0) {
      const functionDeclarations = request.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters || { type: 'object', properties: {} },
      }));

      geminiRequest.tools = [{ functionDeclarations }];
    }

    // Convert tool_choice to Gemini toolConfig
    if (request.tool_choice !== undefined) {
      const toolConfig: any = {};

      if (typeof request.tool_choice === 'string') {
        // Handle 'auto', 'required', 'none'
        if (request.tool_choice === 'auto') {
          toolConfig.functionCallingConfig = { mode: 'AUTO' };
        } else if (request.tool_choice === 'required') {
          toolConfig.functionCallingConfig = { mode: 'ANY' };
        } else if (request.tool_choice === 'none') {
          toolConfig.functionCallingConfig = { mode: 'NONE' };
        }
      } else if (typeof request.tool_choice === 'object' && request.tool_choice.type === 'function') {
        // Handle specific function choice
        toolConfig.functionCallingConfig = {
          mode: 'ANY',
          allowedFunctionNames: [request.tool_choice.function.name],
        };
      }

      if (Object.keys(toolConfig).length > 0) {
        geminiRequest.toolConfig = toolConfig;
      }
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'gemini',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Using field-normalizer
      fieldsIgnored: 0,
      fieldsWarned: warnings.length,
    };

    const result = success(geminiRequest, metadata);
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  }

  // ==========================================
  // Request Conversion (Gemini -> Internal)
  // ==========================================

  convertRequestToInternal(
    request: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalRequest> {
    const startTime = Date.now();

    if (typeof request !== 'object' || request === null) {
      return failure([createError('', 'Request must be an object', 'INVALID_TYPE')]);
    }

    const geminiReq = request as Record<string, any>;
    const messages: InternalMessage[] = [];

    // Validate required fields
    if (!geminiReq.contents || !Array.isArray(geminiReq.contents)) {
      return failure([createError('contents', 'Missing or invalid field: contents', 'MISSING_REQUIRED_FIELD')]);
    }

    // Extract system instruction
    if (geminiReq.systemInstruction?.parts?.[0]?.text) {
      messages.push({
        role: 'system',
        content: geminiReq.systemInstruction.parts[0].text,
      });
    }

    // Convert contents to messages
    for (const content of geminiReq.contents) {
      const role = content.role === 'model' ? 'assistant' : content.role;
      const parts = content.parts || [];

      // Build message content
      let messageContent: string | InternalContentBlock[] = '';
      const tool_calls: InternalToolCall[] = [];

      for (const part of parts) {
        if (part.text) {
          if (messageContent === '') {
            messageContent = part.text;
          } else {
            messageContent += '\n' + part.text;
          }
        }

        if (part.functionCall) {
          tool_calls.push({
            id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }

        if (part.functionResponse) {
          messages.push({
            role: 'tool',
            content: JSON.stringify(part.functionResponse.response),
            name: part.functionResponse.name,
          });
        }
      }

      if (role !== 'tool') {
        messages.push({
          role: role as 'system' | 'user' | 'assistant',
          content: messageContent,
          toolCalls: tool_calls.length > 0 ? tool_calls : undefined,
        } as any);
      }
    }

    // Build internal request
    const internalRequest: InternalRequest = {
      model: 'gemini-model', // Gemini doesn't require model in request
      messages,
    };

    // Extract generation config
    if (geminiReq.generationConfig) {
      const config = geminiReq.generationConfig;

      if (config.temperature !== undefined) {
        internalRequest.temperature = config.temperature;
      }

      if (config.topP !== undefined) {
        internalRequest.topP = config.topP;
      }

      if (config.topK !== undefined) {
        internalRequest.vendorSpecific = internalRequest.vendorSpecific || {};
        internalRequest.vendorSpecific.topK = config.topK;
      }

      if (config.maxOutputTokens !== undefined) {
        internalRequest.maxTokens = config.maxOutputTokens;
      }

      if (config.stopSequences) {
        internalRequest.stop = config.stopSequences;
      }

      // ThinkingConfig support (Gemini 2.0)
      if (config.thinkingConfig) {
        internalRequest.thinkingConfig = {
          includeThoughts: config.thinkingConfig.includeThoughts,
          thinkingBudget: config.thinkingConfig.thinkingBudget,
          thinkingLevel: config.thinkingConfig.thinkingLevel,
        };
      }
    }

    // Convert tools from Gemini format
    if (geminiReq.tools?.[0]?.functionDeclarations) {
      const convertedTools = geminiReq.tools[0].functionDeclarations.map((tool: any) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      internalRequest.tools = convertedTools;
    }

    // Convert toolConfig to tool_choice
    if (geminiReq.toolConfig?.functionCallingConfig) {
      const config = geminiReq.toolConfig.functionCallingConfig;

      if (config.mode === 'AUTO') {
        internalRequest.tool_choice = 'auto';
      } else if (config.mode === 'NONE') {
        internalRequest.tool_choice = 'none';
      } else if (config.mode === 'ANY' || config.mode === 'VALIDATED') {
        if (config.allowedFunctionNames && config.allowedFunctionNames.length > 0) {
          // Specific function requested
          internalRequest.tool_choice = {
            type: 'function',
            function: { name: config.allowedFunctionNames[0] },
          };
        } else {
          // Any function allowed (equivalent to 'required')
          internalRequest.tool_choice = 'required';
        }
      }
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'gemini',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Using field-normalizer
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(internalRequest, metadata);
  }

  // ==========================================
  // Response Conversion (Gemini -> Internal)
  // ==========================================

  convertResponseToInternal(
    response: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalResponse> {
    const startTime = Date.now();

    if (typeof response !== 'object' || response === null) {
      return failure([createError('', 'Response must be an object', 'INVALID_TYPE')]);
    }

    const geminiResp = response as Record<string, any>;

    // Validate required fields
    if (!geminiResp.candidates || !Array.isArray(geminiResp.candidates)) {
      return failure([createError('candidates', 'Missing or invalid field: candidates', 'MISSING_REQUIRED_FIELD')]);
    }

    const candidate = geminiResp.candidates[0];

    if (!candidate) {
      return failure([createError('candidates', 'No candidates in response', 'INVALID_STRUCTURE')]);
    }

    // Use field-normalizer to convert Gemini format to internal format
    // This handles promptTokenCount -> promptTokens, etc.
    const normalizedResponse = normalizeToCamelCase(geminiResp, true) as any;

    // Extract content from parts
    let content: string | null = null;
    const tool_calls: InternalToolCall[] = [];

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          if (content === null) {
            content = part.text;
          } else {
            content += '\n' + part.text;
          }
        }

        if (part.functionCall) {
          tool_calls.push({
            id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }
    }

    // Map finish reasons
    const finishReasonMap: Record<string, string> = {
      STOP: 'stop',
      MAX_TOKENS: 'length',
      SAFETY: 'content_filter',
      RECITATION: 'content_filter',
      OTHER: 'stop',
    };

    // Build internal response with detailed token statistics using normalized data
    const internalResponse: InternalResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: geminiResp.model || 'gemini-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content as string | InternalContentBlock[],
            toolCalls: tool_calls.length > 0 ? tool_calls : undefined,
          } as any,
          finishReason: finishReasonMap[candidate.finishReason] || candidate.finishReason || 'stop',
        },
      ],
      usage: {
        promptTokens: normalizedResponse.usageMetadata?.promptTokens || geminiResp.usageMetadata?.promptTokenCount || 0,
        completionTokens: normalizedResponse.usageMetadata?.completionTokens || geminiResp.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: normalizedResponse.usageMetadata?.totalTokens || geminiResp.usageMetadata?.totalTokenCount || 0,
        cachedContentTokenCount: normalizedResponse.usageMetadata?.cachedContentTokenCount || geminiResp.usageMetadata?.cachedContentTokenCount,
        thoughtsTokenCount: normalizedResponse.usageMetadata?.thoughtsTokenCount || geminiResp.usageMetadata?.thoughtsTokenCount,
        toolUsePromptTokenCount: normalizedResponse.usageMetadata?.toolUsePromptTokenCount || geminiResp.usageMetadata?.toolUsePromptTokenCount,
      } as any,
    };

    const metadata: TranspileMetadata = {
      fromVendor: 'gemini',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Using field-normalizer
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(internalResponse, metadata);
  }

  // ==========================================
  // Response Conversion (Internal -> Gemini)
  // ==========================================

  convertResponseFromInternal(
    response: InternalResponse,
    _options?: ConversionOptions
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();

    const choice = response.choices![0]!;
    const message = choice.message;

    // Build parts array
    const parts: any[] = [];

    if (message.content) {
      parts.push({ text: message.content });
    }

    if (message.toolCalls) {
      for (const tool_call of message.toolCalls) {
        parts.push({
          functionCall: {
            name: tool_call.function.name,
            args: JSON.parse(tool_call.function.arguments || '{}'),
          },
        });
      }
    }

    // Map finish reasons
    const finishReasonMap: Record<string, string> = {
      stop: 'STOP',
      length: 'MAX_TOKENS',
      content_filter: 'SAFETY',
      tool_calls: 'STOP',
    };

    // Build usage metadata with detailed statistics
    const usageMetadata: any = {
      promptTokenCount: response.usage!.promptTokens,
      candidatesTokenCount: response.usage!.completionTokens,
      totalTokenCount: response.usage!.totalTokens,
    };

    // Add optional token statistics
    if ((response.usage as any).thoughtsTokenCount !== undefined) {
      usageMetadata.thoughtsTokenCount = (response.usage as any).thoughtsTokenCount;
    }
    if ((response.usage as any).cachedContentTokenCount !== undefined) {
      usageMetadata.cachedContentTokenCount = (response.usage as any).cachedContentTokenCount;
    }
    if ((response.usage as any).toolUsePromptTokenCount !== undefined) {
      usageMetadata.toolUsePromptTokenCount = (response.usage as any).toolUsePromptTokenCount;
    }

    // Build Gemini response
    const geminiResponse: Record<string, any> = {
      candidates: [
        {
          content: {
            parts: parts.length > 0 ? parts : [{ text: '' }],
            role: 'model',
          },
          finishReason: finishReasonMap[choice.finishReason as any] || 'OTHER',
          index: 0,
        },
      ],
      usageMetadata,
    };

    if (response.model) {
      geminiResponse.model = response.model;
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'gemini',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Using field-normalizer
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(geminiResponse, metadata);
  }

  // ==========================================
  // Stream Conversion (Not yet supported)
  // ==========================================

  convertStreamChunkToInternal(
    _chunk: string,
    _options?: ConversionOptions
  ): TranspileResult<any> {
    // Gemini streaming conversion not yet implemented
    return failure([
      createError('chunk', 'Gemini streaming conversion not yet implemented', 'UNSUPPORTED_FEATURE'),
    ]);
  }

  convertStreamChunkFromInternal(
    _chunk: any,
    _options?: ConversionOptions
  ): TranspileResult<string> {
    // Gemini streaming conversion not yet implemented
    return failure([
      createError('chunk', 'Gemini streaming conversion not yet implemented', 'UNSUPPORTED_FEATURE'),
    ]);
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

    // Check for Gemini response structure
    if ('candidates' in obj && Array.isArray(obj.candidates)) {
      confidence += 0.4;
    }
    if ('usageMetadata' in obj) {
      confidence += 0.3;
    }
    if ('modelVersion' in obj) {
      confidence += 0.2;
    }

    return {
      valid: confidence > 0.5,
      confidence,
    };
  }

  isValidStreamChunk(_data: unknown): ValidationResult {
    // Gemini streaming not yet implemented
    return {
      valid: false,
      confidence: 0,
      errors: [{
        path: '',
        message: 'Gemini streaming conversion not yet implemented',
        code: 'UNSUPPORTED_FEATURE',
        severity: 'error',
      }],
    };
  }

  detect(data: unknown): number {
    if (typeof data !== 'object' || data === null) {
      return 0;
    }

    const obj = data as Record<string, unknown>;
    let confidence = 0;

    // Check for Gemini-specific fields
    if ('contents' in obj) {
      confidence += 0.4;
    }
    if ('systemInstruction' in obj) {
      confidence += 0.3;
    }
    if ('generationConfig' in obj) {
      confidence += 0.2;
    }
    if ('thinkingConfig' in obj) {
      confidence += 0.1; // Gemini 2.0 thinking config
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

    if (!('contents' in obj)) {
      errors.push({ path: 'contents', message: 'Missing required field: contents' });
    } else if (!Array.isArray(obj.contents)) {
      errors.push({ path: 'contents', message: 'contents must be an array' });
    }

    return { valid: errors.length === 0, errors };
  }
}
