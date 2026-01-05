# Log Format Details

## Protocol Transformation Log Format

### File Structure

```
logs/protocol-transformation/
├── {REQUEST_ID}-{TIMESTAMP}.log          (Old format)
└── {REQUEST_ID}-{SUFFIX}-{TIMESTAMP}.log (New format)
```

**Filename formats**:

| Format | Pattern | Example |
|--------|---------|---------|
| Old | `{UUID}-{timestamp}.log` | `4346b7e7-95b3-4014-8a99-8feb62a80a20-1767495623000.log` |
| New | `{UUID}-{suffix}-{timestamp}.log` | `4346b7e7-95b3-4014-8a99-8feb62a80a20-cb1b13-1767495623000.log` |

**Where**:
- `UUID`: Full request UUID (8-4-4-4-12 format)
- `suffix`: Last 6 characters of UUID (for easy searching)
- `timestamp`: Unix timestamp in milliseconds (13 digits)

**Example breakdown**:
```
Filename: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log
          └─────────────────────────────────────┘ └───┘ └──────┘
                    Full UUID (36 chars)          Suffix  Timestamp
                                                    (6 chars) (13 chars)
```

### Log Sections

#### 1. Header

```
╔══════════════════════════════════════════════════════════════════╗
║           PROTOCOL TRANSFORMATION TRACE LOG                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Request ID: 4b40f9aa-a301-4a7a-9cf6-06831ddd7d43                ║
║  Timestamp: 2026-01-04T02:09:17.931Z                            ║
╚══════════════════════════════════════════════════════════════════╝
```

**Fields**:
- `Request ID`: UUID for tracking
- `Timestamp`: ISO 8601 format

#### 2. Chunk Entries

```
[Chunk #001] 02:09:17.932
┌─────────────────────────────────────────────────────────────────┐
│ Raw SSE from Upstream:                                          │
├─────────────────────────────────────────────────────────────────┤
│ data: {"id":"chatcmpl-123","object":"chat.completion.chunk",... │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Internal Format (openai):                                        │
├─────────────────────────────────────────────────────────────────┤
│ {                                                                │
│   "id": "chatcmpl-123",                                          │
│   "choices": [{...}]                                             │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Client Format (openai):                                 │
├─────────────────────────────────────────────────────────────────┤
│ data: {"id":"chatcmpl-123","object":"chat.completion.chunk",... │
└─────────────────────────────────────────────────────────────────┘

Status: success ✓
```

**Components**:

1. **Chunk Header**: `[Chunk #NNN] HH:MM:SS.mmm`
   - Sequential number
   - Timestamp offset

2. **Raw SSE Section**: Original upstream data
   - Format: `data: {JSON}`
   - May span multiple lines
   - Exact as received from vendor

3. **Internal Format Section**: Parsed intermediate
   - Normalized field names
   - Standardized structure
   - Vendor identifier in parentheses

4. **Client Format Section**: Final output format
   - Target vendor format
   - Ready to send to client
   - SSE format with `data:` prefix

5. **Status Line**: Conversion result
   - `success ✓`: Converted successfully
   - `failed ✗`: Conversion error
   - `warning ⚠️`: Partial success with issues
   - `unknown ?`: Unclear status

#### 3. Footer

```
╔══════════════════════════════════════════════════════════════════╗
║                    END OF TRACE LOG                              ║
╠══════════════════════════════════════════════════════════════════╣
║  End Time: 2026-01-04T02:09:17.932Z                             ║
║  Duration: 1ms                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Fields**:
- `End Time`: ISO 8601 timestamp
- `Duration`: Total processing time

## SSE Trace Log Format

### File Structure

```
logs/sse-traces/
├── {VENDOR}-{ISO_TIMESTAMP}-raw.log      (Old format)
└── {VENDOR}-{SUFFIX}-{TIMESTAMP}.log     (New format)
```

**Filename formats**:

| Format | Pattern | Example |
|--------|---------|---------|
| Old | `{vendor}-{YYYY-MM-DD}THH-MM-SS-{millis}Z-raw.log` | `openai-2026-01-04T03-00-11-305Z-raw.log` |
| New | `{vendor}-{suffix}-{timestamp}.log` | `openai-cb1b13-1767495623000.log` |

**Where**:
- `vendor`: Vendor name (openai, anthropic, gemini, glm)
- `suffix`: Last 6 characters of UUID (for easy searching)
- `timestamp`: Unix timestamp in milliseconds (13 digits)
- ISO timestamp format: `YYYY-MM-DDTHH-MM-SS-{millis}Z` (old format)

### Format

**Line-by-line JSON**:

```
data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"},"finishReason":"","index":0}]}

