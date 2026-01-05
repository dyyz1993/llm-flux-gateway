# Common Debugging Queries

This document provides ready-to-use bash commands for common debugging scenarios.

## Quick Reference

| Query Type | Use Case | Command Template |
|------------|----------|------------------|
| UUID Suffix | Recent logs with 6-char suffix | `find logs/ -name "*SUFFIX*"` |
| Full UUID | Exact request match | `grep -r "UUID" logs/` |
| Time Range | Logs within time window | `find logs/ -mmin -N` |
| Vendor | Provider-specific logs | `grep -l "VENDOR" logs/` |
| Status | Conversion result | `grep -l "Status: X" logs/` |

## UUID-Based Searches

### By UUID Suffix (New Format)

**When to use**: Searching for recent logs with UUID suffix in filename

**File naming**:
- Protocol Transformation: `{UUID}-{suffix}-{timestamp}.log`
- SSE Traces: `{vendor}-{suffix}-{timestamp}.log`

**Example suffix**: `a6a3b6` (last 6 chars of UUID `4e8685a6a3b6`)

```bash
# Find by suffix in filename (fastest)
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/ \
  -name "*a6a3b6*" -type f

find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/ \
  -name "*a6a3b6*" -type f

# List and grep
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/ | \
  grep a6a3b6

# Search in file content (slower but thorough)
grep -r "a6a3b6" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/

# Combined search (both filename and content)
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ \
  -name "*a6a3b6*" -o -exec grep -l "a6a3b6" {} \;
```

**Real-world example**:
```bash
# User reports issue with UUID ending in cb1b13
SUFFIX="cb1b13"

# Find all related logs
find logs/ -name "*${SUFFIX}*" -type f

# Output:
# logs/protocol-transformation/4346b7e7-95b3-4014-8a99-8feb62a80a20-cb1b13-1767495623000.log
# logs/sse-traces/openai-cb1b13-1767495623000.log
```

### By Full UUID

**When to use**: Exact request ID known, or suffix search fails

```bash
# Search by full UUID in log content
UUID="4346b7e7-95b3-4014-8a99-8feb62a80a20"

grep -r "$UUID" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/

# Find by partial UUID (first 8 chars)
grep -r "4346b7e7" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/

# Search in filenames
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*${UUID}*.log
```

### Extract UUID from Log

```bash
# Get Request ID from log header
grep "Request ID:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Extract only the UUID
grep "Request ID:" logs/protocol-transformation/*.log | \
  sed -E 's/.*Request ID: ([0-9a-f-]+).*/\1/'

# Get UUID suffix (last 6 chars)
grep "Request ID:" logs/protocol-transformation/*.log | \
  sed -E 's/.*Request ID: [0-9a-f-]+([0-9a-f]{6}).*/\1/'
```

## Time-Based Searches

### Recent Logs

```bash
# Last 10 minutes
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -mmin -10 -name "*.log"

# Last hour
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -mmin -60 -name "*.log"

# Last 24 hours
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -mtime -1 -name "*.log"
```

### Specific Time Range

```bash
# Between two timestamps
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/ \
  -newermt "2026-01-04 10:00" \
  ! -newermt "2026-01-04 11:00" \
  -name "*.log"

# By modification time (more precise)
touch -t 202601041000 /tmp/start
touch -t 202601041100 /tmp/end
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ \
  -newer /tmp/start ! -newer /tmp/end -name "*.log"
```

### Latest N Logs

```bash
# Latest 5 transformation logs
ls -lt /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  head -5 | awk '{print $NF}'

# Latest 10 SSE traces
ls -lt /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/*.log | \
  head -10 | awk '{print $NF}'
```

## Vendor-Specific Searches

### OpenAI

```bash
# Protocol transformation logs
grep -l "Internal Format (openai)" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# SSE traces
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/openai-*.log

# Find OpenAI-specific issues
grep -i "openai" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "error\|failed\|warning"
```

### Anthropic

```bash
# Protocol transformation logs
grep -l "Internal Format (anthropic)" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# SSE traces
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/anthropic-*.log

# Find content block issues
grep -i "content_block\|content-block" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### Gemini

```bash
# Protocol transformation logs
grep -l "Internal Format (gemini)" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# SSE traces
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/gemini-*.log

# Find functionCall vs tool_calls issues
grep -i "functionCall\|tool_calls" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### GLM (Zhipu AI)

