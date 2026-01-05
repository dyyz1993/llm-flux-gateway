import { useRef, useCallback } from 'react';
import type { ToolCall, Message } from '@shared/types';
import type { ApiFormat } from '@client/services/protocolTranspiler';

interface StreamOptions {
  apiKey: string;
  model: string;
  messages: Message[];
  tools?: any[];
  // Optional: Use pre-built request body in specific format
  requestBody?: any;
  requestFormat?: ApiFormat;
  onChunk: (content: string, toolCalls?: ToolCall[]) => void;
  onError: (error: string) => void;
  onComplete?: (tokens: { prompt: number; completion: number }) => void;
}

interface StreamResult {
  stream: (options: StreamOptions) => Promise<void>;
  cancel: () => void;
  isLoading: boolean;
}

/**
 * Hook for managing streaming chat requests
 */
export function useChatStream(): StreamResult {
  const abortControllerRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false);

  const stream = useCallback(async (options: StreamOptions) => {
    const { apiKey, model, messages, tools, requestBody, requestFormat, onChunk, onError, onComplete } = options;

    isLoadingRef.current = true;
    abortControllerRef.current = new AbortController();

    // Build request body
    const body = requestBody || {
      model,
      messages,
      stream: true,
      // Always send tools, let LLM decide whether to use them
      tools: tools && tools.length > 0 ? tools : undefined,
    };

    // Determine endpoint and headers based on format
    const endpoint = '/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    // Add format header if specified
    if (requestFormat && requestFormat !== 'openai') {
      headers['X-Request-Format'] = requestFormat;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let promptTokens = 0;
      let completionTokens = 0;
      const accumulatedToolCalls: Map<number, ToolCall> = new Map();
      const notifiedToolCalls = new Set<string | number>(); // Track which tool calls we've notified

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // Check for error in stream
              if (parsed.error) {
                throw new Error(parsed.error.message || 'Upstream error');
              }

              // Handle content delta
              if (parsed.choices?.[0]?.delta?.content) {
                onChunk(parsed.choices[0].delta.content, Array.from(accumulatedToolCalls.values()));
              }

              // Handle tool_calls
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                const newToolCalls = parsed.choices[0].delta.tool_calls;
                let shouldNotify = false;

                newToolCalls.forEach((newCall: ToolCall) => {
                  const index = newCall.index ?? accumulatedToolCalls.size;
                  const existing = accumulatedToolCalls.get(index);

                  if (!existing) {
                    // New tool call - add to accumulated and mark for notification
                    accumulatedToolCalls.set(index, { ...newCall, index });
                    shouldNotify = true;
                  } else if (newCall.function?.arguments) {
                    // Existing tool call - just accumulate arguments
                    existing.function.arguments += newCall.function.arguments;
                  }
                });

                // Only notify once when we first see tool calls, not on every chunk
                if (shouldNotify && !notifiedToolCalls.has('initial')) {
                  notifiedToolCalls.add('initial');
                  onChunk('', Array.from(accumulatedToolCalls.values()));
                }
              }

              // Handle usage
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens || promptTokens;
                completionTokens = parsed.usage.completion_tokens || completionTokens;
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'Unexpected token' && !e.message.includes('JSON')) {
                throw e;
              }
            }
          }
        }
      }

      // Call onComplete after stream finishes
      if (onComplete) {
        onComplete({ prompt: promptTokens, completion: completionTokens });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        onError('Request was cancelled');
      } else {
        onError(e.message || 'Unknown error occurred');
      }
    } finally {
      isLoadingRef.current = false;
      abortControllerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      isLoadingRef.current = false;
    }
  }, []);

  return {
    stream,
    cancel,
    get isLoading() {
      return isLoadingRef.current;
    },
  };
}
