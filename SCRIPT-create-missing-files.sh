#!/bin/bash
# Manual script to create missing ProtocolTranspiler files
# Run this script from the project root directory

set -e

echo "📁 Creating missing ProtocolTranspiler files..."
echo ""

# Create internal-format.ts
cat > src/server/module-protocol-transpiler/interfaces/internal-format.ts << 'INTERNALFORMAT'
/**
 * Internal Format - Protocol Transpiler Intermediate Representation
 *
 * This module defines the internal format used as an intermediate representation
 * when converting between different LLM API protocols. The internal format is
 * based on OpenAI's API format as it serves as the de facto standard.
 *
 * Architecture:
 *   Vendor Format → Internal Format → Another Vendor Format
 *
 * Design Principles:
 * 1. Based on OpenAI format (most widely adopted)
 * 2. Extensible via index signatures
 * 3. Vendor-agnostic representation
 * 4. Supports all common LLM features
 */

/**
 * Role types for messages in the internal format
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Finish reason types for streaming responses
 */
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;

/**
 * Internal request format - unified representation of LLM API requests
 *
 * This format captures all common parameters across different vendors.
 * Vendor-specific fields can be added via the index signature.
 */
export interface InternalRequest {
  /** Model identifier to use */
  model: string;

  /** Array of messages in the conversation */
  messages: InternalMessage[];

  /** List of tools/functions the model may call */
  tools?: InternalTool[];

  /** Optional tool choice configuration */
  toolChoice?: 'auto' | 'required' | 'none' | { type: string; function: { name: string } };

  /** Sampling temperature (0-2) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Nucleus sampling threshold (0-1) */
  topP?: number;

  /** Whether to stream responses */
  stream?: boolean;

  /** Sequences where generation should stop */
  stop?: string[] | string;

  /** Penalty for new topics (-2.0 to 2.0) */
  presencePenalty?: number;

  /** Penalty for repetition (-2.0 to 2.0) */
  frequencyPenalty?: number;

  /** Number of completions to generate */
  n?: number;

  /** Seed for deterministic sampling */
  seed?: number;

  /** Include log probabilities */
  logprobs?: boolean;

  /** Number of top log probabilities to include */
  topLogprobs?: number;

  /** Vendor-specific parameters */
  [key: string]: unknown;
}

/**
 * Internal message format - unified representation of chat messages
 */
export interface InternalMessage {
  /** Role of the message author */
  role: MessageRole;

  /** Message content - text or structured content blocks */
  content: string | InternalContentBlock[];

  /** Optional name for the message author (user/tool) */
  name?: string;

  /** Tool calls made by the assistant */
  toolCalls?: InternalToolCall[];

  /** ID of the tool call this message is responding to */
  toolCallId?: string;

  /** Additional vendor-specific fields */
  [key: string]: unknown;
}

/**
 * Content block types for multimodal messages
 */
export type InternalContentBlock =
  | TextContentBlock
  | ImageUrlContentBlock
  | ThinkingContentBlock
  | CacheControlContentBlock;

/**
 * Text content block
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Image URL content block
 */
export interface ImageUrlContentBlock {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

/**
 * Thinking/reasoning content block (for models with chain-of-thought)
 */
export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  /** Signature for verified thinking (some vendors) */
  signature?: string;
}

/**
 * Cache control content block (for prompt caching)
 */
export interface CacheControlContentBlock {
  type: 'cache_control';
  cache_control: {
    type: 'ephemeral';
  };
}

/**
 * Internal tool/function definition
 */
export interface InternalTool {
  /** Tool type (currently only 'function') */
  type: 'function';

  /** Function definition */
  function: {
    /** Function name */
    name: string;

    /** Function description */
    description?: string;

    /** JSON Schema for parameters */
    parameters?: Record<string, unknown>;

    /** Whether parameters are required */
    strict?: boolean;
  };
}

/**
 * Internal tool call - represents a function call initiated by the model
 */
export interface InternalToolCall {
  /** Unique identifier for this tool call */
  id: string;

