/**
 * Anthropic Format Converter
 *
 * Handles conversion between OpenAI and Anthropic API formats.
 *
 * Key differences:
 * - Anthropic requires max_tokens (default to 4096)
 * - System prompt is a separate field, not in messages array
 * - Anthropic uses "user" and "assistant" roles (no "system" in messages)
 * - Tool format is different (tool_use -> tool_choice)
 * - Response format uses content blocks instead of direct content
 *
 * Extended to support:
 * - Extended Thinking (thinking parameter in request)
 * - thinking blocks in response
 * - Cache tokens (cache_read_tokens, cache_write_tokens)
 *
 * Field Normalization:
 * - Uses field-normalizer for all field name conversions
 * - Tool schema properties are preserved as-is (not normalized)
 */

import type {
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalMessage,
  InternalToolCall,
  InternalContentBlock,
  TextContentBlock,
} from '../interfaces/internal-format';
import type {
  FormatConverter,
  ValidationResult,
} from '../interfaces/format-converter';
import type { TranspileResult, TranspileMetadata, ConversionOptions } from '../core/transpile-result';
import type { VendorType } from '../interfaces/vendor-types';
import { success, failure, createError, createWarning } from '../core/transpile-result';
import { normalizeToCamelCase, normalizeToSnakeCase } from '../utils/field-normalizer';

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic Format Converter
 *
 * Converts between OpenAI internal format and Anthropic API format.
 */
export class AnthropicConverter implements FormatConverter {
  readonly vendorType: VendorType = 'anthropic';

  // Stream state management for SSE conversion
  private streamState = new Map<string, {
    messageId: string;
    model: string;
    created: number;
    pendingToolCalls: Map<number, Partial<InternalToolCall>>;
    // Track if content_block_start has been sent for this stream
    contentBlockStarted: boolean;
    // Track if tool_use block has been started for each index
    toolUseBlockStarted: Map<number, boolean>;
  }>();

  // ==========================================
  // Request Conversion (Internal -> Anthropic)
  // ==========================================

