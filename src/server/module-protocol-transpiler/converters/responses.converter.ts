/**
 * OpenAI Responses API Format Converter
 *
 * Handles conversion between OpenAI's new Responses API format and the internal format.
 *
 * Responses API format differences:
 * - Uses "input" instead of "messages"
 * - Content is array of content parts (input_text, image, etc.)
 * - Response has different structure
 *
 * References:
 * - https://platform.openai.com/docs/api-reference/responses/create
 */

import type {
  InternalRequest,
  InternalResponse,
  InternalMessage,
  InternalStreamChunk,
} from '../interfaces/internal-format';
import type { TranspileResult, TranspileMetadata } from '../core/transpile-result';
import type { VendorType } from '../interfaces/vendor-types';
import { success, failure, createError } from '../core/transpile-result';

// ==========================================
// Responses API Types
// ==========================================

/**
 * Responses API content part types
 */
type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }
  | { type: 'input_image'; image_url: string | { url: string }; detail?: 'low' | 'high' | 'auto' }
  | { type: 'ref'; ref: string; ref_type?: 'image' | 'document' };

/**
 * Responses API message format
 */
interface ResponsesMessage {
  role: string;
  content: string | ResponsesContentPart[];
}

/**
 * Responses API request format
 */
interface ResponsesRequest {
  model: string;
  input: ResponsesMessage[] | string;
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  tools?: any[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  stream?: boolean;
  include?: ('input' | 'output')[];
  truncate?: boolean | string;
  previous_response_id?: string;
}

/**
 * Responses API response format
 */
interface ResponsesResponse {
  id: string;
  status: string;
  status_details?: any;
  output?: ResponsesMessage[];
  error?: any;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  created_at?: string;
  incomplete?: boolean;
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Convert Responses API content to string
 */
function responsesContentToString(content: string | ResponsesContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content.map(part => {
    if (part.type === 'input_text' || part.type === 'output_text') {
      return part.text;
    }
    if (part.type === 'input_image') {
      return '[Image]';
    }
    if (part.type === 'ref') {
      return `[Ref: ${part.ref}]`;
    }
    return '[Unknown content type]';
  }).join('');
}

/**
 * Convert Responses API messages to internal format
 */
function responsesMessagesToInternal(messages: ResponsesMessage[]): InternalMessage[] {
  return messages.map(msg => ({
    role: msg.role.toUpperCase() === 'ASSISTANT' ? 'assistant' : 'user',
    content: responsesContentToString(msg.content),
  }));
}

/**
 * Convert internal messages to Responses API format
 */
function internalMessagesToResponses(messages: InternalMessage[]): ResponsesMessage[] {
  return messages.map(msg => ({
    role: msg.role,
    content: [{ type: msg.role === 'assistant' ? 'output_text' : 'input_text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
  }));
}

/**
 * Convert Responses API tools to internal (OpenAI) format
 *
 * Responses API format: { type: 'function', name: '...', description: '...', parameters: {...} }
 * OpenAI format: { type: 'function', function: { name: '...', description: '...', parameters: {...} } }
 */
function responsesToolsToInternal(tools?: any[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => {
    // If already in OpenAI format (has function property), return as-is
    if (tool.function) {
      return tool;
    }
    // Convert from Responses API format to OpenAI format
    return {
      type: tool.type || 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || { type: 'object', properties: {} },
      },
    };
  });
}

/**
 * Convert internal (OpenAI) tools to Responses API format
 */
function internalToolsToResponses(tools?: any[]): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => {
    // If already in Responses API format (has name at top level), return as-is
    if (tool.name && !tool.function) {
      return tool;
    }
    // Convert from OpenAI format to Responses API format
    return {
      type: tool.type || 'function',
      name: tool.function?.name,
      description: tool.function?.description,
      parameters: tool.function?.parameters,
    };
  });
}

// ==========================================
// Converter Implementation
// ==========================================

/**
 * Responses API Format Converter
 *
 * Converts between OpenAI Responses API format and internal format.
 */
export class ResponsesConverter {
  readonly vendorType: VendorType = 'openai-responses';

