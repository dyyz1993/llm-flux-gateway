export enum Role {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool'
}

import { ApiFormat } from '../server/module-protocol-transpiler';

// ==========================================
// VENDOR AND PROTOCOL TYPES
// ==========================================

/**
 * Protocol format mapping to vendor inference
 */
export type ProtocolFormat = ApiFormat;

export interface ToolCall {
  id?: string;
  index?: number;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: any; // JSON Schema
  };
}

export interface Message {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  toolCalls?: ToolCall[]; // Support both snake_case and camelCase
  name?: string;
  tool_call_id?: string; // For tool messages: the ID of the tool call this result belongs to
  toolCallId?: string;   // Support both snake_case and camelCase
}

export interface RequestParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  n?: number;
  stop?: string[];
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ResponseParams {
  // Internal Format (camelCase)
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  model?: string;
  systemFingerprint?: string;
  id?: string;
  created?: number;

  // Vendor API format (snake_case) - for compatibility with different API responses
  // Most APIs (OpenAI, Anthropic, GLM) use snake_case for these fields
  finish_reason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  system_fingerprint?: string;
}

export interface OverwrittenField {
  field: string;
  original: any;
  final: any;
  ruleId?: string;
}

export interface OverrideRule {
  field: string; // e.g., "model", "temperature"
  matchValues: string[]; // e.g., ["gpt-3.5-turbo"]
  rewriteValue: string; // e.g., "gemini-flash"
}

export interface RouteConfig {
  id: string;
  name: string;
  assetId: string;
  isActive: boolean;
  overrides: OverrideRule[];
  configType: 'yaml' | 'json'; // For the UI editor
  priority?: number;
  createdAt: Date;
  updatedAt: Date;
  // JOIN fields from asset
  assetName?: string;
  assetVendorDisplayName?: string;
  assetBaseUrl?: string;
  assetApiKey?: string;
  assetModels?: string[];
}

export interface ApiKey {
  id: string;
  keyToken: string; // sk-flux-...
  name: string; // Client name
  status: 'active' | 'revoked';
  createdAt: Date;
  lastUsedAt: Date | null;
  updatedAt: Date;
  routes?: KeyRouteAssociation[];
}

export interface KeyRouteAssociation {
  routeId: string;
  routeName: string;
  priority: number;
  weight: number;
  healthStatus: 'healthy' | 'unhealthy' | 'degraded';
  failCount: number;
  successCount: number;
  lastCheckAt?: Date;
  lastSuccessAt?: Date;
  lastFailAt?: Date;
  avgLatencyMs?: number;
}

export interface RequestLog {
  // Core identifiers
  id: string;
  timestamp: number; // Unix timestamp in seconds
  apiKeyId: string; // Links to ApiKey
  routeId: string; // Links to RouteConfig

  // Model information
  originalModel: string;
  finalModel: string; // After rewrite
  overwrittenModel?: string;
  overwrittenFields?: OverwrittenField[];

  // Request Info
  method: string;
  path: string;

  // Request statistics (NEW)
  messageCount: number;
  firstMessage: string;
  hasTools: boolean;
  toolCount: number;
  requestParams?: RequestParams;

  // Configuration (legacy, kept for backward compatibility)
  requestTools?: ToolDefinition[];
  temperature?: number;

  // Token statistics (expanded)
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;

  // Timing
  latencyMs: number; // Total request duration
  timeToFirstByteMs?: number; // TTFB - Time to first byte
  statusCode: number;

  // Response metadata (NEW)
  responseParams?: ResponseParams;

  // Error Info
  errorMessage?: string; // Error message if request failed
  baseUrl?: string; // Upstream base URL

  // Content
  messages: Message[]; // The conversation history
  responseContent?: string; // Full response content (for streaming requests)
  responseToolCalls?: ToolCall[]; // Tool calls from the response (if any)
  overwrittenAttributes: Record<string, { original: any; final: any }>;

  // Original Data (NEW)
  originalResponse?: string;
  originalRequestRaw?: string; // Full raw request body JSON
  originalRequestFormat?: ApiFormat;
  originalResponseFormat?: ApiFormat;

