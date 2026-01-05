# Field Mapping Reference

## Overview

Complete field mapping across vendor formats and internal format.

## Vendor Field Equivalents

### Core Message Fields

| Concept | OpenAI | Anthropic | Gemini | GLM | Internal |
|---------|--------|-----------|--------|-----|----------|
| Message ID | `id` | `id` | `id` | `id` | `id` |
| Timestamp | `created` | (not used) | (timestamp) | `created` | `created` |
| Model | `model` | `model` | `model` | `model` | `model` |
| Role | `role` | `role` | `role` | `role` | `role` |
| Content | `content` (string) | `content` (blocks) | `parts[].text` | `content` | `content` |

### Streaming Fields

| Concept | OpenAI | Anthropic | Gemini | GLM | Internal |
|---------|--------|-----------|--------|-----|----------|
| Delta | `delta` | `delta` | (incremental) | `delta` | `delta` |
| Content chunk | `delta.content` | `delta.text` | `parts[].text` | `delta.content` | `delta.content` |
| Finish reason | `finish_reason` | `stop_reason` | `finishReason` | `finish_reason` | `finish_reason` |
| Index | `choices[].index` | `index` | `index` | `index` | `index` |

### Tool Call Fields

| Concept | OpenAI | Anthropic | Gemini | GLM | Internal |
|---------|--------|-----------|--------|-----|----------|
| Tool calls | `tool_calls` (array) | `content[]` (blocks) | `functionCall` (object) | `tool_calls` | `tool_calls` |
| Tool ID | `tool_calls[].id` | `content[].id` | (none) | `tool_calls[].id` | `tool_calls[].id` |
| Tool type | `tool_calls[].type` | (inferred) | (none) | `tool_calls[].type` | `tool_calls[].type` |
| Function name | `tool_calls[].function.name` | `content[].name` | `functionCall.name` | `tool_calls[].function.name` | `tool_calls[].function.name` |
| Function args | `tool_calls[].function.arguments` | `content[].input` | `functionCall.args` | `tool_calls[].function.arguments` | `tool_calls[].function.arguments` |
| Stream index | `tool_calls[].index` | `content[].index` | (none) | `tool_calls[].index` | `tool_calls[].index` |

## Ignored Fields (Warnings)

Fields that are intentionally ignored with `⚠️ Ignored field` warnings:

### Provider-Specific Metadata

| Field | Vendor | Reason |
|-------|--------|--------|
| `usage.prompt_tokens` | OpenAI | Not available in streaming |
| `usage.completion_tokens` | OpenAI | Not available in streaming |
| `logprobs` | OpenAI | Not supported in conversion |
| `anthropic_version` | Anthropic | Vendor-specific |
| `google_metadata` | Gemini | Vendor-specific |

### Reasoning Features

| Field | Vendor | Reason |
|-------|--------|--------|
| `reasoning` | Anthropic | Extended model feature |
| `thinking` | Anthropic | Extended model feature |
| `extended.thinking` | Anthropic | Extended model feature |
| `thought` | Various | Not standardized |

### Non-Standard Extensions

| Field | Vendor | Reason |
|-------|--------|--------|
| `user.provider` | Any | Client-side field |
| `vendor_config` | Any | Implementation detail |
| `custom_fields.*` | Any | Not part of standard |

## Common Ignored Field Scenarios

### Scenario 1: Streaming Token Usage

```json
// Raw SSE from OpenAI
{
  "choices": [{"delta": {"content": "Hello"}}],
  "usage": {"prompt_tokens": 10, "completion_tokens": 2}  // ⚠️ Ignored
}

// Log output
⚠️ Ignored field: usage.prompt_tokens (streaming token usage not supported)
```

### Scenario 2: Anthropic Reasoning

```json
// Anthropic extended thinking
{
  "content": [
    {"type": "thinking", "thinking": "Let me think..."}  // ⚠️ Ignored
  ]
}

// Log output
⚠️ Ignored field: content[].thinking (extended thinking feature not supported)
```

### Scenario 3: Vendor-Specific Metadata

