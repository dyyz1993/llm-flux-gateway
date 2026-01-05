# Performance Analysis

## Overview

Debugging performance issues in protocol conversion: slow TTFB, high latency, processing bottlenecks.

## Metrics

### Key Performance Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| TTFB (Time To First Byte) | Latency to first chunk | <500ms |
| Chunk Processing Time | Time per chunk conversion | <10ms |
| Total Duration | End-to-end request time | <5000ms |
| Chunk Count | Number of chunks processed | Variable |

### Reading Duration from Logs

```bash
# Check duration of specific request
grep "Duration:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Find slowest requests
grep "Duration:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  sort -t: -k2 -rn | head -10

# Requests over 1 second
grep "Duration:.*[1-9][0-9][0-9][0-9]ms" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

## Performance Bottlenecks

### 1. High Chunk Count

**Symptom**: Many chunks → high processing time

**Diagnosis**:
```bash
# Count chunks per request
grep "Chunk #" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/REQUEST-ID.log | wc -l

# Find requests with most chunks
for f in /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log; do
  count=$(grep "Chunk #" "$f" | wc -l)
  echo "$count $f"
done | sort -rn | head -10
```

**Impact**:
- 100 chunks × 5ms/chunk = 500ms overhead
- Each chunk requires parse + convert + format

**Optimization**:
- Batch small chunks
- Use chunk merging
- Reduce logging overhead

### 2. Tool Call Processing

**Symptom**: Tool calls slower than text-only

**Diagnosis**:
```bash
# Compare durations
grep -B1 "tool_calls" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep "Duration:"

# Compare tool vs non-tool requests
grep -l "tool" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  while read f; do grep "Duration:" "$f"; done | \
  awk '{sum+=$2; n++} END {print "Avg with tools:", sum/n, "ms"}'
```

**Causes**:
- Tool call accumulation
- Argument string building
- Complex format conversion

**Optimization**:
- Cache tool call state
- Optimize argument concatenation
- Pre-build tool call templates

### 3. Format Conversion Overhead

**Symptom**: Cross-format conversions slower

**Diagnosis**:
```bash
# Compare format combinations
grep "Internal Format\|Client Format" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  paste - - | awk '{print $4, $6}' | sort | uniq -c
```

**Example output**:
```
10 openai → openai
5 openai → anthropic
3 anthropic → openai
```

**Cost**:
- Same format: ~1ms/chunk
- Cross format: ~5ms/chunk (5× slower)

**Optimization**:
- Use same format when possible
- Optimize hot paths
- Cache conversion results

### 4. JSON Parsing/Serialization

**Symptom**: CPU time in JSON operations

**Diagnosis**:
```bash
# Check for large JSON
wc -c /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | sort -rn

# Profile JSON parsing
# (Requires code instrumentation)
```

**Optimization**:
- Use faster JSON parser (e.g., simdjson if available)
- Minimize JSON size in logs
- Stream JSON instead of full parse

## Performance Debugging Workflow

### 1. Identify Slow Request

```bash
# Find slowest requests today
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/ -daystart -name "*.log" \
  -exec grep -H "Duration:" {} \; | \
  sort -t: -k2 -rn | head -10
```

### 2. Analyze Request Characteristics

```bash
# For a slow request, check:
REQUEST_ID="slow-request-id"
LOG="/Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/$REQUEST_ID.log"

# Chunk count
echo "Chunks: $(grep 'Chunk #' "$LOG" | wc -l)"

# Format conversion
echo "Format: $(grep 'Internal Format\|Client Format' "$LOG" | paste - - | head -1)"

# Tool calls
echo "Tools: $(grep -c 'tool' "$LOG")"

# Warnings
echo "Warnings: $(grep -c '⚠️' "$LOG")"
```

### 3. Identify Bottleneck

| High Value | Likely Cause | Fix |
|------------|--------------|-----|
| Chunk count >100 | Many small chunks | Batch/merge |
| Duration + tools | Tool call overhead | Optimize accumulation |
| Cross-format | Conversion cost | Cache/optimize |
| Many warnings | Field processing | Reduce logging |

### 4. Profile Code

Add timing to converters:

```typescript
// In converter
const start = Date.now();

