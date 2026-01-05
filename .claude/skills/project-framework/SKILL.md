---
name: project-framework
description: >
  Guide React + Hono + TypeScript monorepo architecture with single-port development.
  Use when: setting up project structure, understanding module patterns, onboarding developers,
  or when user mentions "project structure", "architecture", "monorepo", "full-stack".
  Covers: path aliases, Hono RPC, server modules, and development workflow.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

# Project Framework Skill

Complete guide to the React + Hono + TypeScript full-stack architecture. This skill provides the foundational knowledge needed to work with all other project skills.

## Project Overview

This is a **monorepo-style web application** using:

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Hono (Node.js) on the **same port** via `@hono/vite-dev-server`
- **State**: Zustand
- **Database**: MySQL + Drizzle ORM (or PostgreSQL, SQLite)
- **Testing**: Vitest + jsdom

### Key Features

- Single port development (frontend + backend together)
- Path aliases for clean imports
- Mock mode for frontend-only development
- Module-based server architecture
- Pre-commit validation hooks

## Directory Structure

```
project-root/
├── src/
│   ├── client/              # React frontend
│   │   ├── classes/         # Core logic (entities, rendering)
│   │   │   └── __tests__/   # Physics/rendering tests
│   │   ├── components/      # React UI components
│   │   │   └── __tests__/   # Component tests
│   │   ├── hooks/           # Custom React hooks
│   │   │   └── __tests__/   # Hook tests
│   │   ├── services/        # API, AI, utilities
│   │   │   └── __tests__/   # Service tests
│   │   ├── stores/          # Zustand state management
│   │   │   └── __tests__/   # Store tests
│   │   └── App.tsx          # Root component
│   │
│   ├── server/              # Hono backend
│   │   ├── module-auth/     # Authentication module
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── __tests__/   # Auth module tests
│   │   ├── module-products/ # Product/Resource modules
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── __tests__/   # Products module tests
│   │   ├── module-orders/   # Feature modules
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── __tests__/   # Orders module tests
│   │   ├── integration/     # Integration tests
│   │   │   └── __tests__/   # DB integration tests
│   │   └── shared/          # Server utilities
│   │       ├── database.ts  # DB connection
│   │       ├── schema.ts    # Drizzle schema
│   │       └── config.ts    # Server config
│   │
│   └── shared/              # Shared types
│       └── types.ts
│
├── scripts/                 # Tooling scripts
│   ├── validators/          # Pre-commit validators
│   │   ├── todos.validator.ts
│   │   ├── sensitive.validator.ts
│   │   └── imports.validator.ts
│   └── config/              # Script configuration
│
├── drizzle/                 # Database migrations
├── .husky/                  # Git hooks
├── .claude/                 # Claude Code skills
│   ├── rules/               # Development rules
│   └── skills/              # Reusable skills
├── vite.config.ts           # Vite + Hono dev server config
├── vitest.config.ts         # Unit test configuration
├── vitest.integration.config.ts  # Integration test config
└── tsconfig.json            # TypeScript config
```

## Path Aliases

Always use these aliases instead of relative imports:

```typescript
import { Entity } from '@shared/types'; // src/shared/types.ts
import { EntityClass } from '@client/classes/Entity'; // src/client/classes/
import { useAppStore } from '@client/stores/appStore'; // src/client/stores/
import { getDb } from '@server/shared/database'; // src/server/shared/
```

## Single Port Development

Using `@hono/vite-dev-server`, both frontend and backend run on **port 3010**:

**Request Flow**:

- `/` → Vite serves `index.html` (Frontend)
- `/api/*` → Hono server handles (Backend)
- `/src/*`, `*.ts`, `*.css` → Vite dev server (HMR)

```typescript
// vite.config.ts
import devServer from '@hono/vite-dev-server';

plugins: [
  react(),
  devServer({
    entry: 'src/server/index.ts',
    exclude: [
      /^\/$/,                        // Frontend
      /^\/(@[a-zA-Z0-9_-]+|src)/,   // Vite assets
      /.*\.(ts|tsx|js|css)$/,        // Static files
    ],
  }),
],
```

## Type-Safe API with Hono RPC

### Shared RPC Client Pattern

**Recommended**: Use `@shared/rpc-server` for automatic type inference.

```typescript
// 1. Shared client (src/shared/rpc-server.ts)
import { hc } from 'hono/client';
import type { AppType } from '@server/index';
export const client = hc<AppType>('/');

// 2. Client service usage (src/client/services/*)
import { client } from '@shared/rpc-server';

export const productApi = {
  async getAll() {
    const res = await client.products.$get();
    return await res.json();
  },

  async getById(id: string) {
    const res = await client.products[':id'].$get({
      param: { id },
    });
    return await res.json();
  },
};
```

### Route Chain Syntax (Critical!)

**⚠️ Hono RPC type inference ONLY works with chain syntax:**

```typescript
// ✅ CORRECT - Chain syntax preserves types
const router = new Hono()
  .get('/', (c) => controller.getAll(c))
  .post('/', (c) => controller.create(c))
  .get('/:id', (c) => controller.getById(c));

// ❌ WRONG - Breaks type inference
const router = new Hono();
router.get('/', handler); // Types lost!
router.post('/', handler); // No auto-complete!
```

### Type Safety Benefits

**📖 See [examples/rpc-type-safety-demo.md](examples/rpc-type-safety-demo.md)** for:

- Complete comparison of Traditional REST vs Hono RPC
- End-to-end type inference demonstration
- Before/After code examples
- Refactoring safety and IDE auto-completion benefits

**Quick Summary**:
| Feature | Traditional REST | Hono RPC |
|---------|-----------------|----------|
| Request types | Manual interface | Auto from Zod |
| Response types | Manual interface | Auto from c.json() |
| Type safety | Requires `as` assertion | Compile-time check |
| IDE completion | Needs config | Works out-of-box |
| Refactoring | Easy to miss updates | Immediate errors |