```bash
# Protocol transformation logs
grep -l "Internal Format (glm)" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# SSE traces
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/glm-*.log

# Find streaming tool call issues
grep -i "tool_call" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "glm"
```

## Status-Based Searches

### Failed Conversions

```bash
# Find all failed conversions
grep -l "Status: failed" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Get context around failures
grep -B10 "Status: failed" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Count failures
grep -c "Status: failed" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  awk -F: '$2 > 0 {sum+=$2} END {print "Total failures:", sum}'
```

### Warnings

```bash
# Find warnings
grep -l "Status: warning" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Count ignored fields
grep "Ignored field" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  sort | uniq -c | sort -rn
```

### Unknown Status

```bash
# Find unknown status (potential issues)
grep -l "Status: unknown" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Check for empty chunks
grep "Empty chunk" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

## Field-Specific Searches

### Tool Calls

```bash
# Find tool call conversions
grep -i "tool_call\|toolCall\|tool-use" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Track tool_calls field through conversion
grep "tool_calls" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  head -20

# Find ignored tool fields
grep "ignored.*tool" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### Content Fields

```bash
# Find content block conversions
grep -i "content" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "block\|delta"

# Check for empty content
grep -A5 "Internal Format" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -B2 -A2 '"content":\s*\[\]'
```

### Finish Reasons

```bash
# Find finish_reason handling
grep "finish_reason" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Check for missing finish_reason
grep -C3 "Status: failed" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "finish"
```

### Token Counts

```bash
# Find usage/token fields
grep -i "usage\|token" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Check for zero token counts
grep -i '"prompt_tokens":\s*0\|"completion_tokens":\s*0' \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

## Performance Queries

### Slow Conversions

```bash
# Find conversions >1000ms
grep "Duration:.*[1-9][0-9][0-9][0-9]ms" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Find conversions >5000ms
grep "Duration:.*[5-9][0-9][0-9][0-9]ms\|Duration:.*[1-9][0-9][0-9][0-9][0-9]ms" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Sort by duration (slowest first)
grep "Duration:" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  sed -E 's/.*Duration: ([0-9]+)ms.*/\1 ms\t&/' | \
  sort -rn | head -10
```

### High Chunk Count

```bash
# Count chunks per file
for file in /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log; do
  count=$(grep -c "Chunk #" "$file")
  echo "$count $file"
done | sort -rn | head -10
```

### Average Duration by Vendor

```bash
# Calculate average conversion time per vendor
for vendor in openai anthropic gemini glm; do
  echo "Vendor: $vendor"
  grep "Internal Format ($vendor)" \
    /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log -A1 | \
    grep "Duration:" | \
    sed -E 's/.*Duration: ([0-9]+)ms.*/\1/' | \
    awk '{sum+=$1; count++} END {if(count>0) print "  Avg:", sum/count, "ms (" count " samples)"}'
