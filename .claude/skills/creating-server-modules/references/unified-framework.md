# Unified Framework Reference

The project uses a Routes → Service architecture with Hono as the web framework.

## Core Concepts

### Service Classes

Services are plain TypeScript classes without decorators:

```typescript
import { getDb } from '@server/shared/database';
import { schema } from '@server/shared/schema';

export class MyService {
  async getData() {
    const db = getDb();
    // Business logic and database operations
  }
}
```

### Database Access

```typescript
import { getDb } from '@server/shared/database';
import { schema } from '@server/shared/schema';
import { eq, and, or } from 'drizzle-orm';

const db = getDb();

// Query pattern
const results = await db
  .select()
  .from(schema.usersTable)
  .where(eq(schema.usersTable.id, userId))
  .orderBy(schema.usersTable.createdAt)
  .limit(10);

// Insert pattern
const [inserted] = await db.insert(schema.usersTable).values({ name: 'John' }).returning();

// Update pattern
const [updated] = await db
  .update(schema.usersTable)
  .set({ name: 'Jane' })
  .where(eq(schema.usersTable.id, userId))
  .returning();

// Delete pattern
const result = await db.delete(schema.usersTable).where(eq(schema.usersTable.id, userId));
```

### Schema Definition

Define in `src/server/shared/schema.ts`:

```typescript
import { mysqlTable, varchar, int, timestamp } from 'drizzle-orm/mysql-core';

export const myResourceTable = mysqlTable('my_resources', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  value: int('value').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

## Routes → Service Pattern

The project uses Hono with zValidator for route definitions:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { apiResponse, apiError } from '@server/shared/utils';

const router = new Hono();

// GET endpoint with schema validation
router.get('/resource/:id', zValidator('param', z.object({ id: z.string() })), async (c) => {
  try {
    const { id } = c.req.valid('param');
    const result = await service.getResource(id);
    return c.json(apiResponse(result));
  } catch (error) {
    return c.json(apiError('Failed to fetch resource', error), 500);
  }
});

// POST endpoint with request body validation
router.post(
  '/resource',
  zValidator(
    'json',
    z.object({
      name: z.string(),
      value: z.number(),
    })
  ),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const result = await service.createResource(input.name, input.value);
      return c.json(apiResponse(result));
    } catch (error) {
      return c.json(apiError('Failed to create resource', error), 500);
    }
  }
);

export default router;
```

## Error Handling

```typescript
import { Hono } from 'hono';
import { apiResponse, apiError } from '@server/shared/utils';

const router = new Hono();

router.get('/resource/:id', async (c) => {
  try {
    const result = await service.getResource(c.req.param('id'));
    return c.json(apiResponse(result));
  } catch (error) {
    // Use unified error response format
    return c.json(
      apiError(
        'Failed to fetch resource',
        error instanceof Error ? error.message : 'Unknown error'
      ),
      500
    );
  }
});
```

## Authentication Context

```typescript
import { Hono } from 'hono';
import { apiResponse, apiError } from '@server/shared/utils';

const router = new Hono();

router.get('/protected-resource', async (c) => {
  try {
    // Get user from context (set by auth middleware)
    const userId = c.get('userId');

    if (!userId) {
      return c.json(apiError('Unauthorized', 'No user ID found in context'), 401);
    }

    const result = await service.getProtectedResource(userId);
    return c.json(apiResponse(result));
  } catch (error) {
    return c.json(apiError('Failed to fetch resource', error), 500);
  }
});
```

## Migration

Create migration files in `drizzle/`:

```bash
# Generate migration
npx drizzle-kit generate

# Run migration
npm run db:push

# Check status
npm run db:status
```