data: {"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"},"finishReason":"","index":0}]}

data: {"candidates":[{"content":{"parts":[{"text":"!"}],"role":"model"},"finishReason":"STOP","index":0}]}
```

**Characteristics**:
- One SSE event per line
- `data:` prefix followed by JSON
- Empty line between events (not shown above)
- No transformation (raw from vendor)

### Vendor Prefixes

| Prefix | Vendor |
|--------|--------|
| `openai-` | OpenAI |
| `anthropic-` | Anthropic |
| `gemini-` | Gemini |
| `glm-` | GLM (Zhipu AI) |

## UUID Suffix Searching

### What is UUID Suffix?

The UUID suffix is the **last 6 characters** of a request UUID, extracted and embedded in log filenames for fast searching.

**Example**:
```
Full UUID: 4e8685a6-a3b6-4cf6-bd31-4e8685a6a3b6
Suffix:    a6a3b6 (last 6 chars)
```

### Why Use UUID Suffix?

| Benefit | Description |
|---------|-------------|
| Fast search | `find` by filename is faster than `grep` by content |
| Unique enough | 6 hex chars = 16^6 = 16,777,216 combinations |
| Easy to copy | Short enough to share verbally or in chat |
| Cross-log correlation | Same suffix in both transformation and SSE trace logs |
| Backward compatible | Old logs (without suffix) still searchable by full UUID |

### Search Methods

#### For New Logs (with suffix)

```bash
# Fast filename search (recommended)
find logs/protocol-transformation/ -name "*a6a3b6*" -type f
find logs/sse-traces/ -name "*a6a3b6*" -type f

# List and grep
ls logs/protocol-transformation/ | grep a6a3b6
ls logs/sse-traces/ | grep a6a3b6
```

#### For Old Logs (without suffix)

```bash
# Search by full UUID in content
grep -r "4e8685a6-a3b6-4cf6-bd31-4e8685a6a3b6" logs/

