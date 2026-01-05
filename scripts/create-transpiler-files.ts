#!/usr/bin/env tsx
/**
 * Script to create ProtocolTranspiler type definition files
 *
 * Run with: npx tsx create-transpiler-files.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseDir = 'src/server/module-protocol-transpiler';

console.log('📁 Creating ProtocolTranspiler type definitions...\n');

// ============================================
// File 1: core/transpile-result.ts
// ============================================

const transpileResultContent = `/**
 * Transpile Result - Core Result Types
 *
 * This module defines result types used throughout the transpiler
 * for reporting success, errors, warnings, and metadata.
 */

import type { VendorType } from '../interfaces/vendor-types';

/**
 * Transpile result - the standard return type for all transpilation operations
 *
 * This result type provides comprehensive information about the operation:
 * - Success/failure status
 * - Converted data (if successful)
 * - Errors and warnings
 * - Performance metadata
 */
export interface TranspileResult<T> {
  /** Whether the transpilation was successful */
  success: boolean;

  /** Converted data (if successful) */
  data?: T;

  /** Errors encountered during transpilation */
  errors?: TranspileError[];

  /** Warnings encountered during transpilation */
  warnings?: TranspileError[];

  /** Metadata about the transpilation process */
  metadata?: TranspileMetadata;
}

/**
 * Transpile error with detailed context
 *
 * Errors include full context for debugging:
 * - Path to the error location
 * - Human-readable message
 * - Error code for categorization
 * - Original value that caused the error
 */
export interface TranspileError {
  /** JSON path to the error location (e.g., 'messages.0.content') */
  path: string;

  /** Human-readable error message */
  message: string;

  /** Error code for categorization */
  code: TranspileErrorCode;

  /** Original value that caused the error */
  value?: unknown;

  /** Stack trace (for debugging) */
  stack?: string;

  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Standard error codes for transpilation failures
 *
 * These codes help categorize and handle different types of errors.
 */
export type TranspileErrorCode =
  // Field errors
  | 'MISSING_REQUIRED_FIELD'
  | 'UNKNOWN_FIELD'
  | 'INVALID_FIELD'

  // Type errors
  | 'INVALID_TYPE'
  | 'TYPE_MISMATCH'
  | 'UNEXPECTED_NULL'

  // Value errors
  | 'INVALID_VALUE'
  | 'VALUE_OUT_OF_RANGE'
  | 'INVALID_ENUM_VALUE'

  // Structure errors
  | 'INVALID_STRUCTURE'
  | 'MALFORMED_DATA'
  | 'EMPTY_ARRAY'

  // Feature errors
  | 'UNSUPPORTED_FEATURE'
  | 'FEATURE_NOT_AVAILABLE'
  | 'VENDOR_MISMATCH'

  // Tool/Function errors
  | 'INVALID_TOOL_DEFINITION'
  | 'INVALID_TOOL_CALL'
  | 'TOOL_PARAMETERS_ERROR'

  // Message errors
  | 'INVALID_MESSAGE'
  | 'INVALID_MESSAGE_ROLE'
  | 'INVALID_CONTENT_BLOCK'

  // Parse errors
  | 'PARSE_ERROR'
  | 'JSON_PARSE_ERROR'
  | 'INVALID_JSON'

  // Validation errors
  | 'VALIDATION_FAILED'
  | 'SCHEMA_VALIDATION_FAILED'

  // General errors
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR';

/**
 * Transpile metadata - information about the transpilation process
 *
 * This metadata helps with:
 * - Debugging conversion issues
 * - Performance monitoring
 * - Analytics and logging
 */
export interface TranspileMetadata {
  /** Source vendor format */
  fromVendor: VendorType;

  /** Target vendor format */
  toVendor: VendorType;

  /** Timestamp when transpilation was performed */
  convertedAt: number;

  /** Time taken for transpilation (milliseconds) */
  conversionTimeMs: number;

  /** Number of fields that were successfully converted */
  fieldsConverted: number;

  /** Number of fields that were ignored (not supported) */
  fieldsIgnored: number;

  /** Number of fields that triggered warnings */
  fieldsWarned: number;

  /** Fields that were transformed or mapped */
  transformedFields?: string[];

  /** Fields that were ignored (not supported) */
  ignoredFields?: string[];

  /** Original data size (bytes, if available) */
  originalDataSize?: number;

  /** Converted data size (bytes, if available) */
  convertedDataSize?: number;

