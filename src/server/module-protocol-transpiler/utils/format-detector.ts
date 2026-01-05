/**
 * Format Detector - Utility Functions
 *
 * This module provides utilities for detecting the vendor format
 * from various sources (URL paths, request bodies, headers, etc.).
 */

import type { VendorType } from '../interfaces/vendor-types';

/**
 * Detect format from URL path
 *
 * Analyzes the URL path to determine the vendor format.
 *
 * @param path - URL path (e.g., '/v1/chat/completions')
 * @returns Detected vendor type
 *
 * @example
 * detectFormatFromPath('/v1/chat/completions') // 'openai'
 * detectFormatFromPath('/v1/messages') // 'anthropic'
 * detectFormatFromPath('/v1/models/gemini-pro:generateContent') // 'gemini'
 */
export function detectFormatFromPath(path: string): VendorType {
  const normalizedPath = path.toLowerCase().replace(/\\/g, '/');

  // Anthropic patterns
  if (
    normalizedPath.includes('/v1/messages') ||
    normalizedPath.includes('/messages')
  ) {
    return 'anthropic';
  }

  // Gemini patterns
  if (
    normalizedPath.includes('generatecontent') ||
    normalizedPath.includes('gemini-') ||
    normalizedPath.includes('/v1/models/')
  ) {
    return 'gemini';
  }

  // OpenAI patterns (default)
  if (
    normalizedPath.includes('/chat/completions') ||
    normalizedPath.includes('/completions') ||
    normalizedPath.includes('/v1/')
  ) {
    return 'openai';
  }

  // Default to OpenAI for unknown paths
  return 'openai';
}

/**
 * Detect format from base URL
 *
 * Analyzes the base URL to determine the vendor format.
 *
 * @param url - Base URL (e.g., 'https://api.anthropic.com')
 * @returns Detected vendor type
 *
 * @example
 * detectFormatFromUrl('https://api.anthropic.com') // 'anthropic'
 * detectFormatFromUrl('https://generativelanguage.googleapis.com') // 'gemini'
 * detectFormatFromUrl('https://api.openai.com') // 'openai'
 */
export function detectFormatFromUrl(url: string): VendorType {
  const normalizedUrl = url.toLowerCase();

  // Anthropic
  if (normalizedUrl.includes('anthropic.com')) {
    return 'anthropic';
  }

  // Gemini/Google
  if (
    normalizedUrl.includes('googleapis.com') ||
    normalizedUrl.includes('google.')
  ) {
    return 'gemini';
  }

  // OpenAI (default)
  if (
    normalizedUrl.includes('openai.com') ||
    normalizedUrl.includes('openai')
  ) {
    return 'openai';
  }

  // Default to OpenAI for unknown URLs
  return 'openai';
}

/**
 * Detect format from request body
 *
 * Analyzes the request structure to determine the vendor format.
 * Uses heuristic analysis with confidence scoring.
 *
 * @param data - Request body object
 * @returns Detected vendor type
 *
 * @example
 * detectRequestFormat({ model: 'gpt-4', messages: [...] }) // 'openai'
 * detectRequestFormat({ model: 'claude-3', messages: [...], max_tokens: 4096 }) // 'anthropic'
 */
export function detectRequestFormat(data: unknown): VendorType {
  if (!data || typeof data !== 'object') {
    return 'openai'; // Default
  }

  const obj = data as Record<string, unknown>;

  // Check for Anthropic-specific fields
  if (hasAnthropicSignature(obj)) {
    return 'anthropic';
  }

  // Check for Gemini-specific fields
  if (hasGeminiSignature(obj)) {
    return 'gemini';
  }

  // Check for OpenAI-specific fields
  if (hasOpenAISignature(obj)) {
    return 'openai';
  }

  // Default to OpenAI
  return 'openai';
}

/**
 * Detect format from response body
 *
 * Analyzes the response structure to determine the vendor format.
 *
 * @param data - Response body object
 * @returns Detected vendor type
 */
export function detectResponseFormat(data: unknown): VendorType {
  if (!data || typeof data !== 'object') {
    return 'openai'; // Default
  }

  const obj = data as Record<string, unknown>;

  // Check for Anthropic-specific fields
  if (
    'type' in obj &&
    obj.type === 'message' &&
    'content' in obj &&
    Array.isArray(obj.content)
  ) {
    return 'anthropic';
  }

  // Check for Gemini-specific fields
  if ('candidates' in obj && Array.isArray(obj.candidates)) {
    return 'gemini';
  }

  // Check for OpenAI-specific fields
  if ('choices' in obj && Array.isArray(obj.choices)) {
    return 'openai';
  }

  // Default to OpenAI
  return 'openai';
}

/**
 * Detect format from headers
 *
 * Analyzes HTTP headers to determine the vendor format.
 *
 * @param headers - HTTP headers object
 * @returns Detected vendor type
 */
export function detectFormatFromHeaders(headers: Record<string, string>): VendorType {
  const userAgent = (headers['user-agent'] || '').toLowerCase();

  // Anthropic SDK detection
  if (userAgent.includes('anthropic-sdk') || userAgent.includes('anthropic-')) {
    return 'anthropic';
  }

  // Google SDK detection
  if (userAgent.includes('google-api') || userAgent.includes('gemini-')) {
    return 'gemini';
  }

  // OpenAI SDK detection
  if (userAgent.includes('openai') || userAgent.includes('openai/')) {
    return 'openai';
  }

  // Default to OpenAI
  return 'openai';
}

// ============================================
// Helper Functions for Format Detection
// ============================================

/**
 * Check for Anthropic format signatures
 */