# Or search by timestamp
ls logs/protocol-transformation/*1767496729144.log
ls logs/sse-traces/*1767496729144.log
```

#### Hybrid Search (works for both)

```bash
# Try suffix first, fall back to full UUID
SUFFIX="a6a3b6"
FULL_UUID="4e8685a6-a3b6-4cf6-bd31-4e8685a6a3b6"

# Try suffix search
RESULTS=$(find logs/ -name "*${SUFFIX}*" -type f)

# If no results, use full UUID
if [ -z "$RESULTS" ]; then
  RESULTS=$(grep -rl "$FULL_UUID" logs/)
fi

echo "$RESULTS"
```

### Correlating Logs by Suffix

**When a request is processed, both logs share the same suffix**:

```bash
# Given suffix: a6a3b6

# Protocol transformation log
logs/protocol-transformation/a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log

# SSE trace log
logs/sse-traces/openai-a6a3b6-1767496729144.log
```

**Automatic correlation script**:

```bash
#!/bin/bash
SUFFIX="$1"

echo "=== Protocol Transformation ==="
find logs/protocol-transformation/ -name "*${SUFFIX}*.log" -type f

echo ""
echo "=== SSE Traces ==="
find logs/sse-traces/ -name "*${SUFFIX}*.log" -type f
```

### Suffix Length Considerations

| Length | Combinations | Collision Risk | Use Case |
|--------|--------------|----------------|----------|
| 4 chars | 65,536 | High | Not recommended |
| 6 chars | 16,777,216 | Low | ✅ Recommended |
| 8 chars | 4,294,967,296 | Very Low | Overkill |

**Recommendation**: Use 6 characters for balance of uniqueness and usability.

## Field Markers

### Status Indicators

| Symbol | Meaning |
|--------|---------|
| ✓ | Success |
| ✗ | Failed |
| ⚠️ | Warning |
| ? | Unknown |

### Warning Messages

```
⚠️ Ignored field: field_name (reason)
```

**Common warnings**:
- Unsupported features
- Vendor-specific fields
- Non-standard extensions

### Error Messages

```
✗ Error: error_message
```

**Errors indicate**:
- Parse failures
- Conversion errors
- Invalid data
- Missing required fields

## Parsing Logs

### Extract Request ID

```bash
grep "Request ID:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### Extract Duration

```bash
grep "Duration:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  cut -d: -f2
```

### Extract Status

```bash
grep "Status:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  cut -d: -f2
```

### Count Chunks

```bash
grep "Chunk #" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  wc -l
```

### Extract Raw SSE

```bash
sed -n '/Raw SSE/,/┘/p' /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/LOG_FILE
```

### Extract Internal Format

```bash
sed -n '/Internal Format/,/┘/p' /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/LOG_FILE
```

### Extract Client Format

```bash
sed -n '/Client Format/,/┘/p' /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/LOG_FILE
```

## Log Levels

### Current Implementation

Logs are **verbose** - all chunks logged with full details

**Format**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Section Name:                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Content                                                         │
└─────────────────────────────────────────────────────────────────┘
```

**Advantages**:
- Complete visibility
- Easy debugging
- Full context

**Disadvantages**:
- Large file size
- Performance overhead
- Disk usage

### Production Considerations

For production, consider:

1. **Error-only logging**: Only log failed conversions
2. **Sampling**: Log 1% of all requests
3. **Condensed format**: Remove box drawing
4. **Structured logs**: JSON format for parsing
5. **Log rotation**: Delete old logs automatically

## Correlating Logs

### Protocol Transformation ↔ SSE Trace

Match by timestamp:

```bash
# Find SSE trace for transformation log
TRANSFORM_TIME="2026-01-04T02:09:17"
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/sse-traces/ -name "*$TRANSFORM_TIME*"
```

### Multiple Logs for Same Request

If using multiple vendors or formats:

```bash
# Find all logs with same timestamp prefix
TIMESTAMP="1767492557932"
ls /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*$TIMESTAMP*.log
```

## Log File Management

### Rotation Strategy

```bash
# Keep logs for 7 days
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -name "*.log" -mtime +7 -delete

# Or by size
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -name "*.log" -size +100M -delete
```

### Compression

```bash
# Compress old logs
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -name "*.log" -mtime +1 -exec gzip {} \;
```

### Archive

```bash
# Move to archive directory
find /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/ -name "*.log.gz" -exec mv {} archive/ \;
```

## Troubleshooting Logs

### Missing Logs

**Check**:
```bash
# Is logging enabled?
grep -r "PROTOCOL_TRANSFORMATION_LOGGER" /Users/xuyingzhou/Downloads/llm-flux-gateway/src/

# Log directory exists?
ls -ld /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/
```

### Empty Logs

**Check**:
```bash
# File size
ls -lh /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log
```

### Malformed Logs

**Symptoms**:
- Incomplete box drawing
- Missing sections
- Corrupted JSON

**Debug**:
```bash
# Validate JSON
grep "data:" /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/*.log | \
  sed 's/data: //' | jq .
```

## References

- Logger code: `/src/server/module-gateway/services/protocol-transformation-logger.service.ts`
- Format definitions: `/src/server/module-protocol-transpiler/interfaces/internal-format.ts`
- Converter implementations: `/src/server/module-protocol-transpiler/converters/*.converter.ts`
