/**
 * Format Converter Interface
 *
 * Defines the contract for converting between different LLM API formats.
 * All converters use OpenAI format as the internal representation.
 *
 * Architecture:
 *   Vendor Format → Internal Format (OpenAI-based) → Another Vendor Format
 */

import type {
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalMessage,
  InternalTool,
  InternalToolCall,
} from './internal-format';
import type { VendorType } from './vendor-types';
import type {
  TranspileResult,
  TranspileError,
  TranspileMetadata,
} from '../core/transpile-result';

// Re-export internal format types for convenience
export type {
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalMessage,
  InternalTool,
  InternalToolCall,
};

// Re-export vendor types
export type { VendorType};

// Re-export transpile result types for backward compatibility
export type { TranspileResult, TranspileError, TranspileMetadata };

/**
 * Conversion direction - determines how data flows through the transpiler
 */
export type ConversionDirection = 'to-internal' | 'from-internal';

/**
 * Validation result for checking if data matches a format
 */
export interface ValidationResult {
  /** Whether the data is valid for this format */
  valid: boolean;

  /** Confidence score (0-1) for format detection */
  confidence: number;

  /** Errors if validation failed */
  errors?: TranspileError[];

  /** Warnings about potential issues */
  warnings?: TranspileError[];
}

/**
 * Stream converter interface for handling streaming responses
 *
 * Streaming requires special handling because:
 * 1. Chunks arrive incrementally
 * 2. State must be maintained across chunks
 * 3. Delta updates must be accumulated
 */
export interface StreamConverter {
  /**
   * The vendor format this converter handles
   */
  readonly vendorType: VendorType;

  /**
   * Convert a stream chunk from vendor format to internal format
   *
   * @param chunk - Raw SSE chunk string from vendor
   * @returns Parsed internal stream chunk, or null if chunk should be skipped
   */
  convertChunkToInternal(chunk: string): InternalStreamChunk | null;

  /**
   * Convert a stream chunk from internal format to vendor format
   *
   * @param chunk - Internal stream chunk
   * @returns SSE-formatted string for vendor
   */
  convertChunkFromInternal(chunk: InternalStreamChunk): string;

  /**
   * Check if a chunk represents the end of the stream
   *
   * @param chunk - Raw SSE chunk string
   * @returns True if this is the final chunk
   */
  isStreamEnd(chunk: string): boolean;

  /**
   * Extract the data portion from an SSE line
   *
   * @param line - Raw SSE line (e.g., 'data: {...}')
   * @returns JSON string or null if not a data line
   */
  extractDataFromLine(line: string): string | null;
}

/**
 * Main format converter interface
 *
 * All format converters must implement this interface.
 * The converter handles bidirectional conversion between
 * vendor format and internal format.
 */
export interface FormatConverter {
  /**
   * The vendor format this converter handles
   */
  readonly vendorType: VendorType;

  /**
   * Convert a request from vendor format to internal format
   *
   * This is used when receiving requests in vendor format.
   *
   * @param request - Vendor-specific request object
   * @returns Internal request format
   */
  convertRequestToInternal(request: unknown): TranspileResult<InternalRequest>;

  /**
   * Convert a request from internal format to vendor format
   *
   * This is used when sending requests to a vendor.
   *
   * @param internal - Internal request format
   * @returns Vendor-specific request object
   */
  convertRequestFromInternal(internal: InternalRequest): TranspileResult<Record<string, unknown>>;

  /**
   * Convert a response from vendor format to internal format
   *
   * This is used when receiving responses from a vendor.
   *
   * @param response - Vendor-specific response object
   * @returns Internal response format
   */
  convertResponseToInternal(response: unknown): TranspileResult<InternalResponse>;

  /**
   * Convert a response from internal format to vendor format
   *
   * This is used when sending responses to a client.
   *
   * @param internal - Internal response format
   * @returns Vendor-specific response object
   */
  convertResponseFromInternal(internal: InternalResponse): TranspileResult<Record<string, unknown>>;

  /**
   * Get stream converter if streaming is supported
   *
   * @returns Stream converter or undefined if not supported
   */
  getStreamConverter?(): StreamConverter;

  /**
   * Convert a stream chunk from vendor format to internal format
   *
   * This is used when receiving streaming responses from a vendor.
   *
   * @param chunk - Vendor-specific stream chunk (SSE string or parsed object)
   * @returns Internal stream chunk format
   */
  convertStreamChunkToInternal(chunk: string): TranspileResult<InternalStreamChunk>;

  /**
   * Convert a stream chunk from internal format to vendor format
   *
   * This is used when sending streaming responses to a client.
   *
   * @param chunk - Internal stream chunk format
   * @returns Vendor-specific stream chunk (SSE string)
   */
  convertStreamChunkFromInternal(chunk: InternalStreamChunk): TranspileResult<string>;

  /**
   * Validate if an object is a valid request for this format
   *
   * @param data - Object to validate
   * @returns Validation result with confidence score
   */
  isValidRequest(data: unknown): ValidationResult;

  /**
   * Validate if an object is a valid response for this format
   *
   * @param data - Object to validate
   * @returns Validation result with confidence score
   */
  isValidResponse(data: unknown): ValidationResult;

  /**
   * Validate if an object is a valid stream chunk for this format
   *
   * @param data - Object to validate
   * @returns Validation result with confidence score
   */
  isValidStreamChunk(data: unknown): ValidationResult;
}

/**
 * Format converter factory
 *
 * Factory interface for creating converter instances.
 */
export interface FormatConverterFactory {
  /**
   * Get a converter for a specific vendor type
   *
   * @param vendorType - Vendor type identifier
   * @returns Format converter instance
   * @throws Error if vendor type not supported
   */
  getConverter(vendorType: VendorType): FormatConverter;

  /**
   * Register a custom converter
   *
   * @param vendorType - Vendor type identifier
   * @param converter - Converter instance
   */
  registerConverter(vendorType: VendorType, converter: FormatConverter): void;

  /**
   * Check if a converter is available
   *
   * @param vendorType - Vendor type identifier
   * @returns True if converter exists
   */
  hasConverter(vendorType: VendorType): boolean;

  /**
   * List all available converter types
   *
   * @returns Array of vendor type identifiers
   */
  listConverters(): VendorType[];
}
