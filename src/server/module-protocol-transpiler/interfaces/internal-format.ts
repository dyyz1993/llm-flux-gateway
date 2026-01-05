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
 * Vendor-specific fields should be added via vendorSpecific.
 */
export interface InternalRequest {
  /** Model identifier to use */
  model: string;

  /** Array of messages in the conversation */
  messages: InternalMessage[];

  /** List of tools/functions the model may call */
  tools?: InternalTool[];

  /**
   * Optional tool choice configuration
   * Matches OpenAI API format: 'auto', 'required', 'none', or specific function
   */
  tool_choice?: 'auto' | 'required' | 'none' | { type: string; function: { name: string } };

  /** Sampling temperature (0-2) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Maximum completion tokens (for o1 reasoning models) */
  maxCompletionTokens?: number;

  /** Nucleus sampling threshold (0-1) */
  topP?: number;

  /** Top-k sampling (Anthropic-specific) */
  topK?: number;

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

  /** Vendor-specific parameters (use sparingly) */
  vendorSpecific?: VendorSpecificFields;

  /** Extended thinking configuration (Anthropic) */
  thinking?: {
    type: string;
    budget_tokens?: number;
  };

  /** Thinking configuration (Gemini 2.0 Flash Thinking) */
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
    thinkingLevel?: string;
  };

  /** System prompt (backward compatibility) */
  system?: string | Array<{ type: string; text: string; cache_control?: { type: string } }>;
}

/**
 * Internal message format - unified representation of chat messages
 *
 * Tool calls can be represented in two ways:
 * 1. As ToolUseContentBlock in the `content` array (preserves original block structure)
 * 2. As InternalToolCall[] in the `toolCalls` field (OpenAI-style format)
 *
 * Converters should maintain both representations for maximum compatibility.
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

  /** Vendor-specific fields (use sparingly) */
  vendorSpecific?: VendorSpecificFields;
}

/**
 * Content block types for multimodal messages
 */
export type InternalContentBlock =
  | TextContentBlock
  | ImageUrlContentBlock
  | ThinkingContentBlock
  | CacheControlContentBlock
  | ToolUseContentBlock
  | GenericContentBlock;

/**
 * Generic content block for vendor-specific content
 */
export interface GenericContentBlock {
  type: string;
  [key: string]: unknown;
}

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
 * Tool use content block (for tool calls made by assistant)
 *
 * This allows tool calls to be represented as content blocks, preserving
 * the original structure from vendors like Anthropic. This is particularly
 * useful for:
 * 1. Maintaining block-level structure for display/debugging
 * 2. Supporting prompt caching with tool calls
 * 3. Aligning with Anthropic's native format
 */
export interface ToolUseContentBlock {
  type: 'tool_use';
  /** Unique identifier for this tool call */
  id: string;
  /** Name of the tool/function being called */
  name: string;
  /** Parameters to pass to the tool */
  input: Record<string, unknown>;
  /** Optional cache control for prompt caching */
  cache_control?: {
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

  /** Direct tool name (backward compatibility for Responses API) */
  name?: string;

  /** Direct description (backward compatibility) */
  description?: string;

  /** Direct parameters (backward compatibility) */
  parameters?: Record<string, unknown>;
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

  /** Index of the tool call in the response (for streaming) */
  index?: number;
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

  /** System fingerprint for reproducibility (OpenAI) */
  systemFingerprint?: string;

  /** Vendor-specific fields (use sparingly) */
  vendorSpecific?: VendorSpecificFields;

  /** Extended thinking data (Anthropic) */
  extended_thinking?: {
    thinking_blocks: Array<{ type: 'thinking'; content: string }>;
  };

  /** System fingerprint (alias with snake_case for vendor compatibility) */
  system_fingerprint?: string;
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

  /** Token usage information (only in final chunk) */
  usage?: InternalUsage;

  /** System fingerprint for reproducibility (OpenAI) */
  systemFingerprint?: string;

  /** Vendor-specific fields (use sparingly) */
  vendorSpecific?: VendorSpecificFields;

  /**
   * Internal marker for empty chunks (metadata-only chunks)
   * This is used internally to mark chunks that contain only metadata
   * (e.g., finish_reason, usage) but no actual content.
   * This field should not be exposed to external APIs.
   */
  __empty?: true;
}

/**
 * Vendor-specific fields (use sparingly)
 *
 * Principles:
 * 1. Minimize use - prefer standard fields
 * 2. Use descriptive naming (without vendor prefix)
 * 3. Document which vendor uses each field
 */
export interface VendorSpecificFields {
  // Anthropic-specific
  /** Thinking tokens (Anthropic) */
  thinkingTokens?: number;
  /** Thinking budget tokens (Anthropic) */
  thinkingBudgetTokens?: number;

