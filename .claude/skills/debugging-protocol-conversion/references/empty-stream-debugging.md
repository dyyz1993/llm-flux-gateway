# Empty Stream Debugging

## Problem

Client receives no chunks or incomplete stream response.

## Diagnosis Commands

```bash
# Find all failed/unknown status conversions
grep -B5 "Status: \(failed\|unknown\)" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Check for empty chunk messages
grep "Empty chunk detected" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Look for meaningful chunk filter issues
grep "isChunkMeaningful" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

## Common Causes

### 1. isChunkMeaningful() Returns False

**Symptom**: All chunks filtered out

**Location**: `/src/server/module-protocol-transpiler/converters/*.converter.ts`

**Example from OpenAI converter**:
```typescript
if (!this.isChunkMeaningful(chunk)) {
  console.log('[OpenAIConverter] Empty chunk detected, returning empty string');
  return success('', metadata);  // Returns empty string
}
```

**Debug steps**:
1. Check what fields are present in chunk
2. Verify `isChunkMeaningful()` logic
3. Ensure at least role or content is present

### 2. Missing finish_reason Chunk

**Symptom**: Stream ends without completion

**Expected pattern**:
- Content chunks: `delta.content = "text"`
- Final chunk: `delta.finish_reason = "stop"`

**Debug**:
```bash
# Check if finish_reason is present
grep "finish_reason" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### 3. Empty Delta Fields

**Symptom**: All delta fields are empty objects

**Example problematic chunk**:
```json
{
  "choices": [{
    "index": 0,
    "delta": {},  // All fields empty
    "finish_reason": null
  }]
}
```

**Fix**: Ensure at least one meaningful field in each chunk

## Vendor-Specific Issues

### OpenAI

- **Issue**: Streaming tool_calls without content
- **Check**: `delta.tool_calls` array population
- **Fix**: Ensure tool_calls chunks include index and function

### Anthropic

- **Issue**: Content blocks without text
- **Check**: `content_block.type` and `content_block.text`
- **Fix**: Validate content block structure

### Gemini

- **Issue**: Empty candidates array
- **Check**: `candidates[0].content.parts`
- **Fix**: Verify parts array has content

### GLM

- **Issue**: Incomplete tool_calls in stream
- **Check**: `finish_reason: "tool_calls"` without actual tool_calls
- **Fix**: Handle GLM-specific streaming pattern

## Debugging Workflow

1. **Identify Request ID**
   ```bash
   grep -l "Status: failed\|Status: unknown" logs/protocol-transformation/*.log
   ```

2. **Read Full Log**
   - Check Raw SSE input
   - Verify Internal Format parsing
   - Inspect Client Format output

3. **Locate Failure Point**
   - Parse failure? → Check parser
   - Conversion failure? → Check converter
   - Filter failure? → Check isChunkMeaningful

4. **Verify Expected Output**
   - Compare with working similar request
   - Check vendor documentation
   - Test with minimal example

## Fixes

### Quick Fix: Disable Filtering

For testing only:
```typescript
// In converter, temporarily bypass filter
// if (!this.isChunkMeaningful(chunk)) {
//   return success('', metadata);
// }
```

### Proper Fix: Update isChunkMeaningful

```typescript
private isChunkMeaningful(chunk: InternalStreamChunk): boolean {
  // Check for content
  if (chunk.delta.content) return true;

  // Check for role
  if (chunk.delta.role) return true;

  // Check for tool calls
  if (chunk.delta.tool_calls && chunk.delta.tool_calls.length > 0) return true;

  // Check for finish_reason (always meaningful)
  if (chunk.finish_reason) return true;

  return false;
}
```

### Ensure finish_reason Transmission

```typescript
// Always send finish_reason chunk
if (chunk.finish_reason) {
  return success(formattedChunk, metadata);
}
```

## Prevention

1. **Add tests** for edge cases
2. **Log chunk content** before filtering
3. **Validate** vendor response format
4. **Monitor** empty chunk rate in production
