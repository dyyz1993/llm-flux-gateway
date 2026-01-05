---
name: debugging-protocol-conversion
description: >
  Debugs protocol transformation issues in LLM Flux Gateway by analyzing conversion logs from
  protocol-transformation/ and sse-traces/ directories. Use when: investigating conversion errors,
  ignored fields, warnings, performance issues, or unexpected behavior in protocol transpilation.
  Supports: Request ID tracking, vendor-specific analysis, error diagnosis, field tracing, and
  performance debugging for OpenAI, Anthropic, Gemini, and GLM protocols.
allowed-tools: [Read, Glob, Grep]
---

# Debugging Protocol Conversion

## Quick Start

```bash
# Find latest conversion logs
ls -lt /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/ | head -5

# Search for errors in logs
grep -r "Status: failed" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/

# Find specific Request ID
grep -r "REQUEST-ID" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/
```

## Log Locations

| Directory | Purpose | Format |
|-----------|---------|--------|
| `logs/protocol-transformation/` | Detailed conversion flow | Text with visual boxes |
| `logs/sse-traces/` | Raw SSE data | JSON lines |

**Absolute paths**:
- `/Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/`
- `/Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/`

## Core Workflow

### 1. Identify Problem Type

**Symptom → Log Source**

| Symptom | Primary Log | Secondary Log |
|---------|-------------|---------------|
| Conversion failures | protocol-transformation/ | sse-traces/ |
| Empty responses | protocol-transformation/ | sse-traces/ |
| Tool call issues | protocol-transformation/ | sse-traces/ |
| Performance slow | protocol-transformation/ | - |
| Format differences | protocol-transformation/ | sse-traces/ |

### 2. Locate Relevant Logs

#### By Timestamp (latest first)

```bash
ls -lt logs/protocol-transformation/*.log | head -10
ls -lt logs/sse-traces/*.log | head -10
```

#### By UUID Suffix (Recommended for recent logs)

**New log format includes UUID suffix for easy searching**:

```bash
# Search by 6-character UUID suffix (e.g., a6a3b6)
find logs/protocol-transformation/ -name "*a6a3b6*" -type f
find logs/sse-traces/ -name "*a6a3b6*" -type f

# List logs with specific suffix
ls logs/protocol-transformation/ | grep a6a3b6
ls logs/sse-traces/ | grep a6a3b6

# Search in file content for UUID suffix
grep -r "a6a3b6" logs/protocol-transformation/
grep -r "a6a3b6" logs/sse-traces/
```

**File naming formats**:

| Log Type | Old Format | New Format (with suffix) |
|----------|-----------|--------------------------|
| Protocol Transformation | `{UUID}-{timestamp}.log` | `{UUID}-{suffix}-{timestamp}.log` |
| SSE Traces | `{vendor}-{timestamp}.log` | `{vendor}-{suffix}-{timestamp}.log` |

**Example**:
```
Old: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-1767496729144.log
New: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log
                                                    ^^^^^^
                                                    UUID suffix (last 6 chars)
```

#### By Full Request ID

```bash
# Search for full UUID in log content
grep -l "REQUEST-ID" logs/protocol-transformation/*.log

# Find by full UUID in filename
ls logs/protocol-transformation/*REQUEST-ID*.log
```

#### By Vendor

```bash
# Protocol transformation logs (check content)
grep -l "openai\|anthropic\|gemini\|glm" logs/protocol-transformation/*.log

# SSE traces (check filename prefix)
ls logs/sse-traces/openai-*.log
ls logs/sse-traces/anthropic-*.log
ls logs/sse-traces/gemini-*.log
ls logs/sse-traces/glm-*.log
```

#### By Status

```bash
# Find failed conversions
grep -l "Status: failed" logs/protocol-transformation/*.log

# Find warnings
grep -l "Status: warning" logs/protocol-transformation/*.log

# Find unknown status
grep -l "Status: unknown" logs/protocol-transformation/*.log
```

See [references/common-queries.md](references/common-queries.md) for more search patterns.

### 3. Analyze Conversion Flow