  // Gemini-specific
  /** Grounding tokens (Gemini) */
  groundingTokens?: number;

  // OpenAI-specific
  /** Reasoning tokens (OpenAI o1) - duplicated in completionTokensDetails */
  reasoningTokens?: number;

  // Other vendor-specific fields
  [key: string]: unknown;
}

/**
 * Token usage information
 *
 * All fields must use camelCase
 */
export interface InternalUsage {
  // === Core fields (required) ===

  /** Input tokens used */
  promptTokens: number;

  /** Output tokens generated */
  completionTokens: number;

  /** Total tokens used */
  totalTokens: number;

  // === Vendor-specific fields (use sparingly) ===

  /** Cache read tokens (Anthropic/Gemini) */
  cacheReadTokens?: number;

  /** Cache write tokens (Anthropic) */
  cacheWriteTokens?: number;

  /** Thinking/reasoning tokens */
  thinkingTokens?: number;

  // === Nested details ===

  /** Prompt token details */
  promptTokensDetails?: {
    /** Cached tokens (OpenAI) */
    cachedTokens?: number;
  };

  /** Completion token details */
  completionTokensDetails?: {
    /** Reasoning tokens (OpenAI o1) */
    reasoningTokens?: number;
    /** Accepted prediction tokens (OpenAI o1) */
    acceptedPredictionTokens?: number;
    /** Rejected prediction tokens (OpenAI o1) */
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
  vendorSpecific?: VendorSpecificFields;
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

  /** Vendor-specific metadata (use sparingly) */
  vendorSpecific?: VendorSpecificFields;
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

// ============================================
// Type Guard Utilities
// ============================================

/**
 * Type guard: Check if value is a valid InternalUsage
 */
export function isInternalUsage(obj: unknown): obj is InternalUsage {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const usage = obj as Partial<InternalUsage>;

  return (
    typeof usage.promptTokens === 'number' &&
    typeof usage.completionTokens === 'number' &&
    typeof usage.totalTokens === 'number'
  );
}

/**
 * Type guard: Check if value is a valid InternalResponse
 */
export function isInternalResponse(obj: unknown): obj is InternalResponse {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const response = obj as Partial<InternalResponse>;

  return (
    typeof response.id === 'string' &&
    typeof response.object === 'string' &&
    typeof response.created === 'number' &&
    typeof response.model === 'string' &&
    Array.isArray(response.choices)
  );
}

/**
 * Type guard: Check if value is a valid InternalRequest
 */
export function isInternalRequest(obj: unknown): obj is InternalRequest {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const request = obj as Partial<InternalRequest>;

  return (
    typeof request.model === 'string' &&
    Array.isArray(request.messages)
  );
}

/**
 * Strict type assertion helper for InternalUsage
 * Use this instead of `as any` for better type safety
 *
 * @throws {Error} if obj is not a valid InternalUsage
 */
export function assertInternalUsage(obj: unknown): InternalUsage {
  if (!isInternalUsage(obj)) {
    throw new Error('Invalid InternalUsage format: missing required fields (promptTokens, completionTokens, totalTokens)');
  }
  return obj;
}

/**
 * Strict type assertion helper for InternalResponse
 * Use this instead of `as any` for better type safety
 *
 * @throws {Error} if obj is not a valid InternalResponse
 */
export function assertInternalResponse(obj: unknown): InternalResponse {
  if (!isInternalResponse(obj)) {
    throw new Error('Invalid InternalResponse format: missing required fields');
  }
  return obj;
}

/**
 * Strict type assertion helper for InternalRequest
 * Use this instead of `as any` for better type safety
 *
 * @throws {Error} if obj is not a valid InternalRequest
 */
export function assertInternalRequest(obj: unknown): InternalRequest {
  if (!isInternalRequest(obj)) {
    throw new Error('Invalid InternalRequest format: missing required fields');
  }
  return obj;
}
