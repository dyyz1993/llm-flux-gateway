import { Hono } from 'hono';
import { systemConfigService } from '../services/system-config.service';

const router = new Hono();

/**
 * GET /api/system/config
 *
 * Get all system configuration
 */
router.get('/', async (c) => {
  try {
    const configs = await systemConfigService.getAllConfigs();
    return c.json({
      success: true,
      data: configs,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to get system config',
    }, 500);
  }
});

/**
 * GET /api/system/config/category/:category
 *
 * Get configs by category
 */
router.get('/category/:category', async (c) => {
  const category = c.req.param('category');

  try {
    const configs = await systemConfigService.getConfigsByCategory(category);
    return c.json({
      success: true,
      data: configs,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to get system config',
    }, 500);
  }
});

/**
 * GET /api/system/config/:key
 *
 * Get a single config value
 */
router.get('/:key', async (c) => {
  const key = c.req.param('key');

  try {
    const config = await systemConfigService.getConfig(key);
    if (!config) {
      return c.json({
        success: false,
        error: 'Config not found',
      }, 404);
    }
    return c.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to get config',
    }, 500);
  }
});

/**
 * PUT /api/system/config/:key
 *
 * Update a config value
 */
router.put('/:key', async (c) => {
  const key = c.req.param('key');

  try {
    const body = await c.req.json();
    const { value, dataType } = body;

    if (value === undefined) {
      return c.json({
        success: false,
        error: 'Value is required',
      }, 400);
    }

    await systemConfigService.setConfig(key, value, dataType || 'string');

    // Get updated config
    const config = await systemConfigService.getConfig(key);

    return c.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to update config',
    }, 500);
  }
});

/**
 * POST /api/system/config/batch
 *
 * Update multiple configs at once
 */
router.post('/batch', async (c) => {
  try {
    const body = await c.req.json();
    const { configs } = body;

    if (!configs || typeof configs !== 'object') {
      return c.json({
        success: false,
        error: 'configs object is required',
      }, 400);
    }

    await systemConfigService.updateConfigs(configs);

    // Get all updated configs
    const allConfigs = await systemConfigService.getAllConfigs();

    return c.json({
      success: true,
      data: allConfigs,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to update configs',
    }, 500);
  }
});

/**
 * POST /api/system/config/initialize
 *
 * Initialize default configs (run on first startup)
 */
router.post('/initialize', async (c) => {
  try {
    await systemConfigService.initializeDefaults();
    const configs = await systemConfigService.getAllConfigs();

    return c.json({
      success: true,
      data: configs,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Failed to initialize configs',
    }, 500);
  }
});

export default router;
