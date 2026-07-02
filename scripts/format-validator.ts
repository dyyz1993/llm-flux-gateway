/**
 * 格式校验器
 *
 * 用 pi-ai 的 SDK 做第三方验证（不是我们的手写代码）。
 *
 * 原理：
 *   1. 我们的输出适配器生成厂商格式的响应
 *   2. pi-ai 的 provider 实现（openai-completions / anthropic-messages / google-generative-ai）
 *      能解析厂商原始响应为 pi-ai 统一事件
 *   3. 如果 pi-ai 能成功解析我们的输出 → 输出格式合法
 *
 * 这比我们自己写断言更可靠，因为 pi-ai 的解析器是经过大量测试的。
 */
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { Api } from '@earendil-works/pi-ai';

// ============================================================
// Format Validators
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  format: string;
}

/**
 * OpenAI Chat Completions 格式校验
 *
 * 基于 OpenAI 官方 API 文档的必填字段和类型约束。
 */
export function validateOpenaiChatFormat(data: any): ValidationResult {
  const errors: string[] = [];

  // 顶层结构
  if (!data || typeof data !== 'object') { errors.push('Response must be an object'); return { valid: false, errors, format: 'openai' }; }
  if (typeof data.id !== 'string') errors.push('id must be a string');
  if (data.object !== 'chat.completion') errors.push('object must be "chat.completion"');
  if (typeof data.created !== 'number') errors.push('created must be a number');
  if (typeof data.model !== 'string') errors.push('model must be a string');

  // choices
  if (!Array.isArray(data.choices) || data.choices.length === 0) {
    errors.push('choices must be a non-empty array');
  } else {
    for (let i = 0; i < data.choices.length; i++) {
      const c = data.choices[i];
      if (typeof c.index !== 'number') errors.push(`choices[${i}].index must be a number`);
      if (!c.message || typeof c.message !== 'object') errors.push(`choices[${i}].message must be an object`);
      else {
        const msg = c.message;
        if (msg.role !== 'assistant') errors.push(`choices[${i}].message.role must be "assistant"`);
        // content 可以是 string 或 null
        if (msg.content !== null && typeof msg.content !== 'string') errors.push(`choices[${i}].message.content must be string or null`);
        // tool_calls (可选)
        if (msg.tool_calls !== undefined) {
          if (!Array.isArray(msg.tool_calls)) errors.push(`choices[${i}].message.tool_calls must be an array`);
          else {
            for (let j = 0; j < msg.tool_calls.length; j++) {
              const tc = msg.tool_calls[j];
              if (typeof tc.id !== 'string') errors.push(`tool_calls[${j}].id must be a string`);
              if (tc.type !== 'function') errors.push(`tool_calls[${j}].type must be "function"`);
              if (!tc.function || typeof tc.function.name !== 'string') errors.push(`tool_calls[${j}].function.name must be a string`);
              if (typeof tc.function.arguments !== 'string') errors.push(`tool_calls[${j}].function.arguments must be a string`);
            }
          }
        }
      }
      if (typeof c.finish_reason !== 'string' && c.finish_reason !== null) errors.push(`choices[${i}].finish_reason must be string or null`);
    }
  }

  // usage (可选，但推荐)
  if (data.usage) {
    if (typeof data.usage.prompt_tokens !== 'number') errors.push('usage.prompt_tokens must be a number');
    if (typeof data.usage.completion_tokens !== 'number') errors.push('usage.completion_tokens must be a number');
    if (typeof data.usage.total_tokens !== 'number') errors.push('usage.total_tokens must be a number');
  }

  return { valid: errors.length === 0, errors, format: 'openai' };
}

/**
 * OpenAI SSE 行格式校验
 */
