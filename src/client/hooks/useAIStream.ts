/**
 * AI Stream Hook using Native SDKs
 *
 * Provides unified streaming interface for OpenAI, Anthropic, and Gemini
 * using native SDKs (not Vercel AI SDK).
 *
 * Similar to Python: from openai import OpenAI; import anthropic
 */

import { useCallback, useRef, useState } from 'react';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Message, ToolCall } from '@shared/types';
import { Role } from '@shared/types';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

interface StreamOptions {
  apiKey: string;
  model: string;
  messages: Message[];
  provider?: AIProvider;
  baseURL?: string;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  onChunk: (content: string, toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>) => void;
  onError: (error: string) => void;
  onComplete?: (tokens: { prompt: number; completion: number }) => void;
}

interface StreamResult {
  stream: (options: StreamOptions) => Promise<void>;
  request: (options: Omit<StreamOptions, 'onChunk'>) => Promise<{ content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } }>;
  cancel: () => void;
  isLoading: boolean;
}

// Helper function to convert ToolCall[] to the format expected by onChunk
function toToolCallsArray(toolCalls: ToolCall[]): Array<{
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}> {
  return toolCalls.map(tc => ({
    id: tc.id || '',
    type: 'function' as const,
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }));
}

/**
 * Hook for managing streaming AI requests using native SDKs
 */
export function useAIStream(): StreamResult {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef<number>(0);

  const stream = useCallback(async (options: StreamOptions) => {
    const {
      apiKey,
      model,
      messages,
      provider = 'openai',
      baseURL = window.location.origin + '/v1',
      tools,
      onChunk,
      onError,
      onComplete,
    } = options;

    // 🔒 防止并发：如果有正在进行的请求，取消它
    if (isLoading || abortControllerRef.current) {
      console.warn('[useAIStream] Cancelling previous request due to new request');
      abortControllerRef.current?.abort();
    }

    // 生成新的请求 ID
    const currentRequestId = ++requestIdRef.current;

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      switch (provider) {
        case 'openai':
          await streamOpenAI({
            apiKey,
            model,
            messages,
            baseURL,
            tools,
            onChunk,
            onError,
            onComplete,
            abortSignal: abortControllerRef.current.signal,
          });
          break;

        case 'anthropic':
          await streamAnthropic({
            apiKey,
            model,
            messages,
            baseURL,
            tools,
            onChunk,
            onError,
            onComplete,
            abortSignal: abortControllerRef.current.signal,
          });
          break;

        case 'gemini':
          await streamGemini({
            apiKey,
            model,
            messages,
            baseURL,
            tools,
            onChunk,
            onError,
            onComplete,
            abortSignal: abortControllerRef.current.signal,
          });
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

    } catch (e: unknown) {
      // 🔒 验证这是当前请求（不是已取消的请求）
      if (currentRequestId !== requestIdRef.current) {
        console.warn('[useAIStream] Request superseded, ignoring error');
        return;
      }

      if (e instanceof Error && e.name === 'AbortError') {
        // 被取消的请求不显示错误
        return;
      } else {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
        onError(errorMessage);
      }
    } finally {
      // 🔒 只有当前请求才重置状态
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [isLoading, setIsLoading]);

  const request = useCallback(async (options: Omit<StreamOptions, 'onChunk'>) => {
    const {
      apiKey,
      model,
      messages,
      provider = 'openai',
      baseURL = window.location.origin + '/v1',
      tools,
      onError,
    } = options;

    // 🔒 防止并发：如果有正在进行的请求，取消它
    if (isLoading || abortControllerRef.current) {
      console.warn('[useAIStream] Cancelling previous request due to new request');
      abortControllerRef.current?.abort();
    }

    // 生成新的请求 ID
    const currentRequestId = ++requestIdRef.current;

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      let result: { content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } };

      switch (provider) {
        case 'openai':
          result = await requestOpenAI({
            apiKey,
            model,
            messages,
            baseURL,
            tools,
            abortSignal: abortControllerRef.current.signal,
          });
          break;

        case 'anthropic':
          result = await requestAnthropic({
            apiKey,
            model,
            messages,
            baseURL,
            tools,
            abortSignal: abortControllerRef.current.signal,
          });
          break;

        case 'gemini':
          result = await requestGemini({
            apiKey,
            model,
            messages,
            tools,
            abortSignal: abortControllerRef.current.signal,
          });
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      return result;

    } catch (e: unknown) {
      // 🔒 验证这是当前请求（不是已取消的请求）
      if (currentRequestId !== requestIdRef.current) {
        console.warn('[useAIStream] Request superseded, ignoring error');
        throw new Error('Request superseded');
      }

      if (e instanceof Error && e.name === 'AbortError') {
        // 被取消的请求不显示错误
        throw new Error('Request cancelled');
      } else {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
        onError(errorMessage);
        throw e;
      }
    } finally {
      // 🔒 只有当前请求才重置状态
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [isLoading]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [setIsLoading]);

  return {
    stream,
    request,
    cancel,
    isLoading,
  };
}

// ==========================================
// OpenAI Streaming
// ==========================================

async function streamOpenAI(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  onChunk: StreamOptions['onChunk'];
  onError: StreamOptions['onError'];
  onComplete?: StreamOptions['onComplete'];
  abortSignal?: AbortSignal;
}) {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    dangerouslyAllowBrowser: true,
  });

  const coreMessages = params.messages.map(msg => ({
    role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
    content: msg.content || '',
  }));

  // Convert tools to OpenAI format
  const openAITools = params.tools?.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }));

  const stream = await client.chat.completions.create({
    model: params.model,
    messages: coreMessages,
    tools: openAITools,
    stream: true,
  } as any);

  // Accumulate tool calls across chunks
  const accumulatedToolCalls = new Map<number, ToolCall>();
  let completed = false; // 🔒 防止 onComplete 重复调用

  for await (const chunk of stream as any) {
    const content = chunk.choices[0]?.delta?.content;
    const toolCalls = chunk.choices[0]?.delta?.tool_calls;

    // Handle content delta
    if (content) {
      params.onChunk(content, toToolCallsArray(Array.from(accumulatedToolCalls.values())));
    }

    // Handle tool_calls
    if (toolCalls) {
      toolCalls.forEach((newCall: any) => {
        const index = newCall.index ?? accumulatedToolCalls.size;
        const existing = accumulatedToolCalls.get(index);

        if (!existing) {
          accumulatedToolCalls.set(index, {
            id: newCall.id,
            type: 'function',
            function: {
              name: newCall.function?.name || '',
              arguments: newCall.function?.arguments || '',
            },
            index,
          });
        } else if (newCall.function?.arguments) {
          existing.function.arguments += newCall.function.arguments;
        }
      });

      // Notify about tool calls even if no content
      params.onChunk('', toToolCallsArray(Array.from(accumulatedToolCalls.values())));
    }

    // Handle completion
    if (chunk.choices[0]?.finish_reason && !completed) {
      completed = true; // 🔒 设置标志

      if (chunk.usage && params.onComplete) {
        params.onComplete({
          prompt: chunk.usage.prompt_tokens || 0,
          completion: chunk.usage.completion_tokens || 0,
        });
      }
    }
  }
}

