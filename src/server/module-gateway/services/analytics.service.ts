/**
 * Analytics Service
 *
 * Provides statistical analysis of request logs
 */

import { queryAll, queryFirst } from '../../shared/database';

/**
 * Overview Statistics
 */
export interface OverviewStats {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  promptRatio: number;
  completionRatio: number;
  avgLatency: number;
  avgTTFB: number;
  successRate: number;
  errorRate: number;
  costEstimate: number;
}

/**
 * Model Statistics
 */
export interface ModelStats {
  model: string;
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  promptRatio: number;
  completionRatio: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
  cachedRequests: number;
}

/**
 * API Key Statistics
 */
export interface KeyStats {
  keyId: string;
  keyName: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
  errorRate: number;
}

/**
 * Asset Statistics
 */
export interface AssetStats {
  assetId: string;
  assetName: string;
  vendorName: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
}

/**
 * TTFB Statistics
 */
export interface TTFBStats {
  ranges: {
    '0-100ms': number;
    '100-500ms': number;
    '500ms-1s': number;
    '1-3s': number;
    '>3s': number;
  };
  avgTTFB: number;
  minTTFB: number;
  maxTTFB: number;
  count: number;
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  hitRate: number;
  totalCachedTokens: number;
  avgCachedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Error Statistics
 */
export interface ErrorStats {
  totalErrors: number;
  byStatusCode: { [code: number]: number };
  byModel: { [model: string]: number };
  commonErrors: { message: string; count: number }[];
}

/**
 * Time Series Statistics
 */
export interface TimeSeriesStats {
  date: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  avgTTFB: number;
  errorCount: number;
}

class AnalyticsService {
  /**
   * Get overview statistics
   */
  async getOverviewStats(): Promise<OverviewStats> {
    const result = queryFirst<{
      total_requests: number;
      total_tokens: number;
      total_prompt_tokens: number;
      total_completion_tokens: number;
      avg_latency: number;
      avg_ttfb: number;
      success_count: number;
      total_requests_with_status: number;
    }>(`
      SELECT
        COUNT(*) as total_requests,
        SUM(total_tokens) as total_tokens,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        AVG(latency_ms) as avg_latency,
        AVG(time_to_first_byte_ms) as avg_ttfb,
        SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success_count,
        COUNT(*) as total_requests_with_status
      FROM request_logs
    `);

    if (!result) {
      return {
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
      };
    }

    const successRate = result.total_requests_with_status > 0
      ? (result.success_count / result.total_requests_with_status) * 100
      : 0;

    const totalTokens = result.total_tokens || 0;
    const totalPromptTokens = result.total_prompt_tokens || 0;
    const totalCompletionTokens = result.total_completion_tokens || 0;

    // Calculate ratios
    const promptRatio = totalTokens > 0 ? (totalPromptTokens / totalTokens) * 100 : 0;
    const completionRatio = totalTokens > 0 ? (totalCompletionTokens / totalTokens) * 100 : 0;

    // Simple cost estimation: $0.001 per 1K tokens
    const costEstimate = (totalTokens / 1000) * 0.001;

    return {
      totalRequests: result.total_requests,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      promptRatio,
      completionRatio,
      avgLatency: result.avg_latency || 0,
      avgTTFB: result.avg_ttfb || 0,
      successRate,
      errorRate: 100 - successRate,
      costEstimate,
    };
  }

  /**
   * Get model statistics
   */
  async getModelStats(): Promise<ModelStats[]> {
    const results = queryAll<{
      model: string;
      request_count: number;
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
      avg_latency: number;
      avg_ttfb: number;
      error_count: number;
      cached_requests: number;
    }>(`
      SELECT
        final_model as model,
        COUNT(*) as request_count,
        SUM(total_tokens) as total_tokens,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        AVG(latency_ms) as avg_latency,
        AVG(time_to_first_byte_ms) as avg_ttfb,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN cached_tokens > 0 THEN 1 ELSE 0 END) as cached_requests
      FROM request_logs
      GROUP BY final_model
      ORDER BY request_count DESC
    `);

    return results.map(row => {
      const totalTokens = row.total_tokens || 0;
      const promptTokens = row.prompt_tokens || 0;
      const completionTokens = row.completion_tokens || 0;

      return {
        model: row.model,
        requestCount: row.request_count,
        totalTokens,
        promptTokens,
        completionTokens,
        promptRatio: totalTokens > 0 ? (promptTokens / totalTokens) * 100 : 0,
        completionRatio: totalTokens > 0 ? (completionTokens / totalTokens) * 100 : 0,
        avgLatency: row.avg_latency || 0,
        avgTTFB: row.avg_ttfb || 0,
        errorCount: row.error_count,
        cachedRequests: row.cached_requests,
      };
    });
  }

