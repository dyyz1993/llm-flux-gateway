import { ApiKey, RouteConfig, RequestLog, Asset, Vendor, VendorModel } from '@shared/types';
import { mockStore } from './mockStore';
import { getAdminToken } from './adminApi';

// ============================================
// Configuration
// ============================================

const USE_MOCK_SERVER = false;

/**
 * 获取 API 基础地址
 * 优先从 window.env 读取（由 Docker 运行时注入），
 * 其次使用编译时环境变量，最后默认 localhost
 */
const getApiBaseUrl = () => {
  // @ts-ignore - window.env 是动态注入的
  if (window.env && typeof window.env.VITE_API_BASE_URL === 'string') {
    // @ts-ignore
    return window.env.VITE_API_BASE_URL;
  }
  // 生产环境打包后，如果没有注入 window.env，默认使用相对路径 ""
  return import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : (import.meta.env.MODE === 'production' ? '' : 'http://localhost:3000');
};

const API_BASE_URL = getApiBaseUrl();

// ============================================
// Type Definitions
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Helper Functions
// ============================================

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const handleError = (error: any): ApiResponse<any> => {
  console.error('[API Error]:', error);
  return { success: false, error: error.message || 'Network Error' };
};

// ============================================
// HTTP Request Wrapper
// ============================================

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;

    // Get admin token and add to headers
    const token = getAdminToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - redirect to login
    if (response.status === 401) {
      window.location.hash = '#/login';
      return { success: false, error: 'Session expired' };
    }

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    // Server already returns { success: true, data: ... }
    // Pass it through directly instead of wrapping again
    return data as ApiResponse<T>;
  } catch (error) {
    return handleError(error);
  }
}

// ============================================
// Keys API
// ============================================

/**
 * Fetch all API keys
 */
export const fetchKeys = async (): Promise<ApiResponse<ApiKey[]>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200);
      return { success: true, data: [] };
    }

    return await apiRequest<ApiKey[]>('/api/keys');
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Fetch a single API key by ID
 */
export const fetchKeyById = async (id: string): Promise<ApiResponse<ApiKey>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200);
      const key = mockStore.getKeyById(id);
      if (!key) {
        return { success: false, error: 'Key not found' };
      }
      return { success: true, data: key };
    }

    return await apiRequest<ApiKey>(`/api/keys/${id}`);
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Create a new API key
 */
export const createKey = async (
  name: string,
  routeIds?: string[]
): Promise<ApiResponse<ApiKey>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(400);
      const newKey = mockStore.createKey(name, routeIds);
      return { success: true, data: newKey };
    }

    return await apiRequest<ApiKey>('/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name, routeIds }),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Update an existing API key
 */
export const updateKey = async (
  id: string,
  data: { name?: string; status?: 'active' | 'revoked'; routeIds?: string[] }
): Promise<ApiResponse<ApiKey>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(300);
      const updatedKey = mockStore.updateKey(id, data);
      if (!updatedKey) {
        return { success: false, error: 'Key not found' };
      }
      return { success: true, data: updatedKey };
    }

    return await apiRequest<ApiKey>(`/api/keys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Delete an API key
 */
export const deleteKey = async (id: string): Promise<ApiResponse<{ deleted: boolean }>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(300);
      return { success: true, data: { deleted: true } };
    }

    return await apiRequest<{ deleted: boolean }>(`/api/keys/${id}`, {
      method: 'DELETE',
    });
  } catch (e) {
    return handleError(e);
  }
};

// ============================================
// Routes API
// ============================================

/**
 * Fetch all routes
 */
export const fetchRoutes = async (): Promise<ApiResponse<RouteConfig[]>> => {
  try {
    return await apiRequest<RouteConfig[]>('/api/routes');
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Create a new route
 */
export const createRoute = async (data: {
  name: string;
  assetId: string;
  overrides?: any[];
  configType?: 'yaml' | 'json';
  priority?: number;
}): Promise<ApiResponse<RouteConfig>> => {
  try {
    return await apiRequest<RouteConfig>('/api/routes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Update an existing route
 */
export const updateRoute = async (
  id: string,
  data: {
    name?: string;
    assetId?: string;
    isActive?: boolean;
    overrides?: any[];
    configType?: 'yaml' | 'json';
    priority?: number;
  }
): Promise<ApiResponse<RouteConfig>> => {
  try {
    return await apiRequest<RouteConfig>(`/api/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Delete a route
 */
export const deleteRoute = async (id: string): Promise<ApiResponse<{ deleted: boolean }>> => {
  try {
    return await apiRequest<{ deleted: boolean }>(`/api/routes/${id}`, {
      method: 'DELETE',
    });
  } catch (e) {
    return handleError(e);
  }
};

// ============================================
// Logs API (TODO: Not implemented on server)
// ============================================

export const fetchLogs = async (): Promise<ApiResponse<RequestLog[]>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200);
      const logs = mockStore.getLogs();
      return { success: true, data: logs };
    }

    return await apiRequest<RequestLog[]>('/api/logs');
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Fetch protocol transformation log for a specific request
 */
