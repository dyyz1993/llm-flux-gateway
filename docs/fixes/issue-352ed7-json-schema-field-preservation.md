# Fix for Issue 352ed7 - JSON Schema Standard Field Preservation

## Problem Description

In the protocol transformation log `289da827-4746-45ef-8411-93130b352ed7-352ed7-1767524358642.log`, the following issues were discovered:

1. **`additionalProperties` was being converted to `additional_properties`**
   - Original Anthropic request: `"additionalProperties": false`
   - Converted output: `"additional_properties": false`
   - This is incorrect because `additionalProperties` is a JSON Schema standard field

2. **Tool schema properties were being incorrectly normalized**
   - Fields inside `input_schema.properties` should remain as-is
   - Fields like `required`, `$schema`, `additionalProperties` at the schema level should also be preserved

## Root Cause

The `field-normalizer.ts` had logic to preserve fields inside `properties` objects (like `tools[].function.parameters.properties`), but it didn't protect JSON Schema standard fields at the same level as `properties`, such as:

- `additionalProperties`
- `required`
- `$schema`
- `type`
- `format`
- etc.

## Solution

### 1. Added `isJsonSchemaStandardField()` function

This function checks if a field name is a JSON Schema standard field that should not be normalized:

```typescript
function isJsonSchemaStandardField(key: string): boolean {
  const standardFields = [
    'additionalProperties',
    '$schema',
    '$id',
    '$ref',
    'definitions',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'enum',
    'const',
    'type',
    'format',
    'pattern',
    // ... and many more JSON Schema standard fields
  ];
  return standardFields.includes(key);
}
```

### 2. Added `isInToolSchema()` function

This function checks if the current path is inside a tool schema (parameters or input_schema) and if the current key is a JSON Schema standard field:

```typescript
function isInToolSchema(path: string[], key: string): boolean {
  if (path.length < 1) return false;

  const last = path[path.length - 1];

  // Check if we're directly in parameters or input_schema
  if (last === 'parameters' || last === 'input_schema') {
    if (isJsonSchemaStandardField(key)) {
      return true;
    }
  }

  // Check for nested paths like tools[].function.parameters
  if (path.length >= 2) {
    const parent = path[path.length - 2];
    if (
      (last === 'parameters' || last === 'input_schema') &&
      (parent === 'function' || parent?.startsWith('tools[') ||
       parent?.startsWith('[0]') || parent?.startsWith('[1]'))
    ) {
      if (isJsonSchemaStandardField(key)) {
        return true;
      }
    }
  }

  return false;
}
```

### 3. Updated normalization functions

Both `normalizeToCamelCase()` and `normalizeToSnakeCase()` were updated to check if a key should be preserved:

```typescript
for (const [key, value] of Object.entries(obj)) {
  // Don't normalize keys in tool schema properties or JSON Schema standard fields
  const inToolSchemaObject = isInToolSchema(path, key);
  const shouldSkipNormalization = inToolSchema || inToolSchemaObject;
  const normalizedKey = shouldSkipNormalization ? key : (isSnakeCase(key) ? snakeToCamel(key) : key);

  // ... rest of the normalization logic
}
```

## Test Coverage

### New Test File: `anthropic-issue-352ed7.test.ts`

Created comprehensive tests to verify the fix:

1. **JSON Schema Standard Field Preservation**
   - Verifies `additionalProperties` is preserved in tool schemas
   - Verifies `$schema` is preserved in tool schemas
   - Tests both Anthropic and OpenAI converters

2. **Grep Tool Command-Line Flags**
   - Verifies `-B`, `-A`, `-C` parameters are preserved as-is
   - Ensures they're not converted to `_b`, `_a`, `_c`

3. **Edge Cases**
   - Tests nested `additionalProperties` in tool schemas
   - Tests `additionalProperties` with object values
   - Tests round-trip conversion

4. **Regression Test**
   - Reproduces the exact scenario from log 352ed7
   - Verifies all issues are fixed

## Test Results

All tests pass successfully:

```bash
✓ src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-352ed7.test.ts (7 tests)
✓ src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-2a1098.test.ts (9 tests)
✓ src/server/module-protocol-transpiler/converters/__tests__/anthropic-field-normalization.test.ts (7 tests)
✓ src/server/module-protocol-transpiler/utils/__tests__/format-detector.test.ts (92 tests)
```

## Files Modified

1. `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-protocol-transpiler/utils/field-normalizer.ts`
   - Added `isJsonSchemaStandardField()` function
   - Added `isInToolSchema()` function
   - Updated `normalizeToCamelCase()` to check for JSON Schema standard fields
   - Updated `normalizeToSnakeCase()` to check for JSON Schema standard fields

2. `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-352ed7.test.ts`
   - New test file with comprehensive test coverage

3. `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-protocol-transpiler/converters/__tests__/test-data/anthropic-to-openai-352ed7.json`
   - Test data file for the 352ed7 scenario

## Verification

To verify the fix works correctly, you can:

1. Run the new tests:
   ```bash
   npm test -- --run src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-352ed7.test.ts
   ```

2. Run all related tests:
   ```bash
   npm test -- --run src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-*.test.ts
   npm test -- --run src/server/module-protocol-transpiler/converters/__tests__/anthropic-field-normalization.test.ts
   ```

3. Check the conversion of a real request with tool schemas to ensure `additionalProperties` is preserved

## Summary

The fix ensures that JSON Schema standard fields (like `additionalProperties`, `required`, `$schema`, etc.) are preserved as-is during protocol conversion, preventing incorrect field name normalization that could break tool schema validation.
