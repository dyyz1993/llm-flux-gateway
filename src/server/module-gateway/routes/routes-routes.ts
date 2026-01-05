import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { routesService } from '../services/routes.service';
import { apiResponse, apiError } from '@server/shared';

// ============================================
// Validation Schemas
// ============================================

const overrideRuleSchema = z.object({
  field: z.string(),
  matchValues: z.array(z.string()),
  rewriteValue: z.string(),
});

const createRouteSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  assetId: z.string().min(1, 'Asset ID is required'),
  overrides: z.array(overrideRuleSchema).optional(),
  configType: z.enum(['yaml', 'json']).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
} as any);

const updateRouteSchema = z.object({
  name: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  overrides: z.array(overrideRuleSchema).optional(),
  configType: z.enum(['yaml', 'json']).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
} as any);

// ============================================
// Routes Definition
// ============================================

/**
 * Routes Routes
 *
 * Route configuration CRUD operations with inline handlers for Hono RPC type inference
 */
const router = new Hono()
  // GET /api/routes - Get all routes
  .get('/', async (c) => {
    try {
      const results = await routesService.getAll();
      return c.json(apiResponse(results));
    } catch (error) {
      console.error('[Routes] Error fetching routes:', error);
      return c.json(apiError('Failed to fetch routes'), 500);
    }
  })

  // GET /api/routes/active - Get active routes only
  .get('/active', async (c) => {
    try {
      const results = await routesService.getActive();
      return c.json(apiResponse(results));
    } catch (error) {
      console.error('[Routes] Error fetching active routes:', error);
      return c.json(apiError('Failed to fetch active routes'), 500);
    }
  })

  // GET /api/routes/:id - Get a single route
  .get('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await routesService.getById(id);

      if (!result) {
        return c.json(apiError('Route not found'), 404);
      }

      return c.json(apiResponse(result));
    } catch (error) {
      console.error('[Routes] Error fetching route:', error);
      return c.json(apiError('Failed to fetch route'), 500);
    }
  })

  // POST /api/routes - Create a new route
  .post(
    '/',
    zValidator('json', createRouteSchema),
    async (c) => {
      const data = c.req.valid('json');

      try {
        const result = await routesService.create(data as any);
        return c.json(apiResponse(result), 201);
      } catch (error) {
        console.error('[Routes] Error creating route:', error);
        return c.json(apiError('Failed to create route'), 500);
      }
    }
  )

  // PUT /api/routes/:id - Update a route
  .put(
    '/:id',
    zValidator('json', updateRouteSchema),
    async (c) => {
      const id = c.req.param('id');
      const data = c.req.valid('json');

      try {
        const result = await routesService.update(id, data);

        if (!result) {
          return c.json(apiError('Route not found'), 404);
        }

        return c.json(apiResponse(result));
      } catch (error) {
        console.error('[Routes] Error updating route:', error);
        return c.json(apiError('Failed to update route'), 500);
      }
    }
  )

  // PATCH /api/routes/:id/toggle - Toggle route active status
  .patch('/:id/toggle', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await routesService.toggleActive(id);

      if (!result) {
        return c.json(apiError('Route not found'), 404);
      }

      return c.json(apiResponse(result));
    } catch (error) {
      console.error('[Routes] Error toggling route:', error);
      return c.json(apiError('Failed to toggle route'), 500);
    }
  })

  // DELETE /api/routes/:id - Delete a route
  .delete('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const success = await routesService.delete(id);

      if (!success) {
        return c.json(apiError('Route not found'), 404);
      }

      return c.json(apiResponse({ deleted: true }));
    } catch (error) {
      console.error('[Routes] Error deleting route:', error);
      return c.json(apiError('Failed to delete route'), 500);
    }
  });

export default router;