  /**
   * Get API Key statistics
   */
  async getKeyStats(): Promise<KeyStats[]> {
    const results = queryAll<{
      key_id: string;
      key_name: string;
      request_count: number;
      total_tokens: number;
      avg_latency: number;
      avg_ttfb: number;
      error_count: number;
      error_rate: number;
    }>(`
      SELECT
        ak.id as key_id,
        ak.name as key_name,
        COUNT(rl.id) as request_count,
        COALESCE(SUM(rl.total_tokens), 0) as total_tokens,
        COALESCE(AVG(rl.latency_ms), 0) as avg_latency,
        COALESCE(AVG(rl.time_to_first_byte_ms), 0) as avg_ttfb,
        SUM(CASE WHEN rl.status_code >= 400 THEN 1 ELSE 0 END) as error_count,
        CASE
          WHEN COUNT(rl.id) > 0 THEN
            CAST(SUM(CASE WHEN rl.status_code >= 400 THEN 1 ELSE 0 END) AS REAL) / COUNT(rl.id) * 100
          ELSE 0
        END as error_rate
      FROM api_keys ak
      LEFT JOIN request_logs rl ON ak.id = rl.api_key_id
      GROUP BY ak.id, ak.name
      HAVING request_count > 0
      ORDER BY request_count DESC
    `);

    return results.map(row => ({
      keyId: row.key_id,
      keyName: row.key_name,
      requestCount: row.request_count,
      totalTokens: row.total_tokens,
      avgLatency: row.avg_latency,
      avgTTFB: row.avg_ttfb,
      errorCount: row.error_count,
      errorRate: row.error_rate,
    }));
  }

  /**
   * Get asset statistics
   */
  async getAssetStats(): Promise<AssetStats[]> {
    const results = queryAll<{
      asset_id: string;
      asset_name: string;
      vendor_name: string;
      request_count: number;
      total_tokens: number;
      avg_latency: number;
      avg_ttfb: number;
      error_count: number;
    }>(`
      SELECT
        a.id as asset_id,
        a.name as asset_name,
        vt.display_name as vendor_name,
        COUNT(rl.id) as request_count,
        COALESCE(SUM(rl.total_tokens), 0) as total_tokens,
        COALESCE(AVG(rl.latency_ms), 0) as avg_latency,
        COALESCE(AVG(rl.time_to_first_byte_ms), 0) as avg_ttfb,
        SUM(CASE WHEN rl.status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM assets a
      LEFT JOIN routes r ON a.id = r.asset_id
      LEFT JOIN request_logs rl ON r.id = rl.route_id
      LEFT JOIN vendor_templates vt ON a.vendor_id = vt.id
      GROUP BY a.id, a.name, vt.display_name
      HAVING request_count > 0
      ORDER BY request_count DESC
    `);

    return results.map(row => ({
      assetId: row.asset_id,
      assetName: row.asset_name,
      vendorName: row.vendor_name,
      requestCount: row.request_count,
      totalTokens: row.total_tokens,
      avgLatency: row.avg_latency,
      avgTTFB: row.avg_ttfb,
      errorCount: row.error_count,
    }));
  }

