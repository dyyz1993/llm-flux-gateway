/**
 * Dashboard Component Tests
 *
 * Tests the analytics dashboard UI component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Dashboard } from '../Dashboard';
import * as analyticsService from '@client/services/analyticsService';

// Mock analytics service
vi.mock('@client/services/analyticsService', () => ({
  getOverviewStats: vi.fn(),
  getModelStats: vi.fn(),
  getKeyStats: vi.fn(),
  getAssetStats: vi.fn(),
  getTTFBStats: vi.fn(),
  getCacheStats: vi.fn(),
  getErrorStats: vi.fn(),
  getTimeSeriesStats: vi.fn(),
  getRequestLogs: vi.fn(),
}));

// Mock Recharts components
vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie">{children}</div>
  ),
  Cell: () => <div data-testid="cell" />,
  Legend: () => <div data-testid="legend" />,
}));

const mockAnalyticsService = vi.mocked(analyticsService);

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const mockOverviewStats = {
    totalRequests: 55,
    totalTokens: 125000,
    avgLatency: 450.5,
    avgTTFB: 125.3,
    successRate: 90.91,
    errorRate: 9.09,
    costEstimate: 0.125,
  };

  const mockModelStats = [
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
      completionRatio: 33.3, // 25000 / 75000 * 100
    },
    {
      model: 'glm-4-air',
      requestCount: 25,
      totalTokens: 50000,
      promptTokens: 35000,
      completionTokens: 15000,
      avgLatency: 480.3,
      avgTTFB: 135.8,
      errorCount: 1,
      cachedRequests: 3,
      completionRatio: 30.0, // 15000 / 50000 * 100
    },
  ];

  const mockKeyStats = [
    {
      keyId: 'key-001',
      keyName: 'Production Key',
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

  const mockRequestLogs = [
    {
      id: 'log-001',
      timestamp: 1704067200,
      apiKeyId: 'key-001',
      routeId: 'route-001',
      originalModel: 'gpt-4',
      finalModel: 'glm-4-flash',
      messages: [{ role: 'user', content: 'Test message' }],
      totalTokens: 1000,
      promptTokens: 700,
      completionTokens: 300,
      latencyMs: 450,
      timeToFirstByteMs: 120,
      statusCode: 200,
      cachedTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      errorMessage: null,
      // Missing required fields
      method: 'POST',
      path: '/v1/chat/completions',
      messageCount: 1,
      firstMessage: 'Test message',
      hasTools: false,
    } as any,
  ];

  describe('Initial Loading', () => {
    it('should show loading state while fetching data', () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      // Check for loading placeholders in cards
      expect(screen.getAllByText('...').length).toBeGreaterThan(0);
    });

    it.skip('should call all 8 analytics APIs on mount', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      // Wait for data to be loaded and displayed
      await waitFor(() => {
        expect(mockAnalyticsService.getOverviewStats).toHaveBeenCalledOnce();
        expect(mockAnalyticsService.getModelStats).toHaveBeenCalledOnce();
        expect(mockAnalyticsService.getKeyStats).toHaveBeenCalledOnce();
        expect(mockAnalyticsService.getTTFBStats).toHaveBeenCalledOnce();
        expect(mockAnalyticsService.getCacheStats).toHaveBeenCalledOnce();
        expect(mockAnalyticsService.getTimeSeriesStats).toHaveBeenCalledWith(7);
        expect(mockAnalyticsService.getRequestLogs).toHaveBeenCalledWith({ limit: 50 });
        // Note: getAssetStats and getErrorStats are not called by Dashboard component
      }, { timeout: 5000 });
    });
  });

  describe('Data Display', () => {
    it('should display overview cards with correct data', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('55')!).toBeInTheDocument(); // Total Requests
        expect(screen.getByText('125.0K')!).toBeInTheDocument(); // Total Tokens
        expect(screen.getByText('450ms')!).toBeInTheDocument(); // Avg Latency (450.5.toFixed(0) = 450)
        expect(screen.getByText('125ms')!).toBeInTheDocument(); // Avg TTFB (125.3.toFixed(0) = 125)
      });
    });

    it('should display success rate and cost cards', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('90.9%')!).toBeInTheDocument(); // Success Rate
        expect(screen.getByText('$0.13')!).toBeInTheDocument(); // Cost (0.125.toFixed(2) = 0.13)
        expect(screen.getByText('14.6%')!).toBeInTheDocument(); // Cache Hit Rate
      });
    });

    it('should display model statistics table', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      // Wait for model statistics table header
      await waitFor(
        () => {
          expect(screen.getByText('Model Statistics')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // Verify model names appear in the table
      const modelNames = screen.getAllByText('glm-4-flash');
      expect(modelNames.length).toBeGreaterThan(0);

      // Verify key data points are displayed
      expect(screen.getByText('30')).toBeInTheDocument(); // Request count
      expect(screen.getByText('75.0K')).toBeInTheDocument(); // Total tokens
    });

    it('should display API key statistics table', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Production Key')!).toBeInTheDocument();
        expect(screen.getByText('35')!).toBeInTheDocument(); // Request count
        expect(screen.getByText('85.0K')!).toBeInTheDocument(); // Tokens
        expect(screen.getByText('2.9%')!).toBeInTheDocument(); // Error rate (2.86.toFixed(1) = 2.9)
      });
    });

    it('should display recent requests table', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        // Use getAllByText since glm-4-flash appears in multiple tables
        expect(screen.getAllByText('glm-4-flash').length).toBeGreaterThan(0);
        expect(screen.getByText('200')!).toBeInTheDocument(); // Status code
        expect(screen.getByText('1.0K')!).toBeInTheDocument(); // Tokens
        expect(screen.getByText('450ms')!).toBeInTheDocument(); // Latency
      });
    });

    it('should render chart components', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getAllByTestId('area-chart').length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('bar-chart').length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('pie-chart').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Empty Data Handling', () => {
    it('should display zero values when no data exists', async () => {
      const emptyStats = {
        totalRequests: 0,
        totalTokens: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        avgLatency: 0,
        avgTTFB: 0,
        successRate: 0,
        errorRate: 0,
        costEstimate: 0,
      };

      const emptyTTFBStats = {
        ranges: { '0-100ms': 0, '100-500ms': 0, '500ms-1s': 0, '1-3s': 0, '>3s': 0 },
        avgTTFB: 0,
        minTTFB: 0,
        maxTTFB: 0,
        count: 0,
      };

      const emptyCacheStats = {
        hitRate: 0,
        totalCachedTokens: 0,
        avgCachedTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(emptyStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(emptyTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(emptyCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue([]);

      render(<Dashboard />);

      // Wait for loading to complete
      await waitFor(
        () => {
          expect(screen.queryAllByText('...').length).toBe(0);
        },
        { timeout: 5000 }
      );

      // Verify zero values are displayed correctly
      expect(screen.getByText('$0.00')).toBeInTheDocument(); // Cost estimate
    });

    it('should not display key stats table when no keys exist', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue([]); // Empty
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue([]);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue([]);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.queryByText('API Key Statistics')!).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle partial API failures gracefully', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      // Should not throw - component catches errors and logs them
      // Since Promise.all fails on first rejection, no data will be displayed
      // Just verify that loading completes and component doesn't crash
      await waitFor(() => {
        // Loading state should be cleared
        expect(screen.queryAllByText('...').length).toBe(0);
      }, { timeout: 5000 });
    });

    it('should complete loading even on error', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getModelStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getKeyStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getAssetStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getTTFBStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getCacheStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getErrorStats).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockAnalyticsService.getRequestLogs).mockRejectedValue(new Error('API Error'));

      render(<Dashboard />);

      // Loading should complete (no longer showing "...")
      await waitFor(() => {
        expect(screen.queryAllByText('...').length).toBe(0);
      });
    });
  });

  describe('Data Formatting', () => {
    it('should format large numbers with K/M suffixes', async () => {
      const largeStats = {
        ...mockOverviewStats,
        totalTokens: 1500000, // 1.5M
      };

      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(largeStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('1.5M')!).toBeInTheDocument();
      });
    });

    it('should format latency in ms and seconds', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('450ms')!).toBeInTheDocument(); // Latency < 1000ms (450.5.toFixed(0) = 450)
      });
    });

    it('should format percentages correctly', async () => {
      vi.mocked(mockAnalyticsService.getOverviewStats).mockResolvedValue(mockOverviewStats);
      vi.mocked(mockAnalyticsService.getModelStats).mockResolvedValue(mockModelStats);
      vi.mocked(mockAnalyticsService.getKeyStats).mockResolvedValue(mockKeyStats);
      vi.mocked(mockAnalyticsService.getAssetStats).mockResolvedValue(mockAssetStats);
      vi.mocked(mockAnalyticsService.getTTFBStats).mockResolvedValue(mockTTFBStats);
      vi.mocked(mockAnalyticsService.getCacheStats).mockResolvedValue(mockCacheStats);
      vi.mocked(mockAnalyticsService.getTimeSeriesStats).mockResolvedValue(mockTimeSeriesStats);
      vi.mocked(mockAnalyticsService.getErrorStats as any).mockResolvedValue([] as any);
      vi.mocked(mockAnalyticsService.getRequestLogs).mockResolvedValue(mockRequestLogs);

      render(<Dashboard />);

      // Wait for success rate card to render
      await waitFor(
        () => {
          expect(screen.getByText('90.9%')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // Verify other percentage formats
      expect(screen.getByText('14.6%')).toBeInTheDocument(); // Cache hit rate
    });
  });
});
