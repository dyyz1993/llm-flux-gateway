/**
 * Response Parser - Shared Utility for Parsing LLM API Responses
 *
 * Provides a unified interface to parse and extract information from
 * different LLM API response formats (OpenAI, Anthropic, Gemini).
 *
 * Used by:
 * - Backend: Log service, analytics service
 * - Frontend: LogExplorer component
 */

import { ApiFormat } from '../server/module-protocol-transpiler';

// ==========================================
// Type Definitions for Parsed Response
// ==========================================

/**
 * Reasoning information extracted from response
 */
export interface ReasoningInfo {
  /** Whether reasoning was used */
  hasReasoning: boolean;
  /** Reasoning token count (if available) */
  reasoningTokens?: number;
  /** Extended thinking blocks (Anthropic) */
  thinkingBlocks?: ThinkingBlock[];
  /** Thinking config used (Gemini) */
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
    thinkingLevel?: 'LOW' | 'HIGH';
  };
  /** Reasoning effort level (OpenAI o1) */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

/**
 * Cache information extracted from response
 */
export interface CacheInfo {
  /** Whether caching was used */
  hasCache: boolean;
  /** Cache read tokens (Anthropic) */
  cacheReadTokens?: number;
  /** Cache write tokens (Anthropic) */
  cacheWriteTokens?: number;
  /** Cached content tokens (Gemini) */
  cachedContentTokens?: number;
  /** Predicted output tokens (OpenAI) */
  acceptedPredictionTokens?: number;
  /** Rejected prediction tokens (OpenAI) */
  rejectedPredictionTokens?: number;
}

/**
 * Thinking block content (Anthropic Extended Thinking)
 */
export interface ThinkingBlock {
  type: 'thinking';
  content: string;
  timestamp?: number;
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  /** Total prompt tokens */
  promptTokens: number;
  /** Total completion tokens */
  completionTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Cache information */
  cache?: CacheInfo;
  /** Reasoning information */
  reasoning?: ReasoningInfo;
  /** Audio tokens (if any) */
  audioTokens?: {
    promptAudioTokens?: number;
    completionAudioTokens?: number;
  };
}

/**
 * Parsed response structure
 */
export interface ParsedResponse {
  /** Original response format */
  format: ApiFormat;
  /** Response ID */
  id: string;
  /** Model name */
  model: string;
  /** Finish reason */
  finishReason?: string;
  /** Token usage */
  usage: TokenUsage;
  /** Main response content */
  content?: string;
  /** Tool calls (if any) */
  toolCalls?: ToolCallInfo[];
  /** Extended thinking blocks (if any) */
  extendedThinking?: ThinkingBlock[];
  /** System fingerprint (OpenAI) */
  systemFingerprint?: string;
  /** Whether response was streamed */
  streamed?: boolean;
  /** Raw original response (for debugging) */
  raw?: any;
}

/**
 * Tool call information
 */
export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any; // For tool results
}

// ==========================================
// Response Parser Implementation
// ==========================================

export class ResponseParser {
  /**
   * Parse an API response based on its format
   */
  static parse(response: any, format: ApiFormat): ParsedResponse {
    switch (format) {
      case ApiFormat.OPENAI:
        return this.parseOpenAIResponse(response);
      case ApiFormat.ANTHROPIC:
        return this.parseAnthropicResponse(response);
      case ApiFormat.GEMINI:
        return this.parseGeminiResponse(response);
      default:
        return this.parseGenericResponse(response, format);
    }
  }

