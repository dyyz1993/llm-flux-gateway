# Project Architecture

## Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Layer                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         React Components (UI)                    │   │
│  │  - ProductList, Dashboard, DataCanvas            │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ useAppStore (selectors)                 │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │         State Management (Zustand)               │   │
│  │  - Global state, actions, async operations       │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ ApiClient methods                     │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │         Services Layer                            │   │
│  │  - apiClient, aiService, audioService            │   │
│  └──────────────┬───────────────────────────────────┘   │
└─────────────────┼───────────────────────────────────────┘
                  │ HTTP (via @hono/vite-dev-server)
┌─────────────────▼───────────────────────────────────────┐
│                  Server Layer (Hono)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Routes (HTTP Handlers with Validation)    │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │ Direct calls                           │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │         Services (Business Logic)                │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                         │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │         Database (Drizzle ORM)                   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Single Port Development

Using `@hono/vite-dev-server`, both frontend and backend run on **one port**:

```typescript
// vite.config.ts
import devServer from '@hono/vite-dev-server';

plugins: [
  react(),
  devServer({
    entry: 'src/server/index.ts',  // Backend entry
    exclude: [
      /^\/$/,                        // Frontend: index.html
      /^\/(@[a-zA-Z0-9_-]+|src|node_modules)/,  // Vite assets
      /.*\.(ts|tsx|js|jsx|css|html)$/,  // Static files
    ],
  }),
],
```

**Request Flow**:

- `/` → Vite serves `index.html` (Frontend)
- `/api/*` → Hono server handles (Backend)
- `/src/*`, `*.ts`, `*.css` → Vite dev server (HMR)

## Data Flow

### 1. User Action Flow

```
User clicks button
    ↓
Component event handler
    ↓
Zustand action selector
    ↓
ApiClient method (fetch/post/put/delete)
    ↓
Server Route (same port)
    ↓
Server Service
    ↓
Database Query
    ↓
Response back through layers
    ↓
Zustand state update
    ↓
Component re-render
```

### 2. AI Service Flow (Example)

```
User enters prompt
    ↓
aiService.enhancePrompt()
    ↓
aiService.generateContent()
    ↓
aiService.analyzeResult()
    ↓
Create Entity with data
    ↓
ApiClient.createEntity()
    ↓
Save to Database
    ↓
Update Zustand state
    ↓
Render in Component
```

## Routes Direct Service Call Pattern

### Architecture Overview

```
Client Layer
    ↓ API Calls
Server Routes (HTTP handlers with validation)
    ↓ Direct calls
Server Services (Business logic)
    ↓
Database
```

### Pattern Implementation

**Routes (HTTP Handlers)**: Handle request/response, validation, authentication

```typescript
// src/server/module-fish/routes/fish-routes.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { fishService } from '../services/fish-service';
import { createFishSchema } from '@shared/schemas';

const router = new Hono();

router.post('/', zValidator('json', createFishSchema), async (c) => {
  const userId = c.get('userId'); // From middleware
  const data = c.req.valid('json'); // Validated data

  const fish = await fishService.createFish(userId, data);
  return c.json({ success: true, data: fish });
});
```

**Services (Business Logic)**: Pure functions, no HTTP concerns

```typescript
// src/server/module-fish/services/fish-service.ts
export const fishService = {
  async createFish(userId: string, data: CreateFishInput) {
    // Business logic only
    const fish = await db
      .insert(schema.fishTable)
      .values({
        userId,
        ...data,
      })
      .returning();

    return fish[0];
  },

  async getUserFish(userId: string) {
    return db.select().from(schema.fishTable).where(eq(schema.fishTable.userId, userId));
  },
};
```

### Benefits

| Aspect     | Routes → Service              | Routes → Controllers → Service |
| ---------- | ----------------------------- | ------------------------------ |
| Files      | Fewer files, less boilerplate | More files, more indirection   |
| Clarity    | Direct call path is obvious   | Extra layer adds complexity    |
| Testing    | Services tested independently | Controllers need HTTP mocking  |
| Validation | Centralized in routes (Zod)   | Split across layers            |

### Key Principles

1. **Routes handle HTTP concerns**: Request parsing, response formatting, validation
2. **Services handle business logic**: Data operations, calculations, workflows
3. **Direct function calls**: No interface layer between routes and services
4. **Pure services**: Services don't import Hono types, they work with plain TypeScript

### Error Handling Example

```typescript
// Route - HTTP errors
router.post('/', zValidator('json', schema), async (c) => {
  try {
    const result = await fishService.createFish(c.get('userId'), c.req.valid('json'));
    return c.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ success: false, error: error.message }, 400);
    }
    throw error; // Let Hono's error handler deal with 500
  }
});

// Service - Domain errors
export const fishService = {
  async createFish(userId: string, data: CreateFishInput) {
    const existing = await this.findByName(userId, data.name);
    if (existing) {
      throw new ValidationError('Fish name already exists');
    }
    // ... create logic
  },
};
```

