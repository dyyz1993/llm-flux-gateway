---
name: creating-server-modules
description: >
  Create new Hono server modules with routes, services, and tests.
  Use when: creating business modules, adding API endpoints, or extending server architecture.
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# Creating Server Modules

Create new Hono server modules with complete architecture.

## Quick Start

```bash
# 1. Create module directory
mkdir -p src/server/module-{name}/{routes,services,__tests__}

# 2. Copy templates from this skill
# 3. Replace {Name} and {name} placeholders
# 4. Mount routes in src/server/index.ts
```

## Directory Structure

```
src/server/module-{name}/
├── routes/{name}-routes.ts              # Route definitions & handlers
├── services/{name}-service.ts           # Business logic
├── __tests__/
│   ├── {name}-routes.test.ts
│   └── {name}-service.test.ts
└── main.ts                              # Module export
```

## Templates

See [templates/](templates/) directory for complete code templates:

| Template                   | Description                            |
| -------------------------- | -------------------------------------- |
| `service.ts.template`      | Service layer with database operations |
| `routes.ts.template`       | Hono route definitions with handlers   |
| `service.test.ts.template` | Vitest test for service                |

## Workflow

1. **Create module directory**: `mkdir -p src/server/module-{name}/{routes,services,__tests__}`
2. **Copy templates**: Use templates from this skill
3. **Add database table**: Update `src/server/shared/schema.ts`
4. **Implement service**: Business logic with database operations
5. **Define routes with handlers**: Route definitions with request handling, mount in `src/server/index.ts`
6. **Write tests**: All layers
7. **Run tests**: `npm run test`

## Example

See [examples/basic-usage.md](examples/basic-usage.md) for a complete walkthrough creating a notifications module from start to finish.

## Documentation Types

This skill provides two types of documentation:

| Type           | Location      | Purpose               | Content                                                                     |
| -------------- | ------------- | --------------------- | --------------------------------------------------------------------------- |
| **Examples**   | `examples/`   | Complete walkthroughs | End-to-end tutorials showing how to build a full module step-by-step        |
| **References** | `references/` | Technical reference   | Detailed documentation of patterns, conventions, and architecture decisions |

**When to use**:

- **examples/**: First time creating a module, need complete guidance
- **references/**: Looking up specific patterns, understanding design decisions

## Additional Resources

- **Type Safety Demo**: [../project-framework/examples/rpc-type-safety-demo.md](../project-framework/examples/rpc-type-safety-demo.md) - See how Hono RPC provides end-to-end type safety
- **Routes & Service Pattern**: [references/unified-framework.md](references/unified-framework.md)
- **Database Schema**: [references/database-patterns.md](references/database-patterns.md)
- **Existing Modules**: `src/server/module-auth/`, `src/server/module-fish/`