  /**
   * Parse OpenAI format response
   */
  private static parseOpenAIResponse(response: any): ParsedResponse {
    const usage = this.extractTokenUsage(response, ApiFormat.OPENAI);
    const reasoning = this.extractReasoningInfo(response, ApiFormat.OPENAI);
    const cache = this.extractCacheInfo(response, ApiFormat.OPENAI);

    return {
      format: ApiFormat.OPENAI,
      id: response.id || '',
      model: response.model || '',
      finishReason: response.choices?.[0]?.finish_reason,
      usage: {
        ...usage,
        reasoning,
        cache,
      },
      content: response.choices?.[0]?.message?.content || undefined,
      toolCalls: response.choices?.[0]?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      })),
      systemFingerprint: response.system_fingerprint,
      raw: response,
    };
  }

  /**
   * Parse Anthropic format response
   */
  private static parseAnthropicResponse(response: any): ParsedResponse {
    const usage = this.extractTokenUsage(response, ApiFormat.ANTHROPIC);
    const reasoning = this.extractReasoningInfo(response, ApiFormat.ANTHROPIC);
    const cache = this.extractCacheInfo(response, ApiFormat.ANTHROPIC);

    // Extract content from blocks
    let content: string | undefined;
    const thinkingBlocks: ThinkingBlock[] = [];

    if (Array.isArray(response.content)) {
      const textParts: string[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'thinking') {
          thinkingBlocks.push({
            type: 'thinking',
            content: block.content || block.thinking || '',
          });
        }
      }
      content = textParts.length > 0 ? textParts.join('\n') : undefined;
    } else if (typeof response.content === 'string') {
      content = response.content;
    }

    // Extract tool calls
    const toolCalls = response.content
      ?.filter((b: any) => b.type === 'tool_use')
      .map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.input || {},
      }));

    return {
      format: ApiFormat.ANTHROPIC,
      id: response.id || '',
      model: response.model || '',
      finishReason: response.stop_reason,
      usage: {
        ...usage,
        reasoning,
        cache,
      },
      content,
      toolCalls,
      extendedThinking: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
      raw: response,
    };
  }

  /**
   * Parse Gemini format response
   */
  private static parseGeminiResponse(response: any): ParsedResponse {
    const usage = this.extractTokenUsage(response, ApiFormat.GEMINI);
    const reasoning = this.extractReasoningInfo(response, ApiFormat.GEMINI);
    const cache = this.extractCacheInfo(response, ApiFormat.GEMINI);

    const candidate = response.candidates?.[0];
    let content: string | undefined;
    const toolCalls: ToolCallInfo[] = [];

    if (candidate?.content?.parts) {
      const textParts: string[] = [];
      for (const part of candidate.content.parts) {
        if (part.text) {
          textParts.push(part.text);
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        }
      }
      content = textParts.length > 0 ? textParts.join('\n') : undefined;
    }

    return {
      format: ApiFormat.GEMINI,
      id: `gemini-${Date.now()}`,
      model: response.model || 'gemini-model',
      finishReason: candidate?.finishReason,
      usage: {
        ...usage,
        reasoning,
        cache,
      },
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: response,
    };
  }

  /**
   * Parse generic/unknown format response
   */
  private static parseGenericResponse(response: any, format: ApiFormat): ParsedResponse {
    return {
      format,
      id: response.id || '',
      model: response.model || '',
      finishReason: response.finishReason || response.stop_reason || undefined,
      usage: this.extractTokenUsage(response, format),
      content: response.content || response.choices?.[0]?.message?.content || undefined,
      raw: response,
    };
  }

  // ==========================================
  // Extraction Helpers
  // ==========================================

  /**
   * Extract token usage from response
   */
  private static extractTokenUsage(response: any, format: ApiFormat): TokenUsage {
    switch (format) {
      case ApiFormat.OPENAI:
        return {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        };

      case ApiFormat.ANTHROPIC:
        return {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        };

      case ApiFormat.GEMINI:
        return {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        };

      default:
        return {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        };
    }
  }

  /**
   * Extract reasoning information from response
   */
  private static extractReasoningInfo(response: any, format: ApiFormat): ReasoningInfo | undefined {
    const hasReasoningTokens = (format: ApiFormat) => {
      if (format === ApiFormat.OPENAI) {
        return response.usage?.completion_tokens_details?.reasoning_tokens;
      }
      if (format === ApiFormat.ANTHROPIC) {
        return response.usage?.thinking_tokens;
      }
      if (format === ApiFormat.GEMINI) {
        return response.usageMetadata?.thoughtsTokenCount;
      }
      return undefined;
    };

    const reasoningTokens = hasReasoningTokens(format);

    // Check for thinking blocks (Anthropic)
    const hasThinkingBlocks = Array.isArray(response.content)
      ? response.content.some((b: any) => b.type === 'thinking')
      : false;

    // Check for reasoning_effort (OpenAI request - might be echoed in response metadata)
    const reasoningEffort = response.reasoning_effort || response.config?.reasoning_effort;

    if (!reasoningTokens && !hasThinkingBlocks && !reasoningEffort) {
      return undefined;
    }

    return {
      hasReasoning: true,
      reasoningTokens,
      thinkingBlocks: hasThinkingBlocks
        ? response.content
            .filter((b: any) => b.type === 'thinking')
            .map((b: any) => ({
              type: 'thinking' as const,
              content: b.content || b.thinking || '',
            }))
        : undefined,
      reasoningEffort,
    };
  }

  /**
   * Extract cache information from response
   */
  private static extractCacheInfo(response: any, _format: ApiFormat): CacheInfo | undefined {
    const cacheReadTokens =
      response.usage?.cache_read_tokens ||
      response.usage?.cache_read_input_tokens;

    const cacheWriteTokens =
      response.usage?.cache_write_tokens ||
      response.usage?.cache_creation_input_tokens;

    const cachedContentTokens = response.usage?.cachedContentTokenCount;

    const acceptedPrediction = response.usage?.completion_tokens_details?.accepted_prediction_tokens;
    const rejectedPrediction = response.usage?.completion_tokens_details?.rejected_prediction_tokens;

    if (!cacheReadTokens && !cacheWriteTokens && !cachedContentTokens && !acceptedPrediction) {
      return undefined;
    }

    return {
      hasCache: true,
      cacheReadTokens,
      cacheWriteTokens,
      cachedContentTokens,
      acceptedPredictionTokens: acceptedPrediction,
      rejectedPredictionTokens: rejectedPrediction,
    };
  }

  /**
   * Check if response has a specific feature
   */
  static hasFeature(parsed: ParsedResponse, feature: 'reasoning' | 'cache' | 'toolCalls' | 'extendedThinking'): boolean {
    switch (feature) {
      case 'reasoning':
        return parsed.usage.reasoning?.hasReasoning === true;
      case 'cache':
        return parsed.usage.cache?.hasCache === true;
      case 'toolCalls':
        return parsed.toolCalls !== undefined && parsed.toolCalls.length > 0;
      case 'extendedThinking':
        return parsed.extendedThinking !== undefined && parsed.extendedThinking.length > 0;
      default:
        return false;
    }
  }

  /**
   * Get feature badges for UI display
   */
  static getFeatureBadges(parsed: ParsedResponse): Array<{
    key: string;
    label: string;
    icon: string;
    color: string;
    value?: string | number;
  }> {
    const badges: Array<{
      key: string;
      label: string;
      icon: string;
      color: string;
      value?: string | number;
    }> = [];

    if (this.hasFeature(parsed, 'extendedThinking')) {
      badges.push({
        key: 'thinking',
        label: 'Extended Thinking',
        icon: '🧠',
        color: 'purple',
        value: parsed.extendedThinking?.length,
      });
    }

    if (parsed.usage.reasoning?.reasoningTokens) {
      badges.push({
        key: 'reasoning-tokens',
        label: 'Reasoning Tokens',
        icon: '🔢',
        color: 'indigo',
        value: parsed.usage.reasoning.reasoningTokens,
      });
    }

    if (parsed.usage.cache?.hasCache) {
      badges.push({
        key: 'cache',
        label: 'Cache',
        icon: '💾',
        color: 'blue',
      });
    }

    if (this.hasFeature(parsed, 'toolCalls')) {
      badges.push({
        key: 'tool-calls',
        label: 'Tool Calls',
        icon: '🔧',
        color: 'amber',
        value: parsed.toolCalls?.length,
      });
    }

    return badges;
  }
}
