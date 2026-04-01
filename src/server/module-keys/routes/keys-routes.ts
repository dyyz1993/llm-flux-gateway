import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { keysService } from '../services/keys.service';
import { apiResponse, apiError } from '@server/shared';

// ============================================
// Validation Schemas
// ============================================

const createKeySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  keyToken: z.string().optional(),
  routeIds: z.array(z.string()).optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'revoked']).optional(),
  routeIds: z.array(z.string()).optional(),
  routeWeights: z.array(z.object({
    routeId: z.string(),
    weight: z.number().min(0).max(1000),
  })).optional(),
});

// ============================================
// Routes Definition
// ============================================

/**
 * Keys Routes
 *
 * API Key CRUD operations with inline handlers for Hono RPC type inference
 */
const router = new Hono()
  // GET /api/keys - Get all API keys
  .get('/', async (c) => {
    try {
      const results = await keysService.getAll();
      return c.json(apiResponse(results));
    } catch (error) {
      return c.json(apiError('Failed to fetch API keys'), 500);
    }
  })

  // GET /api/keys/:id - Get a single API key
  .get('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await keysService.getById(id);

      if (!result) {
        return c.json(apiError('API key not found'), 404);
      }

      return c.json(apiResponse(result));
    } catch (error) {
      return c.json(apiError('Failed to fetch API key'), 500);
    }
  })

  // POST /api/keys - Create a new API key
  .post(
    '/',
    zValidator('json', createKeySchema),
    async (c) => {
      const data = c.req.valid('json');

      try {
        const result = await keysService.create(data);
        return c.json(apiResponse(result), 201);
      } catch (error) {
        return c.json(apiError('Failed to create API key'), 500);
      }
    }
  )

  // PUT /api/keys/:id - Update an API key
  .put(
    '/:id',
    zValidator('json', updateKeySchema),
    async (c) => {
      const id = c.req.param('id');
      const data = c.req.valid('json');

      try {
        const result = await keysService.update(id, data);

        if (!result) {
          return c.json(apiError('API key not found'), 404);
        }

        return c.json(apiResponse(result));
      } catch (error) {
        return c.json(apiError('Failed to update API key'), 500);
      }
    }
  )

  // DELETE /api/keys/:id - Delete an API key
  .delete('/:id', async (c) => {
    const id = c.req.param('id');

    try {
      const success = await keysService.delete(id);

      if (!success) {
        return c.json(apiError('API key not found'), 404);
      }

      return c.json(apiResponse({ deleted: true }));
    } catch (error) {
      return c.json(apiError('Failed to delete API key'), 500);
    }
  });

export default router;
