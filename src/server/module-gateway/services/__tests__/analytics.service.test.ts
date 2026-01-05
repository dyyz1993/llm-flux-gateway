/**
 * Analytics Service Tests
 *
 * Tests statistical analysis functions for request logs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyticsService } from '../analytics.service';
import * as database from '@server/shared/database';

// Mock database functions
vi.mock('@server/shared/database', () => ({
  queryAll: vi.fn(),
  queryFirst: vi.fn(),
}));

const mockQueryAll = vi.mocked(database.queryAll);
const mockQueryFirst = vi.mocked(database.queryFirst);

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOverviewDbRow = {
    total_requests: 55,
    total_tokens: 125000,
    total_prompt_tokens: 75000,
    total_completion_tokens: 50000,
    avg_latency: 450.5,
    avg_ttfb: 125.3,
    success_count: 50,
    total_requests_with_status: 55,
  };

  describe('getOverviewStats', () => {
    it('should return overview statistics with correct calculations', async () => {
      mockQueryFirst.mockReturnValue(mockOverviewDbRow);

      const result = await analyticsService.getOverviewStats();

      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as total_requests')
      );
      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SUM(total_tokens) as total_tokens')
      );
      expect(result).toEqual({
        totalRequests: 55,
        totalTokens: 125000,
        totalPromptTokens: 75000,
        totalCompletionTokens: 50000,
        promptRatio: (75000 / 125000) * 100,
        completionRatio: (50000 / 125000) * 100,
        avgLatency: 450.5,
        avgTTFB: 125.3,
        successRate: (50 / 55) * 100,
        errorRate: 100 - (50 / 55) * 100,
        costEstimate: (125000 / 1000) * 0.001,
      });
    });

    it('should return zero stats when no data exists', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await analyticsService.getOverviewStats();

      expect(result).toEqual({
        totalRequests: 0,
        totalTokens: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        promptRatio: 0,
        completionRatio: 0,
        avgLatency: 0,
        avgTTFB: 0,
        successRate: 0,
        errorRate: 0,
        costEstimate: 0,
      });
    });

    it('should handle null token values correctly', async () => {
      mockQueryFirst.mockReturnValue({
        ...mockOverviewDbRow,
        total_tokens: null,
        total_prompt_tokens: null,
        total_completion_tokens: null,
        avg_latency: null,
        avg_ttfb: null,
      });

      const result = await analyticsService.getOverviewStats();

      expect(result.totalTokens).toBe(0);
      expect(result.totalPromptTokens).toBe(0);
      expect(result.totalCompletionTokens).toBe(0);
      expect(result.promptRatio).toBe(0);
      expect(result.completionRatio).toBe(0);
      expect(result.avgLatency).toBe(0);
      expect(result.avgTTFB).toBe(0);
    });
  });

  describe('getModelStats', () => {
    const mockModelDbRows = [
      {
        model: 'glm-4-flash',
        request_count: 30,
        total_tokens: 75000,
        prompt_tokens: 50000,
        completion_tokens: 25000,
        avg_latency: 420.5,
        avg_ttfb: 115.2,
        error_count: 2,
        cached_requests: 5,
      },
      {
        model: 'glm-4-air',
        request_count: 25,
        total_tokens: 50000,
        prompt_tokens: 35000,
        completion_tokens: 15000,
        avg_latency: 480.3,
        avg_ttfb: 135.8,
        error_count: 1,
        cached_requests: 3,
      },
    ];

    it('should return model statistics grouped by model', async () => {
      mockQueryAll.mockReturnValue(mockModelDbRows);

      const result = await analyticsService.getModelStats();

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('final_model as model')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY final_model')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY request_count DESC')
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        model: 'glm-4-flash',
        requestCount: 30,
        totalTokens: 75000,
        promptTokens: 50000,
        completionTokens: 25000,
        promptRatio: (50000 / 75000) * 100,
        completionRatio: (25000 / 75000) * 100,
        avgLatency: 420.5,
        avgTTFB: 115.2,
        errorCount: 2,
        cachedRequests: 5,
      });
    });

    it('should return empty array when no models exist', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await analyticsService.getModelStats();

      expect(result).toEqual([]);
    });

    it('should handle null token values in model stats', async () => {
      mockQueryAll.mockReturnValue([
        {
          ...mockModelDbRows[0] as any,
          total_tokens: null,
          prompt_tokens: null,
          completion_tokens: null,
          avg_latency: null,
          avg_ttfb: null,
        },
      ]);

      const result = await analyticsService.getModelStats();

      expect(result[0]!.totalTokens).toBe(0);
      expect(result[0]!.promptTokens).toBe(0);
      expect(result[0]!.completionTokens).toBe(0);
      expect(result[0]!.avgLatency).toBe(0);
      expect(result[0]!.avgTTFB).toBe(0);
    });
  });

  describe('getKeyStats', () => {
    const mockKeyDbRows = [
      {
        key_id: 'key-001',
        key_name: 'Test Key 1',
        request_count: 35,
        total_tokens: 85000,
        avg_latency: 440.2,
        avg_ttfb: 120.5,
        error_count: 1,
        error_rate: 2.86,
      },
      {
        key_id: 'key-002',
        key_name: 'Test Key 2',
        request_count: 20,
        total_tokens: 40000,
        avg_latency: 460.8,
        avg_ttfb: 130.2,
        error_count: 2,
        error_rate: 10.0,
      },
    ];

    it('should return API key statistics with error rate calculation', async () => {
      mockQueryAll.mockReturnValue(mockKeyDbRows);

      const result = await analyticsService.getKeyStats();

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN request_logs')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY ak.id, ak.name')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('HAVING request_count > 0')
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        keyId: 'key-001',
        keyName: 'Test Key 1',
        requestCount: 35,
        totalTokens: 85000,
        avgLatency: 440.2,
        avgTTFB: 120.5,
        errorCount: 1,
        errorRate: 2.86,
      });
    });

    it('should return empty array when no keys have requests', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await analyticsService.getKeyStats();

      expect(result).toEqual([]);
    });
  });

  describe('getAssetStats', () => {
    const mockAssetDbRows = [
      {
        asset_id: 'asset-001',
        asset_name: 'GLM Asset',
        vendor_name: 'Zhipu AI',
        request_count: 55,
        total_tokens: 125000,
        avg_latency: 450.5,
        avg_ttfb: 125.3,
        error_count: 3,
      },
    ];

    it('should return asset statistics with vendor information', async () => {
      mockQueryAll.mockReturnValue(mockAssetDbRows);

      const result = await analyticsService.getAssetStats();

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN routes')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN request_logs')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN vendor_templates')
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        assetId: 'asset-001',
        assetName: 'GLM Asset',
        vendorName: 'Zhipu AI',
        requestCount: 55,
        totalTokens: 125000,
        avgLatency: 450.5,
        avgTTFB: 125.3,
        errorCount: 3,
      });
    });

    it('should return empty array when no assets have requests', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await analyticsService.getAssetStats();

      expect(result).toEqual([]);
    });
  });

  describe('getTTFBStats', () => {
    const mockTTFBRangeRows = [
      { range: '0-100ms', count: 10 },
      { range: '100-500ms', count: 25 },
      { range: '500ms-1s', count: 15 },
      { range: '1-3s', count: 4 },
      { range: '>3s', count: 1 },
    ];

    const mockTTFBStatsRow = {
      avg_ttfb: 245.8,
      min_ttfb: 45.2,
      max_ttfb: 3200.5,
      count: 55,
    };

    it('should return TTFB distribution with range buckets', async () => {
      mockQueryAll.mockReturnValue(mockTTFBRangeRows);
      mockQueryFirst.mockReturnValue(mockTTFBStatsRow);

      const result = await analyticsService.getTTFBStats();

      expect(mockQueryAll).toHaveBeenCalled();
      expect(mockQueryFirst).toHaveBeenCalled();
      expect(result).toEqual({
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
      });
    });

    it('should handle missing TTFB ranges', async () => {
      mockQueryAll.mockReturnValue([
        { range: '100-500ms', count: 20 },
        { range: '500ms-1s', count: 10 },
      ] as any);
      mockQueryFirst.mockReturnValue(mockTTFBStatsRow);

      const result = await analyticsService.getTTFBStats();

      expect(result.ranges['0-100ms']).toBe(0);
      expect(result.ranges['1-3s']).toBe(0);
      expect(result.ranges['>3s']).toBe(0);
    });

    it('should return zero stats when no TTFB data exists', async () => {
      mockQueryAll.mockReturnValue([]);
      mockQueryFirst.mockReturnValue(undefined);

      const result = await analyticsService.getTTFBStats();

      expect(result).toEqual({
        ranges: {
          '0-100ms': 0,
          '100-500ms': 0,
          '500ms-1s': 0,
          '1-3s': 0,
          '>3s': 0,
        },
        avgTTFB: 0,
        minTTFB: 0,
        maxTTFB: 0,
        count: 0,
      });
    });
  });

  describe('getCacheStats', () => {
    const mockCacheDbRow = {
      total_requests: 55,
      cached_requests: 8,
      total_cached_tokens: 12000,
      cache_read_tokens: 8000,
      cache_write_tokens: 4000,
    };

    it('should return cache statistics with hit rate calculation', async () => {
      mockQueryFirst.mockReturnValue(mockCacheDbRow);

      const result = await analyticsService.getCacheStats();

      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SUM(CASE WHEN cached_tokens > 0')
      );
      expect(result).toEqual({
        hitRate: (8 / 55) * 100,
        totalCachedTokens: 12000,
        avgCachedTokens: 12000 / 8,
        cacheReadTokens: 8000,
        cacheWriteTokens: 4000,
      });
    });

    it('should return zero stats when no cache data exists', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await analyticsService.getCacheStats();

      expect(result).toEqual({
        hitRate: 0,
        totalCachedTokens: 0,
        avgCachedTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    });

    it('should handle zero cached requests', async () => {
      mockQueryFirst.mockReturnValue({
        total_requests: 55,
        cached_requests: 0,
        total_cached_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      });

      const result = await analyticsService.getCacheStats();

      expect(result.hitRate).toBe(0);
      expect(result.avgCachedTokens).toBe(0);
    });
  });

  describe('getErrorStats', () => {
    const mockTotalErrors = { count: 5 };
    const mockByStatusCodeRows = [
      { status_code: 500, count: 3 },
      { status_code: 400, count: 2 },
    ];
    const mockByModelRows = [
      { model: 'glm-4-flash', count: 3 },
      { model: 'glm-4-air', count: 2 },
    ];
    const mockCommonErrorsRows = [
      { error_message: 'Rate limit exceeded', count: 2 },
      { error_message: 'Invalid API key', count: 1 },
    ];

    it('should return comprehensive error statistics', async () => {
      mockQueryFirst.mockReturnValue(mockTotalErrors);
      mockQueryAll
        .mockReturnValueOnce(mockByStatusCodeRows)
        .mockReturnValueOnce(mockByModelRows)
        .mockReturnValueOnce(mockCommonErrorsRows);

      const result = await analyticsService.getErrorStats();

      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as count')
      );
      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status_code >= 400')
      );
      expect(result).toEqual({
        totalErrors: 5,
        byStatusCode: {
          500: 3,
          400: 2,
        },
        byModel: {
          'glm-4-flash': 3,
          'glm-4-air': 2,
        },
        commonErrors: [
          { message: 'Rate limit exceeded', count: 2 },
          { message: 'Invalid API key', count: 1 },
        ],
      });
    });

    it('should handle empty error results', async () => {
      mockQueryFirst.mockReturnValue({ count: 0 });
      mockQueryAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const result = await analyticsService.getErrorStats();

      expect(result.totalErrors).toBe(0);
      expect(result.byStatusCode).toEqual({});
      expect(result.byModel).toEqual({});
      expect(result.commonErrors).toEqual([]);
    });

    it('should return zero total errors when no data', async () => {
      mockQueryFirst.mockReturnValue(undefined);
      mockQueryAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const result = await analyticsService.getErrorStats();

      expect(result.totalErrors).toBe(0);
    });
  });

  describe('getTimeSeriesStats', () => {
    const mockTimeSeriesRows = [
      {
        date: '2025-01-01',
        request_count: 10,
        total_tokens: 25000,
        avg_latency: 440.2,
        avg_ttfb: 120.5,
        error_count: 1,
      },
      {
        date: '2025-01-02',
        request_count: 15,
        total_tokens: 35000,
        avg_latency: 455.8,
        avg_ttfb: 128.3,
        error_count: 0,
      },
    ];

    it('should return time series data for default 7 days', async () => {
      mockQueryAll.mockReturnValue(mockTimeSeriesRows);

      const result = await analyticsService.getTimeSeriesStats();

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining("strftime('%s', 'now', '-7 days')")
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY DATE(timestamp')
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2025-01-01',
        requestCount: 10,
        totalTokens: 25000,
        avgLatency: 440.2,
        avgTTFB: 120.5,
        errorCount: 1,
      });
    });

    it('should return time series data for custom days', async () => {
      mockQueryAll.mockReturnValue(mockTimeSeriesRows);

      await analyticsService.getTimeSeriesStats(30);

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining("strftime('%s', 'now', '-30 days')")
      );
    });

    it('should return empty array when no time series data', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await analyticsService.getTimeSeriesStats();

      expect(result).toEqual([]);
    });

    it('should handle null values in time series data', async () => {
      mockQueryAll.mockReturnValue([
        {
          ...mockTimeSeriesRows[0],
          total_tokens: null,
          avg_latency: null,
          avg_ttfb: null,
        },
      ]);

      const result = await analyticsService.getTimeSeriesStats();

      expect(result[0]!.totalTokens).toBe(0);
      expect(result[0]!.avgLatency).toBe(0);
      expect(result[0]!.avgTTFB).toBe(0);
    });
  });
});
