/**
 * 响应验证器
 *
 * 验证流式响应的正确性、完整性和格式规范
 */

import type { StreamChunk } from './stream-parser.js';

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否通过验证 */
  isValid: boolean;

  /** 错误列表 */
  errors: string[];

  /** 警告列表 */
  warnings: string[];
}

/**
 * 验证选项
 */
export interface ValidationOptions {
  /** 是否检查内容完整性 */
  checkContentIntegrity?: boolean;

  /** 是否检查工具调用格式 */
  checkToolCallFormat?: boolean;

  /** 是否检查结束信号 */
  checkEndSignal?: boolean;

  /** 是否检查 Token 使用情况 */
  checkUsage?: boolean;

  /** 允许的最大块大小（字节） */
  maxChunkSize?: number;
}

export class ResponseValidator {
  private options: Required<ValidationOptions>;
  private _chunks: StreamChunk[] = [];
  private _fullContent = '';
  private toolCalls: Map<number, any> = new Map();

  constructor(options: ValidationOptions = {}) {
    this.options = {
      checkContentIntegrity: options.checkContentIntegrity ?? true,
      checkToolCallFormat: options.checkToolCallFormat ?? true,
      checkEndSignal: options.checkEndSignal ?? true,
      checkUsage: options.checkUsage ?? true,
      maxChunkSize: options.maxChunkSize ?? 10240, // 10KB
    };
  }

  /**
   * 验证单个块
   */
  validateChunk(chunk: StreamChunk): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本验证
    if (typeof chunk.index !== 'number') {
      errors.push(`Chunk #${chunk.index}: missing or invalid index`);
    }

    if (typeof chunk.timestamp !== 'number') {
      errors.push(`Chunk #${chunk.index}: missing or invalid timestamp`);
    }

    // 类型特定验证
    switch (chunk.type) {
      case 'content':
        this.validateContentChunk(chunk, errors, warnings);
        break;

      case 'tool_call':
        this.validateToolCallChunk(chunk, errors, warnings);
        break;

      case 'metadata':
        this.validateMetadataChunk(chunk, errors, warnings);
        break;

      case 'end':
        this.validateEndChunk(chunk, errors, warnings);
        break;

      case 'error':
        errors.push(`Chunk #${chunk.index}: error chunk received`);
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证内容块
   */
  private validateContentChunk(chunk: StreamChunk, errors: string[], warnings: string[]): void {
    if (!chunk.content) {
      errors.push(`Chunk #${chunk.index}: content block missing content`);
      return;
    }

    // 检查内容类型
    if (typeof chunk.content !== 'string') {
      errors.push(`Chunk #${chunk.index}: content must be a string, got ${typeof chunk.content}`);
    }

    // 检查块大小
    const size = Buffer.byteLength(chunk.content, 'utf-8');
    if (size > this.options.maxChunkSize) {
      warnings.push(`Chunk #${chunk.index}: content size (${size} bytes) exceeds limit (${this.options.maxChunkSize} bytes)`);
    }

    // 检查内容是否为空
    if (chunk.content.length === 0) {
      warnings.push(`Chunk #${chunk.index}: empty content`);
    }

    // 检查是否包含特殊字符（可能是格式错误）
    if (chunk.content.includes('NaN') || chunk.content.includes('undefined')) {
      warnings.push(`Chunk #${chunk.index}: content contains suspicious values (NaN/undefined)`);
    }
  }

  /**
   * 验证工具调用块
   */
  validateToolCallFormat(chunk: StreamChunk): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!chunk.toolCall) {
      errors.push(`Chunk #${chunk.index}: tool_call block missing toolCall`);
      return { isValid: false, errors, warnings };
    }

    const { toolCall } = chunk;

    // 验证工具调用索引
    if (typeof toolCall.index !== 'number') {
      warnings.push(`Chunk #${chunk.index}: tool_call missing index`);
    }