done
```

## Cross-Log Correlation

### Match Protocol Transformation with SSE Trace

```bash
# By timestamp
TIMESTAMP="1767496729144"
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*${TIMESTAMP}*.log
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/*${TIMESTAMP}*.log

# By UUID suffix
SUFFIX="a6a3b6"
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*${SUFFIX}*.log
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/*${SUFFIX}*.log

# Correlate automatically
for pt_log in /Users/xuyzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*-*.log; do
  suffix=$(basename "$pt_log" | sed -E 's/.*-([0-9a-f]{6})-[0-9]{13}\.log/\1/')
  echo "Protocol Transformation: $pt_log"
  echo "SSE Trace:"
  ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/*${SUFFIX}*.log 2>/dev/null || echo "  Not found"
  echo
done
```

### Find Related Logs by Time Window

```bash
# Find all logs within 1 second of a given log
REFERENCE_LOG="logs/protocol-transformation/a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log"
REF_TIME=$(stat -f "%m" "$REFERENCE_LOG")

# Find logs modified within 1 second before or after
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ \
  -newermt "$REF_TIME -1 second" \
  ! -newermt "$REF_TIME +1 second" \
  -name "*.log"
```

## Advanced Queries

### Find Conversion Chains

```bash
# Find all conversions from vendor A to vendor B
SOURCE="openai"
TARGET="anthropic"

grep -l "Internal Format ($SOURCE)" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  while read file; do
    if grep -q "Client Format ($TARGET)" "$file"; then
      echo "$file"
    fi
  done
```

### Extract Specific Chunk

```bash
# Get chunk #5 from a log
sed -n '/\[Chunk #005\]/,/\[Chunk #006\]/p' \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/LOG_FILE

# Alternative: Extract chunk by number
awk '/\[Chunk #005\]/,/\[Chunk #006\]|\[Status:/ {
  if (!/\[Chunk #006\]/) print
}' /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/LOG_FILE
```

### Compare Input vs Output

```bash
# Extract Raw SSE and Client Format side-by-side
LOG_FILE="/Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/LOG_FILE"

echo "=== Raw SSE ==="
sed -n '/Raw SSE/,/┘/p' "$LOG_FILE" | head -20

echo "=== Client Format ==="
sed -n '/Client Format/,/┘/p' "$LOG_FILE" | head -20
```

### Field Transformation Path

```bash
# Track a specific field through all conversion stages
FIELD="tool_calls"

grep -A20 "Raw SSE" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep "$FIELD"

grep -A20 "Internal Format" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep "$FIELD"

grep -A20 "Client Format" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep "$FIELD"
```

## Troubleshooting Queries

### Empty Stream Diagnosis

```bash
# Check for empty chunks
grep -i "empty" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log

# Check for missing finish_reason
grep -A5 "Status: unknown\|Status: failed" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "finish"

# Check meaningful chunk filter
grep "isChunkMeaningful" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### Tool Call Diagnosis

```bash
# Check tool call presence in input
grep -A10 "Raw SSE" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "tool"

# Check tool call in internal format
grep -A10 "Internal Format" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "tool"

# Check tool call in output
grep -A10 "Client Format" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  grep -i "tool"
```

### Performance Diagnosis

```bash
# Check conversion duration
grep "Duration:" \
  /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  sort -t: -k2 -rn | head -10

# Check chunk count distribution
for file in /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log; do
  echo "$(grep -c "Chunk #" "$file") chunks: $(basename "$file")"
done | sort -rn | head -10
```

## Summary Tables

### Quick Command Reference

| Goal | Command |
|------|---------|
| Find by UUID suffix | `find logs/ -name "*SUFFIX*"` |
| Find by full UUID | `grep -r "UUID" logs/` |
| Latest logs | `ls -lt logs/*.log \| head -10` |
| Failed conversions | `grep -l "Status: failed" logs/` |
| Vendor-specific | `grep -l "VENDOR" logs/` |
| Slow conversions | `grep "Duration:.*[0-9][0-9][0-9][0-9]ms" logs/` |
| Tool call issues | `grep -i "tool" logs/` |
| Empty streams | `grep -i "empty\|unknown" logs/` |

### Log Location Paths

| Log Type | Path |
|----------|------|
| Protocol Transformation | `/Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/` |
| SSE Traces | `/Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/` |

### File Naming Patterns

| Log Type | Pattern | Example |
|----------|---------|---------|
| Protocol Transformation (Old) | `{UUID}-{timestamp}.log` | `4346b7e7-...-1767495623000.log` |
| Protocol Transformation (New) | `{UUID}-{suffix}-{timestamp}.log` | `4346b7e7-...-cb1b13-1767495623000.log` |
| SSE Traces (Old) | `{vendor}-{timestamp}.log` | `openai-1767495623000.log` |
| SSE Traces (New) | `{vendor}-{suffix}-{timestamp}.log` | `openai-cb1b13-1767495623000.log` |

## Tips and Tricks

1. **Use UUID suffix first** - It's the fastest search method for recent logs
2. **Fall back to full UUID** - If suffix search fails, use full UUID
3. **Cross-reference logs** - Always check both protocol-transformation and sse-traces
4. **Check status first** - Look at `Status:` line before diving into details
5. **Time-based searches** - Use when you don't have the UUID
6. **Vendor-specific searches** - Narrow down by provider when possible
7. **Save complex queries** - Create shell scripts for frequently used searches
8. **Use grep with context** - `-B5 -A5` shows what happened before/after
9. **Count occurrences** - `uniq -c` helps identify patterns
10. **Sort by relevance** - `sort -rn` puts most important results first

## See Also

- [SKILL.md](../SKILL.md) - Main debugging skill documentation
- [log-format-details.md](log-format-details.md) - Detailed log format specification
- [failure-cases.md](failure-cases.md) - Common failure patterns and solutions
