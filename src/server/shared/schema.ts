import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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

/**
 * Content block types for structured message content
 * Supports text, tool_use, thinking, cache_control, and image_url blocks
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  cache_control?: { type: 'ephemeral' };
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface CacheControlContentBlock {
  type: 'cache_control';
  cache_control: { type: 'ephemeral' };
}

export interface ImageUrlContentBlock {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ThinkingContentBlock
  | CacheControlContentBlock
  | ImageUrlContentBlock;

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[] | null; // Updated to support structured content
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
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
// api_keys - API Key Management
// ============================================
export const apiKeysTable = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  keyToken: text('key_token').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'revoked'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Type for inserts
export type NewApiKey = typeof apiKeysTable.$inferInsert;
export type ApiKey = typeof apiKeysTable.$inferSelect;

// ============================================
// vendor_templates - Vendor Configuration Templates
// ============================================
export const vendorTemplatesTable = sqliteTable('vendor_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  baseUrl: text('base_url').notNull(),
  endpoint: text('endpoint').notNull().default('/chat/completions'),
  iconUrl: text('icon_url'),
  status: text('status', { enum: ['active', 'deprecated'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewVendorTemplate = typeof vendorTemplatesTable.$inferInsert;
export type VendorTemplate = typeof vendorTemplatesTable.$inferSelect;

// ============================================
// vendor_models - Vendor Supported Models
// ============================================
export const vendorModelsTable = sqliteTable('vendor_models', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendorTemplatesTable.id),
  modelId: text('model_id').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['active', 'deprecated'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewVendorModel = typeof vendorModelsTable.$inferInsert;
export type VendorModel = typeof vendorModelsTable.$inferSelect;

// ============================================
// assets - Upstream Asset Management
// ============================================
export const assetsTable = sqliteTable('assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  vendorId: text('vendor_id').notNull().references(() => vendorTemplatesTable.id),
  apiKey: text('api_key').notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  validFrom: integer('valid_from', { mode: 'timestamp' }),
  validUntil: integer('valid_until', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewAsset = typeof assetsTable.$inferInsert;
export type Asset = typeof assetsTable.$inferSelect;

// ============================================
// asset_models - Asset Available Models
// ============================================
export const assetModelsTable = sqliteTable('asset_models', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assetsTable.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewAssetModel = typeof assetModelsTable.$inferInsert;
export type AssetModel = typeof assetModelsTable.$inferSelect;

// ============================================
// asset_model_validations - Model Validation Results
// ============================================
export const assetModelValidationsTable = sqliteTable('asset_model_validations', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assetsTable.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  response: text('response'),
  error: text('error'),
  latencyMs: integer('latency_ms'),
  validatedAt: integer('validated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewAssetModelValidation = typeof assetModelValidationsTable.$inferInsert;
export type AssetModelValidation = typeof assetModelValidationsTable.$inferSelect;

// ============================================
// routes - Route Configuration
// ============================================
export const routesTable = sqliteTable('routes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  assetId: text('asset_id').notNull().references(() => assetsTable.id, { onDelete: 'cascade' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  overrides: text('overrides', { mode: 'json' }).$type<OverrideRule[]>().notNull().default([]),
  configType: text('config_type', { enum: ['yaml', 'json'] }).notNull().default('yaml'),
  priority: integer('priority').notNull().default(0),

  // Format conversion configuration
  // Specifies the expected request/response format for API compatibility
  // 'openai': OpenAI-compatible format (default, widely adopted)
  // 'openai-responses': OpenAI Responses API format (enhanced with structured responses)
  // 'anthropic': Anthropic Claude API format
  // 'gemini': Google Gemini API format
  requestFormat: text('request_format', { enum: ['openai', 'openai-responses', 'anthropic', 'gemini'] }).notNull().default('openai'),
  responseFormat: text('response_format', { enum: ['openai', 'openai-responses', 'anthropic', 'gemini'] }).notNull().default('openai'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewRoute = typeof routesTable.$inferInsert;
export type Route = typeof routesTable.$inferSelect;

// ============================================
// api_key_routes - Key to Route Association
// ============================================
export const apiKeyRoutesTable = sqliteTable('api_key_routes', {
  id: text('id').primaryKey(),
  apiKeyId: text('api_key_id').notNull().references(() => apiKeysTable.id, { onDelete: 'cascade' }),
  routeId: text('route_id').notNull().references(() => routesTable.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewApiKeyRoute = typeof apiKeyRoutesTable.$inferInsert;
export type ApiKeyRoute = typeof apiKeyRoutesTable.$inferSelect;

// ============================================
// request_logs - Request Logging
// ============================================
export const requestLogsTable = sqliteTable('request_logs', {
  id: text('id').primaryKey(),
  apiKeyId: text('api_key_id').notNull().references(() => apiKeysTable.id, { onDelete: 'cascade' }),
  routeId: text('route_id').references(() => routesTable.id, { onDelete: 'no action' }),

  // Request Info
  originalModel: text('original_model').notNull(),
  finalModel: text('final_model').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),

  // Configuration
  requestTools: text('request_tools', { mode: 'json' }).$type<ToolDefinition[]>(),
  temperature: text('temperature'), // Store as string to preserve precision

  // Usage
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  latencyMs: integer('latency_ms').notNull(),
  statusCode: integer('status_code').notNull(),

  // Content
  messages: text('messages', { mode: 'json' }).$type<Message[]>().notNull(),
  overwrittenAttributes: text('overwritten_attributes', { mode: 'json' }).notNull().default({}),

  // Timestamp
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),

  // Favorite
  isFavorited: integer('is_favorited', { mode: 'boolean' }).notNull().default(false),
});

export type NewRequestLog = typeof requestLogsTable.$inferInsert;
export type RequestLog = typeof requestLogsTable.$inferSelect;

// ============================================
// analytics - Aggregated Statistics (optional)
// ============================================
export const analyticsTable = sqliteTable('analytics', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD
  apiKeyId: text('api_key_id').references(() => apiKeysTable.id),
  routeId: text('route_id').references(() => routesTable.id),
  model: text('model').notNull(),

  // Aggregated Metrics
  requestCount: integer('request_count').notNull().default(0),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  avgLatencyMs: integer('avg_latency_ms').notNull(),
  successRate: integer('success_rate').notNull(), // Store as integer (0-10000 for 0.00-1.00)

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewAnalytics = typeof analyticsTable.$inferInsert;
export type Analytics = typeof analyticsTable.$inferSelect;

// ============================================
// system_config - System Configuration
// ============================================
export const systemConfigTable = sqliteTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  category: text('category').notNull(), // 'log', 'database', 'api', 'monitoring'
  dataType: text('data_type', { enum: ['string', 'number', 'boolean', 'json'] }).notNull().default('string'),
  description: text('description'),
  isReadOnly: integer('is_read_only', { mode: 'boolean' }).notNull().default(false), // Cannot be modified via UI
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export type NewSystemConfig = typeof systemConfigTable.$inferInsert;
export type SystemConfig = typeof systemConfigTable.$inferSelect;
