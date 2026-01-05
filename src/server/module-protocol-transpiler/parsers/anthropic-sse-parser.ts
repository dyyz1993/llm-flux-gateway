/**
 * Anthropic SSE Parser for Protocol Transpiler
 *
 * Parses Anthropic-compatible SSE streams and converts them to InternalStreamChunk format.
 *
 * Anthropic event types:
 * - message_start: Message metadata (id, role, model, usage)
 * - content_block_start: Start of a content block (text or tool_use)
 * - content_block_delta: Incremental content update (text_delta or input_json_delta)
 * - content_block_stop: End of a content block
 * - message_delta: Message-level updates (usage, stop_reason)
 * - message_stop: End of message
 *
 * This parser handles both Anthropic Claude and compatible vendors (e.g., Zhipu AI).
 */

import { BaseSSEParser, VendorFormat } from './base-sse-parser';
import type { InternalStreamChunk, InternalToolCall } from '../interfaces';

/**
 * Anthropic message_start event
 */
interface AnthropicMessageStart {
  type: 'message_start';
  message: {
    id: string;
    role: 'assistant';
    content: Array<unknown>;
    model: string;
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Anthropic content_block_start event
 */
interface AnthropicContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block: {
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

/**
 * Anthropic content_block_delta event
 */
interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
}

/**
 * Anthropic content_block_stop event
 */
interface AnthropicContentBlockStop {
  type: 'content_block_stop';
  index: number;
}

/**
 * Anthropic message_delta event
 */
interface AnthropicMessageDelta {
  type: 'message_delta';
  delta: {
    stop_reason: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

/**
 * Anthropic message_stop event
 */
interface AnthropicMessageStop {
  type: 'message_stop';
}

/**
 * Union type for all Anthropic events
 */
type AnthropicEvent =
  | AnthropicMessageStart
  | AnthropicContentBlockStart
  | AnthropicContentBlockDelta
  | AnthropicContentBlockStop
  | AnthropicMessageDelta
  | AnthropicMessageStop;

/**
 * Internal tracking for content blocks
 */
interface ContentBlock {
  type: 'text' | 'tool_use';
  index: number;
  text?: string;
  toolCall?: InternalToolCall;
}

/**
 * Tool call delta with index for streaming
 * The index field is used during streaming to identify which tool call in an array is being updated
 */
interface ToolCallDelta extends InternalToolCall {
  index: number;
}

/**
 * Anthropic SSE Parser
 *
 * Converts Anthropic streaming format to InternalStreamChunk
 */
export class AnthropicSSEParser extends BaseSSEParser {
  getFormat(): VendorFormat {
    return VendorFormat.ANTHROPIC;
  }

  async *parse(stream: ReadableStream<Uint8Array>): AsyncGenerator<InternalStreamChunk, void, unknown> {
    console.log('[AnthropicSSEParser] Starting to parse Anthropic SSE stream');

    const contentBlocks = new Map<number, ContentBlock>();
    let messageId = '';
    let model = '';
    let created = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let stopReason: string | null = null;
    let eventCount = 0;
    let chunkCount = 0;

    for await (const event of this.readSSE(stream, 'anthropic')) {
      eventCount++;
      try {
        const data = JSON.parse(event.data!) as AnthropicEvent;

        console.log(`[AnthropicSSEParser] Event #${eventCount}: type=${data.type}`);

        switch (data.type) {
          case 'message_start':
            this.handleMessageStart(data, {
              setMessageId: (id) => { messageId = id; },
              setModel: (m) => { model = m; },
              setCreated: (c) => { created = c; },
              setPromptTokens: (tokens) => { promptTokens = tokens; },
              setCompletionTokens: (tokens) => { completionTokens = tokens; },
            });
            break;

          case 'content_block_start':
            this.handleContentBlockStart(data, contentBlocks);
            break;

          case 'content_block_delta':
            const chunk = this.handleContentBlockDelta(data, contentBlocks, messageId, model, created);
            if (chunk) {
              chunkCount++;
              yield chunk;
            }
            break;

          case 'content_block_stop':
            console.log(`[AnthropicSSEParser] Content block ${data.index} stopped`);
            break;

          case 'message_delta':
            stopReason = data.delta.stop_reason;
            completionTokens = data.usage.output_tokens;
            console.log(`[AnthropicSSEParser] Message delta: stop_reason=${stopReason}, output_tokens=${completionTokens}`);
            break;

          case 'message_stop':
            const finalChunk = this.createFinalChunk(
              messageId,
              model,
              created,
              stopReason,
              promptTokens,
              completionTokens
            );
            chunkCount++;
            yield finalChunk;
            console.log(`[AnthropicSSEParser] Message stop, yielding final chunk`);
            break;

          default:
            console.warn(`[AnthropicSSEParser] Unknown event type: ${(data as { type: string }).type}`);
        }
      } catch (e) {
        console.warn('[AnthropicSSEParser] Failed to parse event:', event.data!, e);
      }
    }

    console.log(`[AnthropicSSEParser] Parsing complete: ${eventCount} events processed, ${chunkCount} chunks yielded`);
  }

  /**
   * Handle message_start event
   */
  private handleMessageStart(
    data: AnthropicMessageStart,
    setters: {
      setMessageId: (id: string) => void;
      setModel: (model: string) => void;
      setCreated: (created: number) => void;
      setPromptTokens: (tokens: number) => void;
      setCompletionTokens: (tokens: number) => void;
    }
  ): void {
    setters.setMessageId(data.message.id);
    setters.setModel(data.message.model);
    setters.setCreated(Math.floor(Date.now() / 1000));
    setters.setPromptTokens(data.message.usage.input_tokens);
    setters.setCompletionTokens(data.message.usage.output_tokens);

    console.log(
      `[AnthropicSSEParser] Message start: id=${data.message.id}, ` +
      `model=${data.message.model}, ` +
      `input_tokens=${data.message.usage.input_tokens}`
    );
  }

  /**
   * Handle content_block_start event
   */
  private handleContentBlockStart(
    data: AnthropicContentBlockStart,
    contentBlocks: Map<number, ContentBlock>
  ): void {
    const block: ContentBlock = {
      type: data.content_block.type,
      index: data.index,
    };

    if (data.content_block.type === 'text') {
      block.text = data.content_block.text || '';
      console.log(`[AnthropicSSEParser] Text block ${data.index} started`);
    } else if (data.content_block.type === 'tool_use') {
      block.toolCall = {
        id: data.content_block.id!,
        type: 'function',
        function: {
          name: data.content_block.name!,
          arguments: '',
        },
      };
      console.log(
        `[AnthropicSSEParser] Tool use block ${data.index} started: ` +
        `id=${data.content_block.id}, name=${data.content_block.name}`
      );
    }

    contentBlocks.set(data.index, block);
  }

  /**
   * Handle content_block_delta event
   */
  private handleContentBlockDelta(
    data: AnthropicContentBlockDelta,
    contentBlocks: Map<number, ContentBlock>,
    messageId: string,
    model: string,
    created: number
  ): InternalStreamChunk | null {
    const block = contentBlocks.get(data.index);
    if (!block) {
      console.warn(`[AnthropicSSEParser] No content block found for index ${data.index}`);
      return null;
    }

    if (data.delta.type === 'text_delta' && data.delta.text) {
      // Text delta - accumulate and yield chunk
      block.text = (block.text || '') + data.delta.text;
      console.log(`[AnthropicSSEParser] Text delta for block ${data.index}: "${data.delta.text}"`);
      return this.createTextChunk(messageId, model, created, data.delta.text);
    } else if (data.delta.type === 'input_json_delta' && data.delta.partial_json) {
      // Tool call arguments delta
      if (block.toolCall) {
        // Accumulate the delta for local tracking
        block.toolCall.function.arguments += data.delta.partial_json;

        console.log(
          `[AnthropicSSEParser] Tool arguments delta for block ${data.index}: ` +
          `"${data.delta.partial_json}"`
        );

        // ⭐ SEND ONLY THE DELTA, not the accumulated value!
        return this.createToolCallDeltaChunk(
          messageId,
          model,
          created,
          block.index,
          block.toolCall,
          data.delta.partial_json  // ⭐ PASS THE DELTA!
        );
      }
    }

    return null;
  }

  /**
   * Create a text content chunk
   */
  private createTextChunk(
    id: string,
    model: string,
    created: number,
    text: string
  ): InternalStreamChunk {
    return {
      ...this.createBaseChunk(id, model, created),
      choices: [{
        index: 0,
        delta: { content: text },
        finishReason: null,
      }],
    };
  }

  /**
   * Create a tool call delta chunk
   *
   * IMPORTANT: This sends ONLY the delta portion of arguments, not the accumulated value.
   * The client is responsible for accumulating the deltas.
   *
   * @param partialJson - The delta portion only (from data.delta.partial_json)
   */
  private createToolCallDeltaChunk(
    id: string,
    model: string,
    created: number,
    index: number,
    toolCall: InternalToolCall,
    partialJson: string  // ⭐ NEW: The delta portion only!
  ): InternalStreamChunk {
    // Create a tool call delta with index for streaming
    const toolCallDelta: ToolCallDelta = {
      id: toolCall.id,
      type: 'function',
      function: {
        name: toolCall.function.name,
        arguments: partialJson,  // ⭐ SEND ONLY THE DELTA!
      },
      index,
    };

    console.log(
      `[AnthropicSSEParser] Sending tool call delta for block ${index}: ` +
      `id=${toolCall.id}, name=${toolCall.function.name}, ` +
      `arguments_delta="${partialJson}"`
    );

    return {
      ...this.createBaseChunk(id, model, created),
      choices: [{
        index: 0,
        delta: {
          toolCalls: [toolCallDelta],
        },
        finishReason: null,
      }],
    };
  }

  /**
   * Create final chunk with usage and finish_reason
   */
  private createFinalChunk(
    id: string,
    model: string,
    created: number,
    finishReason: string | null,
    promptTokens: number,
    completionTokens: number
  ): InternalStreamChunk {
    const mappedReason = this.mapAnthropicFinishReason(finishReason);

    const chunk: InternalStreamChunk = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: {},
        finishReason: mappedReason,
      }],
    };

    console.log(
      `[AnthropicSSEParser] Final chunk: finish_reason=${finishReason} -> ${mappedReason}, ` +
      `prompt_tokens=${promptTokens}, completion_tokens=${completionTokens}`
    );

    return chunk;
  }
}
