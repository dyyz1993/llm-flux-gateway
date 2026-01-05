# Test Type Safety Quick Reference

## Overview
This guide provides patterns for writing type-safe tests in the protocol transpiler module.

## The Problem
When testing converters that return `TranspileResult<T>`, accessing `result.data` directly causes TypeScript errors:
- `result.data` is optional (may be undefined)
- `result.data` has type `T | undefined`
- TypeScript can't narrow the type after `expect(result.success).toBe(true)`

## Solution: Test Helpers

### Import
```typescript
import { expectSuccess, getDataAndAssert } from '../../__tests__/test-helpers';
```

### Pattern 1: Inline Assertions
```typescript
const result = converter.convertRequestFromInternal(request);
expect(result.success).toBe(true);
const data = expectSuccess(result); // Type: Record<string, unknown>
expect(data.messages).toHaveLength(3); // Type-safe!
```

### Pattern 2: Variable Assignment
```typescript
const result = converter.convertRequestToInternal(request);
expect(result.success).toBe(true);
const internalRequest = getDataAndAssert(result); // Type: InternalRequest
expect(internalRequest.tools).toBeDefined(); // Type-safe!
```

### Pattern 3: Multiple Success Checks
```typescript
const toInternalResult = converter.convertRequestToInternal(request);
expect(toInternalResult.success).toBe(true);
const internalRequest = getDataAndAssert(toInternalResult);

const fromInternalResult = converter.convertRequestFromInternal(internalRequest);
expect(fromInternalResult.success).toBe(true);
const geminiRequest = getDataAndAssert(fromInternalResult);
expect(geminiRequest.contents).toBeDefined();
```

## What NOT to Do

### ❌ Direct data access
```typescript
const result = converter.convertRequestFromInternal(request);
expect(result.success).toBe(true);
expect(result.data.messages).toHaveLength(3); // Type error!
```

### ❌ Type assertions
```typescript
const result = converter.convertRequestFromInternal(request);
expect(result.success).toBe(true);
expect((result.data as any).messages).toHaveLength(3); // Unsafe!
```

### ❌ Non-null assertions
```typescript
const result = converter.convertRequestFromInternal(request);
expect(result.success).toBe(true);
expect(result.data!.messages).toHaveLength(3); // Unsafe!
```

## Helper Functions Reference

### expectSuccess<T>(result: TranspileResult<T>): T
- **Purpose**: Assert success and return typed data
- **Use when**: You want to combine assertion and access
- **Throws**: Error if not successful or data is undefined

### getDataAndAssert<T>(result: TranspileResult<T>): T
- **Purpose**: Get data after separate expect assertion
- **Use when**: You've already checked `expect(result.success).toBe(true)`
- **Throws**: Error if not successful or data is undefined

### assertSuccess<T>(result: TranspileResult<T>): T
- **Purpose**: Strict assertion without expect
- **Use when**: You don't need Vitest's expect
- **Throws**: Error if not successful or data is undefined

### assertFailure<T>(result: TranspileResult<T>): void
- **Purpose**: Assert result has errors
- **Use when**: Testing error cases
- **Throws**: Error if result is successful

## Common Patterns

### Testing Successful Conversion
```typescript
it('should convert request to internal format', () => {
  const request = { /* test data */ };
  const result = converter.convertRequestToInternal(request);

  expect(result.success).toBe(true);
  const data = expectSuccess(result);

  expect(data.messages).toHaveLength(3);
  expect(data.model).toBe('test-model');
});
```

### Testing Errors
```typescript
it('should reject invalid requests', () => {
  const invalidRequest = { /* invalid data */ };
  const result = converter.convertRequestToInternal(invalidRequest);

  expect(result.success).toBe(false);
  expect(result.errors).toBeDefined();
  expect(result.errors?.[0].code).toBe('MISSING_REQUIRED_FIELD');
});
```

### Testing Bidirectional Conversion
```typescript
it('should preserve data in round-trip conversion', () => {
  const original = { /* test data */ };

  // To internal
  const toInternalResult = converter.convertRequestToInternal(original);
  expect(toInternalResult.success).toBe(true);
  const internal = getDataAndAssert(toInternalResult);

  // Back to vendor
  const fromInternalResult = converter.convertRequestFromInternal(internal);
  expect(fromInternalResult.success).toBe(true);
  const restored = getDataAndAssert(fromInternalResult);

  expect(restored).toEqual(original);
});
```

## Migration Guide

### Step 1: Add Import
```typescript
import { expectSuccess } from '../../__tests__/test-helpers';
```

### Step 2: Find Direct Access
```bash
# Search for direct result.data access
grep -n "result\.data\." your-test-file.test.ts
```

### Step 3: Add Type Narrowing
```typescript
// Before
expect(result.success).toBe(true);
expect(result.data.messages).toBeDefined();

// After
expect(result.success).toBe(true);
const data = expectSuccess(result);
expect(data.messages).toBeDefined();
```

### Step 4: Replace References
```bash
# Replace all result.data. with data. in that test block
sed -i 's/result\.data\./data./g' your-test-file.test.ts
```

## Troubleshooting

### Error: "expectSuccess is declared but its value is never read"
**Cause**: Import added but not used
**Fix**: Remove import or use it in your tests

### Error: "Cannot find name 'expectSuccess'"
**Cause**: Import path is incorrect
**Fix**: Check the path relative to your test file location
- Converters tests: `../../__tests__/test-helpers`
- Core tests: `../../../__tests__/test-helpers`
- Interface tests: `../../../__tests__/test-helpers`

### Error: Type is still 'unknown' after expectSuccess
**Cause**: TypeScript cannot infer the type
**Fix**: Use type annotation or assertSuccessWithType
```typescript
const data = expectSuccess<YourExpectedType>(result);
```

## Best Practices

1. **Always use helpers**: Never access `result.data` directly
2. **Check success first**: Always verify `result.success` before accessing data
3. **Use descriptive names**: Name variables by what they contain (`internalRequest`, not `data`)
4. **Test both success and failure**: Cover both happy path and error cases
5. **Keep tests simple**: Don't over-abstract, use helpers directly

## Resources

- **Test Helpers**: `/src/server/module-protocol-transpiler/__tests__/test-helpers.ts`
- **Type Definitions**: `/src/server/module-protocol-transpiler/core/transpile-result.ts`
- **Example Tests**: Any file in `/src/server/module-protocol-transpiler/converters/__tests__/`

## Automation

To automatically fix existing tests:
```bash
# Use the Python fix script
python3 /tmp/fix-test.py path/to/test-file.test.ts

# For multiple files
for file in src/server/module-protocol-transpiler/**/__tests__/*.test.ts; do
  python3 /tmp/fix-test.py "$file"
done
```

---

Last Updated: 2026-01-05
Phase: 3B - Test Type Safety Fixes
Status: ✅ Complete
