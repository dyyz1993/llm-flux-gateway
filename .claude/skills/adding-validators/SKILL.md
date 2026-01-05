---
name: adding-validators
description: >
  Add new validation rules for pre-commit hooks.
  Use when: creating validators for TODO, sensitive data, custom checks, or when user mentions "validator", "pre-commit", "hook".
  Generates: validator function, config registration, test coverage.
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# Adding Validators

Create custom validators for pre-commit hooks.

## Quick Start

```bash
# 1. Create validator
# File: scripts/validators/my-custom.validator.ts

# 2. Register in scripts/config/project.config.ts

# 3. Test
npx tsx scripts/validate-all.ts
```

## Templates

See [templates/](templates/) directory:

| Template                        | Description               |
| ------------------------------- | ------------------------- |
| `validator.ts.template`         | Basic validator structure |
| `pattern-validator.ts.template` | Pattern-based validator   |

## Validator Structure

```typescript
export const validateMyCustom = (): ValidationResult => {
  const issues: string[] = [];
  // Scan files, find issues
  return {
    passed: issues.length === 0,
    issues,
    summary: { fileCount, issueCount, message },
  };
};
```

## Existing Validators

- **TODO**: Checks for unassigned TODO comments
- **Sensitive**: Checks for API keys, passwords, console.log
- **Imports**: Checks for deep relative imports

## Additional Resources

- [references/validator-patterns.md](references/validator-patterns.md) - Common patterns
- [references/husky-config.md](references/husky-config.md) - Hook configuration