### Legacy Fetch Pattern

The `apiClient.ts` uses traditional fetch. For new code, prefer the Hono RPC client above.

## Available Skills

### Backend Development

| Skill                                      | Purpose                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| [server-module](../server-module/SKILL.md) | Create new Hono modules (controller, service, routes) |

### Frontend Development

| Skill                                          | Purpose                 |
| ---------------------------------------------- | ----------------------- |
| [react-component](../react-component/SKILL.md) | Create React components |
| [zustand-store](../zustand-store/SKILL.md)     | Extend state management |
| [api-client](../api-client/SKILL.md)           | Add API client methods  |

### Testing & Quality

| Skill                                          | Purpose                   |
| ---------------------------------------------- | ------------------------- |
| [vitest-test](../vitest-test/SKILL.md)         | Write tests               |
| [validation-hook](../validation-hook/SKILL.md) | Add pre-commit validators |

## Development Workflow

### 1. Starting Development

```bash
# Install dependencies
npm install

# Start development server (frontend + backend on same port)
npm run dev    # Runs on http://localhost:3010

# Run tests
npm run test           # Unit tests
npm run test:integration  # Integration tests

# Lint and format
npm run lint
npm run format
```

### 2. Creating a New Feature

**Example: Adding a "Comments" feature**

```bash
# Step 1: Create backend module
Use server-module to create module-comments

# Step 2: Add API client methods
Use api-client to add fetchComments, createComment

# Step 3: Extend store
Use zustand-store to add comments state

# Step 4: Create UI components
Use react-component to create CommentList, CommentForm

# Step 5: Write tests
Use vitest-test to test all layers
```

### 3. Pre-commit Hooks

```bash
# .husky/pre-commit runs:
npx lint-staged          # Format staged files
npm test -- --run        # Run all tests
tsx scripts/validate-all.ts  # Run validators
```

### 4. Database Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Push to database
npm run db:push

# Check status
npm run db:status
```

## Module Architecture

### Server Module Pattern

```
module-{name}/
├── routes/         # Route definitions (Hono)
├── services/       # Business logic + DB operations
└── __tests__/      # Tests for all layers
```

**Example**:

```typescript
// Service
export class CommentService {
  async getUserComments(userId: string) {
    const db = getDb();
    return db.select().from(schema.commentsTable).where(eq(schema.commentsTable.userId, userId));
  }
}

// Routes
const router = new Hono().get('/comments', async (c) => {
  const userId = c.get('userId');
  const comments = await service.getUserComments(userId);
  return c.json({ success: true, data: comments });
});

// Mount: src/server/index.ts
app.route('/comments', commentRoutes);
```

### Client Component Pattern

```typescript
import { useAppStore } from '@client/stores/appStore';

export const MyComponent: React.FC<Props> = ({ id }) => {
  // Precise selector (minimal re-renders)
  const item = useAppStore((state) =>
    state.items.find(i => i.id === id)
  );

  // Stable action selector
  const updateItem = useAppStore((state) => state.updateItem);

  return <div>{item?.name}</div>;
};
```

### State Management Pattern

```typescript
export const useAppStore = create<AppState>((set, get) => ({
  items: [],
  setItems: (items) => set({ items }),

  fetchItems: async () => {
    const result = await ApiClient.getItems();
    if (result.success) set({ items: result.data });
  },
}));

// Selector hook
export const useItems = () => useAppStore((state) => state.items);
```

## Environment Variables

```bash
# .env.example

# AI Services (if applicable)
API_KEY=your_api_key

# Mock Mode (development)
VITE_USE_MOCK_SERVER=true

# Database
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME_TEST=your_test_db
```

## Testing Strategy

| Test Type      | Location                                  | Environment | Mocking  |
| -------------- | ----------------------------------------- | ----------- | -------- |
| Client Service | `src/client/services/__tests__/`          | jsdom       | API, AI  |
| Client Store   | `src/client/stores/__tests__/`            | jsdom       | API, AI  |
| Server Service | `src/server/module-*/services/__tests__/` | jsdom       | Database |
| Integration    | `src/server/integration/__tests__/`       | node        | Real DB  |

## Common Commands

| Command                    | Description                  |
| -------------------------- | ---------------------------- |
| `npm run dev`              | Start dev server (port 3010) |
| `npm run build`            | Production build             |
| `npm run test`             | Run unit tests               |
| `npm run test:integration` | Run integration tests        |
| `npm run lint`             | Run ESLint                   |
| `npm run format`           | Run Prettier                 |
| `npm run db:push`          | Push database schema         |
| `npm run db:status`        | Check migration status       |

## Migration to Other Projects

See [references/migration-guide.md](references/migration-guide.md) for detailed instructions on migrating this framework to new projects.

Quick start:

```bash
# 1. Copy skills
cp -r .claude/skills /path/to/new-project/.claude/

# 2. Update config
# - vite.config.ts (use @hono/vite-dev-server)
# - vitest.config.ts
# - tsconfig.json (path aliases)

# 3. Customize templates for your domain
# - Replace {Name} with your class names
# - Replace {resource} with your resource names
```

## Getting Help

For specific tasks, use the appropriate skill:

- "Use server-module to create a payments module"
- "Use vitest-test to write tests for myService"
- "Use api-client to add a new endpoint"
- "Use react-component to create a dashboard"
- "Use zustand-store to add cart state"
- "Use validation-hook to check for secrets"

## Additional Resources

- **Architecture**: [references/architecture.md](references/architecture.md)
- **Migration**: [references/migration-guide.md](references/migration-guide.md)
- **Development Rules**: [../rules/](../rules/)
