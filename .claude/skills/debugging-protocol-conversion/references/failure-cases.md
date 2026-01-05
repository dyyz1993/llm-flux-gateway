# Failure Cases and Solutions

This document documents common failure patterns in protocol conversion, their root causes, debugging methods, and solutions.

## Table of Contents

1. [UUID Search Failures](#uuid-search-failures)
2. [Field Naming Inconsistencies](#field-naming-inconsistencies)
3. [Empty Response Data](#empty-response-data)
4. [Tool Call Conversion Failures](#tool-call-conversion-failures)
5. [Streaming Parsing Errors](#streaming-parsing-errors)
6. [Format Detection Issues](#format-detection-issues)
7. [Performance Degradation](#performance-degradation)

---

## UUID Search Failures

### Failure Case 1: UUID Suffix Not Found

**Symptom**:
```bash
$ find logs/ -name "*cb1b13*" -type f
# No results
```

**Root Cause**:
- Old log files don't include UUID suffix in filename
- Suffix-based search only works for logs created after the enhancement
- User searching for old log using new search method

**Diagnosis**:
```bash
# Check if logs exist at all
ls -la logs/protocol-transformation/
ls -la logs/sse-traces/

# Check file naming pattern
ls logs/protocol-transformation/ | grep "1767495623000"

# Old format output:
# 4346b7e7-95b3-4014-8a99-8feb62a80a20-1767495623000.log
# (no 6-char suffix)

# New format output:
# 4346b7e7-95b3-4014-8a99-8feb62a80a20-cb1b13-1767495623000.log
# (includes cb1b13 suffix)
```

**Solution**:
```bash
# For old logs, use full UUID or timestamp
UUID="4346b7e7-95b3-4014-8a99-8feb62a80a20"
TIMESTAMP="1767495623000"

# Search by full UUID
grep -r "$UUID" logs/protocol-transformation/
grep -r "$UUID" logs/sse-traces/

# Or search by timestamp
ls logs/protocol-transformation/*${TIMESTAMP}*.log
ls logs/sse-traces/*${TIMESTAMP}*.log
```

**Prevention**:
- Document when UUID suffix was added to log format
- Use hybrid search (try suffix first, fall back to full UUID)
- Add log format version indicator

**Reference**: [common-queries.md](common-queries.md#uuid-based-searches)

---

### Failure Case 2: UUID Fragment Too Short

**Symptom**:
```bash
$ find logs/ -name "*a6a*" -type f
# Returns hundreds of unrelated logs
```

**Root Cause**:
- UUID fragment too short (less than 6 characters)
- High collision probability with short fragments
- Matches multiple unrelated logs

**Diagnosis**:
```bash
# Count matches
find logs/ -name "*a6a*" -type f | wc -l
# Output: 247 (too many)

# Check specificity
find logs/ -name "*a6a3b6*" -type f | wc -l
# Output: 2 (reasonable)
```

**Solution**:
```bash
# Use minimum 6-character suffix
SUFFIX="a6a3b6"  # Last 6 chars of UUID
find logs/ -name "*${SUFFIX}*" -type f

# Or use full UUID for certainty
UUID="4e8685a6a3b6"
grep -r "$UUID" logs/
```

**Best Practice**:
- Always use 6+ character UUID fragments
- Prefer full UUID when possible
- Verify match count is reasonable (<10)

---

## Field Naming Inconsistencies

### Failure Case 3: Snake Case to Camel Case Conversion

**Symptom**:
```
Upstream API Error: Field 'numResults' is not recognized
Expected: 'num_results'
```

**Root Cause**:
- Internal format changed field naming convention
- Upstream API expects snake_case (`num_results`)
- Converter output camelCase (`numResults`)
- Field normalization applied inconsistently

**Example**:
```json
// Upstream GLM API expects
{
  "num_results": 10
}

// But internal format converted to
{
  "numResults": 10
}

// Result: Upstream rejects the request
```

**Diagnosis**:
```bash
# Check field transformation in logs
grep -r "num_results\|numResults" logs/protocol-transformation/*.log

# Look for field normalization
grep "Field Normalizer" logs/protocol-transformation/*.log

# Compare input vs output
grep -A20 "Raw SSE" logs/protocol-transformation/*.log | grep "num"
grep -A20 "Client Format" logs/protocol-transformation/*.log | grep "num"
```

**Solution**:
1. **Preserve original field naming** in internal format
2. **Only normalize at the edge** (client/target conversion)
3. **Document naming conventions** per vendor

```typescript
// Don't do this:
interface InternalFormat {
  numResults: number;  // ❌ Changes convention
}

// Do this instead:
interface InternalFormat {
  num_results?: number;  // ✅ Preserves original
  numResults?: number;   // ✅ Alternative naming
  _raw?: any;            // ✅ Fallback for unknown fields
}
```

**Prevention**:
- Use field normalizer only for output, not storage
- Keep original field names in internal format
- Add vendor-specific naming overrides
- Document field naming requirements

**Reference**: `/src/server/module-protocol-transpiler/utils/field-normalizer.ts`

---

### Failure Case 4: Inconsistent Field Names Across Vendors

**Symptom**:
```
Tool call field not found in OpenAI format
Expected: tool_calls
Actual: toolCalls
```

**Root Cause**:
- Different vendors use different naming conventions
- Field normalizer not applied consistently
- Target format requirements not respected

**Vendor Field Names**:

| Field | OpenAI | Anthropic | Gemini | GLM |
|-------|--------|-----------|---------|-----|
| Tool Calls | `tool_calls` | `tool_use` | `functionCall` | `tool_calls` |
| Content | `content` | `content_blocks` | `contents` | `content` |
| Finish Reason | `finish_reason` | `stop_reason` | `finishReason` | `finish_reason` |

**Diagnosis**:
```bash
# Check field names in conversion
grep -i "tool_call\|toolCall\|tool-use" \
  logs/protocol-transformation/*.log | \
  grep -i "Internal Format\|Client Format"

# Look for ignored fields
grep "Ignored field.*tool" logs/protocol-transformation/*.log
```

**Solution**:
```typescript
// Use vendor-specific field mappings
const VENDOR_FIELD_MAPPINGS = {
  openai: {
    toolCalls: 'tool_calls',
    finishReason: 'finish_reason'
  },
  anthropic: {
    toolCalls: 'tool_use',
    finishReason: 'stop_reason'
  },
  gemini: {
    tool_calls: 'functionCall',
    finish_reason: 'finishReason'
  }
};
```

**Prevention**:
- Document vendor-specific field names
- Use format-specific converters
- Validate output against vendor schemas
- Test cross-vendor conversions

---

## Empty Response Data

### Failure Case 5: All Token Counts Are Zero

**Symptom**:
```json
{
  "prompt_tokens": 0,
  "completion_tokens": 0,
  "total_tokens": 0
}
```

**Root Cause**:
Multiple possible causes:
1. **Upstream API returned empty response**
2. **Streaming response not fully parsed**
3. **Token counting logic not applied**
4. **Usage metadata not extracted**

**Diagnosis**:
```bash
# Check upstream response
grep -A20 "Raw SSE" logs/protocol-transformation/*.log | grep -i "usage\|token"

# Check internal format
grep -A20 "Internal Format" logs/protocol-transformation/*.log | grep -i "usage\|token"

# Check output format
grep -A20 "Client Format" logs/protocol-transformation/*.log | grep -i "usage\|token"

# Check for parse errors
grep -i "error\|failed\|warning" logs/protocol-transformation/*.log | grep -i "parse\|token"
```

**Solutions by Cause**:

**Cause 1: Upstream returned empty**
```bash
# Check SSE traces for raw response
cat logs/sse-traces/*REQUEST_ID*.log

# If truly empty, issue is with upstream API
# Contact vendor or check API quota
```

**Cause 2: Streaming not fully parsed**
```bash
# Check for incomplete chunks
grep "Chunk #" logs/protocol-transformation/*.log | tail -5

# Look for unfinished streams
grep -i "finish_reason\|stop_reason" logs/protocol-transformation/*.log
```

**Cause 3: Token counting not applied**
```typescript
// Ensure token counting is enabled
const options = {
  countTokens: true,  // ✅ Enable token counting
  extractUsage: true  // ✅ Extract usage metadata
};
```

**Cause 4: Usage metadata not extracted**
```bash
# Check if usage field is parsed
grep "usage" logs/protocol-transformation/*.log | grep -i "ignored\|missing"
```

**Prevention**:
- Always validate upstream response
- Ensure stream completion (finish_reason)
- Enable token counting in converters
- Test with real API responses

---

### Failure Case 6: Empty Content in Stream

**Symptom**:
```json
{
  "choices": [{
    "delta": {
      "content": ""
    }
  }]
}
```

**Root Cause**:
- `isChunkMeaningful()` filter too aggressive
- Delta content extraction failed
- Content field mapping incorrect

**Diagnosis**:
```bash
# Check meaningful chunk filter
grep "isChunkMeaningful" logs/protocol-transformation/*.log

# Look for empty content warnings
grep "Empty content" logs/protocol-transformation/*.log

# Check delta extraction
grep -A10 "Internal Format" logs/protocol-transformation/*.log | grep "content"
```

**Solution**:
```typescript
// Don't filter out chunks with potential
function isChunkMeaningful(chunk: InternalStreamChunk): boolean {
  // ✅ Check multiple fields
  return !!(
    chunk.delta?.content ||
    chunk.delta?.tool_calls ||
    chunk.delta?.reasoning ||
    chunk.finish_reason ||
    chunk.usage
  );
}
```

**Prevention**:
- Consider all meaningful fields, not just content
- Log filtered chunks with reason
- Test with various response types
- Document filter criteria

**Reference**: [empty-stream-debugging.md](empty-stream-debugging.md)

---

## Tool Call Conversion Failures

### Failure Case 7: Tool Calls Not Appearing in Output

**Symptom**:
```
Input: Contains tool_calls in Raw SSE
Output: No tool_calls in Client Format
```

**Root Cause**:
- Tool call field name mismatch
- Tool call not extracted to internal format
- Tool call filtered out by `isChunkMeaningful()`
- Tool call structure not compatible with target format

**Diagnosis**:
```bash
# Check input
grep -A20 "Raw SSE" logs/protocol-transformation/*.log | grep -i "tool"

# Check internal format
grep -A20 "Internal Format" logs/protocol-transformation/*.log | grep -i "tool"

# Check output
grep -A20 "Client Format" logs/protocol-transformation/*.log | grep -i "tool"

# Look for ignored tool fields
grep "ignored.*tool" logs/protocol-transformation/*.log

# Check meaningful chunk filter
grep "isChunkMeaningful.*tool" logs/protocol-transformation/*.log
```

**Solution**:
```typescript
// Ensure tool calls are extracted
function extractToolCalls(delta: any): ToolCall[] {
  // ✅ Handle multiple field names
  const toolCalls =
    delta.tool_calls ||      // OpenAI/GLM
    delta.toolCalls ||       // Camel case variant
    delta.tool_use ||        // Anthropic
    delta.functionCall ||    // Gemini
    [];

  return Array.isArray(toolCalls) ? toolCalls : [toolCalls];
}

// Ensure tool calls pass meaningful filter
function isChunkMeaningful(chunk: InternalStreamChunk): boolean {
  return !!(
    chunk.delta?.content ||
    chunk.delta?.tool_calls?.length > 0 ||  // ✅ Check tool calls
    chunk.delta?.reasoning ||
    chunk.finish_reason
  );
}
```

**Prevention**:
- Support all vendor tool call field names
- Test tool call conversion across all formats
- Log tool call extraction details
- Validate output format includes tool calls

**Reference**: [tool-call-debugging.md](tool-call-debugging.md)

---

### Failure Case 8: GLM Incomplete Tool Calls in Stream

**Symptom**:
```
GLM stream: tool_calls array incomplete
Expected: {index, id, type, function}
Actual: {index, function: {name}}
```

**Root Cause**:
- GLM streaming format sends tool call parts incrementally
- First chunk: function name
- Later chunk: arguments
- Converter doesn't accumulate partial tool calls

**Example GLM Stream**:
```json
// Chunk 1
{"tool_calls": [{"index": 0, "function": {"name": "get_weather"}}]}

// Chunk 2
{"tool_calls": [{"index": 0, "function": {"arguments": "{\"location\": \"NYC\"}"}}]}
```

**Diagnosis**:
```bash
# Check GLM tool call structure
grep -i "glm.*tool" logs/protocol-transformation/*.log -A10

# Look for incremental tool call building
grep "incremental\|accumulate\|partial" logs/protocol-transformation/*.log | grep -i "tool"
```

**Solution**:
```typescript
// Accumulate tool calls across chunks
class ToolCallAccumulator {
  private pending = new Map<number, ToolCall>();

  addChunk(toolCalls: ToolCall[]): ToolCall[] {
    const complete: ToolCall[] = [];

    for (const tc of toolCalls) {
      const existing = this.pending.get(tc.index);

      if (existing) {
        // Merge with existing
        existing.function.name = tc.function.name || existing.function.name;
        existing.function.arguments =
          (existing.function.arguments || '') + (tc.function.arguments || '');

        // Check if complete
        if (isValidToolCall(existing)) {
          this.pending.delete(tc.index);
          complete.push(existing);
        }
      } else {
        // Start new accumulation
        this.pending.set(tc.index, {...tc, function: {...tc.function}});
      }
    }

    return complete;
  }
}
```

**Prevention**:
- Document GLM streaming behavior
- Implement tool call accumulation
- Test with multi-chunk tool calls
- Log accumulation state

---

## Streaming Parsing Errors

### Failure Case 9: JSON Parse Error in SSE Stream

**Symptom**:
```
Error: Unexpected token < in JSON at position 0
```

**Root Cause**:
- SSE data not valid JSON
- HTML error page instead of JSON
- Truncated JSON chunk
- Invalid escape sequences

**Diagnosis**:
```bash
# Check raw SSE data
cat logs/sse-traces/*REQUEST_ID*.log | head -20

# Look for non-JSON lines
grep "data:" logs/sse-traces/*.log | grep -v "data: {"

# Check for HTML errors
grep -i "html\|error\|exception" logs/sse-traces/*.log
```

**Solution**:
```typescript
// Add SSE parsing error handling
function parseSSELine(line: string): any {
  try {
    const jsonStr = line.replace(/^data:\s*/, '');
    return JSON.parse(jsonStr);
  } catch (error) {
    // ✅ Log problematic line
    logger.error('SSE parse error', { line, error });

    // ✅ Check for HTML error
    if (line.includes('<html>')) {
      throw new Error('Upstream returned HTML instead of JSON');
    }

    // ✅ Check for truncation
    if (!line.trim().endsWith('}')) {
      logger.warn('Possibly truncated JSON', { line });
    }

    return null;
  }
}
```

**Prevention**:
- Validate SSE format before parsing
- Handle non-JSON responses gracefully
- Log parse errors with context
- Implement retry logic for recoverable errors

---

### Failure Case 10: Chunk Desynchronization

**Symptom**:
```
Chunk numbers not sequential
Expected: #001, #002, #003
Actual: #001, #003, #007
```

**Root Cause**:
- Chunks logged out of order
- Some chunks failed to log
- Concurrent requests intermixed
- Logging race condition

**Diagnosis**:
```bash
# Check chunk sequence
grep "Chunk #" logs/protocol-transformation/*.log | cut -d# -f2 | cut -d] -f1 | sort -n | uniq -c

# Look for gaps
grep "Chunk #" logs/protocol-transformation/*.log | awk -F# '{print $2}' | awk -F] '{print $1}' | \
  awk '{if (NR > 1 && $1 != prev + 1) print "Gap at", $1; prev = $1}'
```

**Solution**:
```typescript
// Add chunk sequence validation
class ChunkLogger {
  private expectedChunk = 1;

  logChunk(chunk: any, chunkNum: number) {
    if (chunkNum !== this.expectedChunk) {
      logger.warn('Chunk sequence mismatch', {
        expected: this.expectedChunk,
        actual: chunkNum,
        request_id: this.requestId
      });
    }

    this.expectedChunk = chunkNum + 1;

    // ... rest of logging logic
  }
}
```

**Prevention**:
- Use request-scoped logger
- Validate chunk sequence
- Log chunks atomically
- Handle concurrent requests properly

---

## Format Detection Issues

### Failure Case 11: Format Misidentification

**Symptom**:
```
Detected format: openai
Actual format: anthropic
```

**Root Cause**:
- Format detection heuristics insufficient
- Edge case not covered
- Vendor format similarity
- Malformed request

**Diagnosis**:
```bash
# Check format detection
grep "Format Detection\|Detected format" logs/protocol-transformation/*.log

# Look at raw request structure
grep -A30 "Raw SSE" logs/protocol-transformation/*.log | head -50
```

**Solution**:
```typescript
// Improve format detection with multiple indicators
function detectFormat(request: any): VendorFormat {
  const scores = {
    openai: 0,
    anthropic: 0,
    gemini: 0,
    glm: 0
  };

  // Check field names
  if (request.tool_calls) scores.openai += 2;
  if (request.tool_use) scores.anthropic += 2;
  if (request.functionCall) scores.gemini += 2;
  if (request.model && request.model.startsWith('claude')) scores.anthropic += 1;

  // Check structure
  if (request.candidates) scores.gemini += 2;
  if (request.choices) scores.openai += 1;

  // Check content structure
  if (Array.isArray(request.content)) scores.anthropic += 2;
  if (typeof request.content === 'string') scores.openai += 1;

  // Return highest score
  const maxScore = Math.max(...Object.values(scores));
  const format = Object.keys(scores).find(k => scores[k] === maxScore);

  return format as VendorFormat;
}
```

**Prevention**:
- Use multiple format indicators
- Weight indicators by confidence
- Log detection confidence score
- Allow manual format override

---

## Performance Degradation

### Failure Case 12: Slow Conversion ( >1000ms)

**Symptom**:
```
Duration: 5234ms
Status: success
```

**Root Cause**:
- Large number of chunks
- Complex transformations
- Inefficient algorithms
- Resource contention

**Diagnosis**:
```bash
# Find slow conversions
grep "Duration:.*[1-9][0-9][0-9][0-9]ms" logs/protocol-transformation/*.log

# Check chunk count
grep -c "Chunk #" logs/protocol-transformation/SLOW_LOG.log

# Profile conversion time
grep "Chunk #" logs/protocol-transformation/SLOW_LOG.log | \
  awk -F: '{print $1}' | \
  awk '{if (NR > 1) print $1 - prev, "ms between chunks"; prev = $1}'
```

**Solution**:
```typescript
// Optimize conversion with batching
class BatchConverter {
  private batch: InternalStreamChunk[] = [];
  private readonly BATCH_SIZE = 100;

  addChunk(chunk: InternalStreamChunk): void {
    this.batch.push(chunk);

    if (this.batch.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  private flush(): void {
    // ✅ Process batch efficiently
    const converted = this.batch.map(c => this.convertChunk(c));
    this.writeBatch(converted);
    this.batch = [];
  }
}
```

**Prevention**:
- Implement chunk batching
- Use efficient data structures
- Profile and optimize hot paths
- Monitor conversion metrics

**Reference**: [performance-analysis.md](performance-analysis.md)

---

## Summary Checklist

### Debugging Flow

1. **Identify symptom** - What exactly is failing?
2. **Check logs** - Use appropriate search method
3. **Locate root cause** - Pinpoint failure point
4. **Apply solution** - Fix based on failure type
5. **Verify fix** - Test with similar cases
6. **Document** - Add to failure cases

### Quick Diagnosis Commands

```bash
# UUID search (new logs)
find logs/ -name "*SUFFIX*" -type f

# UUID search (old logs)
grep -r "FULL_UUID" logs/

# Field transformation
grep "FIELD_NAME" logs/protocol-transformation/*.log

# Status check
grep "Status:" logs/protocol-transformation/*.log

# Performance check
grep "Duration:" logs/protocol-transformation/*.log | sort -t: -k2 -rn
```

### Common Solutions

| Problem | Solution |
|---------|----------|
| UUID not found | Use full UUID or timestamp for old logs |
| Field naming wrong | Preserve original names in internal format |
| Empty response | Check upstream, stream completion, token counting |
| Tool calls missing | Support all field names, check filter |
| Parse errors | Validate SSE, handle errors gracefully |
| Slow conversion | Batch processing, optimize algorithms |

### Prevention Strategies

1. **Use UUID suffix** for all new logs
2. **Preserve field names** in internal format
3. **Validate output** against vendor schemas
4. **Log everything** with context
5. **Test edge cases** with real data
6. **Document formats** and their differences
7. **Monitor performance** metrics
8. **Handle errors** gracefully

## See Also

- [common-queries.md](common-queries.md) - Search patterns and queries
- [tool-call-debugging.md](tool-call-debugging.md) - Tool call specific issues
- [empty-stream-debugging.md](empty-stream-debugging.md) - Empty response issues
- [performance-analysis.md](performance-analysis.md) - Performance optimization
- [log-format-details.md](log-format-details.md) - Log format specification
