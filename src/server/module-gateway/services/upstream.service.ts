/**
 * Upstream Service
 *
 * Handles API calls to upstream LLM providers
 * Returns raw SSE text streams for external parsing
 */

import { config } from '../../shared/config';
import { systemConfigService } from '../../module-system/services/system-config.service';
import type { ProtocolTranspiler } from '../../module-protocol-transpiler';
import type { VendorType } from '../../module-protocol-transpiler/interfaces';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// ============================================
// Type Definitions
// ============================================

/**
 * Complete request trace data structure for comprehensive logging
 */
export interface RequestTraceData {
  metadata: {
    requestId: string;
    timestamp: string;
    vendor: string; // 'anthropic', 'openai', 'gemini', etc.
    url: string;
    requestType: 'streaming' | 'non-streaming';
    latency?: number;
    statusCode?: number;
    streamingStats?: {
      totalSSE: number;
      totalParsed: number;
      totalErrors: number;
      totalSent: number;
      emptyChunks: number;
    };
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>; // Sanitized (sensitive info hidden)
    body: Record<string, any>; // Complete request body
  };
  response?: {
    statusCode: number;
    headers: Record<string, string>;
    body: Record<string, any>; // Complete response body
  };
  error?: {
    message: string;
    stack?: string;
  };
}

// ============================================
// Logging Utilities
// ============================================

/**
 * Sanitize headers by hiding sensitive information
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };

  // Hide Authorization headers
  if (sanitized['Authorization']) {
    const auth = sanitized['Authorization'];
    sanitized['Authorization'] = auth.length > 20
      ? auth.slice(0, 20) + '...'
      : auth.slice(0, 5) + '...';
  }

  // Hide x-api-key headers
  if (sanitized['x-api-key']) {
    const key = sanitized['x-api-key'];
    sanitized['x-api-key'] = key.length > 20
      ? key.slice(0, 20) + '...'
      : key.slice(0, 5) + '...';
  }

  return sanitized;
}

/**
 * Log complete request trace to file for debugging and unit testing
 *
 * This is the unified logging function for both streaming and non-streaming requests
 */