**Read protocol-transformation log structure**:

```
╔══════════════════════════════════════════════════════════════════╗
║           PROTOCOL TRANSFORMATION TRACE LOG                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Request ID: [UUID]                                             ║
║  Timestamp: [ISO 8601]                                          ║
╚══════════════════════════════════════════════════════════════════╝

[Chunk #001] HH:MM:SS.mmm
┌─────────────────────────────────────────────────────────────────┐
│ Raw SSE from Upstream:                                          │
├─────────────────────────────────────────────────────────────────┤
│ data: {...}                                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Internal Format (vendor):                                        │
├─────────────────────────────────────────────────────────────────┤
│ {...}                                                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Client Format (vendor):                                 │
├─────────────────────────────────────────────────────────────────┤
│ data: {...}                                                     │
└─────────────────────────────────────────────────────────────────┘

Status: success | failed | warning | unknown
```

### 4. Cross-Reference with Raw SSE

When protocol-transformation shows issues, check raw SSE:

```bash
# Find corresponding SSE trace by timestamp
grep -l "TIMESTAMP" logs/sse-traces/*.log

# Or by vendor prefix
ls logs/sse-traces/VENDOR-*.log
```

## Common Debugging Scenarios

### Scenario 1: Empty Stream Response

**Trigger**: Client receives no chunks or incomplete stream

**Diagnosis**:

```bash
# Check for empty status
grep -A5 "Status: unknown\|Status: failed" logs/protocol-transformation/*.log

# Look for "Empty chunk detected" messages
grep "Empty chunk" logs/protocol-transformation/*.log

# Check meaningful chunk filter
grep "isChunkMeaningful" logs/protocol-transformation/*.log
```

**Common causes**:
- `isChunkMeaningful()` returning false
- Missing finish_reason chunk
- Delta fields all empty

**Fix location**: `/src/server/module-protocol-transpiler/converters/*.converter.ts`

See [references/empty-stream-debugging.md](references/empty-stream-debugging.md)

### Scenario 2: Tool Call Conversion Failure

**Trigger**: Tools not working across formats (e.g., OpenAI → Anthropic)

**Diagnosis**:

```bash
# Find tool-related conversions
grep -i "tool" logs/protocol-transformation/*.log | head -20

# Check for ignored tool fields
grep "ignored.*tool" logs/protocol-transformation/*.log

# Look for tool_calls in delta
grep "tool_calls" logs/protocol-transformation/*.log
```

**Key fields to trace**:
- `tool_calls` (OpenAI)
- `tool_use` (Anthropic)
- `functionCall` (Gemini)
- `tool_calls` (GLM - may be incomplete in streams)

See [references/tool-call-debugging.md](references/tool-call-debugging.md)

### Scenario 3: Field Ignored Warnings

**Trigger**: Log shows "⚠️ Ignored field: X"

**Diagnosis**:

```bash
# Count ignored fields by type
grep "Ignored field" logs/protocol-transformation/*.log | sort | uniq -c

# Find specific ignored field
grep "Ignored field: specific_field_name" logs/protocol-transformation/*.log
```

**Common ignored fields**:
- Provider-specific metadata (not part of standard)
- Unsupported reasoning features
- Vendor-specific extensions

See [references/field-mapping.md](references/field-mapping.md)

### Scenario 4: Performance Issues

**Trigger**: Slow TTFB or high latency

**Diagnosis**:

```bash
# Check duration in logs
grep "Duration:" logs/protocol-transformation/*.log

# Find slowest requests (>1000ms)
grep "Duration:.*[1-9][0-9][0-9][0-9]ms" logs/protocol-transformation/*.log

# Look for chunk count (high chunk count = slower)
grep "Chunk #" logs/protocol-transformation/*.log | wc -l
```

**Performance factors**:
- Number of chunks processed
- Conversion complexity (tool calls increase time)
- Format conversion overhead

See [references/performance-analysis.md](references/performance-analysis.md)

### Scenario 5: Format-Specific Issues

**By Vendor**:

