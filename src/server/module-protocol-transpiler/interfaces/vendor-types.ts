/**
 * Vendor Types - Protocol Transpiler Vendor Configuration
 *
 * This module defines types for configuring and identifying different LLM API vendors.
 * Each vendor has a unique format, endpoint structure, and special features.
 */

/**
 * API Format enumeration for Gateway routing
 *
 * Maps HTTP endpoint paths to protocol formats.
 */
export enum ApiFormat {
  /** OpenAI Chat Completions API - /v1/chat/completions */
  OPENAI = 'openai',

  /** OpenAI Responses API - /v1/responses */
  OPENAI_RESPONSES = 'openai-responses',

  /** Anthropic Messages API - /v1/messages */
  ANTHROPIC = 'anthropic',

  /** Google Gemini API - /v1/models/:model:generateContent */
  GEMINI = 'gemini',
}

/**
 * Supported vendor identifiers
 *
 * Can be extended with custom vendor types at runtime.
 *
 * @remarks
 * - 'openai': OpenAI's standard Chat Completions API format
 * - 'openai-responses': OpenAI's new Responses API format (structured responses API)
 * - 'anthropic': Anthropic Claude API format
 * - 'gemini': Google Gemini API format
 * - 'glm': Zhipu AI GLM API format
 * - 'custom': Custom vendor format
 */
export type VendorType = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'glm' | 'custom';

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