  // ==========================================
  // Request Conversion
  // ==========================================

  /**
   * Convert Responses API request to internal format
   */
  convertRequestToInternal(request: unknown): TranspileResult<InternalRequest> {
    const startTime = Date.now();
    const warnings: typeof createError[] = [];

    // Basic validation
    if (typeof request !== 'object' || request === null) {
      return failure([createError('root', 'Request must be an object', 'INVALID_TYPE')]);
    }

    const req = request as ResponsesRequest;

    // Validate required fields
    if (!req.model) {
      return failure([createError('model', 'Missing required field: model', 'MISSING_REQUIRED_FIELD')]);
    }

    if (!req.input) {
      return failure([createError('input', 'Missing required field: input', 'MISSING_REQUIRED_FIELD')]);
    }

    // Convert input to messages
    let messages: InternalMessage[];

    if (typeof req.input === 'string') {
      // Simple string input - treat as user message
      messages = [{ role: 'user', content: req.input }];
    } else {
      // Array input - convert from Responses format
      messages = responsesMessagesToInternal(req.input);
    }

    // Build internal request
    const internalRequest: InternalRequest = {
      model: req.model,
      messages,
      temperature: req.temperature,
      maxTokens: req.max_output_tokens,
      topP: req.top_p,
      tools: responsesToolsToInternal(req.tools),
      tool_choice: req.tool_choice === 'required'
        ? { type: 'function' as const, function: { name: '' } }
        : (req.tool_choice === 'auto' || req.tool_choice === 'none' || req.tool_choice === undefined
          ? req.tool_choice
          : { type: 'function' as const, function: { name: (req.tool_choice as { type: 'function'; name: string }).name } }),
      stream: req.stream,
    };

    // Warn about unsupported fields
    if (req.include) {
      warnings.push(createError('include', 'Field not supported in conversion, ignored', 'UNKNOWN_FIELD') as any);
    }
    if (req.truncate) {
      warnings.push(createError('truncate', 'Field not supported in conversion, ignored', 'UNKNOWN_FIELD') as any);
    }
    if (req.previous_response_id) {
      warnings.push(createError('previous_response_id', 'Field not supported in conversion, ignored', 'UNKNOWN_FIELD') as any);
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai-responses',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: messages.length + 3, // model + messages + basic params
      fieldsIgnored: warnings.length,
      fieldsWarned: warnings.length,
    };

    if (warnings.length > 0) {
      return { success: true, data: internalRequest, metadata, warnings: warnings as any };
    }

    return success(internalRequest, metadata);
  }

  /**
   * Convert internal format to Responses API request
   */
  convertRequestFromInternal(request: InternalRequest): TranspileResult<Record<string, any>> {
    const startTime = Date.now();

    // Validate required fields
    if (!request.model) {
      return failure([createError('model', 'Missing required field: model', 'MISSING_REQUIRED_FIELD')]);
    }

    if (!request.messages || request.messages.length === 0) {
      return failure([createError('messages', 'Missing required field: messages', 'MISSING_REQUIRED_FIELD')]);
    }

    // Convert messages to Responses format
    const responsesMessages = internalMessagesToResponses(request.messages);

    // Build Responses request
    const responsesRequest: ResponsesRequest = {
      model: request.model,
      input: responsesMessages,
      temperature: request.temperature,
      max_output_tokens: request.maxTokens,
      top_p: request.topP,
      tools: internalToolsToResponses(request.tools),
      tool_choice: request.tool_choice === 'auto' ? 'auto' : request.tool_choice === 'none' ? 'none' : 'auto',
      stream: request.stream,
    };

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai-responses',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: responsesMessages.length + 2,
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(responsesRequest, metadata);
  }

  // ==========================================
  // Response Conversion
  // ==========================================