#### OpenAI
```bash
# OpenAI-specific issues
grep -i "openai" logs/protocol-transformation/*.log
```
Common: finish_reason handling, streaming tool_calls

#### Anthropic
```bash
# Anthropic-specific issues
grep -i "anthropic" logs/protocol-transformation/*.log
```
Common: content blocks, tool_use format, thinking deltas

#### Gemini
```bash
# Gemini-specific issues
grep -i "gemini" logs/protocol-transformation/*.log
```
Common: functionCall vs tool_calls, candidate array

#### GLM (Zhipu AI)
```bash
# GLM-specific issues
grep -i "glm" logs/protocol-transformation/*.log
```
Common: Incomplete tool_calls in stream, non-standard streaming

See [references/vendor-specific-issues.md](references/vendor-specific-issues.md)

## Query Patterns

### Pattern 1: Time-Based Investigation

```bash
# Last hour of logs
find logs/protocol-transformation/ -mmin -60 -name "*.log"

# Specific date range
find logs/protocol-transformation/ -newermt "2026-01-04 10:00" ! -newermt "2026-01-04 11:00"
```

### Pattern 2: Error Aggregation

```bash
# Count error types
grep "Status:" logs/protocol-transformation/*.log | sort | uniq -c

# Find all failures with context
grep -B10 "Status: failed" logs/protocol-transformation/*.log
```

### Pattern 3: Field Transformation Tracking

```bash
# Track specific field through conversion
grep "field_name" logs/protocol-transformation/*.log

# Compare input vs output for a field
grep -A2 "Raw SSE" logs/protocol-transformation/*.log | grep "field_name"
grep -A2 "Client Format" logs/protocol-transformation/*.log | grep "field_name"
```

### Pattern 4: Vendor Conversion Matrix

```bash
# All conversions from vendor A to B
grep "Internal Format (vendor_a)" logs/protocol-transformation/*.log | \
  while read line; do
    file=$(echo "$line" | cut -d: -f1)
    grep "Client Format (vendor_b)" "$file"
  done
```

## Log Analysis Tips

### Reading Protocol Transformation Logs

1. **Start at the end**: Check `Status:` line first
2. **Count chunks**: More chunks = more conversion steps
3. **Look for warnings**: `⚠️` indicates ignored fields
4. **Check duration**: Performance indicator
5. **Compare formats**: Input (Raw SSE) vs Output (Client Format)

### Reading SSE Trace Logs

1. **Format**: `data: {JSON}` lines
2. **Concatenate**: Multiple chunks form complete message
3. **Vendor prefixes**: `gemini-`, `anthropic-`, `openai-`
4. **Timestamps**: ISO 8601 in filename

### Key Conversion Points

| Stage | What to Check |
|-------|---------------|
| Raw SSE | Valid JSON, correct format |
| Internal | Parse success, field extraction |
| Client | Format correctness, field completeness |
| Status | Success/failure, warnings |

## Source Code Locations

| Component | Path |
|-----------|------|
| Protocol Transpiler | `/src/server/module-protocol-transpiler/core/protocol-transpiler.ts` |
| Converters | `/src/server/module-protocol-transpiler/converters/*.converter.ts` |
| Parsers | `/src/server/module-protocol-transpiler/parsers/*.sse-parser.ts` |
| Internal Format | `/src/server/module-protocol-transpiler/interfaces/internal-format.ts` |
| Gateway Controller | `/src/server/module-gateway/controllers/gateway-controller.ts` |

## Additional Resources

- [references/empty-stream-debugging.md](references/empty-stream-debugging.md) - Empty response debugging
- [references/tool-call-debugging.md](references/tool-call-debugging.md) - Tool call conversion issues
- [references/field-mapping.md](references/field-mapping.md) - Complete field mapping reference
- [references/performance-analysis.md](references/performance-analysis.md) - Performance optimization
- [references/vendor-specific-issues.md](references/vendor-specific-issues.md) - Vendor-specific quirks
- [references/log-format-details.md](references/log-format-details.md) - Detailed log format specification
