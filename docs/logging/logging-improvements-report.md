# Logging Improvements: UUID Suffix Searchability

## Summary

Successfully implemented UUID suffix support in log files to enable easy searching by partial UUID (last 6 characters).

## Problem

Previously, log files were named with full UUIDs:
```
bcbc44dd-8dc6-4349-b3de-67c3ffffa826-1767495771287.log
```

Users could only search by the full UUID, which was inconvenient. When users tried to search with just the last 6 characters (e.g., `cb1b13`), the search would fail because:
1. The filename didn't contain the suffix separately
2. The log content didn't display the suffix

## Solution

### 1. Protocol Transformation Logs

**File**: `src/server/module-gateway/services/protocol-transformation-logger.service.ts`

**Changes**:
- Added `uuidSuffix` property to store last 6 characters of UUID
- Modified `renderHeader()` to display suffix: `║  Request ID: {UUID} ({suffix})      ║`
- Modified `complete()` to include suffix in filename: `{UUID}-{suffix}-{timestamp}.log`

**Example**:
```
Filename: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log
Content:  ║  Request ID: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6     (a6a3b6)      ║
```

### 2. SSE Trace Logs

**File**: `src/server/module-gateway/services/upstream.service.ts`

**Changes**:
- Added optional `requestId` parameter to `logCompleteSSEStream()`
- Modified to extract UUID suffix from requestId
- Updated filename format: `{vendor}-{suffix}-{timestamp}.log`
- Added Request ID line with suffix to log content

**Example**:
```
Filename: openai-a6a3b6-2026-01-04T03-18-49-143Z.log
Content:  Request ID: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6 (a6a3b6)
```

### 3. Gateway Controller Integration

**File**: `src/server/module-gateway/controllers/gateway-controller.ts`

**Changes**:
- Added `requestId` parameter to `upstreamService.parseStreamWith()` call
- Ensures requestId is passed through to SSE trace logging

## Usage Examples

### Search by UUID Suffix in Filenames

```bash
# Search in protocol-transformation logs
ls logs/protocol-transformation/ | grep a6a3b6

# Search in sse-traces logs
ls logs/sse-traces/ | grep a6a3b6
```

### Search by UUID Suffix in File Contents

```bash
# Search in protocol-transformation logs
grep -r "a6a3b6" logs/protocol-transformation/

# Search in sse-traces logs
grep -r "a6a3b6" logs/sse-traces/
```

### Combined Search

```bash
# Find all files related to a specific request suffix
find logs/ -name "*a6a3b6*" -type f

# Search content and show matching files
grep -l "a6a3b6" logs/protocol-transformation/*.log
grep -l "a6a3b6" logs/sse-traces/*.log
```

## Testing

Run the test script to verify the implementation:

```bash
npx tsx scripts/test-logging-improvements.ts
```

Expected output:
- ✓ Log file created with UUID suffix in filename
- ✓ Log content contains UUID suffix in header
- ✓ Search by suffix works in both filename and content

## Backward Compatibility

**Old log files**: Remain unchanged
- Old filename format: `{UUID}-{timestamp}.log`
- Old content format: `║  Request ID: {UUID}                ║`

**New log files**: Include UUID suffix
- New filename format: `{UUID}-{suffix}-{timestamp}.log`
- New content format: `║  Request ID: {UUID} ({suffix})      ║`

This approach ensures:
1. No breaking changes to existing logs
2. Gradual adoption as new logs are created
3. Old logs eventually age out or can be migrated if needed

## Implementation Details

### Protocol Transformation Logger

```typescript
// Constructor extracts suffix
constructor(requestId: string) {
  this.requestId = requestId;
  this.uuidSuffix = requestId.slice(-6); // Last 6 chars
  // ...
}

// Header displays suffix
private renderHeader(): string {
  return `
╔══════════════════════════════════════════════════════════════════╗
║  Request ID: ${this.requestId.padEnd(40)} (${this.uuidSuffix})      ║
║  Timestamp: ${this.timestamp.padEnd(52)}║
╚══════════════════════════════════════════════════════════════════╝
`;
}

// Filename includes suffix
async complete(): Promise<string> {
  const filename = `${this.requestId}-${this.uuidSuffix}-${Date.now()}.log`;
  // ...
}
```

### SSE Trace Logger

```typescript
// Function accepts optional requestId
async function logCompleteSSEStream(
  vendor: string,
  url: string,
  sseData: string,
  summary: { totalSSE: number; totalParsed: number; totalErrors: number },
  requestId?: string
): Promise<void> {
  // Extract suffix
  const uuidSuffix = requestId ? requestId.slice(-6) : 'no-req-id';

  // Include in filename
  const filename = join(logsDir, `${vendor}-${uuidSuffix}-${timestamp}.log`);

  // Include in content
  const header = requestId
    ? `Request ID: ${requestId} (${uuidSuffix})`
    : `Request ID: Not provided`;

  // ...
}
```

## Benefits

1. **Easy Searching**: Users can now search with just 6 characters instead of full UUID
2. **Faster Debugging**: Quickly locate logs related to a specific request
3. **Better UX**: More convenient for daily operations
4. **Backward Compatible**: Old logs remain functional
5. **Consistent Format**: Both log types use the same suffix approach

## Examples

### Before

```bash
# User has full UUID: bcbc44dd-8dc6-4349-b3de-67c3ffffa826
# Search with suffix doesn't work
$ ls logs/ | grep fa826
# (no results)

# Must use full UUID
$ ls logs/ | grep bcbc44dd-8dc6-4349-b3de-67c3ffffa826
bcbc44dd-8dc6-4349-b3de-67c3ffffa826-1767495771287.log
```

### After

```bash
# User has full UUID: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6
# Search with suffix works!
$ ls logs/protocol-transformation/ | grep a6a3b6
a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log

# Search in content
$ grep "a6a3b6" logs/protocol-transformation/*.log
║  Request ID: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6     (a6a3b6)      ║
```

## Files Modified

1. `src/server/module-gateway/services/protocol-transformation-logger.service.ts`
2. `src/server/module-gateway/services/upstream.service.ts`
3. `src/server/module-gateway/controllers/gateway-controller.ts`
4. `scripts/test-logging-improvements.ts` (new test file)

## Verification

To verify the changes are working:

```bash
# 1. Run the test script
npx tsx scripts/test-logging-improvements.ts

# 2. Make a real API request to generate logs
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 3. Get the UUID from the response or logs
# 4. Extract the last 6 characters
# 5. Search for the suffix
ls logs/protocol-transformation/ | grep <suffix>
grep -r <suffix> logs/
```

## Future Enhancements

Potential improvements for the future:

1. **Configurable Suffix Length**: Allow users to configure suffix length (default: 6)
2. **Multiple Suffix Formats**: Support different suffix extraction strategies
3. **Log Migration Tool**: Batch rename old logs to include suffix
4. **Index File**: Create a searchable index of all log files
5. **Web UI**: Add search functionality to the web interface

## Conclusion

The logging improvements successfully address the searchability issue by:
- Adding UUID suffixes to filenames for easy filtering
- Displaying suffixes in log content for grepping
- Maintaining backward compatibility with existing logs
- Providing a consistent pattern across all log types

Users can now quickly find logs using just the last 6 characters of a UUID, making debugging and troubleshooting much more efficient.