  // Favorite
  isFavorited?: boolean; // Whether this log is favorited (exempt from cleanup)
}

export interface AnalyticsData {
  date: string;
  tokens: number;
  requests: number;
  cost: number;
}

// ==========================================
// ANALYTICS TYPES (Frontend + Backend)
// ==========================================

/**
 * Overview Statistics
 */
export interface OverviewStats {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  promptRatio?: number;  // prompt / total * 100
  completionRatio?: number;  // completion / total * 100
  avgLatency: number;
  avgTTFB: number;
  successRate: number;
  errorRate: number;
  costEstimate: number;
}

/**
 * Model Statistics
 */
export interface ModelStats {
  model: string;
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  promptRatio?: number;  // prompt / total * 100
  completionRatio?: number;  // completion / total * 100
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
  cachedRequests: number;
}

/**
 * API Key Statistics
 */
export interface KeyStats {
  keyId: string;
  keyName: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
  errorRate: number;
}

/**
 * Asset Statistics
 */
export interface AssetStats {
  assetId: string;
  assetName: string;
  vendorName: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
}

/**
 * TTFB Statistics
 */
export interface TTFBStats {
  ranges: {
    '0-100ms': number;
    '100-500ms': number;
    '500ms-1s': number;
    '1-3s': number;
    '>3s': number;
  };
  avgTTFB: number;
  minTTFB: number;
  maxTTFB: number;
  count: number;
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  hitRate: number;
  totalCachedTokens: number;
  avgCachedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Error Statistics
 */
export interface ErrorStats {
  totalErrors: number;
  byStatusCode: { [code: number]: number };
  byModel: { [model: string]: number };
  commonErrors: { message: string; count: number }[];
}

/**
 * Time Series Statistics
 */
export interface TimeSeriesStats {
  date: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
}

// ==========================================
// ASSET MANAGEMENT TYPES (Frontend + Backend)
// ==========================================

export interface ModelInfo {
  id: string;
  modelId: string;
  displayName: string;
  description?: string;
  validation?: {
    success: boolean;
    response?: string;
    error?: string;
    latencyMs?: number;
    validatedAt: number;
  };
}

export interface Asset {
  id: string;
  name: string;
  vendorId: string;
  apiKey: string;
  status: 'active' | 'suspended';
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  // JOIN fields from vendor
  vendorName?: string;
  vendorDisplayName?: string;
  vendorBaseUrl?: string;
  // Related models with details
  models?: ModelInfo[];
}

export interface Vendor {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  endpoint: string;
  iconUrl?: string;
  status: string;
  createdAt: Date;
  models?: VendorModel[];
}

export interface VendorModel {
  id: string;
  modelId: string;
  displayName: string;
  description?: string;
  status: string;
}

// ==========================================
// SIMPLIFIED YAML CONFIG TYPES
// ==========================================
// These types are used for the simplified YAML configuration format.
// The database types (Vendor, VendorModel) remain unchanged for compatibility.

export interface VendorConfigSimple {
  name: string;
  baseUrl: string;
  endpoint?: string; // API endpoint path (default: /chat/completions)
  iconUrl?: string;
  models: string[]; // Only model IDs, no additional metadata
}

export interface VendorsYamlSimple {
  vendors: VendorConfigSimple[];
}

// ==========================================
// CHAT PLAYGROUND TYPES (Frontend)
// ==========================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  tokens?: { prompt: number; completion: number };
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  name?: string; // For tool messages: the tool name that was called
  toolCallId?: string; // For tool messages: the ID of the tool call this result belongs to
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model: string;
  keyId: string;
}

export interface ChatStorage {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  description?: string;
  category?: string;
}

export interface SystemPreset {
  id: string;
  name: string;
  content: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'custom';
  description?: string;
}

export interface SystemPromptStorage {
  enabled: boolean;
  customPrompt: string;
  selectedPresetId: string | null;
  customPresets: SystemPreset[];
}