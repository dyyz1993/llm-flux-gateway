# Vendor-Specific Issues

## Overview

Protocol conversion quirks and issues specific to each vendor.

## Vendor Comparison

| Vendor | Standard Compliance | Streaming Quality | Tool Support | Notes |
|--------|-------------------|-------------------|--------------|-------|
| OpenAI | ⭐⭐⭐⭐⭐ | Excellent | Full | Reference implementation |
| Anthropic | ⭐⭐⭐⭐ | Good | Content blocks | Different format |
| Gemini | ⭐⭐⭐ | Fair | Limited | FunctionCall format |
| GLM | ⭐⭐ | Poor | Incomplete | Non-standard streaming |

## OpenAI

### Characteristics

- **Format**: Chat completions API
- **Streaming**: Full support, proper delta accumulation
- **Tools**: `tool_calls` array with streaming by index
- **Compliance**: Reference standard

### Common Issues

#### Issue 1: finish_reason Timing

**Symptom**: `finish_reason` sent in separate chunk after content

**Example**:
```json
// Chunk 1: Content
{"delta": {"content": "Hello"}}

// Chunk 2: Finish
{"delta": {}, "finish_reason": "stop"}
```

**Impact**: Need to handle empty delta with finish_reason

**Fix**:
```typescript
// Always process finish_reason even if delta empty
if (chunk.finish_reason) {
  // Send final chunk
}
```

#### Issue 2: Role Chunk

**Symptom**: First chunk only has role, no content

**Example**:
```json
{"delta": {"role": "assistant"}}
```

**Impact**: Filter may reject as "empty"

**Fix**:
```typescript
// Consider role chunk as meaningful
if (chunk.delta.role) return true;
```

#### Issue 3: Streaming Tool Calls

**Symptom**: Tool calls split across multiple chunks

**Pattern**:
1. Chunk with `index` and `id`
2. Chunk with `function.name`
3. Chunks with `function.arguments` (partial)
4. Chunk with `finish_reason: "tool_calls"`

**Accumulation needed**: Use `index` to group chunks

## Anthropic

### Characteristics

- **Format**: Messages API with content blocks
- **Streaming**: Good, but different delta format
- **Tools**: Content blocks with `type: "tool_use"`
- **Compliance**: Good, but different structure

### Common Issues

#### Issue 1: Content Blocks vs Simple Text

**Symptom**: Content is array of blocks, not string

**Format**:
```json
{
  "content": [
    {"type": "text", "text": "Hello"},
    {"type": "tool_use", "id": "toolu_123", "name": "func", "input": {...}}
  ]
}
```

**Conversion needed**: Convert to/from string for OpenAI

#### Issue 2: Delta Format

**Symptom**: Anthropic uses `delta` differently

**Example**:
```json
// Anthropic streaming
{"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hello"}}

// Not {"delta": {"content": "Hello"}}
```

**Special parsing needed**: Handle `content_block_delta` type

#### Issue 3: Tool Use in Streaming

**Symptom**: Tool use blocks not sent in streaming mode

**Behavior**: Anthropic sends complete tool_use block, then content

**Workaround**: Accumulate full tool_use before sending

#### Issue 4: stop_reason vs finish_reason

**Symptom**: Uses `stop_reason` instead of `finish_reason`

**Values**: `end_turn`, `max_tokens`, `tool_use`, `stop_sequence`

**Mapping needed**: Map to OpenAI `finish_reason` values

## Gemini

### Characteristics

- **Format**: Generative AI API
- **Streaming**: Supported but inconsistent
- **Tools**: `functionCall` in parts array
- **Compliance**: Fair, significant deviations

### Common Issues

#### Issue 1: Candidates Array

**Symptom**: Uses `candidates[]` instead of `choices[]`

**Format**:
```json
{
  "candidates": [{
    "content": {"parts": [{"text": "Hello"}]},
    "finishReason": "STOP",
    "index": 0
  }]
}
```

**Conversion needed**: Map `candidates` → `choices`

#### Issue 2: Parts Array

**Symptom**: Content in `parts[]` array

**Format**:
```json
{"content": {"parts": [{"text": "Hello"}, {"text": " world"}]}}
```

**Conversion needed**: Concatenate `parts[].text`

#### Issue 3: FunctionCall Format

**Symptom**: Uses `functionCall` object, not array

**Format**:
```json
{
  "content": {
    "parts": [{
      "functionCall": {
        "name": "get_weather",
        "args": {"location": "SF"}  // Object, not string!
      }
    }]
  }
}
```

