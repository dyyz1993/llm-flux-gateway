import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { assetsService } from '../services/assets.service';
import { queryAll } from '../../shared/database';
import { apiResponse, apiError } from '@server/shared';

// ============================================
// Validation Schemas
// ============================================

const createAssetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  vendorId: z.string().min(1, 'Vendor is required'),
  apiKey: z.string().min(1, 'API key is required'),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  modelIds: z.array(z.string()).optional(),
});

const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  modelIds: z.array(z.string()).optional(),
});

// ============================================
// Routes Definition
// ============================================

/**
 * Assets Routes
 *
 * Asset CRUD operations with inline handlers for Hono RPC type inference
 */
const router = new Hono()
  // GET /api/assets - Get all assets
  .get('/', async (c) => {
    try {
      const results = await assetsService.getAll();
      return c.json(apiResponse(results));
    } catch (error) {
      console.error('[Assets] Error fetching assets:', error);
      return c.json(apiError('Failed to fetch assets'), 500);
    }
  })

  // GET /api/assets/:id - Get a single asset
  .get('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await assetsService.getById(id);

      if (!result) {
        return c.json(apiError('Asset not found'), 404);
      }

      // Include linked models
      const models = await assetsService.getAssetModels(id);
      return c.json(apiResponse({ ...result, models }));
    } catch (error) {
      console.error('[Assets] Error fetching asset:', error);
      return c.json(apiError('Failed to fetch asset'), 500);
    }
  })

  // POST /api/assets - Create a new asset
  .post(
    '/',
    zValidator('json', createAssetSchema),
    async (c) => {
      const data = c.req.valid('json');

      try {
        const result = await assetsService.create(data, data.modelIds);
        return c.json(apiResponse(result), 201);
      } catch (error) {
        console.error('[Assets] Error creating asset:', error);
        return c.json(apiError('Failed to create asset'), 500);
      }
    }
  )

  // PUT /api/assets/:id - Update an asset
  .put(
    '/:id',
    zValidator('json', updateAssetSchema),
    async (c) => {
      const id = c.req.param('id');
      const data = c.req.valid('json');

      try {
        const result = await assetsService.update(id, data, data.modelIds);

        if (!result) {
          return c.json(apiError('Asset not found'), 404);
        }

        return c.json(apiResponse(result));
      } catch (error) {
        console.error('[Assets] Error updating asset:', error);
        return c.json(apiError('Failed to update asset'), 500);
      }
    }
  )

  // PATCH /api/assets/:id/status - Update asset status
  .patch(
    '/:id/status',
    zValidator('json', z.object({
      status: z.enum(['active', 'suspended']),
    })),
    async (c) => {
      const id = c.req.param('id');
      const { status } = c.req.valid('json');

      try {
        const result = await assetsService.updateStatus(id, status);

        if (!result) {
          return c.json(apiError('Asset not found'), 404);
        }

        return c.json(apiResponse(result));
      } catch (error) {
        console.error('[Assets] Error updating status:', error);
        return c.json(apiError('Failed to update asset status'), 500);
      }
    }
  )

  // POST /api/assets/:id/duplicate - Duplicate an asset
  .post('/:id/duplicate', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await assetsService.duplicate(id);

      if (!result) {
        return c.json(apiError('Asset not found'), 404);
      }

      return c.json(apiResponse(result), 201);
    } catch (error) {
      console.error('[Assets] Error duplicating asset:', error);
      return c.json(apiError('Failed to duplicate asset'), 500);
    }
  })

  // DELETE /api/assets/:id - Delete an asset
  .delete('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const success = await assetsService.delete(id);

      if (!success) {
        return c.json(apiError('Asset not found'), 404);
      }

      return c.json(apiResponse({ deleted: true }));
    } catch (error) {
      console.error('[Assets] Error deleting asset:', error);
      return c.json(apiError('Failed to delete asset'), 500);
    }
  })

  // POST /api/assets/:id/validate - Validate asset API key
  .post('/:id/validate', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await assetsService.validate(id);
      return c.json(apiResponse(result));
    } catch (error: any) {
      console.error('[Assets] Error validating asset:', error);

      // Return meaningful error from API call
      if (error.message) {
        return c.json(apiError(error.message), 400);
      }
      return c.json(apiError('Failed to validate asset'), 500);
    }
  })

  // POST /api/assets/:id/validate-models - Validate each model with a test request
  .post('/:id/validate-models', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await assetsService.validateModels(id);
      return c.json(apiResponse(result));
    } catch (error: any) {
      console.error('[Assets] Error validating models:', error);

      if (error.message) {
        return c.json(apiError(error.message), 400);
      }
      return c.json(apiError('Failed to validate models'), 500);
    }
  });

// ============================================
// Vendors Routes
// ============================================

const vendorsRouter = new Hono()
  // GET /api/vendors - Get all vendors
  .get('/', async (c) => {
    try {
      const rows = queryAll<any>(`
        SELECT id, name, display_name, icon_url, status, created_at
        FROM vendor_templates
        WHERE status = 'active'
        ORDER BY display_name
      `);

      const vendors = rows.map((row) => ({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        iconUrl: row.icon_url,
        status: row.status,
        createdAt: new Date(row.created_at),
      }));

      return c.json(apiResponse(vendors));
    } catch (error) {
      console.error('[Vendors] Error fetching vendors:', error);
      return c.json(apiError('Failed to fetch vendors'), 500);
    }
  })

  // GET /api/vendors/:id/models - Get models for a vendor
  .get('/:id/models', async (c) => {
    const vendorId = c.req.param('id');

    try {
      const rows = queryAll<any>(`
        SELECT id, model_id, display_name, description, status
        FROM vendor_models
        WHERE vendor_id = ? AND status = 'active'
        ORDER BY display_name
      `, [vendorId]);

      const models = rows.map((row) => ({
        id: row.id,
        modelId: row.model_id,
        displayName: row.display_name,
        description: row.description,
        status: row.status,
      }));

      return c.json(apiResponse(models));
    } catch (error) {
      console.error('[Vendors] Error fetching models:', error);
      return c.json(apiError('Failed to fetch models'), 500);
    }
  });

export default router;
export { vendorsRouter };