  /**
   * Get TTFB statistics
   */
  async getTTFBStats(): Promise<TTFBStats> {
    const results = queryAll<{
      range: string;
      count: number;
    }>(`
      SELECT
        CASE
          WHEN time_to_first_byte_ms < 100 THEN '0-100ms'
          WHEN time_to_first_byte_ms < 500 THEN '100-500ms'
          WHEN time_to_first_byte_ms < 1000 THEN '500ms-1s'
          WHEN time_to_first_byte_ms < 3000 THEN '1-3s'
          ELSE '>3s'
        END as range,
        COUNT(*) as count
      FROM request_logs
      WHERE time_to_first_byte_ms IS NOT NULL
      GROUP BY range
    `);

    const ranges = {
      '0-100ms': 0,
      '100-500ms': 0,
      '500ms-1s': 0,
      '1-3s': 0,
      '>3s': 0,
    };

    results.forEach(row => {
      ranges[row.range as keyof typeof ranges] = row.count;
    });

    const stats = queryFirst<{
      avg_ttfb: number;
      min_ttfb: number;
      max_ttfb: number;
      count: number;
    }>(`
      SELECT
        AVG(time_to_first_byte_ms) as avg_ttfb,
        MIN(time_to_first_byte_ms) as min_ttfb,
        MAX(time_to_first_byte_ms) as max_ttfb,
        COUNT(*) as count
      FROM request_logs
      WHERE time_to_first_byte_ms IS NOT NULL
    `);

    return {
      ranges,
      avgTTFB: stats?.avg_ttfb || 0,
      minTTFB: stats?.min_ttfb || 0,
      maxTTFB: stats?.max_ttfb || 0,
      count: stats?.count || 0,
    };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    const result = queryFirst<{
      total_requests: number;
      cached_requests: number;
      total_cached_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
    }>(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN cached_tokens > 0 THEN 1 ELSE 0 END) as cached_requests,
        COALESCE(SUM(cached_tokens), 0) as total_cached_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens
      FROM request_logs
    `);

    if (!result) {
      return {
        hitRate: 0,
        totalCachedTokens: 0,
        avgCachedTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
    }

    const hitRate = result.total_requests > 0
      ? (result.cached_requests / result.total_requests) * 100
      : 0;

    const avgCachedTokens = result.cached_requests > 0
      ? result.total_cached_tokens / result.cached_requests
      : 0;

    return {
      hitRate,
      totalCachedTokens: result.total_cached_tokens,
      avgCachedTokens,
      cacheReadTokens: result.cache_read_tokens,
      cacheWriteTokens: result.cache_write_tokens,
    };
  }

  /**
   * Get error statistics
   */
  async getErrorStats(): Promise<ErrorStats> {
    const totalErrors = queryFirst<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM request_logs
      WHERE status_code >= 400
    `);

    // Group by status code
    const byStatusCodeResults = queryAll<{ status_code: number; count: number }>(`
      SELECT
        status_code,
        COUNT(*) as count
      FROM request_logs
      WHERE status_code >= 400
      GROUP BY status_code
      ORDER BY count DESC
    `);

    const byStatusCode: { [code: number]: number } = {};
    byStatusCodeResults.forEach(row => {
      byStatusCode[row.status_code] = row.count;
    });

    // Group by model
    const byModelResults = queryAll<{ model: string; count: number }>(`
      SELECT
        final_model as model,
        COUNT(*) as count
      FROM request_logs
      WHERE status_code >= 400
      GROUP BY final_model
      ORDER BY count DESC
    `);

    const byModel: { [model: string]: number } = {};
    byModelResults.forEach(row => {
      byModel[row.model] = row.count;
    });

    // Common errors
    const commonErrorsResults = queryAll<{ error_message: string; count: number }>(`
      SELECT
        error_message,
        COUNT(*) as count
      FROM request_logs
      WHERE error_message IS NOT NULL AND error_message != ''
        AND status_code >= 400
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 10
    `);

    const commonErrors = commonErrorsResults.map(row => ({
      message: row.error_message,
      count: row.count,
    }));

    return {
      totalErrors: totalErrors?.count || 0,
      byStatusCode,
      byModel,
      commonErrors,
    };
  }

  /**
   * Get time series statistics
   */
  async getTimeSeriesStats(days: number = 7): Promise<TimeSeriesStats[]> {
    const results = queryAll<{
      date: string;
      request_count: number;
      total_tokens: number;
      avg_latency: number;
      avg_ttfb: number;
      error_count: number;
    }>(`
      SELECT
        DATE(timestamp, 'unixepoch') as date,
        COUNT(*) as request_count,
        SUM(total_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency,
        AVG(time_to_first_byte_ms) as avg_ttfb,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM request_logs
      WHERE timestamp >= strftime('%s', 'now', '-${days} days')
      GROUP BY DATE(timestamp, 'unixepoch')
      ORDER BY date ASC
    `);

    return results.map(row => ({
      date: row.date,
      requestCount: row.request_count,
      totalTokens: row.total_tokens || 0,
      avgLatency: row.avg_latency || 0,
      avgTTFB: row.avg_ttfb || 0,
      errorCount: row.error_count,
    }));
  }
}

export const analyticsService = new AnalyticsService();
