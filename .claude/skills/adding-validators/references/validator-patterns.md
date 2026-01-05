# Validator Patterns

## Overview

This reference describes patterns for creating pre-commit hook validators in the project.

## Validator Location

```
scripts/validate-*.ts
```

## Validator Template

### Basic Validator

```typescript
// scripts/validate-sensitive.ts
import type { ValidationResult } from './validate-all';

export const validateSensitive = (): ValidationResult => {
  const errors: string[] = [];

  // Read all TypeScript files
  const files = glob('src/**/*.ts');

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check for sensitive patterns
    if (content.includes('API_KEY')) {
      errors.push(`${file}: Contains API_KEY`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
};
```

## Common Validation Patterns

### 1. String Pattern Matching

```typescript
const forbiddenPatterns = [
  /API_KEY\s*=\s*['"][^'"]+['"]/, // Hardcoded API key
  /console\.log\(/, // Debug console.log
  /TODO:/i, // TODO comments
];

for (const pattern of forbiddenPatterns) {
  const matches = content.match(pattern);
  if (matches) {
    errors.push(`${file}:${matches.index}: Found forbidden pattern`);
  }
}
```

### 2. Import Validation

```typescript
// Check for forbidden imports
const forbiddenImports = ['@client/services/forbidden-module', 'dangerous-library'];

for (const imp of forbiddenImports) {
  if (content.includes(imp)) {
    errors.push(`${file}: Imports forbidden module: ${imp}`);
  }
}
```

### 3. File Structure Validation

```typescript
// Validate directory structure
const requiredFiles = ['src/client/index.tsx', 'src/server/index.ts', 'package.json'];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  }
}
```

### 4. Type Safety Validation

```typescript
// Check for 'any' types
const anyTypePattern = /:\s*any\b/g;
const matches = content.match(anyTypePattern);

if (matches && matches.length > 0) {
  errors.push(`${file}: Found ${matches.length} instances of 'any' type`);
}
```

### 5. Naming Convention Validation

```typescript
// Check for kebab-case file names
const files = glob('src/**/*.{ts,tsx}');

for (const file of files) {
  const basename = path.basename(file, path.extname(file));

  if (basename !== paramCase(basename)) {
    errors.push(`${file}: File name should be kebab-case`);
  }
}
```

## Validator Return Type

```typescript
// scripts/validate-all.ts
export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings?: string[];
}
```

## Advanced Patterns

### Recursive Directory Scanning

```typescript
function scanDirectory(dir: string, callback: (file: string) => void) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and dist
      if (!['node_modules', 'dist', '.git'].includes(entry.name)) {
        scanDirectory(fullPath, callback);
      }
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}
```

### Parallel Validation

```typescript
async function validateAll(): Promise<ValidationResult> {
  const validators = [
    import('./validate-sensitive').then((m) => m.validateSensitive()),
    import('./validate-todos').then((m) => m.validateTodos),
    import('./validate-imports').then((m) => m.validateImports()),
  ];

  const results = await Promise.all(validators);

  return {
    passed: results.every((r) => r.passed),
    errors: results.flatMap((r) => r.errors),
  };
}
```

## Error Reporting

### Structured Error Messages

```typescript
return {
  passed: false,
  errors: [
    'src/services/api.ts:42: Hardcoded API key found',
    'src/utils/debug.ts:15: console.log statement detected',
  ],
};
```

### Color-Coded Output

```typescript
import chalk from 'chalk';

console.log(chalk.red(`✖ ${error}`));
console.log(chalk.yellow(`⚠ ${warning}`));
console.log(chalk.green(`✓ All checks passed`));
```

## Testing Validators

```typescript
// tests/validate-sensitive.test.ts
import { describe, it, expect } from 'vitest';
import { validateSensitive } from '../scripts/validate-sensitive';

describe('validateSensitive', () => {
  it('should detect hardcoded API keys', () => {
    // Write test file with violation
    fs.writeFileSync('test-file.ts', 'const API_KEY = "secret"');

    const result = validateSensitive();

    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
```

## Integration with Husky

```typescript
// .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx tsx scripts/validate-all.ts

if [ $? -ne 0 ]; then
  echo "❌ Validation failed. Please fix the errors before committing."
  exit 1
fi
```

## Performance Optimization

### Cache Results

```typescript
const cache = new Map<string, ValidationResult>();

export async function validateWithCache(file: string): Promise<ValidationResult> {
  const stats = fs.statSync(file);
  const key = `${file}:${stats.mtimeMs}`;

  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const result = await validateFile(file);
  cache.set(key, result);

  return result;
}
```

### Parallel File Processing

```typescript
import { Worker } from 'worker_threads';

async function validateParallel(files: string[]): Promise<ValidationResult> {
  const workers = files.map((file) => {
    return new Promise<ValidationResult>((resolve) => {
      const worker = new Worker('./validator-worker.js', {
        workerData: { file },
      });

      worker.on('message', resolve);
    });
  });

  const results = await Promise.all(workers);

  return {
    passed: results.every((r) => r.passed),
    errors: results.flatMap((r) => r.errors),
  };
}
```

## See Also

- [husky-config.md](husky-config.md) - Husky configuration
- [../SKILL.md](../SKILL.md) - Validation hook skill