export const fetchProtocolLog = async (requestId: string): Promise<ApiResponse<{
  requestId: string;
  fileName: string;
  content: string;
  size: number;
}>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200);
      const log = mockStore.getProtocolLog(requestId);
      if (!log) {
        return { success: false, error: 'Protocol log not found' };
      }
      return { success: true, data: log };
    }

    return await apiRequest<{
      requestId: string;
      fileName: string;
      content: string;
      size: number;
    }>(`/api/logs/${requestId}/protocol-log`);
  } catch (e) {
    return handleError(e);
  }
};

// ============================================
// Assets API
// ============================================

/**
 * Fetch all assets
 */
export const fetchAssets = async (): Promise<ApiResponse<Asset[]>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200);
      const assets = mockStore.getAssets();
      return { success: true, data: assets };
    }

    return await apiRequest<Asset[]>('/api/assets');
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Fetch a single asset by ID
 */
export const fetchAssetById = async (id: string): Promise<ApiResponse<Asset>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200);
      const asset = mockStore.getAssetById(id);
      if (!asset) {
        return { success: false, error: 'Asset not found' };
      }
      return { success: true, data: asset };
    }

    return await apiRequest<Asset>(`/api/assets/${id}`);
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Create a new asset
 */
export const createAsset = async (data: {
  name: string;
  vendorId: string;
  apiKey: string;
  validFrom?: Date;
  validUntil?: Date;
  modelIds?: string[];
}): Promise<ApiResponse<Asset>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(400);
      const newAsset = mockStore.createAsset(data);
      return { success: true, data: newAsset };
    }

    return await apiRequest<Asset>('/api/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Update an existing asset
 */
export const updateAsset = async (
  id: string,
  data: {
    name?: string;
    apiKey?: string;
    status?: 'active' | 'suspended';
    validFrom?: Date;
    validUntil?: Date;
    modelIds?: string[];
  }
): Promise<ApiResponse<Asset>> => {
  try {
    return await apiRequest<Asset>(`/api/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Update asset status
 */
export const updateAssetStatus = async (
  id: string,
  status: 'active' | 'suspended'
): Promise<ApiResponse<Asset>> => {
  try {
    return await apiRequest<Asset>(`/api/assets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Duplicate an asset
 */
export const duplicateAsset = async (id: string): Promise<ApiResponse<Asset>> => {
  try {
    return await apiRequest<Asset>(`/api/assets/${id}/duplicate`, {
      method: 'POST',
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Delete an asset
 */
export const deleteAsset = async (id: string): Promise<ApiResponse<{ deleted: boolean }>> => {
  try {
    return await apiRequest<{ deleted: boolean }>(`/api/assets/${id}`, {
      method: 'DELETE',
    });
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Validate all models of an asset with test chat completions
 */
export const validateAssetModels = async (id: string): Promise<ApiResponse<{
  results: Array<{
    modelId: string;
    displayName: string;
    success: boolean;
    response?: string;
    error?: string;
    latencyMs?: number;
  }>;
}>> => {
  try {
    return await apiRequest(`/api/assets/${id}/validate-models`, {
      method: 'POST',
    });
  } catch (e) {
    return handleError(e);
  }
};

// ============================================
// Vendors API
// ============================================

/**
 * Fetch all vendors
 */
export const fetchVendors = async (): Promise<ApiResponse<Vendor[]>> => {
  try {
    return await apiRequest<Vendor[]>('/api/vendors');
  } catch (e) {
    return handleError(e);
  }
};

/**
 * Fetch models for a vendor
 */
export const fetchVendorModels = async (vendorId: string): Promise<ApiResponse<VendorModel[]>> => {
  try {
    return await apiRequest<VendorModel[]>(`/api/vendors/${vendorId}/models`);
  } catch (e) {
    return handleError(e);
  }
};
