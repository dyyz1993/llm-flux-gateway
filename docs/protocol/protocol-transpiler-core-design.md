# Protocol Transpiler Core Design Philosophy

## Executive Summary

The protocol-transpiler module implements a **vendor-agnostic intermediate representation** based on OpenAI's API format (with camelCase naming). This architecture enables seamless conversion between any LLM vendor formats through a unified "Internal Format" abstraction layer.

**Core Architecture**:
```
Vendor Format (snake_case) → Internal Format (camelCase) → Another Vendor Format (snake_case)
```

---

## 1. Core Design Principles

### 1.1 Internal Format as Universal Intermediate

**Why it exists**: To provide a single, unified representation that all converters use as a lingua franca.

**Based on OpenAI format** because:
- OpenAI has become the de facto industry standard
- Most widely adopted API structure
- Well-documented and stable
- Covers 90%+ of common LLM features

**Key modification**: Uses **camelCase** instead of snake_case for better TypeScript integration.

### 1.2 The Conversion Flow

**Request Conversion**:
```
1. Client sends request in Vendor A format (snake_case)
   ↓
2. Converter A: normalizeToCamelCase() → Internal Format (camelCase)
   ↓
3. Converter B: normalizeToSnakeCase() → Vendor B format (snake_case)
   ↓
4. Upstream receives Vendor B format
```

**Response Conversion**: Same pattern in reverse.

**Streaming Conversion**:
- Each chunk is converted independently
- State is maintained for accumulated deltas
- Special handling for empty/metadata-only chunks (`__empty` marker)

### 1.3 Field Normalization Philosophy

**Two-Layer Approach**:

1. **Structural Conversion** (Converter-specific):
   - Different data structures → unified structure
   - Example: Anthropic's `contents` array vs OpenAI's `messages` array
   - Example: Tool call formats (Anthropic's `tool_use` blocks vs OpenAI's `tool_calls` field)

2. **Field Name Normalization** (Shared utility):
   - `normalizeToCamelCase()`: snake_case → camelCase
   - `normalizeToSnakeCase()`: camelCase → snake_case
   - **Critical exception**: JSON Schema standard fields are NOT normalized
     - `additionalProperties`, `minimum`, `maximum`, etc. remain as-is
     - Tool schema properties are detected by path and preserved

**Why this separation?**
- Structural differences require vendor-specific logic
- Field name differences are mechanical and reusable
- Preserves JSON Schema compatibility

---

## 2. Converter Responsibilities

### 2.1 What Converters MUST Do

1. **Implement FormatConverter interface**:
   ```typescript
   convertRequestToInternal(request: unknown): TranspileResult<InternalRequest>
   convertRequestFromInternal(internal: InternalRequest): TranspileResult<Record<string, unknown>>
   convertResponseToInternal(response: unknown): TranspileResult<InternalResponse>
   convertResponseFromInternal(internal: InternalResponse): TranspileResult<Record<string, unknown>>
   ```

2. **Return TranspileResult wrapper**:
   ```typescript
   return success(data, metadata)  // Success case
   return failure([error])          // Failure case
   ```

3. **Use field-normalizer for field name conversion**:
   ```typescript
   const normalized = normalizeToCamelCase(vendorData, true)
   ```

4. **Handle structural differences**:
   - Map vendor-specific structures to Internal Format
   - Example: Anthropic system messages → Internal Format system field

5. **Validate input and output**:
   - Check required fields
   - Generate warnings for unknown fields

### 2.2 What Converters MUST NOT Do

1. **No direct vendor-to-vendor conversion**:
   - ❌ Don't convert Anthropic → OpenAI directly
   - ✅ Convert Anthropic → Internal → OpenAI

2. **No business logic**:
   - ❌ Don't add authentication headers
   - ❌ Don't handle retry logic
   - ❌ Don't implement caching strategies
   - ✅ Only handle data transformation

3. **No vendor-specific hacks in gateway controller**:
   - ❌ Don't check `if (vendor === 'anthropic')` in controller
   - ✅ Handle all vendors uniformly via Internal Format

4. **No raw field name access**:
   - ❌ Don't access `response.input_tokens` (Anthropic-specific)
   - ✅ Access `usage.promptTokens` (Internal Format)

### 2.3 Streaming vs Request/Response Conversion

**Request/Response**: Convert complete objects in one call

**Streaming**: More complex due to:
- **Incremental updates**: Chunks contain partial data (deltas)
- **State management**: Accumulate deltas across chunks
- **Empty chunks**: Some chunks have only metadata (finish_reason, usage)
- **SSE format**: Chunks are SSE-formatted strings, not JSON objects

