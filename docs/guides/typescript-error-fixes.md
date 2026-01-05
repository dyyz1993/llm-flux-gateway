# Quick Reference: TypeScript Error Fixes

## Top 10 Error Patterns and Solutions

### 1. TS2532: Object is possibly 'undefined' (131 errors)

**Problem**:
```typescript
expect(data.messages[0].role).toBe('user');
```

**Solution**:
```typescript
expect(data.messages?.[0]?.role).toBe('user');
```

**Batch Fix**:
```bash
find src -name "*.test.ts" | xargs sed -i '' 's/\.messages\[\([0-9]\+\)\]\./.messages?.[\1]?./g'
```

---

### 2. TS2345: Argument not assignable (101 errors)

**Problem**:
```typescript
const request = {
  model: 'gpt-4',
  messages: [...],
  max_tokens: 4096  // Wrong: snake_case
};

converter.convertRequestFromInternal(request);
```

**Solution**:
```typescript
import type { InternalRequest } from '../../interfaces/internal-format';

const request: InternalRequest = {
  model: 'gpt-4',
  messages: [...],
  maxTokens: 4096  // Correct: camelCase
};

converter.convertRequestFromInternal(request);
```

---

### 3. TS18048: Expression is possibly undefined (74 errors)

**Problem**:
```typescript
const assistantMsg = anthropicRequest.messages[1];
expect(assistantMsg.role).toBe('assistant');
```

**Solution**:
```typescript
const assistantMsg = anthropicRequest.messages?.[1];
expect(assistantMsg?.role).toBe('assistant');
```

---

### 4. TS18046: Expression is not callable (57 errors)

**Problem**:
```typescript
const data = result.data.messages;  // Type is unknown
data.forEach(...);  // Error: Not callable
```

**Solution**:
```typescript
const messages = (result.data as any).messages;
messages.forEach(...);

// OR better:
const messages = result.data as AnthropicRequest;
messages.messages.forEach(...);
```

---

### 5. TS2339: Property does not exist (51 errors)

**Problem**:
```typescript
expect(metadata.string_field).toBe('value');
// Error: Property 'string_field' does not exist on type 'InternalMetadata'
```

**Solution**:
```typescript
// Option 1: Use correct property names
expect(metadata.requestTimestamp).toBe(Date.now());

// Option 2: Use vendorSpecific for custom fields
expect(metadata.vendorSpecific?.string_field).toBe('value');
```

---

### 6. Interface Mismatch: max_tokens vs maxTokens

**Problem**:
```typescript
const request = {
  model: 'gpt-4',
  max_tokens: 4096  // Wrong
};
```

**Solution**:
```typescript
const request = {
  model: 'gpt-4',
  maxTokens: 4096  // Correct (camelCase)
};
```

**Batch Fix**:
```bash
find src -name "*.test.ts" | xargs sed -i '' 's/max_tokens:/maxTokens:/g'
```

---

### 7. Interface Mismatch: tool_choice

**Problem**: InternalRequest uses `tool_choice` (snake_case)

**Solution**:
```typescript
const request: InternalRequest = {
  model: 'gpt-4',
  tool_choice: 'auto',  // Correct: snake_case
  // NOT toolChoice: 'auto'
};
```

---

### 8. Missing Required Fields

**Problem**:
```typescript
const usage: InternalUsage = {
  promptTokens: 10,
  completionTokens: 20
  // Error: Missing 'totalTokens'
};
```

**Solution**:
```typescript
const usage: InternalUsage = {
  promptTokens: 10,
  completionTokens: 20,
  totalTokens: 30  // Required field
};
```

---

### 9. Wrong Enum Values

**Problem**:
```typescript
const error: InternalError = {
  type: 'invalid_request_error',  // Wrong
  message: '...'
};
```

**Solution**:
```typescript
const error: InternalError = {
  type: 'invalid_request',  // Correct enum value
  message: '...'
};
```

---

### 10. Mock Data Mismatch

**Problem**:
```typescript
const mockLogs: RequestLog[] = [{
  id: '123',
  timestamp: Date.now()
  // Error: Missing 10+ required fields
}];
```

