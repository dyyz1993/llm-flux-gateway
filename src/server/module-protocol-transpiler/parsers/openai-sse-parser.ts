/**
 * OpenAI SSE Parser - Protocol Transpiler Module
 *
 * Parses OpenAI-compatible SSE streams and converts them to InternalStreamChunk format.
 *
 * OpenAI SSE Format:
 * - Events are separated by double newlines (\n\n)
 * - Each event has a "data:" line containing JSON
 * - Stream ends with a "data: [DONE]" message
 *
 * Example OpenAI SSE stream:
 * ```
 * data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
 *
 * data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}
 *
 * data: [DONE]
 * ```
 *
 * This parser:
 * 1. Reads SSE events using the base class
 * 2. Parses JSON data from each event
 * 3. Skips the [DONE] termination message
 * 4. Converts OpenAI format to InternalStreamChunk
 * 5. Logs progress at regular intervals
 */

import type { InternalStreamChunk, InternalMessage } from '../interfaces/internal-format';
import {
  BaseSSEParser,
  VendorFormat,
} from './base-sse-parser';

/**
 * OpenAI chunk format (raw SSE data)
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

/**
 * OpenAI SSE Parser
 *
 * Handles parsing of OpenAI-format SSE streams.
 * Since OpenAI format is the basis for InternalStreamChunk,
 * conversion is mostly straightforward mapping.
 */
export class OpenAISSEParser extends BaseSSEParser {
  /**
   * Get the vendor format this parser handles
   */
  getFormat(): VendorFormat {
    return VendorFormat.OPENAI;
  }

  /**
   * Parse OpenAI SSE stream and yield InternalStreamChunk objects
   *
   * Process:
   * 1. Read SSE events from stream
   * 2. Skip [DONE] termination message
   * 3. Parse JSON data from each event
   * 4. Map OpenAI format to InternalStreamChunk
   * 5. Log progress at regular intervals
   *
   * @param stream - Raw SSE stream from OpenAI API
   * @returns AsyncGenerator yielding InternalStreamChunk objects
   */
  async *parse(
    stream: ReadableStream<Uint8Array>
  ): AsyncGenerator<InternalStreamChunk, void, unknown> {
    this.resetCounters();

    console.log('[OpenAISSEParser] Starting to parse OpenAI SSE stream');

    try {
      for await (const event of this.readSSE(stream, 'openai')) {
        // Check for [DONE] message
        if (event.data! === '[DONE]') {
          console.log('[OpenAISSEParser] Received [DONE] termination message');
          continue;
        }

        try {
          // Parse OpenAI chunk
          const openaiChunk = JSON.parse(event.data!) as OpenAIStreamChunk;

          // Convert to InternalStreamChunk
          const internalChunk = this.convertToInternalFormat(openaiChunk);

          // Log progress
          this.logProgress('OpenAI');

          // Yield the chunk
          yield internalChunk;

        } catch (parseError) {
          // Log parse error but continue processing
          const dataPreview = event.data!.length > 200
            ? `${event.data!.substring(0, 200)}...`
            : event.data!;

          console.warn(
            `[OpenAISSEParser] Failed to parse SSE chunk: ${dataPreview}`,
            parseError
          );
        }
      }

      // Log summary
      this.logSummary('OpenAI');

    } catch (error) {
      console.error('[OpenAISSEParser] Error during stream parsing:', error);
      throw error;
    }
  }

  /**
   * Convert OpenAI chunk format to InternalStreamChunk
   *
   * Mapping:
   * - id → id (same)
   * - object → object (same)
   * - created → created (same)
   * - model → model (same)
   * - choices[i].index → choices[i].index (same)
   * - choices[i].delta → choices[i].delta (mapped)
   * - choices[i].finish_reason → choices[i].finishReason (camelCase)
   * - usage → not included in stream chunks (only in final response)
   *
   * @param openaiChunk - Raw OpenAI stream chunk
   * @returns InternalStreamChunk
   */
  private convertToInternalFormat(
    openaiChunk: OpenAIStreamChunk
  ): InternalStreamChunk {
    const internalChunk: InternalStreamChunk = {
      id: openaiChunk.id,
      object: openaiChunk.object,
      created: openaiChunk.created,
      model: openaiChunk.model,
      choices: openaiChunk.choices.map(choice => ({
        index: choice.index,
        delta: this.mapDelta(choice.delta),
        finishReason: this.mapFinishReason(choice.finish_reason),
      })),
    };

    return internalChunk;
  }

  /**
   * Map OpenAI delta to InternalMessage delta
   *
   * OpenAI delta fields:
   * - content: string content
   * - role: message role
   * - tool_calls: array of tool call deltas
   *
   * InternalMessage delta fields:
   * - content: string | InternalContentBlock[]
   * - role: MessageRole
   * - toolCalls: InternalToolCall[]
   * - toolCallId: string
   *
   * @param delta - OpenAI delta object
   * @returns Partial InternalMessage delta
   */
  private mapDelta(
    delta: OpenAIStreamChunk['choices'][0]['delta']
  ): Partial<InternalMessage> {
    const mappedDelta: Partial<InternalMessage> = {};

    // Map content (OpenAI sends content as string, not content blocks)
    if (delta.content !== undefined) {
      mappedDelta.content = delta.content;
    }

    // Map role
    if (delta.role !== undefined) {
      mappedDelta.role = delta.role as 'system' | 'user' | 'assistant' | 'tool';
    }

    // Map tool_calls → toolCalls
    if (delta.tool_calls !== undefined) {
      mappedDelta.toolCalls = delta.tool_calls.map(tc => ({
        id: tc.id || '',
        type: 'function' as const,
        function: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        },
      }));
    }

    return mappedDelta;
  }

  /**
   * Map OpenAI finish reason to internal format
   *
   * OpenAI finish reasons: 'stop', 'length', 'tool_calls', 'content_filter'
   * Internal format: 'stop', 'length', 'content_filter', 'tool_calls', null
   *
   * @param finishReason - OpenAI finish reason
   * @returns Internal finish reason
   */
  private mapFinishReason(
    finishReason: string | null
  ): 'stop' | 'length' | 'content_filter' | 'tool_calls' | null {
    if (finishReason === null) {
      return null;
    }

    // Direct mapping as they match
    const validReasons = ['stop', 'length', 'content_filter', 'tool_calls'] as const;
    if (validReasons.includes(finishReason as any)) {
      return finishReason as any;
    }

    // Default to 'stop' for unknown reasons
    console.warn(
      `[OpenAISSEParser] Unknown finish_reason: ${finishReason}, defaulting to 'stop'`
    );
    return 'stop';
  }
}