    // 验证函数名称
    if (toolCall.function?.name) {
      if (typeof toolCall.function.name !== 'string') {
        errors.push(`Chunk #${chunk.index}: function name must be a string`);
      }

      if (toolCall.function.name.length === 0) {
        errors.push(`Chunk #${chunk.index}: function name is empty`);
      }

      // 检查函数名格式（通常应该是 snake_case 或 camelCase）
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(toolCall.function.name)) {
        warnings.push(`Chunk #${chunk.index}: function name has unusual format: ${toolCall.function.name}`);
      }
    }

    // 验证函数参数
    if (toolCall.function?.arguments) {
      if (typeof toolCall.function.arguments !== 'string') {
        errors.push(`Chunk #${chunk.index}: function arguments must be a string`);
      } else {
        // 尝试解析 JSON（如果是完整参数）
        try {
          JSON.parse(toolCall.function.arguments);
        } catch {
          // 可能是增量参数，这是正常的
          if (!toolCall.function.argumentsInProgress) {
            warnings.push(`Chunk #${chunk.index}: function arguments not valid JSON and not marked as in-progress`);
          }
        }
      }
    }

    // 验证增量参数
    if (toolCall.function?.argumentsInProgress) {
      if (typeof toolCall.function.argumentsInProgress !== 'string') {
        errors.push(`Chunk #${chunk.index}: argumentsInProgress must be a string`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证工具调用块（内部方法）
   */
  private validateToolCallChunk(chunk: StreamChunk, errors: string[], warnings: string[]): void {
    const result = this.validateToolCallFormat(chunk);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  /**
   * 验证元数据块
   */
  private validateMetadataChunk(chunk: StreamChunk, errors: string[], warnings: string[]): void {
    if (chunk.usage) {
      const { usage } = chunk;

      // 验证 Token 数量
      if (typeof usage.prompt_tokens !== 'number' || usage.prompt_tokens < 0) {
        errors.push(`Chunk #${chunk.index}: invalid prompt_tokens`);
      }

      if (typeof usage.completion_tokens !== 'number' || usage.completion_tokens < 0) {
        errors.push(`Chunk #${chunk.index}: invalid completion_tokens`);
      }

      if (usage.total_tokens !== undefined) {
        const expectedTotal = usage.prompt_tokens + usage.completion_tokens;
        if (usage.total_tokens !== expectedTotal) {
          warnings.push(`Chunk #${chunk.index}: total_tokens (${usage.total_tokens}) != prompt + completion (${expectedTotal})`);
        }
      }
    }
  }

  /**
   * 验证结束块
   */
  validateEndSignal(chunk: StreamChunk): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (chunk.type !== 'end') {
      errors.push(`Chunk #${chunk.index}: expected end type, got ${chunk.type}`);
      return { isValid: false, errors, warnings };
    }

    // 验证结束原因
    if (chunk.finishReason) {
      const validReasons = ['stop', 'length', 'content_filter', 'tool_calls', 'error', 'max_tokens'];
      if (!validReasons.includes(chunk.finishReason)) {
        warnings.push(`Chunk #${chunk.index}: unusual finish_reason: ${chunk.finishReason}`);
      }

      // 某些结束原因需要特别关注
      if (chunk.finishReason === 'error') {
        errors.push(`Chunk #${chunk.index}: stream ended with error`);
      }

      if (chunk.finishReason === 'content_filter') {
        warnings.push(`Chunk #${chunk.index}: stream ended due to content filter`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证结束块（内部方法）
   */
  private validateEndChunk(chunk: StreamChunk, errors: string[], warnings: string[]): void {
    const result = this.validateEndSignal(chunk);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  /**
   * 验证完整的响应流
   */
  validateStream(chunks: StreamChunk[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (chunks.length === 0) {
      errors.push('No chunks received');
      return { isValid: false, errors, warnings };
    }

    // 检查是否有结束信号
    const lastChunk = chunks[chunks.length - 1];
    if (this.options.checkEndSignal && lastChunk.type !== 'end') {
      warnings.push('Stream did not end with end signal');
    }

    // 检查块索引连续性
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].index !== i) {
        errors.push(`Chunk index mismatch: expected ${i}, got ${chunks[i].index}`);
        break;
      }
    }

    // 检查内容完整性
    if (this.options.checkContentIntegrity) {
      const contentChunks = chunks.filter((c) => c.type === 'content');
      if (contentChunks.length === 0) {
        warnings.push('No content chunks received');
      }
    }

    // 检查时间戳单调性
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].timestamp < chunks[i - 1].timestamp) {
        warnings.push(`Chunk #${i}: timestamp is not monotonically increasing`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 重置验证器状态
   */
  reset(): void {
    this.chunks = [];
    this.fullContent = '';
    this.toolCalls.clear();
  }
}
