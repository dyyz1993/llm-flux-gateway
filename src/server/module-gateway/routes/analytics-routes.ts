/**
 * Analytics Routes
 *
 * Provides endpoints for statistical analysis of request logs
 */

import { Hono } from 'hono';
import { analyticsService } from '../services/analytics.service';

const router = new Hono();

/**
 * GET /api/analytics/overview
 *
 * Get overview statistics
 */
router.get('/overview', async (c) => {
  try {
    const stats = await analyticsService.getOverviewStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get overview stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get overview statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/models
 *
 * Get model usage distribution
 */
router.get('/models', async (c) => {
  try {
    const stats = await analyticsService.getModelStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get model stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get model statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/keys
 *
 * Get API Key statistics
 */
router.get('/keys', async (c) => {
  try {
    const stats = await analyticsService.getKeyStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get key stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get key statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/assets
 *
 * Get asset/upstream statistics
 */
router.get('/assets', async (c) => {
  try {
    const stats = await analyticsService.getAssetStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get asset stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get asset statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/ttfb
 *
 * Get TTFB (Time to First Byte) distribution
 */
router.get('/ttfb', async (c) => {
  try {
    const stats = await analyticsService.getTTFBStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get TTFB stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get TTFB statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/cache
 *
 * Get cache statistics
 */
router.get('/cache', async (c) => {
  try {
    const stats = await analyticsService.getCacheStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get cache stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get cache statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/errors
 *
 * Get error analysis
 */
router.get('/errors', async (c) => {
  try {
    const stats = await analyticsService.getErrorStats();
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get error stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get error statistics',
    }, 500);
  }
});

/**
 * GET /api/analytics/timeseries
 *
 * Get time series data
 * Query params:
 * - days: number of days to look back (default: 7)
 */
router.get('/timeseries', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '7');
    const stats = await analyticsService.getTimeSeriesStats(days);
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Analytics] Failed to get time series stats:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get time series statistics',
    }, 500);
  }
});

export default router;