export async function logRequestTrace(data: RequestTraceData): Promise<void> {
  const logsDir = join(process.cwd(), 'logs', 'request-traces');

  // Create directory if it doesn't exist
  if (!existsSync(logsDir)) {
    await mkdir(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uuidSuffix = data.metadata.requestId.slice(-6);
  const filename = join(logsDir, `${data.metadata.vendor}-${uuidSuffix}-${timestamp}.json`);

  try {
    await writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[Upstream] Request trace logged to: ${filename}`);
  } catch (error) {
    console.error(`[Upstream] Failed to write request trace:`, error);
  }
}

/**
 * Log complete SSE stream to file for debugging
 * @deprecated Use logRequestTrace instead for unified logging
 */
async function logCompleteSSEStream(
  vendor: string,
  url: string,
  sseData: string,
  summary: { totalSSE: number; totalParsed: number; totalErrors: number },
  requestId?: string // Optional request ID for better tracking
): Promise<void> {
  const logsDir = join(process.cwd(), 'logs', 'request-traces');

  // Create directory if it doesn't exist
  if (!existsSync(logsDir)) {
    await mkdir(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uuidSuffix = requestId ? requestId.slice(-6) : 'no-req-id';
  const filename = join(logsDir, `${vendor}-${uuidSuffix}-${timestamp}.log`);

  const header = requestId
    ? `Request ID: ${requestId} (${uuidSuffix})`
    : `Request ID: Not provided`;

  const content = [
    `=== SSE Stream Log ===`,
    `Timestamp: ${new Date().toISOString()}`,
    header,
    `Vendor: ${vendor}`,
    `URL: ${url}`,
    `Summary: ${JSON.stringify(summary, null, 2)}`,
    ``,
    `=== Raw SSE Data ===`,
    sseData,
    ``,
    `=== End of Log ===`,
  ].join('\n');

  try {
    await writeFile(filename, content, 'utf-8');
    console.log(`[Upstream] SSE stream logged to: ${filename}`);
  } catch (error) {
    console.error(`[Upstream] Failed to write SSE log:`, error);
  }
}

/**
 * Log non-streaming request and response to file for debugging
 * @deprecated Use logRequestTrace instead for unified logging
 */
export async function logNonStreamingRequest(
  vendor: string,
  url: string,
  requestBody: Record<string, any>,
  responseBody: Record<string, any>,
  requestId: string
): Promise<void> {
  // Use the new unified logging function
  await logRequestTrace({
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      vendor,
      url,
      requestType: 'non-streaming',
      statusCode: 200,
    },
    request: {
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ...', // Sanitized
      },
      body: requestBody,
    },
    response: {
      statusCode: 200,
      headers: {},
      body: responseBody,
    },
  });
}

export interface StreamOptions {
  url: string;
  apiKey: string;
  body: Record<string, any>;
}

/**
 * Token usage information
 *
 * All fields use camelCase to match Internal Format
 */
export interface UsageInfo {
  /** Input tokens used */
  promptTokens: number;

  /** Output tokens generated */
  completionTokens: number;

  /** Total tokens used */
  totalTokens: number;

  /** Prompt token details (OpenAI format) */
  promptTokensDetails?: {
    /** Cached tokens (OpenAI) */
    cachedTokens?: number;
  };

  /** Completion token details (OpenAI o1 format) */
  completionTokensDetails?: {
    /** Reasoning tokens (OpenAI o1) */
    reasoningTokens?: number;
    /** Accepted prediction tokens */
    acceptedPredictionTokens?: number;
    /** Rejected prediction tokens */
    rejectedPredictionTokens?: number;
  };

  // === Vendor-specific fields ===

  /** Cache read tokens (Anthropic/Gemini) */
  cacheReadTokens?: number;

  /** Cache write tokens (Anthropic) */
  cacheWriteTokens?: number;

  /** Thinking/reasoning tokens */
  thinkingTokens?: number;
}

export class UpstreamService {
  /**
   * Make a streaming request to upstream API
   *
   * Returns raw SSE text lines (e.g., "data: {...}\n\n")
   * The caller is responsible for parsing the SSE data
   */
  async *streamRequest(options: StreamOptions): AsyncGenerator<string, void, unknown> {
    const { url, apiKey, body } = options;

    console.log('[Upstream] Starting stream request to:', url);

    // Get dynamic timeout from config (default 120s)    
    // For streaming, we DON'T use a total timeout signal because it's too restrictive for long generations.
    // Instead, we rely on the underlying connection and the stream's own lifecycle.
    // The previous AbortSignal.timeout(streamTimeout * 1000) was likely causing the 70s disconnects
    // if the framework or environment has a lower internal threshold.
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'keep-alive',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        ...body,
        stream: true,
      }),
      // signal: AbortSignal.timeout(streamTimeout * 1000), // REMOVED to prevent premature termination
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upstream API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Read and yield raw SSE text lines
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Flush any remaining data in buffer
          if (buffer.trim()) {
            yield buffer;
          }
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.includes('data:')) {
            // Yield complete SSE lines
            yield line + '\n';
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Make a streaming request and parse with protocol transpiler
   *
   * @param options - Stream request options
   * @param transpiler - Protocol transpiler instance
   * @param fromVendor - Source vendor type (e.g., 'openai', 'anthropic', 'gemini')
   * @param toVendor - Target vendor type (default: 'openai' for internal format)
   * @param requestId - Optional request ID for log file naming and tracking
   * @returns Async generator of parsed stream chunks
   */
  async *parseStreamWith(
    options: StreamOptions,
    transpiler: ProtocolTranspiler,
    fromVendor: VendorType,
    toVendor: VendorType = 'openai',
    requestId?: string
  ): AsyncGenerator<any, void, unknown> {
    let rawSSECount = 0;
    let parsedCount = 0;
    let errorCount = 0;
    let emptyChunks = 0;
    let completeSSEData = ''; // Accumulate complete SSE stream for logging

    try {
      for await (const rawSSE of this.streamRequest(options)) {
        rawSSECount++;
        completeSSEData += rawSSE;

        // Extract data from SSE line
        const dataMatch = rawSSE.match(/^data:\s*(.+)\s*$/);
        if (!dataMatch) {
          console.warn('[Upstream] No data match in SSE line:', rawSSE.substring(0, 100));
          continue;
        }

        const data = (dataMatch[1] || '').trim();

        // Skip [DONE] marker
        if (data === '[DONE]') {
          continue;
        }

        // Parse using protocol transpiler
        const result = transpiler.transpileStreamChunk(
          data,
          fromVendor,
          toVendor
        );

        if (result.success) {
          parsedCount++;

          // Count empty chunks
          if (result.data! && '__empty' in result.data! && result.data!.__empty) {
            emptyChunks++;
          }

          // Always yield the result, even if marked as __empty
          // The gateway layer will decide how to handle empty chunks
          // This ensures proper state tracking and allows the gateway to filter if needed
          yield result.data!;
        } else {
          errorCount++;
          console.error(`[Upstream] ✗ Failed to parse chunk #${errorCount}:`, {
            errors: result.errors,
            rawData: data.substring(0, 200),
            fromVendor,
            toVendor,
          });
        }
      }

      // Log complete SSE stream to file (legacy format, kept for compatibility)
      await logCompleteSSEStream(fromVendor, options.url, completeSSEData, {
        totalSSE: rawSSECount,
        totalParsed: parsedCount,
        totalErrors: errorCount,
      }, requestId);

      // Log complete request trace (new unified format)
      if (requestId) {
        await logRequestTrace({
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
            vendor: fromVendor,
            url: options.url,
            requestType: 'streaming',
            streamingStats: {
              totalSSE: rawSSECount,
              totalParsed: parsedCount,
              totalErrors: errorCount,
              totalSent: parsedCount - emptyChunks,
              emptyChunks,
            },
          },
          request: {
            method: 'POST',
            url: options.url,
            headers: sanitizeHeaders({
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${options.apiKey.slice(0, 20)}...`,
            }),
            body: options.body,
          },
        });
      }
    } catch (error: any) {
      console.error('[Upstream] parseStreamWith error:', error);
      // Log SSE data even if there was an error
      if (completeSSEData) {
        await logCompleteSSEStream(fromVendor, options.url, completeSSEData, {
          totalSSE: rawSSECount,
          totalParsed: parsedCount,
          totalErrors: errorCount,
        }, requestId);

        // Log error trace
        if (requestId) {
          await logRequestTrace({
            metadata: {
              requestId,
              timestamp: new Date().toISOString(),
              vendor: fromVendor,
              url: options.url,
              requestType: 'streaming',
              streamingStats: {
                totalSSE: rawSSECount,
                totalParsed: parsedCount,
                totalErrors: errorCount,
                totalSent: parsedCount - emptyChunks,
                emptyChunks,
              },
            },
            request: {
              method: 'POST',
              url: options.url,
              headers: sanitizeHeaders({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.apiKey.slice(0, 20)}...`,
              }),
              body: options.body,
            },
            error: {
              message: error.message,
              stack: error.stack,
            },
          });
        }
      }
      throw error;
    }
  }

  /**
   * Make a non-streaming request to upstream API
   */
  async request(options: StreamOptions): Promise<{
    id?: string;
    choices: any[];
    usage: UsageInfo;
    model: string;
    system_fingerprint?: string;
    created?: number;
  }> {
    const { url, apiKey, body } = options;

    // Get dynamic timeout from config (default 120s)
    const baseTimeout = await systemConfigService.getEffectiveValue<number>('request_timeout') || config.requestTimeout;
    
    // For non-streaming requests, we allow a generous timeout (default 5 minutes)
    // especially for reasoning models that may take a long time to respond
    const timeout = Math.max(baseTimeout, 300);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'keep-alive',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeout * 1000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upstream API error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}

// Export singleton instance
export const upstreamService = new UpstreamService();