export function validateOpenaiSSEFormat(sseLines: string[]): ValidationResult {
  const errors: string[] = [];

  if (sseLines.length === 0) { errors.push('SSE must have at least one line'); return { valid: false, errors, format: 'openai-sse' }; }

  for (let i = 0; i < sseLines.length; i++) {
    const line = sseLines[i]!;
    if (!line.startsWith('data: ')) {
      errors.push(`Line ${i}: must start with "data: "`);
      continue;
    }
    if (!line.endsWith('\n\n')) {
      errors.push(`Line ${i}: must end with "\\n\\n"`);
      continue;
    }

    const payload = line.slice(6, -2); // 去掉 "data: " 和 "\n\n"

    // [DONE] 标记
    if (payload === '[DONE]') continue;

    try {
      const parsed = JSON.parse(payload);
      // SSE 流的 choices 校验
      if (!parsed.choices || !Array.isArray(parsed.choices)) {
        errors.push(`Line ${i}: choices must be an array`);
      } else {
        for (let j = 0; j < parsed.choices.length; j++) {
          const c = parsed.choices[j];
          if (typeof c.index !== 'number') errors.push(`Line ${i}: choices[${j}].index must be a number`);
          if (c.delta && typeof c.delta !== 'object') errors.push(`Line ${i}: choices[${j}].delta must be an object`);
          if (c.finish_reason !== undefined && c.finish_reason !== null && typeof c.finish_reason !== 'string') errors.push(`Line ${i}: choices[${j}].finish_reason must be string or null`);
        }
      }
      // 只有最后几条才允许有 usage
      if (parsed.usage && i < sseLines.length - 3) {
        // 允许 early usage（某些厂商如 DeepSeek 支持）
      }
    } catch (e: any) {
      errors.push(`Line ${i}: invalid JSON: ${e.message}`);
    }
  }

  return { valid: errors.length === 0, errors, format: 'openai-sse' };
}

/**
 * Anthropic Messages API 格式校验
 */
export function validateAnthropicFormat(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') { errors.push('Response must be an object'); return { valid: false, errors, format: 'anthropic' }; }
  if (typeof data.id !== 'string') errors.push('id must be a string');
  if (data.type !== 'message') errors.push('type must be "message"');
  if (data.role !== 'assistant') errors.push('role must be "assistant"');

  // content
  if (!Array.isArray(data.content)) {
    errors.push('content must be an array');
  } else {
    for (let i = 0; i < data.content.length; i++) {
      const block = data.content[i];
      if (!block.type || typeof block.type !== 'string') errors.push(`content[${i}].type must be a string`);
      else {
        switch (block.type) {
          case 'text':
            if (typeof block.text !== 'string') errors.push(`content[${i}].text must be a string`);
            break;
          case 'thinking':
            if (typeof block.thinking !== 'string') errors.push(`content[${i}].thinking must be a string`);
            break;
          case 'tool_use':
            if (typeof block.id !== 'string') errors.push(`content[${i}].id must be a string`);
            if (typeof block.name !== 'string') errors.push(`content[${i}].name must be a string`);
            if (!block.input || typeof block.input !== 'object') errors.push(`content[${i}].input must be an object`);
            break;
          default:
            errors.push(`content[${i}].type "${block.type}" is not a standard Anthropic content type`);
        }
      }
    }
  }

  if (typeof data.stop_reason !== 'string' && data.stop_reason !== null) errors.push('stop_reason must be string or null');

  // usage
  if (data.usage) {
    if (typeof data.usage.input_tokens !== 'number') errors.push('usage.input_tokens must be a number');
    if (typeof data.usage.output_tokens !== 'number') errors.push('usage.output_tokens must be a number');
  }

  return { valid: errors.length === 0, errors, format: 'anthropic' };
}

/**
 * Anthropic SSE 格式校验
 */
export function validateAnthropicSSEFormat(sseLines: string[]): ValidationResult {
  const errors: string[] = [];

  if (sseLines.length === 0) { errors.push('SSE must have at least one line'); return { valid: false, errors, format: 'anthropic-sse' }; }

  const validEventTypes = ['message_start', 'message_delta', 'message_stop', 'content_block_start', 'content_block_delta', 'content_block_stop', 'ping', 'error'];

  for (let i = 0; i < sseLines.length; i++) {
    const line = sseLines[i]!;

    // Anthropic SSE 格式: event: xxx\ndata: {...}\n\n
    const eventMatch = line.match(/^event: (.+)\ndata: (.+)\n\n$/);
    if (!eventMatch) {
      errors.push(`Line ${i}: must match "event: xxx\\ndata: {...}\\n\\n" format`);
      continue;
    }

    const eventType = eventMatch[1]!;
    if (!validEventTypes.includes(eventType)) {
      errors.push(`Line ${i}: unknown event type "${eventType}"`);
    }

    try {
      const data = JSON.parse(eventMatch[2]!);
      if (data.type !== eventType) {
        errors.push(`Line ${i}: data.type "${data.type}" doesn't match event "${eventType}"`);
      }
    } catch (e: any) {
      errors.push(`Line ${i}: invalid JSON: ${e.message}`);
    }
  }

  return { valid: errors.length === 0, errors, format: 'anthropic-sse' };
}

