/**
 * Analytics Routes Tests
 *
 * Tests HTTP endpoints for analytics statistics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import analyticsRouter from '../analytics-routes';
import { analyticsService } from '../../services/analytics.service';

// Mock analytics service
vi.mock('../../services/analytics.service', () => ({
  analyticsService: {
    getOverviewStats: vi.fn(),
    getModelStats: vi.fn(),
    getKeyStats: vi.fn(),
    getAssetStats: vi.fn(),
    getTTFBStats: vi.fn(),
    getCacheStats: vi.fn(),
    getErrorStats: vi.fn(),
    getTimeSeriesStats: vi.fn(),
  },
}));

const mockAnalyticsService = vi.mocked(analyticsService);

describe('Analytics Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/api/analytics', analyticsRouter);
  });

  const mockOverviewStats: any = {
    totalRequests: 55,
    totalTokens: 125000,
    totalPromptTokens: 50000,
    totalCompletionTokens: 25000,
    promptRatio: 0.5,
    completionRatio: 0.5,
    avgLatency: 450.5,
    avgTTFB: 125.3,
    successRate: 90.91,
    errorRate: 9.09,
    costEstimate: 0.125,
  };

  const mockModelStats: any[] = [
    {
      model: 'glm-4-flash',
      requestCount: 30,
      totalTokens: 75000,
      promptTokens: 50000,
      completionTokens: 25000,
      promptRatio: 0.5,
      completionRatio: 0.5,
      avgLatency: 420.5,
      avgTTFB: 115.2,
      errorCount: 2,
      cachedRequests: 5,
    },
  ];

  const mockKeyStats = [
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

  const mockAssetStats = [
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

  const mockTTFBStats = {
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

  const mockCacheStats = {
    hitRate: 14.55,
    totalCachedTokens: 12000,
    avgCachedTokens: 1500,
    cacheReadTokens: 8000,
    cacheWriteTokens: 4000,
  };

  const mockErrorStats = {
    totalErrors: 5,
    byStatusCode: { 500: 3, 400: 2 },
    byModel: { 'glm-4-flash': 3, 'glm-4-air': 2 },
    commonErrors: [
      { message: 'Rate limit exceeded', count: 2 },
      { message: 'Invalid API key', count: 1 },
    ],
  };

  const mockTimeSeriesStats = [
    {
      date: '2025-01-01',
      requestCount: 10,
      totalTokens: 25000,
      avgLatency: 440.2,
      avgTTFB: 120.5,
      errorCount: 1,
    },
    {
      date: '2025-01-02',
      requestCount: 15,
      totalTokens: 35000,
      avgLatency: 455.8,
      avgTTFB: 128.3,
      errorCount: 0,
    },
  ];

  describe('GET /api/analytics/overview', () => {
    it('should return overview statistics', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);

      const response = await app.request('/api/analytics/overview');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockOverviewStats,
      });
      expect(mockAnalyticsService.getOverviewStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockRejectedValue(
        new Error('Database error')
      );

      const response = await app.request('/api/analytics/overview');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Database error');
    });
  });

  describe('GET /api/analytics/models', () => {
    it('should return model statistics', async () => {
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);

      const response = await app.request('/api/analytics/models');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockModelStats,
      });
      expect(mockAnalyticsService.getModelStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getModelStats).mockRejectedValue(
        new Error('Failed to fetch models')
      );

      const response = await app.request('/api/analytics/models');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch models');
    });
  });

  describe('GET /api/analytics/keys', () => {
    it('should return API key statistics', async () => {
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);

      const response = await app.request('/api/analytics/keys');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockKeyStats,
      });
      expect(mockAnalyticsService.getKeyStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getKeyStats).mockRejectedValue(
        new Error('Failed to fetch keys')
      );

      const response = await app.request('/api/analytics/keys');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch keys');
    });
  });

  describe('GET /api/analytics/assets', () => {
    it('should return asset statistics', async () => {
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);

      const response = await app.request('/api/analytics/assets');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockAssetStats,
      });
      expect(mockAnalyticsService.getAssetStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getAssetStats).mockRejectedValue(
        new Error('Failed to fetch assets')
      );

      const response = await app.request('/api/analytics/assets');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch assets');
    });
  });

  describe('GET /api/analytics/ttfb', () => {
    it('should return TTFB statistics', async () => {
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);

      const response = await app.request('/api/analytics/ttfb');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockTTFBStats,
      });
      expect(mockAnalyticsService.getTTFBStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getTTFBStats).mockRejectedValue(
        new Error('Failed to fetch TTFB')
      );

      const response = await app.request('/api/analytics/ttfb');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch TTFB');
    });
  });

  describe('GET /api/analytics/cache', () => {
    it('should return cache statistics', async () => {
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);

      const response = await app.request('/api/analytics/cache');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockCacheStats,
      });
      expect(mockAnalyticsService.getCacheStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getCacheStats).mockRejectedValue(
        new Error('Failed to fetch cache stats')
      );

      const response = await app.request('/api/analytics/cache');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch cache stats');
    });
  });

  describe('GET /api/analytics/errors', () => {
    it('should return error statistics', async () => {
      vi.mocked(mockAnalyticsService.getErrorStats).mockResolvedValue(mockErrorStats);

      const response = await app.request('/api/analytics/errors');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockErrorStats,
      });
      expect(mockAnalyticsService.getErrorStats).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getErrorStats).mockRejectedValue(
        new Error('Failed to fetch errors')
      );

      const response = await app.request('/api/analytics/errors');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch errors');
    });
  });

  describe('GET /api/analytics/timeseries', () => {
    it('should return time series statistics with default days', async () => {
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(
        mockTimeSeriesStats
      );

      const response = await app.request('/api/analytics/timeseries');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockTimeSeriesStats,
      });
      expect(mockAnalyticsService.getTimeSeriesStats).toHaveBeenCalledWith(7);
    });

    it('should return time series statistics with custom days', async () => {
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(
        mockTimeSeriesStats
      );

      const response = await app.request('/api/analytics/timeseries?days=30');
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        success: true,
        data: mockTimeSeriesStats,
      });
      expect(mockAnalyticsService.getTimeSeriesStats).toHaveBeenCalledWith(30);
    });

    it('should handle invalid days parameter', async () => {
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue([]);

      const response = await app.request('/api/analytics/timeseries?days=invalid');

      // parseInt('invalid') returns NaN, service should handle gracefully
      expect(response.status).toBe(200);
      expect(mockAnalyticsService.getTimeSeriesStats).toHaveBeenCalledWith(NaN);
    });

    it('should handle service errors', async () => {
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockRejectedValue(
        new Error('Failed to fetch time series')
      );

      const response = await app.request('/api/analytics/timeseries');
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Failed to fetch time series');
    });
  });
});