**Issues**:
- Single function call (not array)
- Args is object, not JSON string
- No index for streaming

**Conversion**: Object → string, wrap in array

#### Issue 4: Inconsistent Streaming

**Symptom**: Sometimes sends full response, no streaming

**Detection**:
```bash
# Check for single chunk responses
grep -c "Chunk #" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/gemini-*.log
```

**Workaround**: Handle both streaming and non-streaming

## GLM (Zhipu AI)

### Characteristics

- **Format**: OpenAI-compatible (mostly)
- **Streaming**: Poor, incomplete implementation
- **Tools**: Claims support but broken in streaming
- **Compliance**: Low, significant issues

### Common Issues

#### Issue 1: Incomplete Tool Calls in Stream

**Symptom**: Sends `finish_reason: "tool_calls"` without actual tool_calls

**Example**:
```json
// GLM stream
{"choices": [{"delta": {"role": "assistant", "content": ""}, "finish_reason": "tool_calls"}]}

// No tool_calls array!
```

**Impact**: Cannot use tool calls in streaming mode

**Workarounds**:
1. Use non-streaming for tool calls
2. Patch responses server-side
3. Use different vendor for tools

#### Issue 2: Empty Content Chunks

**Symptom**: Sends chunks with empty content

**Example**:
```json
{"choices": [{"delta": {"role": "assistant", "content": ""}}]}
```

**Impact**: Wastes bandwidth, may trigger empty filters

#### Issue 3: Non-standard Field Names

**Symptom**: Mixes standard and custom fields

**Examples**:
- `finish_reason` (standard)
- `usage` (non-standard structure)
- Custom metadata fields

**Conversion needed**: Normalize to standard

#### Issue 4: Chunk Ordering

**Symptom**: Chunks may arrive out of order

**Detection**:
```bash
# Check chunk numbers
grep "Chunk #" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/glm-*.log | \
  awk '{print $2}' | sort -n | uniq -d
```

**Fix**: Reorder chunks before processing

## Debugging Vendor Issues

### 1. Identify Vendor

```bash
# Check from log
grep "Internal Format\|Client Format" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### 2. Check Vendor-Specific Fields

```bash
# OpenAI
grep "choices\|tool_calls" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Anthropic
grep "content.*type\|stop_reason" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Gemini
grep "candidates\|functionCall\|parts" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# GLM
grep "glm\|finish_reason.*tool_calls" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### 3. Compare Formats

```bash
# Extract input vs output for vendor
grep -A5 "Raw SSE" LOG | head -20 > raw.txt
grep -A5 "Client Format" LOG | head -20 > client.txt
diff raw.txt client.txt
```

## Vendor-Specific Workarounds

### OpenAI

```typescript
// Handle empty delta with finish_reason
if (chunk.delta && Object.keys(chunk.delta).length === 0 && chunk.finish_reason) {
  // Process as final chunk
}
```

### Anthropic

```typescript
// Convert content blocks to string
function convertContentBlocks(content: any[]): string {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}
```

### Gemini

```typescript
// Concatenate parts array
function convertParts(parts: any[]): string {
  return parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('');
}

// Convert functionCall args to string
function convertFunctionCall(call: any): any {
  return {
    name: call.name,
    arguments: JSON.stringify(call.args)  // Object → string
  };
}
```

### GLM

```typescript
// Detect GLM and use non-streaming for tools
if (vendor === 'glm' && requestHasTools) {
  // Force non-streaming
  stream = false;
}

// Or patch incomplete tool calls
if (finish_reason === 'tool_calls' && !tool_calls) {
  // Extract from context or return error
}
```

## Testing Matrix

Test all vendor combinations:

```
Request Format × Upstream Vendor × Response Format × Streaming
```

| Test | Upstream | Request | Response | Stream | Tools |
|------|----------|---------|----------|--------|-------|
| 1 | OpenAI | OpenAI | OpenAI | Yes | Yes |
| 2 | OpenAI | OpenAI | OpenAI | Yes | No |
| ... | ... | ... | ... | ... | ... |
| 16 | GLM | Anthropic | OpenAI | No | Yes |

**Total**: 16 combinations (2 vendors × 2 request formats × 2 stream options × 2 tool options)

## References

- OpenAI API: https://platform.openai.com/docs/api-reference
- Anthropic API: https://docs.anthropic.com/claude/reference/messages_post
- Gemini API: https://ai.google.dev/docs
- GLM API: https://open.bigmodel.cn/dev/api
