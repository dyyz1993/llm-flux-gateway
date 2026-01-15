/**
 * Analytics Service
 *
 * Fetches request logs and analytics data from the backend API
 */

import { adminGet, adminPost, adminDelete } from './adminApi';
import type {
  RequestLog,
  OverviewStats,
  ModelStats,
  KeyStats,
  AssetStats,
  TTFBStats,
  CacheStats,
  ErrorStats,
  TimeSeriesStats,
} from '@shared/types';

export interface AnalyticsStats {
  totalTokens: number;
  requestCount: number;
  successRate: number;
  avgLatency: number;
  costEstimate: number;
  timeSeriesData: Array<{
    timestamp: number;
    tokens: number;
    requests: number;
  }>;
}

/**
 * Helper function to handle API responses
 */
async function handleApiResponse<T>(response: { success: boolean; data?: T; error?: string }): Promise<T> {
  if (!response.success) {
    throw new Error(response.error || 'API request failed');
  }

  return response.data as T;
}

/**
 * Helper to get data from response, with fallback for null
 */
async function getDataFromArrayResponse<T>(response: { success: boolean; data?: T; error?: string }): Promise<T> {
  if (!response.success) {
    throw new Error(response.error || 'API request failed');
  }

  // For array types, if data is null, return empty array
  if (response.data === null) {
    return [] as T;
  }

  return response.data as T;
}

/**
 * Get overview statistics
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const response = await adminGet<{ success: boolean; data?: OverviewStats }>('/api/analytics/overview');
  return handleApiResponse<OverviewStats>(response);
}

/**
 * Get model statistics
 */
export async function getModelStats(): Promise<ModelStats[]> {
  const response = await adminGet<{ success: boolean; data?: ModelStats[] }>('/api/analytics/models');
  return handleApiResponse<ModelStats[]>(response);
}

/**
 * Get API Key statistics
 */
export async function getKeyStats(): Promise<KeyStats[]> {
  const response = await adminGet<{ success: boolean; data?: KeyStats[] }>('/api/analytics/keys');
  return handleApiResponse<KeyStats[]>(response);
}

/**
 * Get asset statistics
 */
export async function getAssetStats(): Promise<AssetStats[]> {
  const response = await adminGet<{ success: boolean; data?: AssetStats[] }>('/api/analytics/assets');
  return handleApiResponse<AssetStats[]>(response);
}

/**
 * Get TTFB statistics
 */
export async function getTTFBStats(): Promise<TTFBStats> {
  const response = await adminGet<{ success: boolean; data?: TTFBStats }>('/api/analytics/ttfb');
  return handleApiResponse<TTFBStats>(response);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const response = await adminGet<{ success: boolean; data?: CacheStats }>('/api/analytics/cache');
  return handleApiResponse<CacheStats>(response);
}

/**
 * Get error statistics
 */
export async function getErrorStats(): Promise<ErrorStats> {
  const response = await adminGet<{ success: boolean; data?: ErrorStats }>('/api/analytics/errors');
  return handleApiResponse<ErrorStats>(response);
}

/**
 * Get time series statistics
 * @param days - Number of days to look back (default: 7)
 */
export async function getTimeSeriesStats(days: number = 7, keyId?: string): Promise<TimeSeriesStats[]> {
  const queryParams = new URLSearchParams({ days: days.toString() });
  if (keyId) {
    queryParams.append('keyId', keyId);
  }
  const response = await adminGet<{ success: boolean; data?: TimeSeriesStats[] }>(`/api/analytics/timeseries?${queryParams.toString()}`);
  return handleApiResponse<TimeSeriesStats[]>(response);
}

/**
 * Get request logs with optional filters
 */
export async function getRequestLogs(options: {
  apiKeyId?: string;
  limit?: number;
  offset?: number;
}): Promise<RequestLog[]> {
  const params = new URLSearchParams();

  if (options.apiKeyId) {
    params.append('apiKeyId', options.apiKeyId);
  }

  if (options.limit) {
    params.append('limit', options.limit.toString());
  }

  if (options.offset) {
    params.append('offset', options.offset.toString());
  }

  // Use /api/logs/all if no apiKeyId is specified
  const url = options.apiKeyId
    ? `/api/logs?${params.toString()}`
    : `/api/logs/all?${params.toString()}`;

  const response = await adminGet<{ success: boolean; data?: RequestLog[] }>(url);
  return getDataFromArrayResponse<RequestLog[]>(response);
}

/**
 * Toggle favorite status of a log
 */
export async function toggleLogFavorite(logId: string): Promise<{ isFavorited: boolean }> {
  const response = await adminPost<{ success: boolean; data?: { isFavorited: boolean } }>(`/api/logs/${logId}/favorite`, {});
  return handleApiResponse(response);
}

/**
 * Get all favorited logs
 */
export async function getFavoriteLogs(limit = 100): Promise<RequestLog[]> {
  const response = await adminGet<{ success: boolean; data?: RequestLog[] }>(`/api/logs/favorites?limit=${limit}`);
  return getDataFromArrayResponse<RequestLog[]>(response);
}

/**
 * Get logs statistics
 */
export async function getLogsStats(): Promise<{
  totalCount: number;
  favoritedCount: number;
  regularCount: number;
}> {
  const response = await adminGet<{ success: boolean; data?: { totalCount: number; favoritedCount: number; regularCount: number } }>('/api/logs/stats');
  return handleApiResponse<{ totalCount: number; favoritedCount: number; regularCount: number }>(response);
}

/**
 * Clear all non-favorited logs
 */
export async function clearAllNonFavoritedLogs(): Promise<{ deletedCount: number }> {
  const response = await adminDelete<{ success: boolean; data?: { deletedCount: number } }>('/api/logs/clear-all');
  return handleApiResponse<{ deletedCount: number }>(response);
}

/**
 * Get a specific request log by ID
 */
export async function getRequestLogById(logId: string): Promise<RequestLog> {
  const response = await adminGet<{ success: boolean; data?: RequestLog }>(`/api/logs/${logId}`);
  return handleApiResponse<RequestLog>(response);
}

/**
 * Retry a request log by ID
 */
export async function retryRequestLog(logId: string): Promise<{ success: boolean; error?: string }> {
  const response = await adminPost<{ success: boolean; error?: string }>(`/api/logs/${logId}/retry`, {});
  return response;
}