  convertRequestFromInternal(
    request: InternalRequest
  ): TranspileResult<Record<string, unknown>> {
    const startTime = Date.now();
    const _warnings: ReturnType<typeof createWarning>[] = [];

    // Extract system message from messages array or request.system field
    let systemPrompt: string | undefined;
    let systemBlocks: Array<{ type: string; text: string; cache_control?: { type: string } }> | undefined;
    const messages: InternalMessage[] = [];
    const toolResults: Array<{ tool_use_id: string; content: string; type: 'tool_result'; is_error?: boolean; content_started?: boolean }> = [];

    // First check if there's a system field at the top level
    // Support both vendorSpecific.system and direct system field (for backward compatibility)
    const system = request.system || request.vendorSpecific?.system;
    if (system) {
      if (Array.isArray(system)) {
        // System is an array of blocks
        systemBlocks = system.map((block: unknown): { type: string; text: string; cache_control?: { type: string } } => {
          if (typeof block === 'string') {
            return { type: 'text', text: block };
          } else if (block && typeof block === 'object') {
            // Use field-normalizer to convert cacheControl to cache_control
            const normalizedBlock = normalizeToSnakeCase(block, true);
            const blockRec = normalizedBlock as Record<string, unknown>;
            return {
              type: String(blockRec.type || 'text'),
              text: blockRec.type === 'text' ? String(blockRec.text || blockRec.content || '') : '',
              ...((blockRec.cache_control as any) && { cache_control: blockRec.cache_control }),
            };
          }
          return { type: 'text', text: String(block) };
        });
      } else if (typeof system === 'string') {
        systemPrompt = system;
      }
    }

    // Then process messages array
    for (const msg of request.messages) {
      if (msg.role === 'system') {
        // Handle system prompt as array to support cache_control
        const content = msg.content;

        // Check if content is an array with cache_control blocks
        if (Array.isArray(content)) {
          systemBlocks = content.map((block): { type: string; text: string; cache_control?: { type: string } } => {
            if (typeof block === 'string') {
              return { type: 'text', text: block };
            } else if (block && typeof block === 'object') {
              // Use field-normalizer to convert cacheControl to cache_control
              const normalizedBlock = normalizeToSnakeCase(block, true);
              const blockRec = normalizedBlock as Record<string, unknown>;
              return {
                type: String(blockRec.type || 'text'),
                text: blockRec.type === 'text' ? String(blockRec.text || '') : '',
                ...((blockRec.cache_control as any) && { cache_control: blockRec.cache_control }),
              };
            }
            return { type: 'text', text: String(block) };
          });
        } else if (typeof content === 'string') {
          systemPrompt = content;
        }
      } else if (msg.role === 'tool') {
        // Handle tool role messages - convert to tool_result content blocks
        // In Anthropic format, tool results are embedded in the user message that follows
        const toolResultContent = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);

        // Try to get tool_use_id from various possible fields
        // OpenAI format uses tool_call_id, internal format uses toolCallId
        // If neither exists, use a placeholder (this shouldn't happen in well-formed requests)
        const toolUseId = msg.toolCallId || (msg as unknown as Record<string, unknown>).tool_call_id as string | undefined || msg.name || `unknown_${toolResults.length}`;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: toolResultContent,
        });
      } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // Handle assistant messages with array content (e.g., from GLM conversion)
        const textParts: string[] = [];
        const orderedContentBlocks: Record<string, unknown>[] = [];

        for (const block of msg.content) {
          if (typeof block === 'string') {
            textParts.push(block);
          } else if (block && typeof block === 'object') {
            // Use field-normalizer to preserve cache_control
            const normalizedBlock = normalizeToSnakeCase(block, true);
            // Preserve thinking blocks in assistant messages
            if (normalizedBlock.type === 'thinking') {
              const thinkingBlock: Record<string, unknown> = {
                type: 'thinking',
                thinking: normalizedBlock.thinking ? String(normalizedBlock.thinking) : (normalizedBlock.content ? String(normalizedBlock.content) : ''),
              };
              if (normalizedBlock.signature) {
                thinkingBlock.signature = normalizedBlock.signature;
              }
              orderedContentBlocks.push(thinkingBlock);
            }
            // Preserve cache_control blocks
            else if (normalizedBlock.type === 'cache_control') {
              orderedContentBlocks.push({
                type: 'cache_control',
                cache_control: normalizedBlock.cache_control || { type: 'ephemeral' },
              });
            }
            // Preserve tool_use blocks
            else if (normalizedBlock.type === 'tool_use') {
              const toolUseBlock = {
                type: 'tool_use',
                id: normalizedBlock.id,
                name: normalizedBlock.name,
                input: normalizedBlock.input,
              } as Record<string, unknown>;
              if (normalizedBlock.cache_control) {
                toolUseBlock.cache_control = normalizedBlock.cache_control;
              }
              orderedContentBlocks.push(toolUseBlock);
            }
            // Handle text blocks
            else if (normalizedBlock.type === 'text' && normalizedBlock.text) {
              orderedContentBlocks.push({
                type: 'text',
                text: String(normalizedBlock.text),
              });
            } else if (normalizedBlock.type === 'content' && normalizedBlock.text) {
              textParts.push(String(normalizedBlock.text));
            } else if (normalizedBlock.text) {
              textParts.push(String(normalizedBlock.text));
            } else if (normalizedBlock.content && typeof normalizedBlock.content === 'string') {
              textParts.push(normalizedBlock.content);
            }
          }
        }

        // If we have structured blocks (thinking/cache_control/tool_use), use array format
        if (orderedContentBlocks.length > 0) {
          const finalContent: any[] = [];

          // Add all structured blocks in their original order
          for (const block of orderedContentBlocks) {
            finalContent.push(block);
          }

          // Add any remaining text content that wasn't already added as a text block
          if (textParts.length > 0) {
            finalContent.push({
              type: 'text',
              text: textParts.join('\n'),
            });
          }

          messages.push({
            role: msg.role,
            content: finalContent,
            ...(msg.toolCalls && { tool_calls: msg.toolCalls }),
            name: msg.name,
            ...(msg.toolCallId && { tool_call_id: msg.toolCallId }),
          });
        } else {
          // No structured blocks, use simple text format
          const messageContent: string | InternalContentBlock[] = textParts.length > 0 ? textParts.join('\n') : [];
          messages.push({
            role: msg.role,
            content: messageContent as string | InternalContentBlock[],
            ...(msg.toolCalls && { tool_calls: msg.toolCalls }),
            name: msg.name,
            ...(msg.toolCallId && { tool_call_id: msg.toolCallId }),
          });
        }
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        // Handle user messages with array content - use field-normalizer
        const processedContent = msg.content.map(block => {
          if (typeof block === 'string') {
            return block;
          } else if (block && typeof block === 'object') {
            // Use field-normalizer to convert cacheControl to cache_control
            return normalizeToSnakeCase(block, true);
          }
          return block;
        });

        messages.push({
          ...msg,
          content: processedContent as InternalContentBlock[],
        });
      } else {
        messages.push(msg);
      }
    }

    // Now we need to merge tool results into the message structure
    // Anthropic format: tool results should be in user messages AFTER assistant messages
    if (toolResults.length > 0) {
      const newMessages: InternalMessage[] = [];

      // Iterate through messages and insert tool results after assistant messages
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;
        newMessages.push(msg);

        // If this is an assistant message and we have tool results left,
        // check if the next message in the original sequence would be a tool result
        // We determine this by checking if this assistant has tool_calls
        const msgToolCalls = (msg as unknown as Record<string, unknown>).tool_calls as InternalToolCall[] | undefined;
        const hasToolCalls = (msgToolCalls && msgToolCalls.length > 0) ||
                            (msg.toolCalls && msg.toolCalls.length > 0);

        if (msg.role === 'assistant' && hasToolCalls && toolResults.length > 0) {
          // Extract tool results that belong to this assistant
          // Each tool call should have one corresponding tool result
          const toolCallCount = (msgToolCalls?.length || msg.toolCalls?.length || 1);
          const resultsForThisAssistant = toolResults.splice(0, toolCallCount);

          if (resultsForThisAssistant.length > 0) {
            // Check if there's already a user message after this assistant
            const nextMsg = messages[i + 1];
            if (nextMsg && nextMsg.role === 'user') {
              // Next message is user - merge tool results into it
              const nextUserMsg = nextMsg;
              if (!Array.isArray(nextUserMsg.content)) {
                const contentValue = nextUserMsg.content;
                nextUserMsg.content = [{
                  type: 'text',
                  text: typeof contentValue === 'string' ? contentValue : ''
                }];
              }
              const contentArray = Array.isArray(nextUserMsg.content) ? nextUserMsg.content : [];
              contentArray.push(...resultsForThisAssistant);
              // Skip the next user message since we already added it
              i++;
            } else {
              // No user message after assistant - create one with tool results
              newMessages.push({
                role: 'user',
                content: resultsForThisAssistant,
              });
            }
          }
        }
      }

      // If there are leftover tool results, add them as a new user message
      if (toolResults.length > 0) {
        newMessages.push({
          role: 'user',
          content: toolResults,
        });
      }

      // Replace messages with the new array
      messages.length = 0;
      messages.push(...newMessages);
    }

    // Convert tools to Anthropic format
    const tools = request.tools?.map(tool => {
      // Handle both OpenAI format (tool.function.name) and Responses API format (tool.name)
      const functionName = tool.function?.name || tool.name;
      const description = tool.function?.description || tool.description || '';
      const parameters = tool.function?.parameters || tool.parameters || { type: 'object', properties: {} };

      if (!functionName) {
        _warnings.push(createWarning('tools', 'Tool missing name, skipping', 'MISSING_REQUIRED_FIELD' as const));
        return null;
      }

      // Tool schema properties are preserved as-is (field-normalizer protects them)
      return {
        name: functionName,
        description,
        input_schema: parameters,
      };
    }).filter(Boolean);

    // Convert tool_choice
    let tool_choice: any = undefined;
    if (request.tool_choice) {
      if (typeof request.tool_choice === 'string') {
        tool_choice = { type: request.tool_choice };
      } else if (request.tool_choice.type === 'function') {
        tool_choice = {
          type: 'tool',
          name: request.tool_choice.function.name,
        };
      }
    }

    // Handle stop parameter (Anthropic uses array of strings)
    let stop: string[] | undefined;
    if (request.stop) {
      stop = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    // Build base request with manual field mappings for Anthropic-specific fields
    const anthropicRequest: Record<string, any> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
    };

    // Use system blocks if available (for cache_control support), otherwise use string
    if (systemBlocks) {
      anthropicRequest.system = systemBlocks;
    } else if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }

    if (request.topP !== undefined) {
      anthropicRequest.top_p = request.topP;
    }

    if (request.topK !== undefined) {
      anthropicRequest.top_k = request.topK;
    }

    if (stop) {
      anthropicRequest.stop_sequences = stop;
    }

    if (tools && tools.length > 0) {
      anthropicRequest.tools = tools;
    }

    if (tool_choice) {
      anthropicRequest.tool_choice = tool_choice;
    }

    if (request.stream !== undefined) {
      anthropicRequest.stream = request.stream;
    }

    // Extended Thinking support (Anthropic Claude 3.7+)
    if (request.thinking) {
      anthropicRequest.thinking = {
        type: request.thinking.type,
      };
      if (request.thinking.budget_tokens) {
        anthropicRequest.thinking.budget_tokens = request.thinking.budget_tokens;
      }
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'anthropic',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Using field-normalizer
      fieldsIgnored: 0,
      fieldsWarned: _warnings.length,
    };

    const result = success(anthropicRequest, metadata);
    if (_warnings.length > 0) {
      result.warnings = _warnings;
    }
    return result;
  }

  // ==========================================
  // Request Conversion (Anthropic -> Internal)
  // ==========================================

  convertRequestToInternal(
    request: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalRequest> {
    const startTime = Date.now();

    if (typeof request !== 'object' || request === null) {
      return failure([createError('', 'Request must be an object', 'INVALID_TYPE')]);
    }

    const anthropicReq = request as Record<string, any>;

    // Validate required fields
    if (!anthropicReq.model) {
      return failure([createError('model', 'Missing required field: model', 'MISSING_REQUIRED_FIELD')]);
    }

    if (!anthropicReq.messages || !Array.isArray(anthropicReq.messages)) {
      return failure([createError('messages', 'Missing or invalid field: messages', 'MISSING_REQUIRED_FIELD')]);
    }

    // Use field-normalizer to convert Anthropic format to internal format
    // This handles max_tokens -> maxTokens, tool_choice, etc.
    const normalizedRequest = normalizeToCamelCase(anthropicReq, true) as InternalRequest;

    // Handle system message separately
    const messages: InternalMessage[] = [];
    if (anthropicReq.system) {
      messages.push({
        role: 'system',
        content: anthropicReq.system,
      });
    }

    // Convert messages
    for (const msg of anthropicReq.messages) {
      // Handle structured content (array of content blocks)
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const processedBlocks: any[] = [];
        const toolResultMessages: InternalMessage[] = [];

        for (const block of msg.content) {
          // Validate content block type
          if (!block.type) {
            continue;
          }

          const validTypes = ['text', 'image', 'tool_use', 'tool_result', 'thinking'];
          if (!validTypes.includes(block.type)) {
            if (block.text) {
              processedBlocks.push({ type: 'text', text: block.text });
            }
            continue;
          }

          // Handle tool_result blocks - each creates a separate message
          if (block.type === 'tool_result') {
            toolResultMessages.push({
              role: 'tool',
              content: typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content),
              toolCallId: block.tool_use_id,
              name: block.tool_use_id,
            } as InternalMessage);
            continue;
          }

          processedBlocks.push(block);
        }

        // Add tool result messages first
        for (const toolMsg of toolResultMessages) {
          messages.push(toolMsg);
        }

        // Then add non-tool-result content if any
        if (processedBlocks.length > 0) {
          messages.push({
            role: msg.role,
            content: processedBlocks,
          });
        }
      } else {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Build internal request using normalized data
    const internalRequest: InternalRequest = {
      model: normalizedRequest.model || anthropicReq.model,
      messages,
      maxTokens: normalizedRequest.maxTokens || anthropicReq.max_tokens || DEFAULT_MAX_TOKENS,
      temperature: normalizedRequest.temperature,
      topP: normalizedRequest.topP,
      topK: normalizedRequest.topK,
      stop: normalizedRequest.stop,
      stream: normalizedRequest.stream,
      thinking: normalizedRequest.thinking,
    };

    // Convert tools from Anthropic format
    if (anthropicReq.tools) {
      internalRequest.tools = anthropicReq.tools.map((tool: any) => {
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        };
      });
    }

    // Convert tool_choice
    if (anthropicReq.tool_choice) {
      if (anthropicReq.tool_choice.type === 'any' || anthropicReq.tool_choice.type === 'auto') {
        internalRequest.tool_choice = anthropicReq.tool_choice.type;
      } else if (anthropicReq.tool_choice.type === 'tool') {
        internalRequest.tool_choice = {
          type: 'function',
          function: { name: anthropicReq.tool_choice.name },
        };
      }
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'anthropic',
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
  // Response Conversion (Anthropic -> Internal)
  // ==========================================

  convertResponseToInternal(
    response: unknown,
    _options?: ConversionOptions
  ): TranspileResult<InternalResponse> {
    const startTime = Date.now();

    if (typeof response !== 'object' || response === null) {
      return failure([createError('', 'Response must be an object', 'INVALID_TYPE')]);
    }

    const anthropicResp = response as Record<string, any>;

    // Validate required fields
    if (!anthropicResp.id) {
      return failure([createError('id', 'Missing required field: id', 'MISSING_REQUIRED_FIELD')]);
    }

    if (!anthropicResp.content) {
      return failure([createError('content', 'Missing required field: content', 'MISSING_REQUIRED_FIELD')]);
    }

    if (!anthropicResp.model) {
      return failure([createError('model', 'Missing required field: model', 'MISSING_REQUIRED_FIELD')]);
    }

    // Use field-normalizer to convert Anthropic format to internal format
    // This handles cache_read_tokens, cache_write_tokens, etc.
    const normalizedResponse = normalizeToCamelCase(anthropicResp, true) as any;

    // Extract content from content blocks
    // Strategy: Preserve full content array structure while also extracting for compatibility
    let content: string | InternalContentBlock[] | null = null;
    const contentBlocks: InternalContentBlock[] = [];
    const tool_calls: InternalToolCall[] = [];
    const thinking_blocks: Array<{ type: 'thinking'; content: string }> = [];
    let hasStructuredContent = false;

    if (Array.isArray(anthropicResp.content)) {
      for (const block of anthropicResp.content) {
        if (block.type === 'text') {
          // Add to content array
          contentBlocks.push({
            type: 'text',
            text: block.text,
          });
        } else if (block.type === 'tool_use') {
          // Add tool_use to content array for structure preservation
          contentBlocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
            ...(block.cache_control && { cache_control: block.cache_control }),
          });

          // Also add to tool_calls for OpenAI compatibility
          tool_calls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
          hasStructuredContent = true;
        } else if (block.type === 'thinking') {
          // Add thinking to content array
          contentBlocks.push({
            type: 'thinking',
            thinking: block.content || block.thinking || '',
          });

          thinking_blocks.push({
            type: 'thinking',
            content: block.content || block.thinking || '',
          });
          hasStructuredContent = true;
        } else if (block.type === 'cache_control') {
          // Add cache_control to content array
          contentBlocks.push({
            type: 'cache_control',
            cache_control: block.cache_control || { type: 'ephemeral' },
          });
          hasStructuredContent = true;
        }
      }

      // Use content array if we have structured content (tool_use, thinking, etc.)
      // Otherwise use simple text format for backward compatibility
      content = hasStructuredContent ? contentBlocks : (contentBlocks.length === 1 && contentBlocks[0]?.type === 'text'
        ? (contentBlocks[0] as TextContentBlock).text
        : null);
    }

    // 🔧 DEFENSIVE FALLBACK: If tool_calls is empty but stop_reason indicates tool_use,
    // try to extract tool_use from the original response more aggressively
    // This handles edge cases where:
    // 1. content is not an array
    // 2. content array is malformed
    // 3. tool_use blocks have unexpected structure
    if (tool_calls.length === 0 && anthropicResp.stop_reason === 'tool_use') {
      // Try to extract from content array again with more lenient checks
      if (Array.isArray(anthropicResp.content)) {
        for (const block of anthropicResp.content) {
          // Check for tool_use with more flexible type checking
          if (block && (block.type === 'tool_use' || block.type === 'toolCall' || block.type === 'tool_call')) {
            const toolCallId = block.id || block.tool_use_id || block.toolCallId || `tool_${Date.now()}`;
            const toolName = block.name || block.function?.name || block.tool_name;
            const toolInput = block.input || block.arguments || block.function?.arguments || {};

            // Only add if we have the minimum required fields
            if (toolName) {
              tool_calls.push({
                id: toolCallId,
                type: 'function',
                function: {
                  name: toolName,
                  arguments: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput),
                },
              });

              console.warn('[AnthropicConverter] Extracted tool_use via defensive fallback:', toolName);
            }
          }
        }
      }

      // Try to extract from legacy/alternative fields
      if (tool_calls.length === 0 && anthropicResp.tool_calls && Array.isArray(anthropicResp.tool_calls)) {
        for (const tc of anthropicResp.tool_calls) {
          tool_calls.push({
            id: tc.id || tc.toolCallId,
            type: 'function',
            function: {
              name: tc.name || tc.function?.name,
              arguments: tc.arguments || tc.function?.arguments || (typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input || {})),
            },
          });
        }
        console.warn('[AnthropicConverter] Extracted from tool_calls field via defensive fallback:', tool_calls.length);
      }
    }

    // Map Anthropic stop_reason to OpenAI finish_reason
    const stopReasonMap: Record<string, string> = {
      'tool_use': 'tool_calls',
      'max_tokens': 'length',
      'stop_sequence': 'stop',
      'end_turn': 'stop',
    };

    // Build internal response with cache and thinking statistics using normalized data
    const internalResponse: InternalResponse = {
      id: anthropicResp.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: anthropicResp.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content as string | InternalContentBlock[],
            toolCalls: tool_calls.length > 0 ? tool_calls : undefined,
          },
          finishReason: stopReasonMap[anthropicResp.stop_reason || ''] || anthropicResp.stop_reason || 'stop',
        },
      ],
      usage: {
        promptTokens: normalizedResponse.usage?.promptTokens || anthropicResp.usage?.input_tokens || 0,
        completionTokens: normalizedResponse.usage?.completionTokens || anthropicResp.usage?.output_tokens || 0,
        totalTokens: normalizedResponse.usage?.totalTokens || (anthropicResp.usage?.input_tokens || 0) + (anthropicResp.usage?.output_tokens || 0),
        cacheReadTokens: normalizedResponse.usage?.cacheReadTokens || anthropicResp.usage?.cache_read_input_tokens || anthropicResp.usage?.cache_read_tokens,
        cacheWriteTokens: normalizedResponse.usage?.cacheWriteTokens || anthropicResp.usage?.cache_creation_input_tokens || anthropicResp.usage?.cache_write_tokens,
        thinkingTokens: normalizedResponse.usage?.thinkingTokens || anthropicResp.usage?.thinking_tokens,
      },
    };

    // Add extended_thinking if thinking blocks were found
    if (thinking_blocks.length > 0) {
      internalResponse.extended_thinking = {
        thinking_blocks,
      };
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'anthropic',
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
  // Response Conversion (Internal -> Anthropic)
  // ==========================================

  convertResponseFromInternal(
    response: InternalResponse,
    _options?: ConversionOptions
  ): TranspileResult<Record<string, any>> {
    const startTime = Date.now();

    const choice = response.choices[0];
    if (!choice) {
      return failure([createError('choices', 'No choices in response', 'MISSING_REQUIRED_FIELD')]);
    }
    const message = choice.message;

    // Build content blocks
    const content: any[] = [];

    // Add Extended Thinking blocks first (if present)
    if (response.extended_thinking?.thinking_blocks) {
      for (const block of response.extended_thinking.thinking_blocks) {
        content.push({
          type: 'thinking',
          content: block.content,
        });
      }
    }

    // Handle message.content based on its type
    if (message.content) {
      if (typeof message.content === 'string') {
        // Simple string content - wrap in a text block
        content.push({
          type: 'text',
          text: message.content,
        });
      } else if (Array.isArray(message.content)) {
        // Structured content array - extract only text blocks
        for (const block of message.content) {
          if (block.type === 'text') {
            content.push({
              type: 'text',
              text: block.text,
            });
          }
          // Skip thinking blocks (already handled from extended_thinking)
          // Skip tool_use blocks (will be handled separately below via tool_calls)
        }
      }
    }

    if (message.toolCalls) {
      for (const tool_call of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: tool_call.id,
          name: tool_call.function.name,
          input: JSON.parse(tool_call.function.arguments || '{}'),
        });
      }
    }

    // Handle stop_reason mapping
    const stopReasonMap: Record<string, string> = {
      stop: 'end_turn',
      length: 'max_tokens',
      tool_calls: 'tool_use',
      content_filter: 'stop_sequence',
    };

    // Build base response
    const anthropicResponse: Record<string, any> = {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content: content.length > 0 ? content : [{ type: 'text', text: '' }],
      model: response.model,
      stop_reason: (choice.finishReason ? stopReasonMap[choice.finishReason] : undefined) || choice.finishReason,
      usage: {
        input_tokens: response.usage?.promptTokens || 0,
        output_tokens: response.usage?.completionTokens || 0,
      },
    };

    // Add cache tokens if present
    if (response.usage?.cacheReadTokens !== undefined) {
      anthropicResponse.usage.cache_read_input_tokens = response.usage.cacheReadTokens;
    }
    if (response.usage?.cacheWriteTokens !== undefined) {
      anthropicResponse.usage.cache_creation_input_tokens = response.usage.cacheWriteTokens;
    }
    if (response.usage?.thinkingTokens !== undefined) {
      anthropicResponse.usage.thinking_tokens = response.usage.thinkingTokens;
    }

    if (response.system_fingerprint) {
      anthropicResponse.system_fingerprint = response.system_fingerprint;
    }

    const metadata: TranspileMetadata = {
      fromVendor: 'openai',
      toVendor: 'anthropic',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted: 1, // Using field-normalizer
      fieldsIgnored: 0,
      fieldsWarned: 0,
    };

    return success(anthropicResponse, metadata);
  }

  // ==========================================
  // Stream Conversion (Anthropic -> Internal)
  // ==========================================

  convertStreamChunkToInternal(
    chunk: string,
    _options?: ConversionOptions
  ): TranspileResult<InternalStreamChunk> {
    const startTime = Date.now();

    // chunk is already extracted JSON (without "data:" prefix)
    // from upstream.service.ts: const data = dataMatch[1].trim();
    let data: any;
    try {
      data = JSON.parse(chunk);
    } catch (e) {
      // Parse error - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    // Handle different event types based on data.type field
    const eventType = data.type;
    if (!eventType) {
      // No event type - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    switch (eventType) {
      case 'message_start':
        return this.handleMessageStart(data);
      case 'content_block_start':
        return this.handleContentBlockStart(data);
      case 'content_block_delta':
        return this.handleContentBlockDelta(data);
      case 'message_delta':
        return this.handleMessageDelta(data);
      case 'message_stop':
        return this.handleMessageStop(data);
      case 'ping':
      case 'content_block_stop':
        // No content to emit - mark as empty to be filtered out
        return success({ __empty: true } as InternalStreamChunk, {
          fromVendor: 'anthropic',
          toVendor: 'openai',
          convertedAt: Date.now(),
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 0,
          fieldsIgnored: 1,
      fieldsWarned: 0,        });
      default:
        // Unknown event type - mark as empty to be filtered out
        return success({ __empty: true } as InternalStreamChunk, {
          fromVendor: 'anthropic',
          toVendor: 'openai',
          convertedAt: Date.now(),
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 0,
          fieldsIgnored: 1,
      fieldsWarned: 0,        });
    }
  }

  private handleMessageStop(_data: any): TranspileResult<InternalStreamChunk> {
    // Get stream state
    let streamId: string | null = null;
    let state: any = null;
    for (const [id, s] of this.streamState.entries()) {
      streamId = id;
      state = s;
      break;
    }

    if (!state) {
      // No stream state - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    // Clean up stream state
    this.streamState.delete(streamId!);

    return success({
      id: streamId!,
      object: 'chat.completion.chunk',
      created: state.created,
      model: state.model,
      choices: [{
        index: 0,
        delta: {},
        finishReason: 'stop',
      }],
    } as InternalStreamChunk, {
      fromVendor: 'anthropic',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: 0,
      fieldsConverted: 1,
      fieldsIgnored: 0,
      fieldsWarned: 0,    });
  }

  private handleMessageStart(data: any): TranspileResult<InternalStreamChunk> {
    const message = data.message;
    if (!message) {
      // No message data - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    const messageId = message.id || `chatcmpl-${Date.now()}`;
    const model = message.model || 'unknown';
    const created = Math.floor(Date.now() / 1000);

    // Initialize stream state
    this.streamState.set(messageId, {
      messageId,
      model,
      created,
      pendingToolCalls: new Map(),
      contentBlockStarted: false,
      toolUseBlockStarted: new Map(),
    });

    return success({
      id: messageId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' },
          finishReason: null,
        },
      ],
    } as InternalStreamChunk, {
      fromVendor: 'anthropic',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: 0,
      fieldsConverted: 3,
      fieldsIgnored: 0,
      fieldsWarned: 0,    });
  }

  private handleContentBlockStart(data: any): TranspileResult<InternalStreamChunk> {
    const index = data.index;
    const contentBlock = data.content_block;
    if (!contentBlock || index === undefined) {
      // No content block data - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    // Get stream state
    let streamId: string | null = null;
    let state: any = null;
    for (const [id, s] of this.streamState.entries()) {
      streamId = id;
      state = s;
      break;
    }

    if (!state) {
      // No stream state - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    const blockType = contentBlock.type;

    if (blockType === 'tool_use') {
      const toolCallId = contentBlock.id;
      const toolName = contentBlock.name;

      if (toolCallId && toolName) {
        state.pendingToolCalls.set(index, {
          id: toolCallId,
          type: 'function',
          function: {
            name: toolName,
            arguments: '',
          },
        });

        return success({
          id: streamId!,
          object: 'chat.completion.chunk',
          created: state.created,
          model: state.model,
          choices: [
            {
              index: 0,
              delta: {
                toolCalls: [
                  {
                    index,
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments: '',
                    },
                  },
                ],
              },
              finishReason: null,
            },
          ],
        } as unknown as InternalStreamChunk, {
          fromVendor: 'anthropic',
          toVendor: 'openai',
          convertedAt: Date.now(),
          conversionTimeMs: 0,
          fieldsConverted: 4,
          fieldsIgnored: 0,
      fieldsWarned: 0,        });
      }
    }

    // Non-tool_use block (e.g., thinking block) - no content to emit yet
    return success({ __empty: true } as InternalStreamChunk, {
      fromVendor: 'anthropic',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: 0,
      fieldsConverted: 0,
      fieldsIgnored: 1,
      fieldsWarned: 0,    });
  }

  private handleContentBlockDelta(data: any): TranspileResult<InternalStreamChunk> {
    const index = data.index;
    const delta = data.delta;
    if (!delta || index === undefined) {
      // No delta data - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    // Get stream state
    let streamId: string | null = null;
    let state: any = null;
    for (const [id, s] of this.streamState.entries()) {
      streamId = id;
      state = s;
      break;
    }

    if (!state) {
      // No stream state - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    const deltaType = delta.type;

    if (deltaType === 'text_delta') {
      const text = delta.text || '';
      return success({
        id: streamId!,
        object: 'chat.completion.chunk',
        created: state.created,
        model: state.model,
        choices: [
          {
            index: 0,
            delta: { content: text },
            finishReason: null,
          },
        ],
      } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 2,
        fieldsIgnored: 0,
      fieldsWarned: 0,      });
    } else if (deltaType === 'thinking_delta') {
      const thinking = delta.thinking || '';
      return success({
        id: streamId!,
        object: 'chat.completion.chunk',
        created: state.created,
        model: state.model,
        choices: [
          {
            index: 0,
            delta: { content: thinking },
            finishReason: null,
          },
        ],
      } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 2,
        fieldsIgnored: 0,
      fieldsWarned: 0,      });
    } else if (deltaType === 'input_json_delta') {
      const partialJson = delta.partial_json || '';
      const pendingToolCall = state.pendingToolCalls.get(index);

      if (pendingToolCall && pendingToolCall.function) {
        const currentArgs = pendingToolCall.function.arguments || '';
        const updatedArgs = currentArgs + partialJson;
        pendingToolCall.function.arguments = updatedArgs;

        return success({
          id: streamId!,
          object: 'chat.completion.chunk',
          created: state.created,
          model: state.model,
          choices: [
            {
              index: 0,
              delta: {
                toolCalls: [
                  {
                    index,
                    function: {
                      arguments: partialJson,
                    },
                  },
                ],
              },
              finishReason: null,
            },
          ],
        } as unknown as InternalStreamChunk, {
          fromVendor: 'anthropic',
          toVendor: 'openai',
          convertedAt: Date.now(),
          conversionTimeMs: 0,
          fieldsConverted: 2,
          fieldsIgnored: 0,
      fieldsWarned: 0,        });
      }
    }

    // Unknown delta type - return empty chunk to be filtered out
    return success({ __empty: true } as InternalStreamChunk, {
      fromVendor: 'anthropic',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: 0,
      fieldsConverted: 0,
      fieldsIgnored: 1,
      fieldsWarned: 0,    });
  }

  private handleMessageDelta(data: any): TranspileResult<InternalStreamChunk> {
    const delta = data.delta;
    const usage = data.usage;

    // Get stream state
    let streamId: string | null = null;
    let state: any = null;
    for (const [id, s] of this.streamState.entries()) {
      streamId = id;
      state = s;
      break;
    }

    if (!state) {
      // No stream state - return empty chunk to be filtered out
      return success({ __empty: true } as InternalStreamChunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 1,
      fieldsWarned: 0,      });
    }

    const stopReason = delta?.stop_reason;

    if (stopReason) {
      const stopReasonMap: Record<string, string> = {
        end_turn: 'stop',
        max_tokens: 'length',
        stop_sequence: 'stop',
        tool_use: 'tool_calls',
        content_filter: 'content_filter',
      };

      const finishReason = stopReasonMap[stopReason] || stopReason;

      const chunk: InternalStreamChunk = {
        id: streamId!,
        object: 'chat.completion.chunk',
        created: state.created,
        model: state.model,
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: finishReason,
          },
        ],
      } as InternalStreamChunk;

      // Add usage if present
      if (usage) {
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;

        chunk.usage = {
          completionTokens: outputTokens,
          promptTokens: inputTokens,
          totalTokens: inputTokens + outputTokens,
          promptTokensDetails: cacheReadTokens > 0 ? {
            cachedTokens: cacheReadTokens,
          } : undefined,
        };
      }

      return success(chunk, {
        fromVendor: 'anthropic',
        toVendor: 'openai',
        convertedAt: Date.now(),
        conversionTimeMs: 0,
        fieldsConverted: usage ? 3 : 2,
        fieldsIgnored: 0,
      fieldsWarned: 0,      });
    }

    // No stop reason - return empty chunk to be filtered out
    return success({ __empty: true } as InternalStreamChunk, {
      fromVendor: 'anthropic',
      toVendor: 'openai',
      convertedAt: Date.now(),
      conversionTimeMs: 0,
      fieldsConverted: 0,
      fieldsIgnored: 1,
      fieldsWarned: 0,    });
  }

  // ==========================================
  // Stream Conversion (Internal -> Anthropic)
  // ==========================================

  convertStreamChunkFromInternal(
    chunk: InternalStreamChunk,
    _options?: ConversionOptions
  ): TranspileResult<string> {
    const startTime = Date.now();
    let fieldsConverted = 0;

    const choice = chunk.choices[0];
    if (!choice) {
      return success('', {
        fromVendor: 'openai',
        toVendor: 'anthropic',
        convertedAt: Date.now(),
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 1,
        fieldsWarned: 0,
      });
    }
    const delta = choice.delta;
    const finishReason = choice.finishReason;

    let events: string[] = [];

    // Get or initialize stream state for outbound conversion
    const streamId = chunk.id;
    let state = this.streamState.get(streamId);

    // Check if this is the first chunk (has role)
    if (delta.role) {
      events.push(this.formatSSE('message_start', {
        type: 'message_start',
        message: {
          id: chunk.id,
          type: 'message',
          role: 'assistant',
          content: [],
          model: chunk.model,
          stop_reason: null,
        },
      }));
      fieldsConverted += 3;

      // Initialize state for outbound stream if not exists
      if (!state) {
        state = {
          messageId: streamId,
          model: chunk.model,
          created: chunk.created,
          pendingToolCalls: new Map(),
          contentBlockStarted: false,
          toolUseBlockStarted: new Map(),
        };
        this.streamState.set(streamId, state);
      }
    }

    // Handle content delta
    if (delta.content) {
      // Only send content_block_start once per stream
      if (!state) {
        // Initialize state if it doesn't exist (shouldn't happen in normal flow)
        state = {
          messageId: streamId,
          model: chunk.model,
          created: chunk.created,
          pendingToolCalls: new Map(),
          contentBlockStarted: false,
          toolUseBlockStarted: new Map(),
        };
        this.streamState.set(streamId, state);
      }

      if (!state.contentBlockStarted) {
        events.push(this.formatSSE('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        }));
        state.contentBlockStarted = true;
        fieldsConverted++;
      }

      events.push(this.formatSSE('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: delta.content,
        },
      }));
      fieldsConverted++;
    }

    // Handle tool calls
    if (delta.toolCalls && delta.toolCalls.length > 0) {
      for (const toolCall of delta.toolCalls) {
        // toolCall 可能没有 index 字段，从 delta.toolCalls 数组获取索引
        const callIndex = delta.toolCalls.indexOf(toolCall);
        const index = 'index' in toolCall ? (toolCall.index as number) : callIndex;

        // If tool call has name, it's a new tool call
        if (toolCall.function?.name) {
          // Only send content_block_start once per tool_use index
          if (state && !state.toolUseBlockStarted.get(index)) {
            events.push(this.formatSSE('content_block_start', {
              type: 'content_block_start',
              index,
              content_block: {
                type: 'tool_use',
                id: toolCall.id || this.generateId(),
                name: toolCall.function.name,
                input: {},
              },
            }));
            state.toolUseBlockStarted.set(index, true);
            fieldsConverted++;
          }
        }

        // If tool call has arguments, emit them
        if (toolCall.function?.arguments) {
          events.push(this.formatSSE('content_block_delta', {
            type: 'content_block_delta',
            index,
            delta: {
              type: 'input_json_delta',
              partial_json: toolCall.function.arguments,
            },
          }));
          fieldsConverted++;
        }
      }
    }

    // Handle finish reason
    if (finishReason) {
      // Emit content_block_stop before message_delta (standard Anthropic SSE format)
      // This should be emitted for each content block that was started
      if (state?.contentBlockStarted) {
        events.push(this.formatSSE('content_block_stop', {
          type: 'content_block_stop',
          index: 0,
        }));
        fieldsConverted++;
      }

      // Emit content_block_stop for each tool_use block that was started
      if (state?.toolUseBlockStarted) {
        for (const [index] of state.toolUseBlockStarted) {
          events.push(this.formatSSE('content_block_stop', {
            type: 'content_block_stop',
            index,
          }));
          fieldsConverted++;
        }
      }

      const stopReasonMap: Record<string, string> = {
        stop: 'end_turn',
        length: 'max_tokens',
        tool_calls: 'tool_use',
        content_filter: 'stop_sequence',
      };

      const stopReason = stopReasonMap[finishReason] || finishReason;

      events.push(this.formatSSE('message_delta', {
        type: 'message_delta',
        delta: {
          type: 'message_delta',
          stop_reason: stopReason,
        },
        usage: {
          output_tokens: 0,
        },
      }));

      events.push(this.formatSSE('message_stop', {
        type: 'message_stop',
      }));
      fieldsConverted += 2;

      // Clean up stream state when stream ends
      if (state) {
        this.streamState.delete(streamId);
      }
    }

    return success(events.join('\n'), {
      fromVendor: 'openai',
      toVendor: 'anthropic',
      convertedAt: Date.now(),
      conversionTimeMs: Date.now() - startTime,
      fieldsConverted,
      fieldsIgnored: 0,
      fieldsWarned: 0,    });
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

    // Check for Anthropic response structure
    if ('id' in obj && 'type' in obj && obj.type === 'message') {
      confidence += 0.4;
    }
    if ('role' in obj && obj.role === 'assistant') {
      confidence += 0.3;
    }
    if ('content' in obj && Array.isArray(obj.content)) {
      confidence += 0.2;
    }
    if ('stop_reason' in obj || 'stop_sequence' in obj) {
      confidence += 0.1;
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

      // Check for Anthropic SSE event types
      if ('type' in obj) {
        const type = obj.type as string;
        if (['message_start', 'message_delta', 'message_stop',
             'content_block_start', 'content_block_delta', 'content_block_stop',
             'ping'].includes(type)) {
          confidence += 0.7;
        }
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

    if ('model' in obj && 'messages' in obj && 'max_tokens' in obj) {
      confidence += 0.3;
    }
    if ('system' in obj) {
      confidence += 0.2;
    }
    if ('stop_sequences' in obj) {
      confidence += 0.2;
    }
    if ('thinking' in obj) {
      confidence += 0.2;
    }
    if ('tool_choice' in obj) {
      const tool_choice = obj.tool_choice as Record<string, unknown>;
      if (tool_choice?.type === 'tool') {
        confidence += 0.1;
      }
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

    if (!('max_tokens' in obj)) {
      errors.push({ path: 'max_tokens', message: 'Missing required field: max_tokens' });
    }

    return { valid: errors.length === 0, errors };
  }

  // ==========================================
  // Helpers
  // ==========================================

  private formatSSE(event: string, data: any): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  private generateId(): string {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
