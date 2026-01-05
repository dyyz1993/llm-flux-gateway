/**
 * Gemini SSE Parser - Protocol Transpiler Module
 *
 * Parses Google Gemini SSE streams and converts them to InternalStreamChunk format.
 *
 * Gemini SSE Format:
 * - Events are separated by double newlines (\n\n)
 * - Each event has a "data:" line containing JSON
 * - Stream ends naturally when the upstream closes the connection
 *
 * Example Gemini SSE stream:
 * ```
 * data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
 *
 * data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}
 * ```
 *
 * Key differences from OpenAI format:
 * - Uses "candidates" array instead of "choices"
 * - Uses "content.parts" instead of "message.content"
 * - Role names: "user" and "model" (not "assistant")
 * - No explicit [DONE] message
 *
 * This parser:
 * 1. Reads SSE events using the base class
 * 2. Parses JSON data from each event
 * 3. Converts Gemini format to InternalStreamChunk
 * 4. Handles empty chunks (metadata-only events)
 */

import type { InternalStreamChunk, FinishReason } from '../interfaces/internal-format';
import {
  BaseSSEParser,
  VendorFormat,
} from './base-sse-parser';

/**
 * Gemini stream chunk format (raw SSE data)
 */
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name?: string;
          args?: Record<string, any>;
        };
        functionResponse?: {
          name?: string;
          response?: Record<string, any>;
        };
      }>;
      role?: string;
    };
    finishReason?: string;
    index?: number;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

/**
 * Gemini SSE Parser
 *
 * Handles parsing of Gemini-format SSE streams.
 */
export class GeminiSSEParser extends BaseSSEParser {
  /**
   * Get the vendor format this parser handles
   */
  getFormat(): VendorFormat {
    return VendorFormat.GEMINI;
  }

  /**
   * Parse Gemini SSE stream and yield InternalStreamChunk objects
   *
   * Process:
   * 1. Read SSE events from stream
   * 2. Parse JSON data from each event
   * 3. Map Gemini format to InternalStreamChunk
   * 4. Handle empty chunks (metadata-only events)
   *
   * @param stream - Raw SSE stream from Gemini API
   * @returns AsyncGenerator yielding InternalStreamChunk objects
   */
  async *parse(
    stream: ReadableStream<Uint8Array>
  ): AsyncGenerator<InternalStreamChunk, void, unknown> {
    let chunkCount = 0;

    // Read SSE events from stream
    for await (const event of this.readSSE(stream, 'gemini')) {
      this.eventCount++;

      try {
        // Parse JSON data from event
        const geminiChunk = JSON.parse(event.data) as GeminiStreamChunk;

        // Skip if no candidates
        if (!geminiChunk.candidates || geminiChunk.candidates.length === 0) {
          continue;
        }

        // Get first candidate (Gemini typically returns one candidate)
        const candidate = geminiChunk.candidates[0];

        if (!candidate) {
          continue;
        }

        // Extract content from parts
        const parts = candidate.content?.parts || [];

        if (parts.length === 0) {
          // This might be a metadata-only chunk (e.g., finish_reason only)
          // Check if we have finishReason
          if (candidate.finishReason) {
            yield {
              id: `gemini-${this.eventCount}`,
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: '',
              choices: [{
                index: candidate.index || 0,
                delta: {},
                finishReason: this.mapFinishReason(candidate.finishReason || 'STOP'),
              }],
              usage: geminiChunk.usageMetadata ? {
                promptTokens: geminiChunk.usageMetadata.promptTokenCount || 0,
                completionTokens: geminiChunk.usageMetadata.candidatesTokenCount || 0,
                totalTokens: geminiChunk.usageMetadata.totalTokenCount || 0,
              } : undefined,
            };
          }
          continue;
        }

        // Process each part to build delta content
        let textContent = '';
        const toolCalls: Array<{
          index: number;
          id?: string;
          type?: string;
          function?: {
            name?: string;
            arguments?: string;
          };
        }> = [];

        for (const part of parts) {
          // Handle text content
          if (part.text) {
            textContent += part.text;
          }

          // Handle function call (tool use)
          if (part.functionCall) {
            toolCalls.push({
              index: toolCalls.length,
              id: `call_${Date.now()}_${toolCalls.length}`,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              },
            });
          }

          // Handle function response
          // Note: These typically don't appear in streaming responses
          if (part.functionResponse) {
            // Function responses are usually sent in the next request, not streamed
            // We'll log this for now
            console.warn('[GeminiSSEParser] Unexpected functionResponse in stream:', part.functionResponse);
          }
        }

        // Build delta object
        const delta: Record<string, any> = {};

        if (textContent) {
          delta.content = textContent;
        }

        if (toolCalls.length > 0) {
          delta.tool_calls = toolCalls;
        }

        // Check if this is an empty delta (metadata-only chunk)
        const isEmptyChunk = Object.keys(delta).length === 0;

        if (isEmptyChunk && !candidate.finishReason) {
          // Skip empty chunks without finish_reason
          continue;
        }

        // Build InternalStreamChunk
        chunkCount++;

        const internalChunk: InternalStreamChunk = {
          id: `gemini-${this.eventCount}`,
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: '',
          choices: [{
            index: candidate.index || 0,
            delta,
            finishReason: candidate.finishReason ? this.mapFinishReason(candidate.finishReason) : null,
          }],
        } as InternalStreamChunk;

        // Add usage metadata if present
        if (geminiChunk.usageMetadata) {
          internalChunk.usage = {
            promptTokens: geminiChunk.usageMetadata.promptTokenCount || 0,
            completionTokens: geminiChunk.usageMetadata.candidatesTokenCount || 0,
            totalTokens: geminiChunk.usageMetadata.totalTokenCount || 0,
          };

          // Add cached tokens if present
          if (geminiChunk.usageMetadata.cachedContentTokenCount) {
            internalChunk.usage.promptTokensDetails = {
              cachedTokens: geminiChunk.usageMetadata.cachedContentTokenCount,
            };
          }

          // Add thinking tokens if present (Gemini 2.0 Flash Thinking)
          if (geminiChunk.usageMetadata.thoughtsTokenCount) {
            internalChunk.usage.completionTokensDetails = {
              reasoningTokens: geminiChunk.usageMetadata.thoughtsTokenCount,
            };
          }
        }

        yield internalChunk;

      } catch (error) {
        // Log parsing error but continue processing
        console.error('[GeminiSSEParser] Failed to parse SSE event:', error);
        console.error('[GeminiSSEParser] Raw data:', event.data);
        // Don't throw - continue processing next event
      }
    }
  }

  /**
   * Map Gemini finish reason to OpenAI format
   *
   * Gemini finish reasons: STOP, MAX_TOKENS, SAFETY, RECITATION, OTHER
   * OpenAI finish reasons: stop, length, content_filter, tool_calls, etc.
   */
  private mapFinishReason(reason: string): FinishReason {
    const reasonMap: Record<string, FinishReason> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop',
    };

    return reasonMap[reason] || 'stop';
  }
}
