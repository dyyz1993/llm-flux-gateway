/**
 * Analytics Service Tests
 *
 * Tests client-side API calls for analytics data
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getOverviewStats,
  getModelStats,
  getKeyStats,
  getAssetStats,
  getTTFBStats,
  getCacheStats,
  getErrorStats,
  getTimeSeriesStats,
  getRequestLogs,
  getRequestLogById,
  toggleLogFavorite,
  getFavoriteLogs,
  getLogsStats,
} from '../analyticsService';
import type {
  OverviewStats,
  ModelStats,
  KeyStats,
  AssetStats,
  TTFBStats,
  CacheStats,
  ErrorStats,
  TimeSeriesStats,
} from '@shared/types';

// Mock global fetch
global.fetch = vi.fn();

const mockFetch = vi.mocked(global.fetch);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

describe('Analytics Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock admin token
    localStorageMock.getItem.mockReturnValue('mock-admin-token');
  });

  // Helper to match fetch calls with Authorization header
  const expectFetchCall = (url: string, method: string = 'GET') => {
    expect(mockFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method,
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-admin-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  };

  const mockOverviewStats: OverviewStats = {
    totalRequests: 55,
    totalTokens: 125000,
    avgLatency: 450.5,
    avgTTFB: 125.3,
    successRate: 90.91,
    errorRate: 9.09,
    costEstimate: 0.125,
  };

  const mockModelStats: ModelStats[] = [
    {
      model: 'glm-4-flash',
      requestCount: 30,
      totalTokens: 75000,
      promptTokens: 50000,
      completionTokens: 25000,
      avgLatency: 420.5,
      avgTTFB: 115.2,
      errorCount: 2,
      cachedRequests: 5,
    },
  ];

  const mockKeyStats: KeyStats[] = [
    {
      keyId: 'key-001',
      keyName: 'Test Key',
      requestCount: 35,
      totalTokens: 85000,
      avgLatency: 440.2,
      avgTTFB: 120.5,
      errorCount: 1,
      errorRate: 2.86,
    },
  ];

  const mockAssetStats: AssetStats[] = [
    {
      assetId: 'asset-001',
      assetName: 'GLM Asset',
      vendorName: 'Zhipu AI',
      requestCount: 55,
      totalTokens: 125000,
      avgLatency: 450.5,
      avgTTFB: 125.3,
      errorCount: 3,
    },
  ];

  const mockTTFBStats: TTFBStats = {
    ranges: {
      '0-100ms': 10,
      '100-500ms': 25,
      '500ms-1s': 15,
      '1-3s': 4,
      '>3s': 1,
    },
    avgTTFB: 245.8,
    minTTFB: 45.2,
    maxTTFB: 3200.5,
    count: 55,
  };

  const mockCacheStats: CacheStats = {
    hitRate: 14.55,
    totalCachedTokens: 12000,
    avgCachedTokens: 1500,
    cacheReadTokens: 8000,
    cacheWriteTokens: 4000,
  };

  const mockErrorStats: ErrorStats = {
    totalErrors: 5,
    byStatusCode: { 500: 3, 400: 2 },
    byModel: { 'glm-4-flash': 3, 'glm-4-air': 2 },
    commonErrors: [
      { message: 'Rate limit exceeded', count: 2 },
      { message: 'Invalid API key', count: 1 },
    ],
  };

  const mockTimeSeriesStats: TimeSeriesStats[] = [
    {
      date: '2025-01-01',
      requestCount: 10,
      totalTokens: 25000,
      avgLatency: 440.2,
      avgTTFB: 120.5,
      errorCount: 1,
    },
  ];

  const mockRequestLog: any = {
    id: 'log-001',
    timestamp: 1704067200,
    apiKeyId: 'key-001',
    routeId: 'route-001',
    originalModel: 'gpt-4',
    finalModel: 'glm-4-flash',
    method: 'POST',
    path: '/v1/chat/completions',
    messageCount: 1,
    firstMessage: 'Test message',
    hasTools: false,
    toolCount: 0,
    messages: [{ role: 'user' as any, content: 'Test message' }],
    totalTokens: 1000,
    promptTokens: 700,
    completionTokens: 300,
    latencyMs: 450,
    timeToFirstByteMs: 120,
    statusCode: 200,
    cachedTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    errorMessage: null as any,
  };

  describe('getOverviewStats', () => {
    it('should fetch overview statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockOverviewStats,
        }),
      } as Response);

      const result = await getOverviewStats();

      expectFetchCall('/api/analytics/overview');
      expect(result).toEqual(mockOverviewStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch overview',
        }),
      } as Response);

      await expect(getOverviewStats()).rejects.toThrow('Failed to fetch overview');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getOverviewStats()).rejects.toThrow('Network error');
    });
  });

  describe('getModelStats', () => {
    it('should fetch model statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockModelStats,
        }),
      } as Response);

      const result = await getModelStats();

      expectFetchCall('/api/analytics/models');
      expect(result).toEqual(mockModelStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch models',
        }),
      } as Response);

      await expect(getModelStats()).rejects.toThrow('Failed to fetch models');
    });
  });

  describe('getKeyStats', () => {
    it('should fetch API key statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockKeyStats,
        }),
      } as Response);

      const result = await getKeyStats();

      expectFetchCall('/api/analytics/keys');
      expect(result).toEqual(mockKeyStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch keys',
        }),
      } as Response);

      await expect(getKeyStats()).rejects.toThrow('Failed to fetch keys');
    });
  });

  describe('getAssetStats', () => {
    it('should fetch asset statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAssetStats,
        }),
      } as Response);

      const result = await getAssetStats();

      expectFetchCall('/api/analytics/assets');
      expect(result).toEqual(mockAssetStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch assets',
        }),
      } as Response);

      await expect(getAssetStats()).rejects.toThrow('Failed to fetch assets');
    });
  });

  describe('getTTFBStats', () => {
    it('should fetch TTFB statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockTTFBStats,
        }),
      } as Response);

      const result = await getTTFBStats();

      expectFetchCall('/api/analytics/ttfb');
      expect(result).toEqual(mockTTFBStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch TTFB',
        }),
      } as Response);

      await expect(getTTFBStats()).rejects.toThrow('Failed to fetch TTFB');
    });
  });

  describe('getCacheStats', () => {
    it('should fetch cache statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockCacheStats,
        }),
      } as Response);

      const result = await getCacheStats();

      expectFetchCall('/api/analytics/cache');
      expect(result).toEqual(mockCacheStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch cache',
        }),
      } as Response);

      await expect(getCacheStats()).rejects.toThrow('Failed to fetch cache');
    });
  });

  describe('getErrorStats', () => {
    it('should fetch error statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockErrorStats,
        }),
      } as Response);

      const result = await getErrorStats();

      expectFetchCall('/api/analytics/errors');
      expect(result).toEqual(mockErrorStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch errors',
        }),
      } as Response);

      await expect(getErrorStats()).rejects.toThrow('Failed to fetch errors');
    });
  });

  describe('getTimeSeriesStats', () => {
    it('should fetch time series statistics with default days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockTimeSeriesStats,
        }),
      } as Response);

      const result = await getTimeSeriesStats();

      expectFetchCall('/api/analytics/timeseries?days=7');
      expect(result).toEqual(mockTimeSeriesStats);
    });

    it('should fetch time series statistics with custom days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockTimeSeriesStats,
        }),
      } as Response);

      await getTimeSeriesStats(30);

      expectFetchCall('/api/analytics/timeseries?days=30');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch time series',
        }),
      } as Response);

      await expect(getTimeSeriesStats()).rejects.toThrow('Failed to fetch time series');
    });
  });

  describe('getRequestLogs', () => {
    it('should fetch all request logs without filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockRequestLog],
        }),
      } as Response);

      const result = await getRequestLogs({});

      expectFetchCall(expect.stringContaining('/api/logs/all'));
      expect(result).toEqual([mockRequestLog]);
    });

    it('should fetch request logs with API key filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockRequestLog],
        }),
      } as Response);

      await getRequestLogs({ apiKeyId: 'key-001', limit: 10 });

      const calledUrl = mockFetch.mock.calls[0]![0]!;
      expect(calledUrl).toContain('/api/logs?');
      expect(calledUrl).toContain('apiKeyId=key-001');
      expect(calledUrl).toContain('limit=10');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch logs',
        }),
      } as Response);

      await expect(getRequestLogs({})).rejects.toThrow('Failed to fetch logs');
    });

    it('should return empty array when data is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: null,
        }),
      } as Response);

      const result = await getRequestLogs({});

      expect(result).toEqual([]);
    });
  });

  describe('getRequestLogById', () => {
    it('should fetch a specific request log', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockRequestLog,
        }),
      } as Response);

      const result = await getRequestLogById('log-001');

      expectFetchCall('/api/logs/log-001');
      expect(result).toEqual(mockRequestLog);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Log not found',
        }),
      } as Response);

      await expect(getRequestLogById('log-001')).rejects.toThrow('Log not found');
    });
  });

  describe('toggleLogFavorite', () => {
    it('should toggle favorite status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { isFavorited: true },
        }),
      } as Response);

      const result = await toggleLogFavorite('log-001');

      expectFetchCall('/api/logs/log-001/favorite', 'POST');
      expect(result).toEqual({ isFavorited: true });
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to toggle favorite',
        }),
      } as Response);

      await expect(toggleLogFavorite('log-001')).rejects.toThrow('Failed to toggle favorite');
    });
  });

  describe('getFavoriteLogs', () => {
    it('should fetch favorite logs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockRequestLog],
        }),
      } as Response);

      const result = await getFavoriteLogs(50);

      expectFetchCall('/api/logs/favorites?limit=50');
      expect(result).toEqual([mockRequestLog]);
    });

    it('should use default limit when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      } as Response);

      await getFavoriteLogs();

      expectFetchCall('/api/logs/favorites?limit=100');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch favorites',
        }),
      } as Response);

      await expect(getFavoriteLogs()).rejects.toThrow('Failed to fetch favorites');
    });

    it('should return empty array when data is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: null,
        }),
      } as Response);

      const result = await getFavoriteLogs();

      expect(result).toEqual([]);
    });
  });

  describe('getLogsStats', () => {
    it('should fetch logs statistics', async () => {
      const mockStats = {
        totalCount: 55,
        favoritedCount: 5,
        regularCount: 50,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockStats,
        }),
      } as Response);

      const result = await getLogsStats();

      expectFetchCall('/api/logs/stats');
      expect(result).toEqual(mockStats);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Failed to fetch stats',
        }),
      } as Response);

      await expect(getLogsStats()).rejects.toThrow('Failed to fetch stats');
    });
  });
});