  /** Tool type (currently only 'function') */
  type: 'function';

  /** Function call details */
  function: {
    /** Name of the function to call */
    name: string;

    /** JSON stringified arguments */
    arguments: string;
  };
}

/**
 * Internal response format - unified representation of LLM API responses
 */
export interface InternalResponse {
  /** Unique response identifier */
  id: string;

  /** Object type (e.g., 'chat.completion') */
  object: string;

  /** Unix timestamp of creation */
  created: number;

  /** Model used for generation */
  model: string;

  /** Array of completion choices */
  choices: InternalChoice[];

  /** Token usage information */
  usage?: InternalUsage;

  /** System fingerprint for reproducibility (some vendors) */
  systemFingerprint?: string;

  /** Vendor-specific fields */
  [key: string]: unknown;
}

/**
 * Internal choice - a single completion option
 */
export interface InternalChoice {
  /** Choice index */
  index: number;

  /** Message generated by the model */
  message: InternalMessage;

  /** Reason generation finished */
  finishReason: FinishReason;

  /** Log probabilities (if requested) */
  logprobs?: {
    tokens: string[];
    token_logprobs: number[];
    top_logprobs: Array<Record<string, number>>[];
    text_offset: number[];
  };
}

/**
 * Internal stream chunk - unified representation of streaming chunks
 */
export interface InternalStreamChunk {
  /** Unique chunk identifier */
  id: string;

  /** Object type (e.g., 'chat.completion.chunk') */
  object: string;

  /** Unix timestamp of creation */
  created: number;

  /** Model used for generation */
  model: string;

  /** Array of streaming choices */
  choices: Array<{
    /** Choice index */
    index: number;

    /** Delta - incremental message update */
    delta: Partial<InternalMessage>;

    /** Reason generation finished (null if still streaming) */
    finishReason: FinishReason;
  }>;

  /** Vendor-specific fields */
  [key: string]: unknown;
}

/**
 * Token usage information
 */
export interface InternalUsage {
  /** Input tokens used */
  promptTokens: number;

  /** Output tokens generated */
  completionTokens: number;

  /** Total tokens used */
  totalTokens: number;

  /** Tokens from cache (some vendors) */
  promptTokensDetails?: {
    cachedTokens?: number;
  };

  /** Reasoning tokens (some vendors) */
  completionTokensDetails?: {
    reasoningTokens?: number;
    acceptedPredictionTokens?: number;
    rejectedPredictionTokens?: number;
  };
}

/**
 * Error format for internal protocol errors
 */
export interface InternalError {
  /** Error type/category */
  type: 'invalid_request' | 'authentication' | 'permission' | 'rate_limit' | 'api_error';

  /** Human-readable error message */
  message: string;

  /** HTTP status code */
  code?: number;

  /** Parameter that caused the error (if applicable) */
  param?: string;

  /** Vendor-specific error details */
  [key: string]: unknown;
}

/**
 * Metadata attached to requests/responses for tracking
 */
export interface InternalMetadata {
  /** Request timestamp */
  requestTimestamp: number;

  /** Response timestamp (if completed) */
  responseTimestamp?: number;

  /** Latency in milliseconds */
  latencyMs?: number;

  /** Vendor identifier */
  vendor: string;

  /** Original vendor format (for debugging) */
  originalFormat?: string;

  /** Request ID for tracing */
  requestId?: string;

  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Complete internal request with metadata
 */
export interface InternalRequestWithMetadata extends InternalRequest {
  /** Request metadata */
  _metadata: InternalMetadata;
}

/**
 * Complete internal response with metadata
 */
export interface InternalResponseWithMetadata extends InternalResponse {
  /** Response metadata */
  _metadata: InternalMetadata;
}
INTERNALFORMAT

echo "✅ Created internal-format.ts"

# Create vendor-types.ts
cat > src/server/module-protocol-transpiler/interfaces/vendor-types.ts << 'VENDORTYPES'
/**
 * Vendor Types - Protocol Transpiler Vendor Configuration
 *
 * This module defines types for configuring and identifying different LLM API vendors.
 * Each vendor has a unique format, endpoint structure, and special features.
 */

/**
 * Supported vendor identifiers
 *
 * Can be extended with custom vendor types at runtime.
 */
export type VendorType = 'openai' | 'anthropic' | 'gemini' | 'custom';

/**
 * Vendor configuration - defines how to connect to and identify a vendor
 *
 * This configuration is used by the transpiler to:
 * 1. Determine which format converter to use
 * 2. Route requests to the correct endpoint
 * 3. Apply vendor-specific transformations
 */
export interface VendorConfig {
  /** Unique vendor identifier */
  name: string;

