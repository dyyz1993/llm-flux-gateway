---
name: api-client
description: >
  Add new API client methods for frontend-backend communication using traditional fetch pattern.
  Use when: adding new backend endpoints, API calls, or working with src/client/services/apiClient.ts.
  Supports: GET/POST/PUT/DELETE methods, mock implementations, TypeScript types, ApiResponse<T> wrapper.
  Triggers: "API", "endpoint", "fetch", "apiClient", "backend route", "mockStore".
allowed-tools: [Read, Write, Edit, Grep]
---

# API Client Skill

Add new API endpoints for client-server communication.

## Choose Your Approach

### Option A: Hono RPC Client (Recommended)

**For**: New modules, type safety, automatic inference

```typescript
// src/shared/rpc-server.ts (already exists)
import { hc } from 'hono/client';
import type { AppType } from '@server/index';
export const client = hc<AppType>('/');

// src/client/services/rpcClient.ts
import { client } from '@shared/rpc-server';

export const productApi = {
  async getAll() {
    const res = await client.products.$get();
    return await res.json();
  },
};
```

**Benefits**:

- Full TypeScript type inference from server
- Auto-complete for all parameters
- Compile-time type checking

### Option B: Traditional Fetch (Legacy)

**For**: Existing codebase, simple endpoints

```typescript
// src/client/services/apiClient.ts
export const fetchProducts = async (): Promise<ApiResponse<Product[]>> => {
  return apiRequest<Product[]>('/products');
};
```

**Note**: This skill focuses on Option B (fetch pattern). For new modules, consider Hono RPC.

## Quick Start

```typescript
// 1. Add method to src/client/services/apiClient.ts
export const myNewMethod = async (param: string): Promise<ApiResponse<MyType>> => {
  // Implementation
};

// 2. Add mock to src/client/services/mockStore.ts
export const myNewMethodMock = () => {
  /* Mock logic */
};
```

## Templates

See [templates/](templates/) directory:

| Template                    | Description            |
| --------------------------- | ---------------------- |
| `get-method.ts.template`    | GET request pattern    |
| `post-method.ts.template`   | POST request pattern   |
| `put-method.ts.template`    | PUT request pattern    |
| `delete-method.ts.template` | DELETE request pattern |

## Response Type

All methods return `ApiResponse<T>`:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## Workflow

1. Add method to `src/client/services/apiClient.ts`
2. Add mock to `src/client/services/mockStore.ts`
3. Create backend route/controller
4. Add to Zustand store if needed
5. Test with mock and real server

## Additional Resources

- [references/mock-patterns.md](references/mock-patterns.md) - Mock strategies
- [references/backend-routes.md](references/backend-routes.md) - Route patterns