## Key Design Patterns

### 1. Repository Pattern (Service Layer)

```typescript
export class ProductService {
  async getUserProducts(userId: string): Promise<ProductEntity[]> {
    return db.select().from(schema.productsTable).where(eq(schema.productsTable.userId, userId));
  }
}
```

### 2. Provider Pattern (Zustand)

```typescript
// Store definition
export const useAppStore = create<AppState>((set, get) => ({
  products: [],
  setProducts: (products) => set({ products }),
}));

// Component usage (selective subscription)
const products = useProducts(); // Only re-renders when products change
```

### 3. Strategy Pattern

```typescript
const PROCESSING_STRATEGIES = {
  fast: { speed: 2.5, quality: 'low' },
  balanced: { speed: 1.0, quality: 'medium' },
  thorough: { speed: 0.5, quality: 'high' },
};
```

### 4. Factory Pattern

```typescript
const entity = new Entity({
  data: entityData,
  strategy: 'balanced',
  x: 100,
  y: 200,
});
```

## Communication Patterns

### Client → Server (HTTP RESTful)

```typescript
// Client
const response = await fetch('/api/products/my', {
  headers: { 'x-guest-id': guestId },
});
const data = await response.json();

// Server (Hono Route)
import { productService } from './services/product-service';

router.get('/my', async (c) => {
  const userId = c.get('userId');
  const products = await productService.getUserProducts(userId);
  return c.json({ success: true, data: products });
});
```

### Mock Mode

```typescript
const USE_MOCK_SERVER = import.meta.env.VITE_USE_MOCK_SERVER === 'true';

export const fetchMyProducts = async () => {
  if (USE_MOCK_SERVER) {
    return MockStore.getAllProducts(); // localStorage
  }
  return apiRequest('/products/my');
};
```

## Security Patterns

### Guest Authentication

```typescript
// Client
let guestId = localStorage.getItem('guest_id') || generateGuestId();

// Server
const user = await findOrCreateGuest(guestId);
c.set('userId', user.id);
```

### Input Validation (Zod)

```typescript
const schema = z.object({
  name: z.string().min(1).max(100),
  value: z.number().min(0).max(100),
});

const validated = schema.parse(await c.req.json());
```

## Performance Patterns

### 1. Selective Re-rendering

```typescript
// ❌ Bad - Re-renders on any state change
const state = useAppStore();

// ✅ Good - Only re-renders when products change
const products = useProducts();
```

### 2. Request Deduplication

```typescript
const pendingRequests = new Map();

async function apiRequest(url) {
  if (pendingRequests.has(url)) {
    return pendingRequests.get(url);
  }
  const promise = fetch(url);
  pendingRequests.set(url, promise);
  return promise;
}
```

### 3. Canvas Optimization (if applicable)

```typescript
// Single canvas for all entities
// Batch rendering
// RequestAnimationFrame loop
```

## Error Handling Patterns

### Client

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Usage
const result = await fetchMyProducts();
if (!result.success) {
  console.error(result.error);
  return;
}
```

### Server

```typescript
try {
  const result = await service.getData();
  return c.json({ success: true, data: result });
} catch (error) {
  return c.json(
    {
      success: false,
      error: error.message,
    },
    500
  );
}
```

## Module Structure

```
src/
├── client/           # React frontend
│   ├── classes/      # Core logic (physics, rendering)
│   │   └── __tests__/
│   ├── components/   # React components
│   │   └── __tests__/
│   ├── hooks/        # Custom hooks
│   │   └── __tests__/
│   ├── services/     # API, AI, utilities
│   │   └── __tests__/
│   └── stores/       # Zustand state
│       └── __tests__/
├── server/           # Hono backend
│   ├── module-*/     # Feature modules
│   │   ├── routes/   # HTTP route handlers with validation
│   │   ├── services/ # Business logic
│   │   └── __tests__/
│   ├── integration/  # Integration tests
│   │   └── __tests__/
│   └── shared/       # Server utilities
│       ├── database.ts
│       └── schema.ts
└── shared/           # Shared types
    └── types.ts
```

### Test File Naming

| Type           | Pattern                                 | Example                        |
| -------------- | --------------------------------------- | ------------------------------ |
| Client Service | `services/__tests__/*.test.ts`          | `apiClient.test.ts`            |
| Client Store   | `stores/__tests__/*.test.ts`            | `appStore.test.ts`             |
| Server Service | `module-*/services/__tests__/*.test.ts` | `auth-service.test.ts`         |
| Integration    | `integration/__tests__/*.test.ts`       | `database-integration.test.ts` |