// ==========================================
// Anthropic Streaming
// ==========================================

async function streamAnthropic(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  onChunk: StreamOptions['onChunk'];
  onError: StreamOptions['onError'];
  onComplete?: StreamOptions['onComplete'];
  abortSignal?: AbortSignal;
}) {
  // Check if we're talking to our own gateway (localhost or same origin)
  const isGateway = params.baseURL.includes('localhost') || params.baseURL.includes(window.location.hostname);

  if (isGateway) {
    // Use native fetch for our gateway (SDKs don't work well with custom auth)
    await streamAnthropicNative(params);
  } else {
    // Use Anthropic SDK for direct API calls
    await streamAnthropicSDK(params);
  }
}

// Stream using native fetch (for our gateway)
async function streamAnthropicNative(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  onChunk: StreamOptions['onChunk'];
  onError: StreamOptions['onError'];
  onComplete?: StreamOptions['onComplete'];
  abortSignal?: AbortSignal;
}) {
  // Build Anthropic-format request
  const systemMessages = params.messages.filter(m => m.role === Role.SYSTEM);
  const conversationMessages = params.messages.filter(m => m.role !== Role.SYSTEM);

  const requestBody = {
    model: params.model,
    system: systemMessages.map(m => m.content || '').join('\n') || undefined,
    messages: conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || '',
    })),
    tools: params.tools?.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    })),
    max_tokens: 4096,
    stream: true,
  };

  const response = await fetch('/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
      'X-Request-Format': 'anthropic',
    },
    body: JSON.stringify(requestBody),
    signal: params.abortSignal,
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

  const accumulatedToolCalls = new Map<number, ToolCall>();
  let buffer = '';
  let currentEvent = '';
  let completed = false; // 🔒 防止 onComplete 重复调用

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      // Parse event type
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      // Parse data
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          // Handle content_block_start (tool_use initialization)
          if (currentEvent === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            const index = parsed.index ?? accumulatedToolCalls.size;
            accumulatedToolCalls.set(index, {
              id: parsed.content_block.id,
              type: 'function',
              function: {
                name: parsed.content_block.name,
                arguments: '',
              },
              index,
            });
          }

          // Handle content_block_delta (text or tool arguments)
          if (currentEvent === 'content_block_delta') {
            if (parsed.delta?.type === 'text_delta') {
              // Text content
              params.onChunk(parsed.delta.text, toToolCallsArray(Array.from(accumulatedToolCalls.values())));
            } else if (parsed.delta?.type === 'input_json_delta') {
              // Tool arguments
              const index = parsed.index;
              const existing = accumulatedToolCalls.get(index);
              if (existing && parsed.delta.partial_json) {
                existing.function.arguments += parsed.delta.partial_json;
              }
              params.onChunk('', toToolCallsArray(Array.from(accumulatedToolCalls.values())));
            }
          }

          // Handle message_delta (completion)
          if (currentEvent === 'message_delta' && parsed.delta?.stop_reason && !completed && params.onComplete) {
            completed = true; // 🔒 设置标志
            params.onComplete({
              prompt: parsed.usage?.input_tokens || 0,
              completion: parsed.usage?.output_tokens || 0,
            });
          }
        } catch (e) {
          // Ignore JSON parse errors for incomplete chunks
        }
      }
    }
  }
}

