/**
 * Module: Protocol Transpiler
 *
 * Unified protocol conversion for LLM API formats.
 *
 * Features:
 * - Convert between OpenAI, Anthropic, and Gemini formats
 * - Support for request/response/stream chunk conversion
 * - Format detection from various sources (path, URL, request body, headers)
 * - Extended features support (reasoning, thinking, cache)
 *
 * @example
 * ```typescript
 * import { protocolTranspiler } from './module-protocol-transpiler';
 *
 * // Convert Anthropic request to OpenAI format
 * const result = await protocolTranspiler.transpile(
 *   anthropicRequest,
 *   'anthropic',
 *   'openai'
 * );
 *
 * if (result.success) {
 *   const openaiRequest = result.data!;
 *   console.log('Converted!', result.metadata);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */

// ==========================================
// Core API
// ==========================================

export {
  protocolTranspiler,
  getRegisteredVendors,
  isVendorRegistered,
  ProtocolTranspiler,
} from './protocol-transpiler-singleton';

// ==========================================
// Types
// ==========================================

export type {
  // Internal Format
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
} from './interfaces/internal-format';

export type {
  // Vendor Types
  VendorType,
  VendorConfig,
  VendorCapabilities,
  VendorAuth,
  VendorFormatSignature,
  VendorRegistry,
} from './interfaces/vendor-types';

export { ApiFormat } from './interfaces/vendor-types';

export type {
  // Format Converter
  FormatConverter,
  ConversionDirection,
  ValidationResult,
  StreamConverter,
  FormatConverterFactory,
} from './interfaces/format-converter';

export type {
  // Transpile Result
  TranspileResult,
  TranspileError,
  TranspileErrorCode,
  TranspileMetadata,
} from './core/transpile-result';

// ==========================================
// Utilities
// ==========================================

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
} from './core/transpile-result';

export {
  // Format Detection
  detectFormatFromPath,
  detectFormatFromUrl,
  detectRequestFormat,
  detectResponseFormat,
  detectFormatFromHeaders,
  detectFormatWithConfidence,
} from './utils/format-detector';

export type {
  FormatDetectionResult,
} from './utils/format-detector';

// ==========================================
// Converters (for direct access if needed)
// ==========================================

export {
  OpenAIConverter,
  AnthropicConverter,
  GeminiConverter,
  ResponsesConverter,
} from './converters';

// ==========================================
// Parsers (SSE stream parsing)
// ==========================================

export {
  BaseSSEParser,
  VendorFormat as SSEParserVendorFormat,
  AnthropicSSEParser,
  OpenAISSEParser,
} from './parsers';

export type {
  ISSEParser,
  SSEEvent,
} from './parsers';
