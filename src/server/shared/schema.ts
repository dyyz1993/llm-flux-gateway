// ============================================
// Server Schema Types
// ============================================
// This file contains type definitions that mirror the database schema.
// It does NOT use Drizzle ORM - types are manually defined to match
// the database structure in database.ts.

// ============================================
// Shared Types
// ============================================
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface OverrideRule {
  field: string;
  matchValues: string[];
  rewriteValue: string;
}

// Content Block Types
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: Json;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
}

export interface CacheControlContentBlock {
  type: 'cache_control';
  cache_breakpoint?: boolean;
}

export interface ImageUrlContentBlock {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'auto' | 'high';
  };
}

export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ThinkingContentBlock
  | CacheControlContentBlock
  | ImageUrlContentBlock;

// Message & Tool Types
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  name?: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id?: string;
  index?: number;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: any;
  };
}

// ============================================
// API Keys
// ============================================
export interface ApiKey {
  id: string;
  keyToken: string;
  name: string;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: number;
  lastUsedAt: number | null;
  updatedAt: number;
}

export type NewApiKey = Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================
// Vendor Templates
// ============================================
export interface VendorTemplate {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  endpoint: string;
  iconUrl: string | null;
  status: 'active' | 'inactive';
  createdAt: number;
}

export type NewVendorTemplate = Omit<VendorTemplate, 'id' | 'createdAt'>;

// ============================================
// Vendor Models
// ============================================
export interface VendorModel {
  id: string;
  vendorId: string;
  modelId: string;
  displayName: string;
  description: string | null;
  status: 'active' | 'inactive';
  createdAt: number;
}

export type NewVendorModel = Omit<VendorModel, 'id' | 'createdAt'>;

// ============================================
// Assets
// ============================================
export interface Asset {
  id: string;
  name: string;
  vendorId: string;
  apiKey: string;
  status: 'active' | 'suspended' | 'revoked';
  validFrom: number | null;
  validUntil: number | null;
  createdAt: number;
  updatedAt: number;
}

export type NewAsset = Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================
// Asset Models
// ============================================
export interface AssetModel {
  id: string;
  assetId: string;
  modelId: string;
  createdAt: number;
}

export type NewAssetModel = Omit<AssetModel, 'id' | 'createdAt'>;

// ============================================
// Asset Model Validations
// ============================================
export interface AssetModelValidation {
  id: string;
  assetId: string;
  modelId: string;
  success: boolean;
  response: string | null;
  error: string | null;
  latencyMs: number | null;
  validatedAt: number | null;
  createdAt: number;
}

export type NewAssetModelValidation = Omit<AssetModelValidation, 'id' | 'createdAt'>;

// ============================================
// Routes
// ============================================
export type ConfigType = 'yaml' | 'json';
export type ApiFormat = 'openai' | 'openai-responses' | 'anthropic' | 'gemini';

export interface Route {
  id: string;
  name: string;
  assetId: string;
  overrides: string; // JSON string
  isActive: boolean;
  configType: ConfigType;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export type NewRoute = Omit<Route, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================
// API Key Routes
// ============================================
export interface KeyRouteAssociation {
  id: string;
  apiKeyId: string;
  routeId: string;
  createdAt: number;
}

export type NewKeyRouteAssociation = Omit<KeyRouteAssociation, 'id' | 'createdAt'>;

// ============================================
// Request Logs
// ============================================
export interface RequestLog {
  id: string;
  apiKeyId: string | null;
  routeId: string | null;
  upstreamEndpoint: string;
  method: string;
  requestBody: string;
  responseBody: string;
  statusCode: number;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  thinkingTokens: number | null;
  isFavorited: boolean;
  originalResponse: string | null;
  originalResponseFormat: string | null;
  createdAt: number;
}

// ============================================
// Analytics
// ============================================
export interface Analytics {
  id: string;
  date: string; // YYYY-MM-DD format
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// System Config
// ============================================
export interface SystemConfig {
  key: string;
  value: string;
  category: string;
  dataType: string;
  description: string | null;
  isReadOnly: boolean;
  updatedAt: Date;
}