// Stream using Anthropic SDK (for direct API calls)
async function streamAnthropicSDK(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  onChunk: StreamOptions['onChunk'];
  onError: StreamOptions['onError'];
  onComplete?: StreamOptions['onComplete'];
  abortSignal?: AbortSignal;
}) {
  // Remove /v1 from baseURL since Anthropic SDK will append /messages
  const anthropicBaseURL = params.baseURL.replace(/\/v1$/, '');

  const client = new Anthropic({
    apiKey: params.apiKey,
    baseURL: anthropicBaseURL, // SDK will append /messages to get /v1/messages
    dangerouslyAllowBrowser: true,
  });

  // Convert tools to Anthropic format
  const anthropicTools = params.tools?.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));

  // Convert messages to Anthropic format
  const systemMessages = params.messages.filter(m => m.role === Role.SYSTEM);
  const conversationMessages = params.messages.filter(m => m.role !== Role.SYSTEM);

  const stream = await client.messages.stream({
    model: params.model,
    system: systemMessages.map(m => m.content || '').join('\n') || undefined,
    messages: conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || '',
    })),
    tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools as any : undefined,
    max_tokens: 4096,
  } as any);

  // Accumulate tool calls across chunks
  const accumulatedToolCalls = new Map<number, ToolCall>();
  let completed = false; // 🔒 防止 onComplete 重复调用

  for await (const chunk of stream as any) {
    if (chunk.type === 'content_block_start') {
      // Initialize tool use block
      if (chunk.content_block?.type === 'tool_use') {
        const index = chunk.index;
        const toolCall: ToolCall = {
          id: chunk.content_block.id,
          type: 'function',
          function: {
            name: chunk.content_block.name,
            arguments: '',
          },
          index,
        };
        accumulatedToolCalls.set(index, toolCall);
      }
    } else if (chunk.type === 'content_block_delta') {
      const delta = chunk.delta;

      if (delta?.type === 'text_delta') {
        // Handle text content
        params.onChunk(delta.text, toToolCallsArray(Array.from(accumulatedToolCalls.values())));
      } else if (delta?.type === 'input_json_delta') {
        // Handle tool arguments
        const index = chunk.index;
        const existing = accumulatedToolCalls.get(index);
        if (existing && delta.partial_json) {
          existing.function.arguments += delta.partial_json;
        }

        // Notify about tool calls even if no content
        params.onChunk('', toToolCallsArray(Array.from(accumulatedToolCalls.values())));
      }
    } else if (chunk.type === 'message_delta') {
      if (chunk.delta?.stop_reason === 'end_turn' && !completed && chunk.usage && params.onComplete) {
        completed = true; // 🔒 设置标志
        params.onComplete({
          prompt: chunk.usage.input_tokens || 0,
          completion: chunk.usage.output_tokens || 0,
        });
      }
    }
  }
}