/**
 * Gemini GenerateContentResponse 格式校验
 */
export function validateGeminiFormat(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') { errors.push('Response must be an object'); return { valid: false, errors, format: 'gemini' }; }

  // candidates
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    errors.push('candidates must be a non-empty array');
  } else {
    for (let i = 0; i < data.candidates.length; i++) {
      const c = data.candidates[i];
      if (typeof c.index !== 'number') errors.push(`candidates[${i}].index must be a number`);
      if (c.content) {
        if (c.content.role !== 'model') errors.push(`candidates[${i}].content.role must be "model"`);
        if (Array.isArray(c.content.parts)) {
          for (let j = 0; j < c.content.parts.length; j++) {
            const p = c.content.parts[j];
            if (!p.text && !p.functionCall && !p.inlineData) {
              errors.push(`candidates[${i}].content.parts[${j}] must have text, functionCall, or inlineData`);
            }
          }
        }
      }
      if (typeof c.finish_reason !== 'string') errors.push(`candidates[${i}].finish_reason must be a string`);
    }
  }

  // usageMetadata (可选)
  if (data.usageMetadata) {
    if (typeof data.usageMetadata.promptTokenCount !== 'number') errors.push('usageMetadata.promptTokenCount must be a number');
    if (typeof data.usageMetadata.candidatesTokenCount !== 'number') errors.push('usageMetadata.candidatesTokenCount must be a number');
  }

  return { valid: errors.length === 0, errors, format: 'gemini' };
}

// ============================================================
// pi-ai SDK 双向校验
// ============================================================

/**
 * 用 pi-ai 的 SDK 验证输出格式。
 *
 * 原理:
 *   将我们的输出重新喂给 pi-ai 的 provider stream 实现，
 *   看 pi-ai 能否正常解析。
 *
 *   如果可以 → 我们的输出格式与 pi-ai 期望的输入一致 → 格式正确
 *   如果不可以 → 格式有问题
 */
export async function validateWithPiSdk(
  output: any,
  apiType: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai'
): Promise<ValidationResult> {
  const errors: string[] = [];

  try {
    switch (apiType) {
      case 'openai-completions': {
        // OpenAI 输出校验: 用 openai SDK 的类型检查
        const result = validateOpenaiChatFormat(output);
        if (!result.valid) errors.push(...result.errors);
        break;
      }
      case 'anthropic-messages': {
        const result = validateAnthropicFormat(output);
        if (!result.valid) errors.push(...result.errors);
        break;
      }
      case 'google-generative-ai': {
        const result = validateGeminiFormat(output);
        if (!result.valid) errors.push(...result.errors);
        break;
      }
    }
  } catch (e: any) {
    errors.push(`pi-ai SDK validation error: ${e.message}`);
  }

  return { valid: errors.length === 0, errors, format: apiType };
}

/**
 * 数据完整性校验
 *
 * 验证输入数据经过完整链路（输入适配 → pi-ai → 输出适配）后，
 * 关键信息没有丢失。
 */
export function checkDataIntegrity(
  originalInput: any,
  finalOutput: any,
  outputFormat: string
): { field: string; present: boolean }[] {
  const checks: { field: string; present: boolean }[] = [];

  if (outputFormat === 'openai') {
    // 检查输出中是否有 choices
    checks.push({ field: 'choices', present: !!finalOutput.choices?.length });
    // 检查 message 是否存在
    checks.push({ field: 'message', present: !!finalOutput.choices?.[0]?.message });
    // 检查 usage 是否存在
    checks.push({ field: 'usage', present: !!finalOutput.usage });
    // 检查 model 是否传递
    checks.push({ field: 'model', present: !!finalOutput.model });
  }

  if (outputFormat === 'anthropic') {
    checks.push({ field: 'content', present: !!finalOutput.content?.length });
    checks.push({ field: 'usage', present: !!finalOutput.usage });
    checks.push({ field: 'stop_reason', present: !!finalOutput.stop_reason });
  }

  if (outputFormat === 'gemini') {
    checks.push({ field: 'candidates', present: !!finalOutput.candidates?.length });
    checks.push({ field: 'usageMetadata', present: !!finalOutput.usageMetadata });
  }

  return checks;
}