```json
// Gemini metadata
{
  "candidates": [{
    "content": {"parts": [{"text": "Hello"}]},
    "finishReason": "STOP",
    "index": 0,
    "safetyRatings": [...]  // ⚠️ Ignored
  }]
}

// Log output
⚠️ Ignored field: safetyRatings (vendor-specific metadata)
```

## Field Transformation Rules

### Rule 1: String to Object

OpenAI uses string arguments, Anthropic uses object:

**OpenAI**:
```json
{
  "function": {
    "name": "get_weather",
    "arguments": "{\"location\":\"SF\"}"  // String
  }
}
```

**Anthropic**:
```json
{
  "name": "get_weather",
  "input": {"location": "SF"}  // Object
}
```

**Transformation**: JSON.parse / JSON.stringify

### Rule 2: Array to Content Blocks

Anthropic uses content blocks array, OpenAI uses simple string:

**OpenAI**:
```json
{
  "content": "Hello, world!"  // String
}
```

**Anthropic**:
```json
{
  "content": [
    {"type": "text", "text": "Hello, world!"}
  ]  // Array
}
```

**Transformation**: Wrap/unwrap content

### Rule 3: Finish Reason Naming

| Vendor | Field | Values |
|--------|-------|--------|
| OpenAI | `finish_reason` | `stop`, `length`, `tool_calls`, `content_filter` |
| Anthropic | `stop_reason` | `end_turn`, `max_tokens`, `tool_use`, `stop_sequence` |
| Gemini | `finishReason` | `STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION` |
| GLM | `finish_reason` | `stop`, `length`, `tool_calls` |

**Transformation**: Map between enum values

## Field Completeness Checklist

When debugging field issues, verify:

### Input (Raw SSE)
- [ ] Required fields present
- [ ] Field types correct
- [ ] Field values valid
- [ ] No unexpected fields

### Internal Format
- [ ] All fields parsed
- [ ] Field names normalized
- [ ] Field types standardized
- [ ] Missing fields have defaults

### Output (Client Format)
- [ ] Target format fields present
- [ ] Field values transformed correctly
- [ ] No data loss
- [ ] Format matches client expectation

## Debugging Field Issues

### 1. Find Missing Fields

```bash
# Check if field exists in Raw SSE but not in Client Format
grep "field_name" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -A5 "Raw SSE" > raw.txt
grep "field_name" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -A5 "Client Format" > client.txt
diff raw.txt client.txt
```

### 2. Trace Field Through Conversion

```bash
# Full journey of a field
grep -C20 "field_name" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/REQUEST-ID.log
```

### 3. Count Ignored Fields

```bash
# What fields are commonly ignored?
grep "Ignored field" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  awk '{print $3}' | sort | uniq -c | sort -rn
```

### 4. Find Type Mismatches

```bash
# Look for conversion errors
grep -i "type.*error\|cannot.*convert" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

## Adding New Field Support

### 1. Update Internal Format

Edit `/src/server/module-protocol-transpiler/interfaces/internal-format.ts`:

```typescript
export interface InternalStreamChunk {
  // ... existing fields ...
  newField?: string;  // Add new field
}
```

### 2. Update Parsers

Add parsing in `/src/server/module-protocol-transpiler/parsers/*.sse-parser.ts`:

```typescript
// Parse new field from vendor format
if (vendorData.newField) {
  internalChunk.newField = vendorData.newField;
}
```

### 3. Update Converters

Add conversion in `/src/server/module-protocol-transpiler/converters/*.converter.ts`:

```typescript
// Convert internal to vendor format
if (internalChunk.newField) {
  vendorChunk.newField = internalChunk.newField;
}
```

### 4. Test

```bash
# Test new field conversion
npm run test -- --grep="new field"
```

## References

- Internal Format: `/src/server/module-protocol-transpiler/interfaces/internal-format.ts`
- Converter Base: `/src/server/module-protocol-transpiler/converters/base.converter.ts`
- Parsers: `/src/server/module-protocol-transpiler/parsers/*.sse-parser.ts`