**Streaming pattern**:
```typescript
// 1. Parse SSE line to extract JSON
const data = extractDataFromLine(sseLine)

// 2. Convert to Internal Format (may return empty chunk)
const internal = convertChunkToInternal(data)

// 3. Skip empty chunks
if (internal.__empty) return null

// 4. Convert to target vendor SSE format
const targetSSE = convertChunkFromInternal(internal)
```

---

## 3. Key Architectural Decisions

### 3.1 TranspileResult<T> Wrapper

**Why not direct returns?**

1. **Error context**: Captures path, message, code, and original value
2. **Metadata tracking**: Records conversion time, fields converted/ignored
3. **Warnings**: Allows non-fatal issues to be reported
4. **Type safety**: Ensures error handling is explicit

### 3.2 Separate Validation Methods (isValidXxx)

**Why have both `convertXxx` and `isValidXxx`?**

1. **Format detection**: Gateways need to detect which format a request uses
2. **Early validation**: Fail fast before attempting conversion
3. **Confidence scoring**: Format detection isn't always certain

### 3.3 ProtocolTranspiler vs Individual Converters

**ProtocolTranspiler role** (protocol-transpiler.ts):
- **Orchestrator**: Manages converter registry
- **Router**: Directs conversions through proper converters
- **Fast-path optimization**: Same-vendor conversions
- **Format detection**: Determines if data is request vs response

**Individual Converter role**:
- **Transformation logic**: Vendor-specific conversion rules
- **No orchestration**: Doesn't know about other vendors
- **Single responsibility**: Handles one vendor format

---

## 4. Common Patterns for Fixing Type Errors

### 4.1 TranspileResult Type Safety

**Pattern 1: Always check success before accessing data**
```typescript
// ❌ Unsafe
const result = converter.convertRequestToInternal(data)
const request = result.data.model  // Runtime error if failed!

// ✅ Safe
const result = converter.convertRequestToInternal(data)
if (!result.success || !result.data) {
  return failure(result.errors || [])
}
const request = result.data.model
```

**Pattern 2: Use type guards**
```typescript
function isSuccess<T>(result: TranspileResult<T>): result is TranspileResult<T> & { data: T } {
  return result.success && result.data !== undefined
}

// Usage
if (isSuccess(result)) {
  // TypeScript knows result.data is defined here
  console.log(result.data.model)
}
```

### 4.2 Dealing with `unknown` Type

**Pattern 1: Type narrowing**
```typescript
function convertRequestToInternal(request: unknown): TranspileResult<InternalRequest> {
  // Narrow from unknown
  if (!request || typeof request !== 'object') {
    return failure([createError('', 'Invalid request', 'INVALID_TYPE')])
  }

  const req = request as Record<string, unknown>

  // Check required fields
  if (!req.model || typeof req.model !== 'string') {
    return failure([createError('model', 'Missing or invalid model', 'MISSING_REQUIRED_FIELD')])
  }

  // Now safe to access
  const model = req.model
}
```

### 4.3 Field Normalization Patterns

**Pattern 1: Always normalize to Internal Format first**
```typescript
// ❌ Don't access raw vendor fields
const maxTokens = vendorRequest.max_tokens  // What if field name changes?

// ✅ Normalize first, then access
const internal = normalizeToCamelCase(vendorRequest, true) as InternalRequest
const maxTokens = internal.maxTokens
```

**Pattern 2: Handle vendor-specific fields correctly**
```typescript
// ✅ Use vendorSpecific for truly vendor-unique fields
const internal: InternalRequest = {
  model: 'claude-3',
  messages: [...],
  vendorSpecific: {
    anthropicBeta: 'prompt-caching-2024-01-01'
  }
}
```

**Pattern 3: Preserve JSON Schema fields**
```typescript
// The field-normalizer automatically detects tool schema paths
// and preserves standard JSON Schema fields like additionalProperties

// No special handling needed - it's automatic!
```

---

## 5. Anti-Patterns (What NOT to Do)

### 5.1 Breaking Abstraction

**❌ Don't access vendor-specific fields in gateway controller**:
```typescript
// ❌ WRONG
if (response.input_tokens) {  // Anthropic-specific
  logUsage(response.input_tokens)
}

// ✅ CORRECT
if (usage.promptTokens) {  // Internal Format
  logUsage(usage.promptTokens)
}
```

### 5.2 Bypassing Internal Format

