/**
 * Base SSE Parser for Protocol Transpiler
 *
 * Provides common utilities for parsing different vendor SSE streaming formats
 * and converting them to InternalStreamChunk format.
 */

import type { InternalStreamChunk } from '../interfaces/internal-format';

/**
 * Log raw SSE data to file for debugging (server-side only)
 */
async function logRawSSE(vendorFormat: string, data: string, isRaw: boolean = false): Promise<void> {
  // No-op in browser environment
  if (typeof window !== 'undefined') {
    return;
  }
  // Dynamic import for server-side only
  try {
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = join(process.cwd(), 'logs', 'sse-traces', `${vendorFormat}-${timestamp}${isRaw ? '-raw' : ''}.log`);
    await writeFile(filename, data, 'utf-8');
    console.log(`[BaseSSEParser] Logged raw SSE to: ${filename}`);
  } catch (error) {
    console.error(`[BaseSSEParser] Failed to write log:`, error);
  }
}

/**
 * Vendor format type
 */
export enum VendorFormat {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
}

/**
 * Raw SSE event
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * Parser interface
 */
export interface ISSEParser {
  /**
   * Parse SSE stream and yield normalized InternalStreamChunk
   */
  parse(stream: ReadableStream<Uint8Array>): AsyncGenerator<InternalStreamChunk, void, unknown>;

  /**
   * Get the vendor format this parser handles
   */
  getFormat(): VendorFormat;
}

/**
 * Base parser with common utilities
 */
export abstract class BaseSSEParser implements ISSEParser {
  protected chunkCount = 0;
  protected eventCount = 0;

  abstract getFormat(): VendorFormat;
  abstract parse(stream: ReadableStream<Uint8Array>): AsyncGenerator<InternalStreamChunk, void, unknown>;

  /**
   * Read and parse SSE stream into events
   */
  protected async *readSSE(
    stream: ReadableStream<Uint8Array>,
    vendorFormat: string = 'unknown'
  ): AsyncGenerator<SSEEvent, void, unknown> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawBuffer = ''; // Accumulate raw data for logging
    let eventCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        rawBuffer += chunk;

        // Split by double newline to get SSE messages
        const messages = buffer.split(/\n\n/);
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;

          let eventType = '';
          let data = '';

          for (const line of message.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('event:')) {
              eventType = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              data = trimmed.slice(5).trim();
            }
          }

          if (data) {
            eventCount++;
            yield { event: eventType || undefined, data };
          }
        }
      }

      // Log raw SSE data at the end
      if (rawBuffer.length > 0) {
        await logRawSSE(vendorFormat, rawBuffer, true);
        console.log(`[BaseSSEParser] Total events received: ${eventCount}, total bytes: ${rawBuffer.length}`);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Create a basic stream chunk structure
   */
  protected createBaseChunk(
    id: string,
    model: string,
    created: number
  ): InternalStreamChunk {
    return {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {},
        finishReason: null,
      }],
    };
  }

  /**
   * Map Anthropic finish reason to internal format
   */
  protected mapAnthropicFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | null {
    if (!reason) return null;

    const reasonMap: Record<string, 'stop' | 'length' | 'tool_calls'> = {
      'end_turn': 'stop',
      'max_tokens': 'length',
      'tool_use': 'tool_calls',
      'stop_sequence': 'stop',
    };

    return reasonMap[reason] || 'stop';
  }

  /**
   * Reset counters for a new parse session
   */
  protected resetCounters(): void {
    this.chunkCount = 0;
    this.eventCount = 0;
  }

  /**
   * Log chunk generation progress
   * Logs every 50 chunks to avoid excessive logging
   */
  protected logProgress(_chunkType: string): void {
    this.chunkCount++;
    // Progress logging disabled for production
  }

  /**
   * Log parse session summary
   */
  protected logSummary(_vendorFormat: string): void {
    // Summary logging disabled for production
  }
}
