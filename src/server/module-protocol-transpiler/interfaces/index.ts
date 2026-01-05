/**
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
  ValidationResult,
  FormatConverter,
  StreamConverter,
  FormatConverterFactory,
} from './format-converter';

// ============================================
// Re-export from core
// ============================================
export type {
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