// ... conversion code ...

const elapsed = Date.now() - start;
if (elapsed > 10) {
  console.log(`[Converter] Slow chunk: ${elapsed}ms`);
}
```

## Performance Optimization

### Optimization 1: Reduce Logging

**Problem**: Excessive logging slows processing

**Solution**:
```typescript
// Only log warnings/errors in production
if (process.env.NODE_ENV === 'production') {
  // Log only issues
} else {
  // Log everything for debugging
}
```

### Optimization 2: Chunk Batching

**Problem**: Many small chunks inefficient

**Solution**:
```typescript
// Batch chunks before processing
const BATCH_SIZE = 10;
let chunkBuffer: Chunk[] = [];

function processChunk(chunk: Chunk) {
  chunkBuffer.push(chunk);

  if (chunkBuffer.length >= BATCH_SIZE || chunk.isLast) {
    // Process batch
    convertBatch(chunkBuffer);
    chunkBuffer = [];
  }
}
```

### Optimization 3: Cache Conversion Logic

**Problem**: Repeated format conversion

**Solution**:
```typescript
// Cache converter instances
const converterCache = new Map<string, Converter>();

function getConverter(from: string, to: string): Converter {
  const key = `${from}-${to}`;
  if (!converterCache.has(key)) {
    converterCache.set(key, new Converter(from, to));
  }
  return converterCache.get(key)!;
}
```

### Optimization 4: Optimize Hot Paths

**Problem**: Frequently-called code is slow

**Profile**:
```bash
# Use Node.js profiler
node --prof script.js
node --prof-process isolate-*.log > profile.txt
```

**Optimize**:
- Inline small functions
- Avoid object creation in loops
- Use arrays instead of objects where possible

## Performance Targets

### By Request Type

| Type | Target TTFB | Target Duration |
|------|-------------|-----------------|
| Simple text | <200ms | <1000ms |
| Long text | <200ms | <5000ms |
| With tools | <300ms | <2000ms |
| Cross-format | <300ms | <3000ms |
| Streaming | <200ms | N/A |

### By Chunk Count

| Chunks | Expected Duration |
|--------|-------------------|
| 1-10 | <100ms |
| 10-50 | <500ms |
| 50-100 | <1000ms |
| 100-500 | <2000ms |
| 500+ | <5000ms |

## Monitoring

### Production Metrics

Track these metrics:

```typescript
// In gateway controller
const metrics = {
  requestCount: 0,
  totalDuration: 0,
  slowRequests: 0,  // >2000ms
  failedRequests: 0,
  avgChunkCount: 0,
};

// Log summary
console.log('[Metrics]', {
  avgDuration: metrics.totalDuration / metrics.requestCount,
  slowRate: metrics.slowRequests / metrics.requestCount,
  failRate: metrics.failedRequests / metrics.requestCount,
});
```

### Alerting

Set up alerts for:

- **Slow requests**: >5000ms (investigate)
- **High failure rate**: >5% (urgent)
- **High TTFB**: >1000ms (check upstream)
- **Memory growth**: Continuous increase (leak)

## Debugging Commands Reference

```bash
# Quick performance check
echo "=== Performance Summary ==="
echo "Total requests: $(ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | wc -l)"
echo "Avg duration: $(grep "Duration:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | awk -F: '{sum+=$2; n++} END {print sum/n "ms"}')"
echo "Slow requests (>1000ms): $(grep "Duration:.*[1-9][0-9][0-9][0-9]ms" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | wc -l)"

# Find top slowest
echo "=== Top 5 Slowest ==="
grep "Duration:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  sort -t: -k2 -rn | head -5

# Performance by format
echo "=== By Format ==="
for format in openai anthropic gemini glm; do
  echo -n "$format: "
  grep -i "$format" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
    grep "Duration:" | \
    awk -F: '{sum+=$2; n++} END {print (n ? sum/n "ms" : "N/A")}'
done
```
