import { Hono } from 'hono';
import { vendorsService } from '../services/vendors.service';
import { apiResponse, apiError } from '@server/shared';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Vendors Routes
 *
 * Vendor configuration management endpoints
 */
const router = new Hono()
  // GET /api/vendors - Get all vendors
  .get('/', async (c) => {
    try {
      const results = await vendorsService.getAll();
      return c.json(apiResponse(results));
    } catch (error) {
      console.error('[Vendors] Error fetching vendors:', error);
      return c.json(apiError('Failed to fetch vendors'), 500);
    }
  })

  // GET /api/vendors/yaml - Get current YAML file content (must be before /:id)
  .get('/yaml', async (c) => {
    try {
      const configPath = resolve(process.cwd(), 'config/vendors.yaml');
      const content = await readFile(configPath, 'utf-8');
      return c.json(apiResponse({ content }));
    } catch (error) {
      console.error('[Vendors] Error reading YAML:', error);
      return c.json(apiError(`Failed to read YAML file: ${error}`), 500);
    }
  })

  // PUT /api/vendors/yaml - Save YAML file content (must be before /:id)
  .put('/yaml', async (c) => {
    try {
      const { content } = await c.req.json();

      if (typeof content !== 'string') {
        return c.json(apiError('Invalid content: must be a string'), 400);
      }

      const configPath = resolve(process.cwd(), 'config/vendors.yaml');
      await writeFile(configPath, content, 'utf-8');

      return c.json(apiResponse({
        message: 'YAML file saved successfully',
        path: configPath,
      }));
    } catch (error) {
      console.error('[Vendors] Error saving YAML:', error);
      return c.json(apiError(`Failed to save YAML file: ${error}`), 500);
    }
  })

  // POST /api/vendors/sync - Sync vendors from YAML config
  .post('/sync', async (c) => {
    try {
      const result = await vendorsService.syncFromYaml();
      return c.json(apiResponse({
        message: 'Vendor configuration synced successfully',
        ...result,
      }));
    } catch (error) {
      console.error('[Vendors] Error syncing vendors:', error);
      return c.json(apiError(`Failed to sync vendors: ${error}`), 500);
    }
  })

  // GET /api/vendors/:id - Get a single vendor with models
  .get('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await vendorsService.getById(id);

      if (!result) {
        return c.json(apiError('Vendor not found'), 404);
      }

      return c.json(apiResponse(result));
    } catch (error) {
      console.error('[Vendors] Error fetching vendor:', error);
      return c.json(apiError('Failed to fetch vendor'), 500);
    }
  })

  // GET /api/vendors/:id/models - Get models for a vendor
  .get('/:id/models', async (c) => {
    const id = c.req.param('id');

    try {
      const results = await vendorsService.getVendorModels(id);
      return c.json(apiResponse(results));
    } catch (error) {
      console.error('[Vendors] Error fetching vendor models:', error);
      return c.json(apiError('Failed to fetch vendor models'), 500);
    }
  });

export default router;
