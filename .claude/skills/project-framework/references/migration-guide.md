# Migration Guide - Using Skills in Other Projects

This guide explains how to migrate the BioMimic Fish Animator V2 skills and framework to a new project.

## Overview

The skills and framework are designed to be reusable across different projects with similar architecture (React + TypeScript + Vite + Hono).

## Step 1: Copy Core Structure

### Directory Layout

```bash
# Create base directories
mkdir -p src/{client,server,shared}
mkdir -p src/client/{classes,components,hooks,services,stores}
mkdir -p src/server/shared
mkdir -p scripts/validators
mkdir -p .claude/{rules,skills}
```

### Copy Skills

```bash
# Copy all skills to your project
cp -r /path/to/BioMimic/.claude/skills /path/to/your-project/.claude/

# Or copy specific skills
cp -r /path/to/BioMimic/.claude/skills/project-framework /path/to/your-project/.claude/skills/
cp -r /path/to/BioMimic/.claude/skills/server-module /path/to/your-project/.claude/skills/
# ... etc
```

## Step 2: Update Configuration Files

### vite.config.ts

Update path aliases and proxy settings:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
    },
  },
  server: {
    port: 3010,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['**/integration/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
    },
  },
});
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@client/*": ["./src/client/*"],
      "@server/*": ["./src/server/*"]
    }
  }
}
```

### package.json

Add necessary scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0"
  }
}
```

## Step 3: Customize Skills

### Update Skill Descriptions

Edit each `SKILL.md` to match your project's terminology:

```markdown
---
name: server-module
description: >
  Create new server modules for YOUR PROJECT NAME.
  Use when: Creating new business modules for YOUR DOMAIN.
---
```

### Update Template Placeholders

Replace placeholder names in templates:

- `{Name}` → Your class names
- `{name}` → Your file/variable names
- `{Resource}` → Your resource names

## Step 4: Adapt to Your Database

### Update Schema Pattern

If using Drizzle ORM, update the schema pattern in templates:

```typescript
// Original (MySQL)
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';

// Your database (PostgreSQL, SQLite, etc.)
import { pgTable, varchar } from 'drizzle-orm/pg-core';
```

### Update Database Configuration

```typescript
// src/server/shared/database.ts
import { drizzle } from 'drizzle-orm/YOUR-DRIVER';
import YOUR_CONNECTION from 'YOUR-DRIVER';

export const getDb = () => {
  // Your connection logic
};
```

## Step 5: Update Environment Variables

Create `.env.example`:

```bash
# Copy from BioMimic and adapt
API_KEY=your_api_key
DATABASE_URL=your_database_url
VITE_USE_MOCK_SERVER=true
```

## Step 6: Test the Migration

### Verify Skills Load

In Claude Code:

```
> What skills are available?
```

Should list all your skills.

### Test a Skill

```
> Use server-module to create a test module
```

Should generate files correctly.

### Run Tests

```bash
npm run test
```

## Step 7: Customize for Your Domain

### Example: E-commerce Project

**Rename**:
- `FishEntity` → `ProductEntity`
- `FishService` → `ProductService`
- `module-fish` → `module-products`

**Update**:
- API endpoints: `/fish/*` → `/products/*`
- Store state: `myFish` → `myProducts`
- Components: `FishAnimator` → `ProductCatalog`

## Step 8: Update Documentation

### Update CLAUDE.md

```markdown
# Your Project Name

## Project Rules
- Custom rules for your project

## Architecture
- Your architecture decisions
```

### Update Skill References

Update all `[references/](references/)` links in skills to point to your documentation.

## Common Customizations

### Frontend Framework

If not using React:

1. Update `react-component` skill templates
2. Update state management patterns
3. Update component test templates

### Backend Framework

If not using Hono:

1. Update `server-module` skill templates
2. Update controller/route patterns
3. Update middleware examples

### State Management

If not using Zustand:

1. Update `zustand-store` skill
2. Or replace with Redux/Pinia patterns

## Checklist

- [ ] Copy skills directory
- [ ] Update vite.config.ts aliases
- [ ] Update vitest.config.ts
- [ ] Update tsconfig.json paths
- [ ] Update package.json scripts
- [ ] Customize skill descriptions
- [ ] Adapt database schema
- [ ] Create .env.example
- [ ] Test skills load in Claude Code
- [ ] Test generating code with skills
- [ ] Update documentation

## Troubleshooting

### Skill not found

**Problem**: Skill doesn't appear in available skills

**Solution**: Check `SKILL.md` frontmatter is valid YAML

```bash
# Verify YAML syntax
cat .claude/skills/your-skill/SKILL.md | head -10
```

### Templates not found

**Problem**: Skill references missing templates

**Solution**: Ensure all template files exist in `templates/` directory

```bash
ls -la .claude/skills/your-skill/templates/
```

### Path aliases not working

**Problem**: Imports fail with `@shared/*` not found

**Solution**: Verify all three config files have matching aliases:

1. `vite.config.ts`
2. `vitest.config.ts`
3. `tsconfig.json`

## Minimal Migration

For a quick start, copy only:

1. `project-framework` skill (overview)
2. One or two domain-specific skills
3. Configuration templates

Then expand as needed.

## Support

For issues or questions:

- Check existing skills as examples
- Review BioMimic project structure
- Consult skill reference documentation