// ==========================================
// Gemini Streaming
// ==========================================

async function streamGemini(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  onChunk: StreamOptions['onChunk'];
  onError: StreamOptions['onError'];
  onComplete?: StreamOptions['onComplete'];
  abortSignal?: AbortSignal;
}) {
  const client = new GoogleGenerativeAI(params.apiKey);

  // Convert messages to Gemini format
  const geminiMessages = params.messages.map(msg => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    return {
      role,
      parts: [{ text: msg.content || '' }],
    };
  });

  const result = await (client as any).generateContentStream({
    model: params.model,
    contents: geminiMessages,
  });

  // Note: Gemini's SDK doesn't support streaming function calls the same way as OpenAI/Anthropic
  // Function calls are returned as complete objects, not streamed incrementally
  const accumulatedToolCalls: ToolCall[] = [];

  for await (const chunk of result.stream) {
    if (chunk.text) {
      params.onChunk(chunk.text(), toToolCallsArray(accumulatedToolCalls));
    }

    // Check for function calls in the response
    // Note: This is a simplified implementation as Gemini's streaming support for function calls is limited
    const functionCalls = (chunk as any).functionCalls;
    if (functionCalls && Array.isArray(functionCalls)) {
      functionCalls.forEach((fc: any, index: number) => {
        accumulatedToolCalls.push({
          id: `gemini-${Date.now()}-${index}`,
          type: 'function',
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args || {}),
          },
        });
      });

      // Notify about tool calls
      params.onChunk('', toToolCallsArray(accumulatedToolCalls));
    }

    if (chunk.usage && params.onComplete) {
      // Gemini sends usage in a different chunk
      const promptTokens = chunk.usage?.promptTokenCount || 0;
      const completionTokens = chunk.usage?.candidatesTokenCount || 0;
      params.onComplete({
        prompt: promptTokens,
        completion: completionTokens,
      });
    }
  }
}

// ==========================================
// OpenAI Non-Streaming
// ==========================================

async function requestOpenAI(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  abortSignal?: AbortSignal;
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } }> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    dangerouslyAllowBrowser: true,
  });

  const coreMessages = params.messages.map(msg => ({
    role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
    content: msg.content || '',
  }));

  // Convert tools to OpenAI format
  const openAITools = params.tools?.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }));

  const response = await client.chat.completions.create({
    model: params.model,
    messages: coreMessages,
    tools: openAITools,
    stream: false,
  } as any);

  // Extract content
  // 🔧 FIX: GLM API returns content as array when there are tool_calls (Anthropic format)
  // Standard OpenAI format should have content as string/null
  const rawContent = response.choices[0]?.message?.content;
  let content = '';

  if (Array.isArray(rawContent)) {
    // GLM API returns array format for tool calls - use empty string as content
    content = '';
  } else if (typeof rawContent === 'string') {
    content = rawContent;
  } else {
    content = rawContent || '';
  }

  // Extract tool calls
  // GLM API uses camelCase "toolCalls", standard OpenAI uses snake_case "tool_calls"
  const messageData = response.choices[0]?.message as any;
  const toolCallsData = messageData?.tool_calls || messageData?.toolCalls;
  const toolCalls: ToolCall[] = [];

  if (toolCallsData && Array.isArray(toolCallsData)) {
    toolCallsData.forEach((tc: any, index: number) => {
      toolCalls.push({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function?.name || tc.name,
          arguments: tc.function?.arguments || tc.arguments,
        },
        index,
      });
    });
  }

  // Extract tokens
  const tokens = response.usage ? {
    prompt: response.usage.prompt_tokens || 0,
    completion: response.usage.completion_tokens || 0,
  } : undefined;

  return { content, toolCalls, tokens };
}

// ==========================================
// Anthropic Non-Streaming
// ==========================================

