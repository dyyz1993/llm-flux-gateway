/**
 * Mock Server Data Store
 *
 * Provides in-memory data storage for development and testing.
 * Used when USE_MOCK_SERVER = true in apiClient.ts
 */

import { ApiKey, RouteConfig, RequestLog, Asset, Vendor, VendorModel, Role, KeyRouteAssociation } from '@shared/types';

// ============================================
// Initial Mock Data
// ============================================

const mockKeys: ApiKey[] = [
  {
    id: 'key-001',
    name: 'Development Key',
    keyToken: 'sk-flux-dev123456789abcdefghijklmnop',
    status: 'active',
    routes: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastUsedAt: new Date('2024-01-06T12:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'key-002',
    name: 'Production Key',
    keyToken: 'sk-flux-pro987654321zyxwvutsrqponmlk',
    status: 'active',
    routes: [
      { routeId: 'route-001', routeName: 'GPT-4 Turbo', priority: 100 },
      { routeId: 'route-002', routeName: 'Claude 3 Opus', priority: 90 },
    ],
    createdAt: new Date('2024-01-02T00:00:00Z'),
    lastUsedAt: null,
    updatedAt: new Date('2024-01-02T00:00:00Z'),
  },
];

const mockRoutes: RouteConfig[] = [
  {
    id: 'route-001',
    name: 'GPT-4 Turbo',
    assetId: 'asset-001',
    isActive: true,
    overrides: [],
    configType: 'json',
    priority: 100,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'route-002',
    name: 'Claude 3 Opus',
    assetId: 'asset-002',
    isActive: true,
    overrides: [],
    configType: 'json',
    priority: 90,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
];

const mockLogs: RequestLog[] = [
  {
    id: 'log-001',
    timestamp: Date.now() - 3600000,
    apiKeyId: 'key-001',
    routeId: 'route-001',
    originalModel: 'gpt-4',
    finalModel: 'gpt-4-turbo',
    method: 'POST',
    path: '/v1/chat/completions',
    messages: [
      { role: Role.USER, content: 'Hello!' },
      { role: Role.ASSISTANT, content: 'Hi there!' },
    ],
    messageCount: 2,
    firstMessage: 'Hello!',
    hasTools: false,
    toolCount: 0,
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cachedTokens: 0,
    latencyMs: 450,
    timeToFirstByteMs: 120,
    statusCode: 200,
    responseContent: 'Hi there!',
    isFavorited: false,
    overwrittenAttributes: {},
  },
  {
    id: 'log-002',
    timestamp: Date.now() - 7200000,
    apiKeyId: 'key-002',
    routeId: 'route-002',
    originalModel: 'claude-3-opus',
    finalModel: 'claude-3-opus',
    method: 'POST',
    path: '/v1/messages',
    messages: [
      { role: Role.USER, content: 'Explain quantum computing' },
    ],
    messageCount: 1,
    firstMessage: 'Explain quantum computing',
    hasTools: false,
    toolCount: 0,
    promptTokens: 25,
    completionTokens: 150,
    totalTokens: 175,
    cachedTokens: 0,
    latencyMs: 2340,
    timeToFirstByteMs: 890,
    statusCode: 200,
    responseContent: 'Quantum computing is...',
    isFavorited: true,
    overwrittenAttributes: {},
  },
];

const mockAssets: Asset[] = [
  {
    id: 'asset-001',
    name: 'OpenAI GPT-4',
    vendorId: 'openai',
    apiKey: 'sk-openai-test-key',
    status: 'active',
    validFrom: new Date('2024-01-01T00:00:00Z'),
    validUntil: undefined,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'asset-002',
    name: 'Anthropic Claude',
    vendorId: 'anthropic',
    apiKey: 'sk-ant-test-key',
    status: 'active',
    validFrom: new Date('2024-01-01T00:00:00Z'),
    validUntil: undefined,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
];

const mockVendors: Vendor[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    endpoint: '/chat/completions',
    iconUrl: '/vendors/openai.svg',
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    endpoint: '/messages',
    iconUrl: '/vendors/anthropic.svg',
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 'gemini',
    name: 'Gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    endpoint: '/generateContent',
    iconUrl: '/vendors/gemini.svg',
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
];

const mockVendorModels: VendorModel[] = [
  {
    id: 'gpt-4',
    modelId: 'gpt-4',
    displayName: 'GPT-4',
    status: 'active',
  },
  {
    id: 'gpt-4-turbo',
    modelId: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    status: 'active',
  },
  {
    id: 'claude-3-opus',
    modelId: 'claude-3-opus',
    displayName: 'Claude 3 Opus',
    status: 'active',
  },
  {
    id: 'claude-3-sonnet',
    modelId: 'claude-3-sonnet',
    displayName: 'Claude 3 Sonnet',
    status: 'active',
  },
];

// ============================================
// Mock Store
// ============================================

class MockStore {
  private keys: ApiKey[] = [...mockKeys];
  private routes: RouteConfig[] = [...mockRoutes];
  private logs: RequestLog[] = [...mockLogs];
  private assets: Asset[] = [...mockAssets];
  private vendors: Vendor[] = [...mockVendors];
  private vendorModels: VendorModel[] = [...mockVendorModels];

  // Helper to generate IDs
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper to generate key token
  private generateKeyToken(): string {
    return `sk-flux-${Math.random().toString(36).substr(2, 32)}`;
  }

  // Keys
  getKeys(): ApiKey[] {
    return [...this.keys];
  }

  getKeyById(id: string): ApiKey | undefined {
    return this.keys.find(k => k.id === id);
  }

  createKey(name: string, routeIds?: string[]): ApiKey {
    const routes: KeyRouteAssociation[] = (routeIds || []).map(rid => ({
      routeId: rid,
      routeName: rid,
      priority: 100,
    }));
    const newKey: ApiKey = {
      id: this.generateId('key'),
      name,
      keyToken: this.generateKeyToken(),
      status: 'active',
      routes,
      createdAt: new Date(),
      lastUsedAt: null,
      updatedAt: new Date(),
    };
    this.keys.push(newKey);
    return newKey;
  }

  updateKey(id: string, data: { name?: string; status?: 'active' | 'revoked' }): ApiKey | null {
    const index = this.keys.findIndex(k => k.id === id);
    if (index === -1) return null;
    const existing = this.keys[index]!;
    this.keys[index] = {
      id: existing.id,
      keyToken: existing.keyToken,
      name: data.name ?? existing.name,
      status: data.status ?? existing.status,
      createdAt: existing.createdAt,
      lastUsedAt: existing.lastUsedAt,
      updatedAt: new Date(),
      routes: existing.routes,
    };
    return { ...this.keys[index]! };
  }

  deleteKey(id: string): boolean {
    const index = this.keys.findIndex(k => k.id === id);
    if (index === -1) return false;
    this.keys.splice(index, 1);
    return true;
  }

  // Routes
  getRoutes(): RouteConfig[] {
    return [...this.routes];
  }

  createRoute(data: any): RouteConfig {
    const newRoute: RouteConfig = {
      id: this.generateId('route'),
      ...data,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.routes.push(newRoute);
    return newRoute;
  }

  updateRoute(id: string, data: any): RouteConfig | null {
    const index = this.routes.findIndex(r => r.id === id);
    if (index === -1) return null;
    const existing = this.routes[index]!;
    this.routes[index] = {
      id: existing.id,
      name: data.name ?? existing.name,
      assetId: data.assetId ?? existing.assetId,
      isActive: data.isActive ?? existing.isActive,
      overrides: data.overrides ?? existing.overrides,
      configType: data.configType ?? existing.configType,
      priority: data.priority ?? existing.priority,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };
    return { ...this.routes[index]! };
  }

  deleteRoute(id: string): boolean {
    const index = this.routes.findIndex(r => r.id === id);
    if (index === -1) return false;
    this.routes.splice(index, 1);
    return true;
  }

  // Logs
  getLogs(): RequestLog[] {
    return [...this.logs].sort((a, b) => b.timestamp - a.timestamp);
  }

  getProtocolLog(requestId: string): any {
    const log = this.logs.find(l => l.id === requestId);
    if (!log) return null;

    return {
      requestId: log.id,
      originalFormat: 'openai',
      targetFormat: 'openai',
      transformationLog: [
        {
          timestamp: log.timestamp,
          stage: 'request_conversion',
          details: { fieldsConverted: 5 },
        },
        {
          timestamp: log.timestamp + 10,
          stage: 'response_conversion',
          details: { fieldsConverted: 3 },
        },
      ],
    };
  }

  // Assets
  getAssets(): Asset[] {
    return [...this.assets];
  }

  getAssetById(id: string): Asset | undefined {
    return this.assets.find(a => a.id === id);
  }

  createAsset(data: any): Asset {
    const newAsset: Asset = {
      id: this.generateId('asset'),
      ...data,
      status: 'active',
      validFrom: new Date(),
      validUntil: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.assets.push(newAsset);
    return newAsset;
  }

  updateAsset(id: string, data: any): Asset | null {
    const index = this.assets.findIndex(a => a.id === id);
    if (index === -1) return null;
    const existing = this.assets[index]!;
    this.assets[index] = {
      id: existing.id,
      name: data.name ?? existing.name,
      vendorId: existing.vendorId,
      apiKey: data.apiKey ?? existing.apiKey,
      status: data.status ?? existing.status,
      validFrom: data.validFrom ?? existing.validFrom,
      validUntil: data.validUntil ?? existing.validUntil,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };
    return { ...this.assets[index]! };
  }

  updateAssetStatus(id: string, status: 'active' | 'suspended'): Asset | null {
    return this.updateAsset(id, { status });
  }

  duplicateAsset(id: string): Asset | null {
    const asset = this.getAssetById(id);
    if (!asset) return null;

    const newAsset: Asset = {
      ...asset,
      id: this.generateId('asset'),
      name: `${asset.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.assets.push(newAsset);
    return newAsset;
  }

  deleteAsset(id: string): boolean {
    const index = this.assets.findIndex(a => a.id === id);
    if (index === -1) return false;
    this.assets.splice(index, 1);
    return true;
  }

  validateAssetModels(id: string): any {
    const asset = this.getAssetById(id);
    if (!asset) return { results: [] };

    // Filter models by vendor ID using simple prefix matching
    const vendorPrefixes: Record<string, string[]> = {
      'openai': ['gpt-'],
      'anthropic': ['claude-'],
      'gemini': ['gemini-'],
    };
    const prefixes = vendorPrefixes[asset.vendorId] || [];
    const models = this.vendorModels.filter(m =>
      prefixes.some(prefix => m.modelId.startsWith(prefix))
    );

    return {
      results: models.map(model => ({
        modelId: model.modelId,
        displayName: model.displayName,
        success: Math.random() > 0.2, // 80% success rate
        response: 'Model validation passed',
        error: Math.random() > 0.8 ? 'Rate limit exceeded' : undefined,
        latencyMs: Math.floor(Math.random() * 1000) + 200,
      })),
    };
  }

  // Vendors
  getVendors(): Vendor[] {
    return [...this.vendors];
  }

  getVendorModels(vendorId: string): VendorModel[] {
    // Filter models by vendor ID using simple prefix matching
    const vendorPrefixes: Record<string, string[]> = {
      'openai': ['gpt-'],
      'anthropic': ['claude-'],
      'gemini': ['gemini-'],
    };
    const prefixes = vendorPrefixes[vendorId] || [];
    return this.vendorModels.filter(m =>
      prefixes.some(prefix => m.modelId.startsWith(prefix))
    );
  }
}

// ============================================
// Export singleton instance
// ============================================

export const mockStore = new MockStore();