  /**
   * Convert Responses API response to internal format
   */
  convertResponseToInternal(response: unknown): TranspileResult<InternalResponse> {
    const startTime = Date.now();

    if (typeof response !== 'object' || response === null) {
      return failure([createError('root', 'Response must be an object', 'INVALID_TYPE')]);
    }

    const resp = response as ResponsesResponse;

    // Handle error responses
    if (resp.error) {
      return failure([createError('error', resp.error.message || 'Unknown error', 'UNKNOWN_ERROR')]);
    }

    // Convert output to internal format
    let content = '';
    if (resp.output && resp.output.length > 0) {
      const assistantMessage = resp.output.find(m => m.role.toLowerCase() === 'assistant');
      if (assistantMessage) {
        content = responsesContentToString(assistantMessage.content);
      }
    }

    // Build internal response
    const internalResponse: InternalResponse = {
      id: resp.id,
      object: 'chat.completion',
      created: resp.created_at ? new Date(resp.created_at).getTime() / 1000 : Date.now() / 1000,
      model: '', // Will be filled by caller
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: (content || null) as string | any[],
        },
        finishReason: resp.status === 'completed' ? 'stop' : resp.status === 'incomplete' ? 'length' : 'stop',
      }],
      usage: {
        promptTokens: resp.usage?.input_tokens || 0,
        completionTokens: resp.usage?.output_tokens || 0,
        totalTokens: resp.usage?.total_tokens || 0,
      },
    };

    const metadata: TranspileMetadata = {
      fromVendor: 'openai-responses',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 5,
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(internalResponse, metadata);
  }

  /**
   * Convert internal format to Responses API response
   */
  convertResponseFromInternal(response: InternalResponse): TranspileResult<Record<string, any>> {
    const startTime = Date.now();
    const choice = response.choices[0]!;

    // Convert to Responses format
    const responsesResponse: ResponsesResponse = {
      id: response.id,
      status: 'completed',
      output: [{
        role: 'assistant',
        content: [{ type: 'output_text', text: (choice.message.content || '') as string }],
      }],
      usage: {
        input_tokens: response.usage!.promptTokens,
        output_tokens: response.usage!.completionTokens,
        total_tokens: response.usage!.totalTokens,
      },
      created_at: new Date(response.created * 1000).toISOString(),
    };

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai-responses',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 6,
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(responsesResponse, metadata);
  }

  // ==========================================
  // Stream Chunk Conversion
  // ==========================================

  /**
   * Convert Responses API stream chunk to internal format
   */
  convertStreamChunkToInternal(chunk: string): TranspileResult<InternalStreamChunk> {
    try {
      const parsed = JSON.parse(chunk);
      // Responses API streaming format is similar to OpenAI
      const metadata: TranspileMetadata = {
        fromVendor: 'openai-responses',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 0,
        fieldsWarned: 0,
      };
      return success(parsed as InternalStreamChunk, metadata);
    } catch {
      return failure([createError('chunk', 'Invalid JSON chunk', 'INVALID_TYPE')]);
    }
  }

  /**
   * Check if an internal chunk has meaningful content worth sending
   *
   * NOTE: Metadata alone (id, model, created, object) is NOT meaningful.
   * Only chunks with actual content, role changes, or completion markers should be sent.
   */
  private isChunkMeaningful(chunk: InternalStreamChunk): boolean {
    // Has role delta (first chunk with assistant role)
    if (chunk.choices?.[0]?.delta?.role) {
      return true;
    }

    // Has content delta (actual text content)
    if (chunk.choices?.[0]?.delta?.content) {
      return true;
    }

    // Has finish_reason (stream end)
    if (chunk.choices?.[0]?.finishReason) {
      return true;
    }

    // Has tool calls (check both camelCase and snake_case for vendor compatibility)
    if (chunk.choices?.[0]?.delta?.toolCalls || (chunk.choices?.[0]?.delta as any)?.tool_calls) {
      return true;
    }

    // Has usage information
    if (chunk.usage) {
      return true;
    }

    // Metadata alone (id, model, created, object) is NOT meaningful - skip it
    return false;
  }

  /**
   * Convert internal stream chunk to Responses API format
   *
   * Responses API uses event-driven SSE format:
   * event: response.output_text.delta
   * data: {"type":"response.output_text.delta","delta":"text",...}
   *
   * For now, we use a simplified format compatible with SSE:
   * data: {...}
   *
   * NOTE: Returns empty string for chunks without meaningful content.
   * Gateway controller should check for non-empty string before writing.
   */
  convertStreamChunkFromInternal(chunk: InternalStreamChunk): TranspileResult<string> {
    const startTime = Date.now();

    // Skip empty chunks - return empty string
    if (!this.isChunkMeaningful(chunk)) {
      const metadata: TranspileMetadata = {
        fromVendor: 'openai',
        toVendor: 'openai-responses',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
        fieldsWarned: 0,
      };
      return success('', metadata);
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'openai-responses',
      convertedAt: Date.now(),
      conversionTimeMs: 0,
      fieldsConverted: 1,
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    const choice = chunk.choices?.[0];
    const delta = choice?.delta;

    // Handle response.created (first chunk with role)
    if (delta?.role && !delta?.content) {
      const data = {
        type: 'response.created',
        response: {
          id: chunk.id,
          status: 'in_progress',
          created_at: chunk.created,
          model: chunk.model,
        },
      };
      return success(`event: response.created\ndata: ${JSON.stringify(data)}\n\n`, {
        ...metadata,
        conversionTimeMs: Date.now() - startTime,
      });
    }

    // Handle response.output_text.delta (content chunks)
    if (delta?.content) {
      const data = {
        type: 'response.output_text.delta',
        delta: {
          type: 'content',
          content: delta.content,
        },
      };
      return success(`event: response.output_text.delta\ndata: ${JSON.stringify(data)}\n\n`, {
        ...metadata,
        conversionTimeMs: Date.now() - startTime,
      });
    }

    // Handle response.done (finish with usage)
    if (choice?.finishReason) {
      const data = {
        type: 'response.done',
        response: {
          id: chunk.id,
          status: 'completed',
          created_at: chunk.created,
          model: chunk.model,
          usage: chunk.usage ? {
            input_tokens: chunk.usage.promptTokens || 0,
            output_tokens: chunk.usage.completionTokens || 0,
            total_tokens: chunk.usage.totalTokens || 0,
          } : undefined,
        },
      };
      return success(`event: response.done\ndata: ${JSON.stringify(data)}\n\n`, {
        ...metadata,
        conversionTimeMs: Date.now() - startTime,
      });
    }

    // Fallback: return empty string for unknown chunk types
    return success('', {
      ...metadata,
      fieldsIgnored: 1,
      conversionTimeMs: Date.now() - startTime,
    });
  }

  // ==========================================
  // Validation & Detection
  // ==========================================

  /**
   * Detect if data is Responses API format
   */
  detect(data: unknown): number {
    if (typeof data !== 'object' || data === null) {
      return 0;
    }

    const obj = data as Record<string, unknown>;
    let confidence = 0;

    // Check for Responses-specific fields
    if ('input' in obj && !('messages' in obj)) {
      confidence += 0.5;
    }
    if (obj.input && typeof obj.input === 'object' && Array.isArray(obj.input)) {
      const firstMsg = (obj.input as unknown[])[0];
      if (firstMsg && typeof firstMsg === 'object' && 'content' in firstMsg && typeof firstMsg.content === 'object') {
        confidence += 0.3; // Content is array of parts
      }
    }

    return confidence;
  }

  /**
   * Validate Responses API request
   */
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

    if (!('input' in obj)) {
      errors.push({ path: 'input', message: 'Missing required field: input' });
    }

    return { valid: errors.length === 0, errors };
  }
}
