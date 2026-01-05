# Husky Configuration

## Overview

This reference describes Husky configuration for Git hooks in the project.

## Husky Setup

### Installation

```bash
npm install -D husky
npx husky init
```

### Directory Structure

```
.husky/
├── pre-commit       # Runs before commit
├── pre-push         # Runs before push
└── _/               # Husky internals
    └── husky.sh
```

## Pre-Commit Hook

### Basic Structure

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run validators
npx tsx scripts/validate-all.ts

# Check exit code
if [ $? -ne 0 ]; then
  echo "❌ Validation failed"
  exit 1
fi
```

### Typical Pre-Commit Tasks

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# 1. Run lint-staged (format and lint)
npx lint-staged

# 2. Run tests
npm test -- --run

# 3. Run validators
npx tsx scripts/validate-all.ts
```

## Lint-Staged Integration

### Configuration

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings=100", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

### Pre-Commit with Lint-Staged

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run lint-staged first
npx lint-staged

# Then run tests
npm test -- --run

# Finally run validators
npx tsx scripts/validate-all.ts
```

## Pre-Push Hook

### Basic Pre-Push

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run full test suite
npm run test

# Run E2E tests
npm run test:e2e
```

### Conditional Pre-Push

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Only run E2E tests on main branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" = "main" ]; then
  npm run test:e2e
fi
```

## Commit Message Hook

### Commitlint Setup

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
echo "export default { extends: ['@commitlint/config-conventional'] };" > commitlint.config.js
```

### Commit Message Hook

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx --no -- commitlint --edit $1
```

## Hook Best Practices

### 1. Fast Failing

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run fastest checks first
npx lint-staged || exit 1
npx tsx scripts/validate-all.ts || exit 1
npm test -- --run || exit 1

# Slower checks last
npm run test:e2e
```

### 2. Clear Error Messages

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running validators..."

if ! npx tsx scripts/validate-all.ts; then
  echo ""
  echo "❌ Validation failed:"
  echo "   - Fix sensitive data issues"
  echo "   - Remove TODO comments"
  echo "   - Check import paths"
  echo ""
  exit 1
fi
```

### 3. Skip Option

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Allow skipping with --no-verify
if [ "$SKIP_HOOKS" = "true" ]; then
  echo "⚠️  Skipping hooks (SKIP_HOOKS=true)"
  exit 0
fi

# Normal hook execution
npx tsx scripts/validate-all.ts
```

Usage:

```bash
SKIP_HOOKS=true git commit -m "message"
```

## Troubleshooting

### Hook Not Executing

```bash
# Check file permissions
ls -la .husky/pre-commit

# Make executable
chmod +x .husky/pre-commit
```

### Debug Hook Execution

```bash
# Add debug output
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

set -x  # Enable debug output

# Hook commands
npx tsx scripts/validate-all.ts
```

### Bypass Hooks (Not Recommended)

```bash
# ⚠️ Only in emergencies
git commit --no-verify -m "message"
```

## Performance Tips

### 1. Parallel Execution

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run tests in parallel
npm run test:unit & \
PID1=$!
npm run test:integration & \
PID2=$!

wait $PID1 && wait $PID2
```

### 2. Cache Dependencies

```bash
# Cache node_modules for faster runs
if [ ! -d "node_modules/.cache" ]; then
  mkdir -p node_modules/.cache
fi
```

### 3. Selective Testing

```bash
# Only test changed files
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM '*.ts' '*.tsx')

if [ -n "$CHANGED_FILES" ]; then
  npx vitest run --reporter=verbose $CHANGED_FILES
fi
```

## See Also

- [validator-patterns.md](validator-patterns.md) - Validator patterns
- [../SKILL.md](../SKILL.md) - Validation hook skill
- [https://typicode.github.io/husky/](https://typicode.github.io/husky/) - Husky documentation
