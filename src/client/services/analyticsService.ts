/**
 * Analytics Service
 *
 * Fetches request logs and analytics data from the backend API
 */

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
async function handleApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data!;
}

/**
 * Get overview statistics
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const response = await fetch('/api/analytics/overview');
  return handleApiResponse<OverviewStats>(response);
}

/**
 * Get model statistics
 */
export async function getModelStats(): Promise<ModelStats[]> {
  const response = await fetch('/api/analytics/models');
  return handleApiResponse<ModelStats[]>(response);
}

/**
 * Get API Key statistics
 */
export async function getKeyStats(): Promise<KeyStats[]> {
  const response = await fetch('/api/analytics/keys');
  return handleApiResponse<KeyStats[]>(response);
}

/**
 * Get asset statistics
 */
export async function getAssetStats(): Promise<AssetStats[]> {
  const response = await fetch('/api/analytics/assets');
  return handleApiResponse<AssetStats[]>(response);
}

/**
 * Get TTFB statistics
 */
export async function getTTFBStats(): Promise<TTFBStats> {
  const response = await fetch('/api/analytics/ttfb');
  return handleApiResponse<TTFBStats>(response);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const response = await fetch('/api/analytics/cache');
  return handleApiResponse<CacheStats>(response);
}

/**
 * Get error statistics
 */
export async function getErrorStats(): Promise<ErrorStats> {
  const response = await fetch('/api/analytics/errors');
  return handleApiResponse<ErrorStats>(response);
}

/**
 * Get time series statistics
 * @param days - Number of days to look back (default: 7)
 */
export async function getTimeSeriesStats(days: number = 7): Promise<TimeSeriesStats[]> {
  const response = await fetch(`/api/analytics/timeseries?days=${days}`);
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

  const response = await fetch(url);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get request logs');
  }

  return data.data! || [];
}

/**
 * Toggle favorite status of a log
 */
export async function toggleLogFavorite(logId: string): Promise<{ isFavorited: boolean }> {
  const response = await fetch(`/api/logs/${logId}/favorite`, {
    method: 'POST',
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to toggle favorite');
  }

  return data.data!;
}

/**
 * Get all favorited logs
 */
export async function getFavoriteLogs(limit = 100): Promise<RequestLog[]> {
  const response = await fetch(`/api/logs/favorites?limit=${limit}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get favorite logs');
  }

  return data.data! || [];
}

/**
 * Get logs statistics
 */
export async function getLogsStats(): Promise<{
  totalCount: number;
  favoritedCount: number;
  regularCount: number;
}> {
  const response = await fetch('/api/logs/stats');
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get stats');
  }

  return data.data!;
}

/**
 * Clear all non-favorited logs
 */
export async function clearAllNonFavoritedLogs(): Promise<{ deletedCount: number }> {
  const response = await fetch('/api/logs/clear-all', {
    method: 'DELETE',
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to clear logs');
  }

  return data.data!;
}

/**
 * Get a specific request log by ID
 */
export async function getRequestLogById(logId: string): Promise<RequestLog> {
  const response = await fetch(`/api/logs/${logId}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get log');
  }

  return data.data!;
}