  /** Base URL for the vendor's API */
  baseUrl: string;

  /** API endpoint path (e.g., '/v1/chat/completions') */
  endpoint: string;

  /** Native format used by this vendor */
  nativeFormat: VendorType;

  /** Optional display name for UI */
  displayName?: string;

  /** Optional icon URL for UI */
  iconUrl?: string;

  /** Whether this vendor supports streaming responses */
  supportsStreaming?: boolean;

  /** Whether this vendor supports function/tool calling */
  supportsTools?: boolean;

  /** Whether this vendor supports extended thinking/reasoning */
  supportsThinking?: boolean;

  /** Whether this vendor supports prompt caching */
  supportsCaching?: boolean;

  /** Default maximum tokens (if applicable) */
  defaultMaxTokens?: number;

  /** Vendor-specific capabilities */
  capabilities?: VendorCapabilities;
}

/**
 * Vendor capabilities - feature flags for vendor-specific features
 */
export interface VendorCapabilities {
  /** Supports image inputs (vision) */
  vision?: boolean;

  /** Supports audio inputs/output */
  audio?: boolean;

  /** Supports structured output */
  structuredOutput?: boolean;

  /** Supports parallel function calls */
  parallelTools?: boolean;

  /** Supports system messages separately from conversation */
  systemMessages?: boolean;

  /** Supports JSON mode (enforces JSON response) */
  jsonMode?: boolean;

  /** Supports seed parameter for deterministic outputs */
  seed?: boolean;

  /** Supports log probabilities */
  logprobs?: boolean;

  /** Custom capability flags */
  [key: string]: boolean | undefined;
}

/**
 * Vendor-specific authentication configuration
 */
export interface VendorAuth {
  /** Authentication type */
  type: 'bearer' | 'api-key' | 'basic' | 'custom';

  /** Header name for the API key */
  headerName?: string;

  /** Token prefix (e.g., 'Bearer ') */
  prefix?: string;

  /** Query parameter name for API key (if using query auth) */
  queryParam?: string;

  /** Custom authentication logic */
  custom?: (config: VendorConfig) => Record<string, string>;
}

/**
 * Vendor format signature - used for auto-detection
 *
 * These signatures help identify the vendor format from request/response bodies.
 */
export interface VendorFormatSignature {
  /** Unique field names that identify this format */
  uniqueFields: string[];

  /** Required field combinations */
  requiredCombinations?: Array<Record<string, unknown>>;

  /** Field patterns (regex) */
  fieldPatterns?: Record<string, RegExp>;

  /** Confidence score for this signature */
  confidence: number;
}

/**
 * Registry of all known vendor configurations
 *
 * This can be extended at runtime with custom vendors.
 */
export interface VendorRegistry {
  /** Get a vendor by name */
  get(name: string): VendorConfig | undefined;

  /** Register a new vendor */
  register(config: VendorConfig): void;

  /** List all registered vendors */
  listAll(): VendorConfig[];

