# Tool Call Debugging

## Problem

Tool calls not working correctly across format conversions (e.g., OpenAI → Anthropic).

## Diagnosis Commands

```bash
# Find all tool-related conversions
grep -i "tool" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | head -50

# Check for ignored tool fields
grep "Ignored.*tool\|tool.*ignored" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Look for tool_calls in delta
grep "tool_calls\|tool_use\|functionCall" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Find failed tool conversions
grep -B10 "tool" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | grep -B10 "Status: failed"
```

## Tool Call Field Mapping

### Vendor Formats

| Vendor | Field Location | Format |
|--------|---------------|--------|
| OpenAI | `choices[].delta.tool_calls` | Array of tool call objects |
| Anthropic | `content` array with type=`tool_use` | Content block |
| Gemini | `candidates[].content.parts[]` with `functionCall` | Part object |
| GLM | `choices[].delta.tool_calls` | Array (may be incomplete in streams) |

### Internal Format

```typescript
interface InternalToolCall {
  index: number;
  id?: string;
  type: string;  // "function", "tool_use", etc.
  function?: {
    name: string;
    arguments: string;  // JSON string
  };
}
```

## Common Issues

### 1. Cross-Format Tool Call Conversion

**Symptom**: Tools work in same format, fail across formats

**Example**: OpenAI request → GLM upstream → Anthropic response

**Diagnosis**:
```bash
# Check format chain
grep "Internal Format\|Client Format" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/REQUEST-ID.log
```

**Common failures**:
- Field name mismatch (`tool_calls` vs `tool_use`)
- Missing `index` field for streaming
- Incomplete argument accumulation
- Different function name formats

### 2. Streaming Tool Call Accumulation

**Symptom**: Tool calls incomplete or fragmented

**Issue**: Tool calls arrive in multiple chunks

**Example stream**:
```json
// Chunk 1: Start tool call
{"delta": {"tool_calls": [{"index": 0, "id": "call_123", "type": "function"}]}}

// Chunk 2: Function name
{"delta": {"tool_calls": [{"index": 0, "function": {"name": "get_weather"}}]}}

// Chunk 3: Arguments (partial)
{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "{\"loca"}}]}}

// Chunk 4: Arguments (continued)
{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "tion\": \"SF\"}"}}]}}

// Chunk 5: Finish
{"delta": {}, "finish_reason": "tool_calls"}
```

**Debug accumulation**:
```bash
# Track tool_call index
grep "index.*0.*tool" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Check argument concatenation
grep "arguments" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### 3. GLM Incomplete Tool Calls

**Symptom**: GLM sends `finish_reason: "tool_calls"` but no tool_calls

**Example GLM response**:
```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "delta": {
      "role": "assistant",
      "content": ""  // No tool_calls!
    }
  }]
}
```

**Issue**: GLM's streaming API doesn't fully match OpenAI standard

**Workaround**:
- Detect GLM vendor
- Use non-streaming mode for tool calls
- Or patch GLM responses

### 4. Anthropic Content Block Format

**Symptom**: Anthropic tools use `tool_use` in content array

**Format**:
```json
{
  "content": [
    {"type": "text", "text": "Let me check the weather"},
    {"type": "tool_use", "id": "toolu_123", "name": "get_weather", "input": {"location": "SF"}}
  ]
}
```

**Conversion to OpenAI**:
```json
{
  "tool_calls": [{
    "index": 0,
    "id": "toolu_123",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\":\"SF\"}"
    }
  }]
}
```

**Debug content block conversion**:
```bash
# Check content array structure
grep "content.*type.*tool_use" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

## Debugging Workflow

### 1. Identify Tool Call Flow

```bash
# Extract tool call journey
grep -A20 "tool_calls\|tool_use\|functionCall" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/REQUEST-ID.log
```

### 2. Verify Field Mapping

| Step | Check | Command |
|------|-------|---------|
| Raw SSE | Has tool field? | `grep "tool" RAW-SSE.log` |
| Internal | Parsed correctly? | `grep "Internal Format" LOG` |
| Client | Converted correctly? | `grep "Client Format" LOG` |

### 3. Check Accumulator State

Tool call accumulators should:
- Use `index` to group chunks
- Concatenate `arguments`
- Preserve `id` and `name`
- Handle multiple parallel tools

**Debug accumulator**:
```bash
# Track index usage
grep "index.*:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | grep tool
```

## Vendor-Specific Quirks

### OpenAI

- **Format**: `tool_calls` array in delta
- **Streaming**: Progressive, uses `index`
- **Arguments**: String JSON, accumulated

### Anthropic

- **Format**: Content blocks with `type: "tool_use"`
- **Streaming**: No streaming for tool_use blocks
- **Arguments**: Object in `input` field

### Gemini

- **Format**: `functionCall` in parts array
- **Streaming**: Supported but varies
- **Arguments**: Object in `functionCall.args`

### GLM (Zhipu AI)

- **Format**: `tool_calls` (OpenAI-like)
- **Streaming**: **INCOMPLETE** - finish_reason sent without tool_calls
- **Arguments**: May be missing in stream

**GLM workaround**:
```typescript
// Detect GLM and use non-streaming for tools
if (vendor === 'glm' && hasTools) {
  stream = false;
}
```

## Fixes

### Fix 1: Ensure Index Field

All streaming tool calls MUST have `index`:

```typescript
// Converter should add index if missing
if (toolCall.index === undefined) {
  toolCall.index = 0;  // Or increment
}
```

### Fix 2: Handle GLM Incomplete Streams

```typescript
// In GLM converter
if (finish_reason === 'tool_calls' && !tool_calls) {
  // Fallback: extract from previous context
  // Or request full response
}
```

### Fix 3: Argument Accumulation

```typescript
// Proper argument accumulation
let accumulatedArgs = '';
for (const chunk of chunks) {
  if (chunk.delta.tool_calls) {
    for (const tc of chunk.delta.tool_calls) {
      if (tc.function?.arguments) {
        accumulatedArgs += tc.function.arguments;
      }
    }
  }
}
```

### Fix 4: Content Block to Tool Calls

```typescript
// Anthropic to OpenAI
function convertContentBlocks(content: any[]): ToolCall[] {
  return content
    .filter(block => block.type === 'tool_use')
    .map((block, index) => ({
      index,
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input)
      }
    }));
}
```

## Testing

```bash
# Test tool call conversion
npm run test -- --toolName="tool-call-conversion"

# Test specific vendor
npm run test -- --toolName="openai-to-anthropic-tools"
```

## Prevention

1. **Validate** tool call schema in converters
2. **Test** all vendor combinations (16 combos: 2 keys × 2 formats × 2 stream × 2 tools)
3. **Log** tool call accumulation steps
4. **Monitor** tool call failure rate
5. **Fallback** to non-streaming for problematic vendors