async function requestAnthropic(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  abortSignal?: AbortSignal;
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } }> {
  // Check if we're talking to our own gateway (localhost or same origin)
  const isGateway = params.baseURL.includes('localhost') || params.baseURL.includes(window.location.hostname);

  if (isGateway) {
    // Use native fetch for our gateway
    return await requestAnthropicNative(params);
  } else {
    // Use Anthropic SDK for direct API calls
    return await requestAnthropicSDK(params);
  }
}

// Non-streaming using native fetch (for our gateway)
async function requestAnthropicNative(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  abortSignal?: AbortSignal;
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } }> {
  // Build Anthropic-format request
  const systemMessages = params.messages.filter(m => m.role === Role.SYSTEM);
  const conversationMessages = params.messages.filter(m => m.role !== Role.SYSTEM);

  const requestBody = {
    model: params.model,
    system: systemMessages.map(m => m.content || '').join('\n') || undefined,
    messages: conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || '',
    })),
    tools: params.tools?.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    })),
    max_tokens: 4096,
    stream: false,
  };

  const response = await fetch('/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
      'X-Request-Format': 'anthropic',
    },
    body: JSON.stringify(requestBody),
    signal: params.abortSignal,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  // Extract content from Anthropic response
  let content = '';
  const toolCalls: ToolCall[] = [];

  if (data.content) {
    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
          index: toolCalls.length,
        });
      }
    }
  }

  // Extract tokens
  const tokens = data.usage ? {
    prompt: data.usage.input_tokens || 0,
    completion: data.usage.output_tokens || 0,
  } : undefined;

  return { content, toolCalls, tokens };
}

// Non-streaming using Anthropic SDK (for direct API calls)
async function requestAnthropicSDK(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  baseURL: string;
  tools?: StreamOptions['tools'];
  abortSignal?: AbortSignal;
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } }> {
  // Remove /v1 from baseURL since Anthropic SDK will append /messages
  const anthropicBaseURL = params.baseURL.replace(/\/v1$/, '');

  const client = new Anthropic({
    apiKey: params.apiKey,
    baseURL: anthropicBaseURL,
    dangerouslyAllowBrowser: true,
  });

  // Convert tools to Anthropic format
  const anthropicTools = params.tools?.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));

  // Convert messages to Anthropic format
  const systemMessages = params.messages.filter(m => m.role === Role.SYSTEM);
  const conversationMessages = params.messages.filter(m => m.role !== Role.SYSTEM);

  const response = await client.messages.create({
    model: params.model,
    system: systemMessages.map(m => m.content || '').join('\n') || undefined,
    messages: conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || '',
    })),
    tools: anthropicTools?.length ? anthropicTools as any : undefined,
    max_tokens: 4096,
  } as any);

  // Extract content from Anthropic response
  let content = '';
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
        index: toolCalls.length,
      });
    }
  }

  // Extract tokens
  const tokens = {
    prompt: response.usage.input_tokens || 0,
    completion: response.usage.output_tokens || 0,
  };

  return { content, toolCalls, tokens };
}

// ==========================================
// Gemini Non-Streaming
// ==========================================

async function requestGemini(params: {
  apiKey: string;
  model: string;
  messages: Message[];
  tools?: StreamOptions['tools'];
  abortSignal?: AbortSignal;
}): Promise<{ content: string; toolCalls?: ToolCall[]; tokens?: { prompt: number; completion: number } }> {
  const client = new GoogleGenerativeAI(params.apiKey);

  // Convert messages to Gemini format
  const geminiMessages = params.messages.map(msg => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    return {
      role,
      parts: [{ text: msg.content || '' }],
    };
  });

  const result = await (client as any).generateContent({
    model: params.model,
    contents: geminiMessages,
  });

  const response = result.response;

  // Extract content
  const content = response.text() || '';

  // Extract function calls
  const toolCalls: ToolCall[] = [];
  const functionCalls = response.functionCalls();
  if (functionCalls && functionCalls.length > 0) {
    functionCalls.forEach((fc: any, index: number) => {
      toolCalls.push({
        id: `gemini-${Date.now()}-${index}`,
        type: 'function',
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args || {}),
        },
        index,
      });
    });
  }

  // Extract tokens (Gemini provides usage info in the response)
  const tokens = response.usage ? {
    prompt: response.usage.promptTokenCount || 0,
    completion: response.usage.candidatesTokenCount || 0,
  } : undefined;

  return { content, toolCalls, tokens };
}