  /** Additional vendor-specific metadata */
  [key: string]: unknown;
}

/**
 * Create a successful transpile result
 *
 * @param data - The converted data
 * @param metadata - Optional metadata
 * @returns Success result
 */
export function success<T>(
  data: T,
  metadata?: Partial<TranspileMetadata>
): TranspileResult<T> {
  return {
    success: true,
    data,
    metadata: metadata as TranspileMetadata,
  };
}

/**
 * Create a failed transpile result
 *
 * @param errors - Array of errors
 * @param warnings - Optional array of warnings
 * @returns Failure result
 */
export function failure<T>(
  errors: TranspileError[],
  warnings?: TranspileError[]
): TranspileResult<T> {
  return {
    success: false,
    errors,
    warnings,
  };
}

/**
 * Create a transpile error
 *
 * @param path - JSON path to error location
 * @param message - Error message
 * @param code - Error code
 * @param value - Original value (optional)
 * @returns Transpile error object
 */
export function createError(
  path: string,
  message: string,
  code: TranspileErrorCode,
  value?: unknown
): TranspileError {
  return {
    path,
    message,
    code,
    value,
    severity: 'error',
  };
}

/**
 * Create a transpile warning
 *
 * @param path - JSON path to warning location
 * @param message - Warning message
 * @param code - Warning code
 * @param value - Original value (optional)
 * @returns Transpile error object with warning severity
 */
export function createWarning(
  path: string,
  message: string,
  code: TranspileErrorCode,
  value?: unknown
): TranspileError {
  return {
    path,
    message,
    code,
    value,
    severity: 'warning',
  };
}

/**
 * Merge multiple transpile results into one
 *
 * @param results - Array of transpile results
 * @returns Combined result
 */
export function mergeResults<T>(
  results: TranspileResult<T>[]
): TranspileResult<T[]> {
  const allErrors: TranspileError[] = [];
  const allWarnings: TranspileError[] = [];
  const successfulData: T[] = [];

  for (const result of results) {
    if (result.errors) {
      allErrors.push(...result.errors);
    }
    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
    if (result.success && result.data !== undefined) {
      successfulData.push(result.data!);
    }
  }

  return {
    success: allErrors.length === 0,
    data: successfulData,
    errors: allErrors.length > 0 ? allErrors : undefined,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

/**
 * Check if a transpile result is successful
 *
 * @param result - Transpile result to check
 * @returns True if successful
 */
export function isSuccess<T>(result: TranspileResult<T>): result is TranspileResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Check if a transpile result has errors
 *
 * @param result - Transpile result to check
 * @returns True if has errors
 */
export function hasErrors<T>(result: TranspileResult<T>): boolean {
  return !result.success || (result.errors !== undefined && result.errors.length > 0);
}

/**
 * Check if a transpile result has warnings
 *
 * @param result - Transpile result to check
 * @returns True if has warnings
 */
export function hasWarnings<T>(result: TranspileResult<T>): boolean {
  return result.warnings !== undefined && result.warnings.length > 0;
}

/**
 * Format errors for display
 *
 * @param result - Transpile result
 * @returns Formatted error string
 */
export function formatErrors<T>(result: TranspileResult<T>): string {
  if (!hasErrors(result)) {
    return 'No errors';
  }

  return result.errors!
    .map(err => \`[\${err.code}] \${err.path}: \${err.message}\`)
    .join('\\n');
}

/**
 * Format warnings for display
 *
 * @param result - Transpile result
 * @returns Formatted warning string
 */
export function formatWarnings<T>(result: TranspileResult<T>): string {
  if (!hasWarnings(result)) {
    return 'No warnings';
  }

  return result.warnings!
    .map(warn => \`[\${warn.code}] \${warn.path}: \${warn.message}\`)
    .join('\\n');
}
`;

// ============================================
// File 2: utils/format-detector.ts
// ============================================

const formatDetectorContent = `/**
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
  const contentType = (headers['content-type'] || '').toLowerCase();

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
`;

// ============================================
// File 3: interfaces/index.ts (barrel export)
// ============================================

const indexContent = `/**
 * Protocol Transpiler - Public API
 *
 * This module exports all public types and interfaces for the protocol transpiler.
 */

// ============================================
// Internal Format Types
// ============================================
export type {
  MessageRole,
  FinishReason,
  InternalRequest,
  InternalResponse,
  InternalMessage,
  InternalContentBlock,
  TextContentBlock,
  ImageUrlContentBlock,
  ThinkingContentBlock,
  CacheControlContentBlock,
  InternalTool,
  InternalToolCall,
  InternalChoice,
  InternalStreamChunk,
  InternalUsage,
  InternalError,
  InternalMetadata,
  InternalRequestWithMetadata,
  InternalResponseWithMetadata,
} from './internal-format';

// ============================================
// Vendor Types
// ============================================
export type {
  VendorType,
  VendorConfig,
  VendorCapabilities,
  VendorAuth,
  VendorFormatSignature,
  VendorRegistry,
} from './vendor-types';

// ============================================
// Format Converter Types
// ============================================
export type {
  ConversionDirection,
  ConversionError,
  ErrorCode,
  ConversionResult,
  ConversionMetadata,
  ValidationResult,
  FormatConverter,
  StreamConverter,
  FormatConverterFactory,
} from './format-converter';

// ============================================
// Re-export for convenience
// ============================================
export type {
  // From core
  TranspileResult,
  TranspileError,
  TranspileErrorCode,
  TranspileMetadata,
} from '../core/transpile-result';

// Utility functions
export {
  success,
  failure,
  createError,
  createWarning,
  mergeResults,
  isSuccess,
  hasErrors,
  hasWarnings,
  formatErrors,
  formatWarnings,
} from '../core/transpile-result';
`;

// ============================================
// Create files
// ============================================

try {
  // Create core directory if needed
  mkdirSync(join(baseDir, 'core'), { recursive: true });

  // Create utils directory if needed
  mkdirSync(join(baseDir, 'utils'), { recursive: true });

  // Write transpile-result.ts
  writeFileSync(join(baseDir, 'core/transpile-result.ts'), transpileResultContent);
  console.log('✅ Created core/transpile-result.ts');

  // Write format-detector.ts
  writeFileSync(join(baseDir, 'utils/format-detector.ts'), formatDetectorContent);
  console.log('✅ Created utils/format-detector.ts');

  // Write index.ts
  writeFileSync(join(baseDir, 'interfaces/index.ts'), indexContent);
  console.log('✅ Created interfaces/index.ts');

  console.log('\n✨ All files created successfully!');
  console.log('\n📝 Next steps:');
  console.log('   1. Run: npm run typecheck');
  console.log('   2. Review the type definitions');
  console.log('   3. Implement converter classes');

} catch (error) {
  console.error('❌ Error creating files:', error);
  process.exit(1);
}
