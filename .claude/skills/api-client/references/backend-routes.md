# Backend Route Patterns

## Overview

This reference describes how backend routes are structured and how to connect them to API client methods.

## Backend Route Location

```
src/server/module-{name}/routes/
├── index.ts          # Route registration
└── {feature}.routes.ts  # Feature-specific routes
```

## Route Structure

### Hono Route Pattern

```typescript
// routes/fish.routes.ts
import { Hono } from 'hono';
import type { Routes } from '@/server/module-rpc/routes';
import { fishService } from '../services/fish.service';

const app = new Hono();

// GET /api/fish/:id
app.get('/api/fish/:id', async (c) => {
  const id = c.req.param('id');
  const fish = await fishService.getById(id);
  return c.json(fish);
});

// POST /api/fish
app.post('/api/fish', async (c) => {
  const data = await c.req.json();
  const fish = await fishService.create(data);
  return c.json(fish);
});

export default app;
```

## Route Registration

### Module Index

```typescript
// routes/index.ts
import { Hono } from 'hono';
import fishRoutes from './fish.routes';
import userRoutes from './user.routes';

const app = new Hono();

app.route('/', fishRoutes);
app.route('/', userRoutes);

export default app;
```

### Server Integration

```typescript
// src/server/index.ts
import { Hono } from 'hono';
import moduleRoutes from './module-fish/routes';

const app = new Hono();

app.route('/', moduleRoutes);

export default app;
```

## Common Route Patterns

### GET by ID

```typescript
app.get('/api/resource/:id', async (c) => {
  const id = c.req.param('id');
  const resource = await service.getById(id);
  return c.json(resource);
});
```

### GET List

```typescript
app.get('/api/resources', async (c) => {
  const { limit, offset } = c.req.query();
  const resources = await service.list({ limit, offset });
  return c.json(resources);
});
```

### POST Create

```typescript
app.post('/api/resources', async (c) => {
  const data = await c.req.json();
  const resource = await service.create(data);
  return c.json(resource);
});
```

### PUT Update

```typescript
app.put('/api/resources/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const resource = await service.update(id, data);
  return c.json(resource);
});
```

### DELETE

```typescript
app.delete('/api/resources/:id', async (c) => {
  const id = c.req.param('id');
  await service.delete(id);
  return c.json({ success: true });
});
```

## Response Format

### Success Response

```typescript
return c.json({
  success: true,
  data: {
    /* response data */
  },
});
```

### Error Response

```typescript
return c.json(
  {
    success: false,
    error: 'Error message',
  },
  400
); // HTTP status code
```

## TypeScript Types

### Route Types

```typescript
// types.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FishEntity {
  id: string;
  name: string;
  // ... other fields
}
```

## Connecting to API Client

### API Client Method

```typescript
// src/client/services/apiClient.ts
export const getFish = async (id: string): Promise<ApiResponse<FishEntity>> => {
  const response = await fetch(`/api/fish/${id}`);
  return response.json();
};
```

## See Also

- [mock-patterns.md](mock-patterns.md) - Mock implementation patterns
- [../../rules/server-service-rules.md](../../rules/server-service-rules.md) - Service layer rules