  /** Check if a vendor is registered */
  has(name: string): boolean;
}
VENDORTYPES

echo "✅ Created vendor-types.ts"

# Create format-converter.ts
cat > src/server/module-protocol-transpiler/interfaces/format-converter.ts << 'FORMATCONVERTER'
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

// Re-export internal format types for convenience
export type {
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalMessage,
  InternalTool,
  InternalToolCall,
  MessageRole,
  FinishReason,
  InternalContentBlock,
  TextContentBlock,
  ImageUrlContentBlock,
  ThinkingContentBlock,
  CacheControlContentBlock,
  InternalChoice,
  InternalUsage,
  InternalError,
  InternalMetadata,
  InternalRequestWithMetadata,
  InternalResponseWithMetadata,
};

// Re-export vendor types
export type { VendorType, VendorConfig, VendorCapabilities };

/**
 * Conversion direction - determines how data flows through the transpiler
 */
export type ConversionDirection = 'to-internal' | 'from-internal';

/**
 * Conversion error with detailed context
 */
export interface ConversionError {
  /** JSON path to the error location (e.g., 'messages.0.content') */
  path: string;

  /** Human-readable error message */
  message: string;

  /** Error code for categorization */
  code: ErrorCode;

  /** Original value that caused the error */
  value?: unknown;

  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Standard error codes for conversion failures
 */
export type ErrorCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'UNSUPPORTED_FEATURE'
  | 'VALIDATION_FAILED'
  | 'PARSE_ERROR'
  | 'UNKNOWN_FIELD'
  | 'TOOL_CALL_ERROR';

/**
 * Result of a format conversion operation
 *
 * This type is used for all conversion operations to provide:
 * - Success/failure status
 * - Converted data
 * - Any errors or warnings
 * - Metadata about the conversion
 */
export interface ConversionResult<T> {
  /** Whether the conversion was successful */
  success: boolean;

  /** Converted data (if successful) */
  data?: T;

  /** Errors encountered during conversion */
  errors?: ConversionError[];

  /** Warnings encountered during conversion */
  warnings?: ConversionError[];

  /** Metadata about the conversion process */
  metadata?: ConversionMetadata;
}

/**
 * Metadata about a conversion operation
 */
export interface ConversionMetadata {
  /** Source vendor format */
  fromVendor: VendorType;

  /** Target vendor format */
  toVendor: VendorType;

  /** Timestamp when conversion was performed */
  convertedAt: number;

  /** Time taken for conversion (milliseconds) */
  conversionTimeMs: number;

  /** Number of fields that were converted */
  fieldsConverted: number;

  /** Number of fields that were ignored (not supported) */
  fieldsIgnored: number;

  /** Fields that were transformed or mapped */
  transformedFields?: string[];
}

/**
 * Validation result for checking if data matches a format
 */
export interface ValidationResult {
  /** Whether the data is valid for this format */
  valid: boolean;

  /** Confidence score (0-1) for format detection */
  confidence: number;

  /** Errors if validation failed */
  errors?: ConversionError[];

  /** Warnings about potential issues */
  warnings?: ConversionError[];
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
  convertRequestToInternal(request: unknown): ConversionResult<InternalRequest>;

  /**
   * Convert a request from internal format to vendor format
   *
   * This is used when sending requests to a vendor.
   *
   * @param internal - Internal request format
   * @returns Vendor-specific request object
   */
  convertRequestFromInternal(internal: InternalRequest): ConversionResult<Record<string, unknown>>;

  /**
   * Convert a response from vendor format to internal format
   *
   * This is used when receiving responses from a vendor.
   *
   * @param response - Vendor-specific response object
   * @returns Internal response format
   */
  convertResponseToInternal(response: unknown): ConversionResult<InternalResponse>;

  /**
   * Convert a response from internal format to vendor format
   *
   * This is used when sending responses to a client.
   *
   * @param internal - Internal response format
   * @returns Vendor-specific response object
   */
  convertResponseFromInternal(internal: InternalResponse): ConversionResult<Record<string, unknown>>;

  /**
   * Get stream converter if streaming is supported
   *
   * @returns Stream converter or undefined if not supported
   */
  getStreamConverter?(): StreamConverter;

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
FORMATCONVERTER

echo "✅ Created format-converter.ts"

echo ""
echo "✨ All files created successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Run: npx tsc --noEmit"
echo "   2. Review the type definitions"
echo "   3. Implement converter classes"
echo ""