**Solution**:
```typescript
const mockLogs: RequestLog[] = [{
  id: '123',
  timestamp: Date.now(),
  method: 'POST',
  path: '/v1/chat/completions',
  messageCount: 1,
  firstMessage: 'Hello',
  // ... all other required fields
}];
```

---

## Quick Fix Commands

### Fix All Array Access Patterns
```bash
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' \
  -e 's/\.messages\[\([0-9]\+\)\]\./.messages?.[\1]?./g' \
  -e 's/\.choices\[\([0-9]\+\)\]\./.choices?.[\1]?./g' \
  -e 's/\.content\[\([0-9]\+\)\]\./.content?.[\1]?./g'
```

### Fix Common Type Assertions
```bash
find src -name "*.test.ts" | xargs sed -i '' \
  -e 's/result\.data\.messages/(result.data as any).messages/g' \
  -e 's/anthropicRequest\.messages/(anthropicRequest as any).messages/g'
```

### Add Type Imports (Manual)
```typescript
// Add to top of test file
import type { InternalRequest } from '../../interfaces/internal-format';
import type { InternalResponse } from '../../interfaces/internal-format';
import type { InternalMessage } from '../../interfaces/internal-format';
```

---

## File-by-File Fix Checklist

### Test Files
- [ ] Add InternalRequest/Response imports
- [ ] Type all request/response objects
- [ ] Add optional chaining for array access
- [ ] Fix mock data to match interfaces
- [ ] Fix enum values (finishReason, etc.)

### Source Files
- [ ] Add type annotations to function parameters
- [ ] Add return type annotations
- [ ] Use type guards for unknown types
- [ ] Fix any implicit any types

### React Components
- [ ] Fix props interfaces
- [ ] Add proper typing for hooks
- [ ] Fix mock data in tests
- [ ] Add proper event handler types

---

## Common Import Patterns

```typescript
// Protocol transpiler tests
import type { InternalRequest } from '../../interfaces/internal-format';
import type { InternalResponse } from '../../interfaces/internal-format';
import type { InternalMessage } from '../../interfaces/internal-format';
import type { InternalUsage } from '../../interfaces/internal-format';

// Gateway tests
import type { RequestLog } from '../../../module-gateway/services/request-log.service';
import type { Route } from '../../../module-gateway/services/routes.service';

// Client tests
import type { UserProfile } from '@shared/types';
import type { Route as RouteType } from '@shared/types';
```

---

## Verification Commands

```bash
# Check error count
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l

# Show errors by file
npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn

# Show specific error types
npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/.*error TS//' | sed 's/:.*//' | sort | uniq -c | sort -rn

# Check specific file
npx tsc --noEmit 2>&1 | grep "filename.test.ts"
```

---

## Estimated Fix Times

| Error Count | File Type | Estimated Time |
|-------------|-----------|----------------|
| 30-40 | Test file | 15-20 min |
| 20-30 | Test file | 10-15 min |
| 10-20 | Test file | 5-10 min |
| 20-30 | Source file | 20-30 min |
| 10-20 | Component | 15-20 min |

**Total estimated time for remaining 598 errors**: 4-6 hours

---

## Tips for Efficient Fixing

1. **Start with test files** - Easier to fix than source code
2. **Fix one file completely** before moving to next
3. **Use patterns** - Most errors follow the same patterns
4. **Batch fix simple patterns** with sed
5. **Test frequently** - Run tsc after each batch
6. **Document new patterns** as you find them

---

## Priority Order for Fixing

### High Priority (Most errors)
1. anthropic-tool-use-blocks.test.ts (35)
2. openai-to-anthropic.real-data.test.ts (32)
3. protocol-transpiler.test.ts (25)
4. anthropic-issue-2a1098.test.ts (23)
5. openai.streaming.test.ts (21)

### Medium Priority (10-20 errors)
6. gateway-tool-calls-fallback.test.ts (20)
7. internal-stream-chunk-conversion.test.ts (18)
8. anthropic-issue-352ed7.test.ts (18)
9. route-matcher.service.api-key-isolation.test.ts (18)
10. useAIStream.test.ts (18)

### Low Priority (Can defer)
- fix-type-errors-phase6.ts (22) - obsolete script
- Files with <10 errors

---

**Last Updated**: 2026-01-05
**Status**: Ready for Phase 2 fixes