**❌ Don't convert directly between vendors**:
```typescript
// ❌ WRONG
function anthropicToOpenAI(anthropic: AnthropicRequest): OpenAIRequest {
  return { /* direct mapping */ }
}

// ✅ CORRECT
function anthropicToOpenAI(anthropic: AnthropicRequest): OpenAIRequest {
  const internal = anthropicConverter.convertRequestToInternal(anthropic)
  return openaiConverter.convertRequestFromInternal(internal.data!)
}
```

### 5.3 Ignoring Type Safety

**❌ Don't use `as any` to bypass type checking**:
```typescript
// ❌ WRONG
const result = converter.convert(data) as any
const value = result.someRandomField  // No type safety!

// ✅ CORRECT
const result = converter.convert(data)
if (!result.success || !result.data) {
  return failure(result.errors)
}
const value = result.data.someField  // Type-safe
```

---

## 6. Current Issues and Solutions

### 6.1 Remaining 1,166 Type Errors

**Distribution**:
- ~48% in test files (mostly mock data issues)
- ~52% in source files (mostly strict type checking)

**Common categories**:
1. **TranspileResult data access** (~30%): Not checking `.success` before accessing `.data`
2. **Test mock mismatches** (~25%): Mocks don't match updated type definitions
3. **Delta type issues** (~15%): Stream delta type mismatches
4. **Unused variables** (~10%): Dead code from refactoring
5. **Other** (~20%): Various strict type checking issues

### 6.2 Most Problematic Converters

**AnthropicConverter** (101 errors):
- Largest converter (1,824 lines)
- Complex streaming logic
- Many edge cases for tool calls, thinking blocks, cache control

**GeminiConverter** (57 errors):
- Medium complexity (748 lines)
- Some unique features (grounding, citations)

**OpenAIConverter** (fewest errors):
- Smallest converter (470 lines)
- Pass-through with validation
- Considered the "reference implementation"

---

## 7. Design Rationale Summary

### Why This Architecture Works

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Extensibility**: Adding new vendors doesn't require changing existing code
3. **Testability**: Each converter can be tested independently
4. **Type Safety**: Internal Format provides strong typing throughout
5. **Maintainability**: Changes to one vendor don't affect others

### Trade-offs

**Pros**:
- ✅ Clean architecture with clear boundaries
- ✅ Easy to add new vendors
- ✅ Type-safe with full IDE support
- ✅ Testable in isolation

**Cons**:
- ❌ Two conversions required (vendor → internal → vendor)
- ❌ Additional abstraction layer to learn
- ❌ Some performance overhead (~1ms per conversion)

**Performance impact**: Negligible (< 0.1% of total request time)

---

## 8. Quick Reference for Type Error Fixes

### Do's

- ✅ Always check `result.success` before accessing `result.data`
- ✅ Use `normalizeToCamelCase()` and `normalizeToSnakeCase()` utilities
- ✅ Preserve JSON Schema standard fields (automatic)
- ✅ Return `TranspileResult<T>` wrapper from all converters
- ✅ Use type guards for narrowing (`isInternalRequest`, `isSuccess`)
- ✅ Handle empty chunks in streaming conversions
- ✅ Add vendor-specific fields to `vendorSpecific` object

### Don'ts

- ❌ Don't use `as any` to bypass type checks
- ❌ Don't access vendor-specific field names directly
- ❌ Don't add business logic to converters
- ❌ Don't convert directly between vendors (bypass Internal Format)
- ❌ Don't hardcode vendor checks in gateway controller
- ❌ Don't normalize JSON Schema standard fields
- ❌ Don't assume `result.data` exists without checking `.success`

---

## 9. Key Files Reference

**Core Architecture**:
- `interfaces/internal-format.ts` - Internal Format type definitions (597 lines)
- `interfaces/format-converter.ts` - Converter interface (254 lines)
- `core/protocol-transpiler.ts` - Orchestrator (519 lines)
- `core/transpile-result.ts` - Result wrapper (360 lines)

**Field Normalization**:
- `utils/field-normalizer.ts` - Field name conversion utilities (462 lines)

**Converters**:
- `converters/openai.converter.ts` - Reference implementation (470 lines)
- `converters/anthropic.converter.ts` - Most complex (1,824 lines)
- `converters/gemini.converter.ts` - Medium complexity (748 lines)
- `converters/responses.converter.ts` - OpenAI Responses API

**Documentation**:
- `docs/INTERNAL_FORMAT_CAMELCASE_RESEARCH.md` - camelCase vs snake_case analysis
- `docs/PROTOCOL_TRANSFORMATION_ARCHITECTURE.md` - Architecture layering
- `docs/TYPE_ERROR_FIX_PLAN.md` - Current error analysis
- `docs/PROTOCOL_TRANSPILER_CORE_DESIGN.md` - This document