function hasAnthropicSignature(data: Record<string, unknown>): boolean {
  // Request signatures
  if ('max_tokens' in data && !('max_tokens' in data && data.max_tokens === 0)) {
    // Anthropic requires max_tokens
    return true;
  }

  if ('system' in data && 'messages' in data && Array.isArray(data.messages)) {
    // System as separate field is Anthropic
    return true;
  }

  if ('tools' in data && Array.isArray(data.tools)) {
    const tool = data.tools[0];
    if (
      tool &&
      typeof tool === 'object' &&
      'input_schema' in tool &&
      !('function' in tool)
    ) {
      // Anthropic uses input_schema directly
      return true;
    }
  }

  // Response signatures
  if (
    'type' in data &&
    data.type === 'message' &&
    'content' in data &&
    Array.isArray(data.content)
  ) {
    return true;
  }

  if (
    'stop_reason' in data &&
    typeof data.stop_reason === 'string' &&
    ['end_turn', 'max_tokens', 'tool_use', 'stop_sequence'].includes(data.stop_reason)
  ) {
    return true;
  }

  return false;
}

/**
 * Check for Gemini format signatures
 */
function hasGeminiSignature(data: Record<string, unknown>): boolean {
  // Request signatures
  if ('contents' in data && Array.isArray(data.contents)) {
    const content = data.contents[0];
    if (content && typeof content === 'object' && 'parts' in content) {
      return true;
    }
  }

  if ('systemInstruction' in data) {
    return true;
  }

  if ('generationConfig' in data) {
    const config = data.generationConfig;
    if (config && typeof config === 'object' && ('topP' in config || 'topK' in config)) {
      // camelCase config is Gemini
      return true;
    }
  }

  if ('tools' in data) {
    const tools = data.tools;
    if (Array.isArray(tools) && tools[0] && typeof tools[0] === 'object') {
      const tool = tools[0];
      if ('functionDeclarations' in tool) {
        return true;
      }
    }
  }

  // Response signatures
  if ('candidates' in data && Array.isArray(data.candidates)) {
    const candidate = data.candidates[0];
    if (
      candidate &&
      typeof candidate === 'object' &&
      ('content' in candidate || 'finishReason' in candidate)
    ) {
      return true;
    }
  }

  if ('usageMetadata' in data) {
    return true;
  }

  return false;
}

/**
 * Check for OpenAI format signatures
 */
function hasOpenAISignature(data: Record<string, unknown>): boolean {
  // Request signatures
  if ('messages' in data && Array.isArray(data.messages)) {
    // Check for standard OpenAI message format
    const msg = data.messages[0];
    if (
      msg &&
      typeof msg === 'object' &&
      'role' in msg &&
      typeof msg.role === 'string' &&
      ['system', 'user', 'assistant', 'tool'].includes(msg.role)
    ) {
      return true;
    }
  }

  if ('tools' in data && Array.isArray(data.tools)) {
    const tool = data.tools[0];
    if (
      tool &&
      typeof tool === 'object' &&
      'type' in tool &&
      tool.type === 'function' &&
      'function' in tool
    ) {
      return true;
    }
  }

  // Response signatures
  if ('choices' in data && Array.isArray(data.choices)) {
    const choice = data.choices[0];
    if (
      choice &&
      typeof choice === 'object' &&
      'message' in choice &&
      typeof choice.message === 'object' &&
      'role' in choice.message &&
      choice.message.role === 'assistant'
    ) {
      return true;
    }
  }

  if ('usage' in data) {
    const usage = data.usage;
    if (
      usage &&
      typeof usage === 'object' &&
      ('prompt_tokens' in usage || 'completion_tokens' in usage)
    ) {
      // snake_case usage is OpenAI
      return true;
    }
  }

  return false;
}

/**
 * Get all format detection results with confidence scores
 *
 * @param data - Request/response body
 * @returns Array of possible formats with confidence scores
 */
export interface FormatDetectionResult {
  format: VendorType;
  confidence: number;
  reasons: string[];
}

export function detectFormatWithConfidence(data: unknown): FormatDetectionResult[] {
  const results: FormatDetectionResult[] = [];

  if (!data || typeof data !== 'object') {
    return [
      {
        format: 'openai',
        confidence: 0.1,
        reasons: ['Default fallback (invalid data)'],
      },
    ];
  }

  const obj = data as Record<string, unknown>;

  // Check Anthropic
  const anthropicReasons: string[] = [];
  if ('max_tokens' in obj) anthropicReasons.push('Has max_tokens');
  if ('system' in obj) anthropicReasons.push('Has system field');
  if ('anthropic_version' in obj) anthropicReasons.push('Has anthropic_version');
  if (anthropicReasons.length > 0) {
    results.push({
      format: 'anthropic',
      confidence: 0.5 + anthropicReasons.length * 0.15,
      reasons: anthropicReasons,
    });
  }

  // Check Gemini
  const geminiReasons: string[] = [];
  if ('contents' in obj) geminiReasons.push('Has contents');
  if ('generationConfig' in obj) geminiReasons.push('Has generationConfig');
  if ('systemInstruction' in obj) geminiReasons.push('Has systemInstruction');
  if (geminiReasons.length > 0) {
    results.push({
      format: 'gemini',
      confidence: 0.5 + geminiReasons.length * 0.15,
      reasons: geminiReasons,
    });
  }

  // Check OpenAI (default)
  const openaiReasons: string[] = [];
  if ('messages' in obj) openaiReasons.push('Has messages');
  if ('model' in obj) openaiReasons.push('Has model');
  if ('tools' in obj) openaiReasons.push('Has tools');
  results.push({
    format: 'openai',
    confidence: 0.3 + openaiReasons.length * 0.1,
    reasons: openaiReasons.length > 0 ? openaiReasons : ['Default fallback'],
  });

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
