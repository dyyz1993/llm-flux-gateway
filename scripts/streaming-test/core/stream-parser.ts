/**
 * 流式响应解析器
 *
 * 解析 SSE (Server-Sent Events) 格式的流式响应，提取内容块、工具调用等数据
 */

/**
 * 流式数据块
 */
export interface StreamChunk {
  /** 块索引（从 0 开始） */
  index: number;

  /** 块类型 */
  type: 'content' | 'tool_call' | 'metadata' | 'error' | 'end';

  /** 文本内容 */
  content?: string;

  /** 工具调用信息 */
  toolCall?: {
    id?: string;
    index?: number;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
      argumentsInProgress?: string;
    };
  };

  /** 结束原因 */
  finishReason?: string;

  /** Token 使用情况 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
  };

  /** 时间戳 */
  timestamp: number;

  /** 原始数据 */
  raw: string;
}

/**
 * 解析选项
 */
export interface ParseOptions {
  /** 是否包含原始数据 */
  includeRaw?: boolean;

  /** 是否验证格式 */
  validate?: boolean;

  /** 调试模式 */
  debug?: boolean;
}

/**
 * SSE 行格式
 */
interface SSELine {
  data?: string;
  event?: string;
  id?: string;
  retry?: number;
}

export class StreamParser {
  private chunkIndex = 0;
  private options: Required<ParseOptions>;

  constructor(options: ParseOptions = {}) {
    this.options = {
      includeRaw: options.includeRaw ?? true,
      validate: options.validate ?? true,
      debug: options.debug ?? false,
    };
  }

  /**
   * 解析单个 SSE 行
   *
   * @param line - SSE 数据行（格式：`data: {...}`）
   * @returns 解析后的块，如果解析失败返回 null
   */
  parseSSELine(line: string): StreamChunk | null {
    if (!line || line.trim() === '') {
      return null;
    }

    try {
      // 解析 SSE 行
      const sseLine = this.parseSSELineFormat(line);

      if (!sseLine.data) {
        return null;
      }

      // 跳过 [DONE] 标记
      if (sseLine.data.trim() === '[DONE]') {
        return {
          index: this.chunkIndex++,
          type: 'end',
          timestamp: Date.now(),
          raw: this.options.includeRaw ? line : '',
        };
      }

      // 解析 JSON 数据
      const data = JSON.parse(sseLine.data);
      const chunk = this.parseDataObject(data, line);

      if (this.options.validate) {
        this.validateChunk(chunk);
      }

      return chunk;
    } catch (error) {
      if (this.options.debug) {
        console.error(`Failed to parse SSE line: ${line}`, error);
      }

      return {
        index: this.chunkIndex++,
        type: 'error',
        timestamp: Date.now(),
        raw: this.options.includeRaw ? line : '',
      };
    }
  }

  /**
   * 解析完整的流式响应
   *
   * @param response - Fetch API 响应对象
   * @yields 解析后的数据块
   */
  async *parseStream(response: Response): AsyncGenerator<StreamChunk> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // 解码并添加到缓冲区
        buffer += decoder.decode(value, { stream: true });

        // 按行分割
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        // 解析每一行
        for (const line of lines) {
          const chunk = this.parseSSELine(line);
          if (chunk) {
            yield chunk;
          }
        }
      }

      // 处理缓冲区剩余的数据
      if (buffer.trim()) {
        const chunk = this.parseSSELine(buffer);
        if (chunk) {
          yield chunk;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 解析 SSE 行格式
   *
   * SSE 格式：`field: value`
   * 常见字段：data, event, id, retry
   */
  private parseSSELineFormat(line: string): SSELine {
    const colonIndex = line.indexOf(':');

    if (colonIndex === -1) {
      return {}; // 无效格式
    }

    const field = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();

    // 解析字段
    switch (field) {
      case 'data':
        return { data: value };
      case 'event':
        return { event: value };
      case 'id':
        return { id: value };
      case 'retry':
        return { retry: parseInt(value, 10) };
      default:
        return {};
    }
  }

  /**
   * 解析数据对象
   *
   * 支持多种格式：
   * - OpenAI: `{ choices: [{ delta: { content } }] }`
   * - Anthropic: `{ type: 'content_block_delta', delta: { text } }`
   * - Gemini: `{ candidates: [{ content: { parts: [{ text }] }] } }`
   */
  private parseDataObject(data: any, rawLine: string): StreamChunk {
    const timestamp = Date.now();

    // OpenAI 格式
    if (data.choices && data.choices[0]) {
      const choice = data.choices[0];
      const delta = choice.delta;

      // 内容块
      if (delta?.content) {
        return {
          index: this.chunkIndex++,
          type: 'content',
          content: delta.content,
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }

      // 工具调用
      if (delta?.tool_calls) {
        const toolCall = delta.tool_calls[0];
        return {
          index: this.chunkIndex++,
          type: 'tool_call',
          toolCall: {
            id: toolCall.id,
            index: toolCall.index,
            type: toolCall.type,
            function: {
              name: toolCall.function?.name,
              arguments: toolCall.function?.arguments,
            },
          },
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }

      // 结束原因
      if (choice.finish_reason) {
        return {
          index: this.chunkIndex++,
          type: 'end',
          finishReason: choice.finish_reason,
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }

      // Token 使用情况
      if (data.usage) {
        return {
          index: this.chunkIndex++,
          type: 'metadata',
          usage: data.usage,
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }
    }

    // Anthropic 格式
    if (data.type) {
      // 内容块增量
      if (data.type === 'content_block_delta' && data.delta?.text) {
        return {
          index: this.chunkIndex++,
          type: 'content',
          content: data.delta.text,
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }

      // 工具调用增量
      if (data.type === 'content_block_delta' && data.delta?.partial_json) {
        return {
          index: this.chunkIndex++,
          type: 'tool_call',
          toolCall: {
            index: data.index,
            function: {
              argumentsInProgress: data.delta.partial_json,
            },
          },
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }

      // 消息结束
      if (data.type === 'message_stop') {
        return {
          index: this.chunkIndex++,
          type: 'end',
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }
    }

    // Gemini 格式
    if (data.candidates && data.candidates[0]?.content?.parts) {
      const part = data.candidates[0].content.parts[0];

      if (part?.text) {
        return {
          index: this.chunkIndex++,
          type: 'content',
          content: part.text,
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }

      if (part?.functionCall) {
        return {
          index: this.chunkIndex++,
          type: 'tool_call',
          toolCall: {
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            },
          },
          timestamp,
          raw: this.options.includeRaw ? rawLine : '',
        };
      }
    }

    // 未知格式
    return {
      index: this.chunkIndex++,
      type: 'metadata',
      timestamp,
      raw: this.options.includeRaw ? rawLine : '',
    };
  }

  /**
   * 验证块格式
   */
  private validateChunk(chunk: StreamChunk): void {
    if (chunk.type === 'content' && typeof chunk.content !== 'string') {
      throw new Error('Invalid content chunk: content must be a string');
    }

    if (chunk.type === 'tool_call' && !chunk.toolCall) {
      throw new Error('Invalid tool_call chunk: toolCall is required');
    }

    if (chunk.type === 'end' && !chunk.finishReason) {
      // end 块可以没有 finishReason（如 Anthropic 的 message_stop）
    }
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.chunkIndex = 0;
  }
}
