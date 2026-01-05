# Streaming Indicator Investigation Report

**Date**: 2026-01-05
**Task**: Add visual streaming indicator to logs UI
**Status**: Investigation Complete

---

## 1. Current State Analysis

### 1.1 Data Availability

**Finding**: Stream parameter is NOT currently being captured in `request_params`

```sql
-- Current database state
SELECT COUNT(*) FROM request_logs WHERE request_params IS NOT NULL;
-- Result: 0
```

**However**, we can detect streaming through **two reliable indicators**:

1. **`time_to_first_byte_ms` field** - Only populated for streaming requests
   ```sql
   -- Verified data exists
   SELECT id, time_to_first_byte_ms FROM request_logs
   WHERE time_to_first_byte_ms IS NOT NULL LIMIT 3;
   -- Results: 1223ms, 614ms, 1080ms
   ```

2. **`original_response` JSON field** - Contains `streamed: true` flag
   ```json
   {
     "streamed": true,
     "chunkCount": 4,
     "targetFormat": "anthropic"
   }
   ```

### 1.2 Backend Code Analysis

**File**: `src/server/module-gateway/controllers/gateway-controller.ts`

**Line 131**: Stream parameter extraction
```typescript
const { model, messages, stream = false, ...rest } = internalRequest;
```

**Line 247**: Streaming detection
```typescript
if (stream) {
  console.log('[Gateway] Starting streaming request...');
  // ... streaming logic
}
```

**Line 562**: Stream flag stored in `original_response`
```typescript
originalResponse: JSON.stringify({
  streamed: true,
  chunkCount,
  targetFormat,
})
```

**Problem**: The `stream` parameter is extracted but **NOT passed** to `requestLogService.createLog()`.

### 1.3 Database Schema

**File**: `src/server/shared/schema.ts`

**Current fields** (Lines 215-246):
```typescript
export const requestLogsTable = sqliteTable('request_logs', {
  // ... other fields
  request_params: text('request_params', { mode: 'json' }), // Line ~220 (not in schema definition, but in DB)
  time_to_first_byte_ms: integer('time_to_first_byte_ms'), // Present in DB, not in TS schema
  original_response: text('original_response'), // Contains streamed flag
  original_response_format: text('original_response_format'),
});
```

**Note**: The Drizzle schema is **out of sync** with the actual database. Some fields exist in SQLite but not in the TypeScript schema definition.

### 1.4 Frontend Types

**File**: `src/shared/types.ts`

**Line 46-57**: `RequestParams` interface
```typescript
export interface RequestParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean; // ✅ Stream field exists in type
  tools?: ToolDefinition[];
}
```

**Line 115-177**: `RequestLog` interface
```typescript
export interface RequestLog {
  // ...
  requestParams?: RequestParams; // ✅ Field exists
  timeToFirstByteMs?: number; // ✅ Field exists
  originalResponse?: string; // ✅ Field exists
  originalResponseFormat?: ApiFormat; // ✅ Field exists
}
```

**Conclusion**: All necessary fields already exist in the type system.

### 1.5 Frontend UI

**File**: `src/client/components/logs/LogExplorer.tsx`

**Current badges** (Lines 529-569):
- `ProtocolBadge` - Shows API format (anthropic, openai, etc.)
- `VendorBadge` - Shows LLM vendor

**Display locations**:
- List item: Line 1628-1630
- Detail view header: Line 1690-1692

**Pattern**: Badge components use consistent styling:
```typescript
className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase border ..."
```

---

## 2. Recommended Solution

### ✅ Solution A: Use `original_response` Detection (Recommended)

**Pros**:
- ✅ No database schema changes needed
- ✅ No backend code changes needed
- ✅ Data already exists and is reliable
- ✅ Simple frontend implementation
- ✅ Works for historical data

**Cons**:
- ⚠️ Requires parsing JSON (lightweight operation)

**Implementation**: Detect streaming by parsing `original_response` JSON

---

### ⚠️ Solution B: Add `is_stream` Database Field

**Pros**:
- ✅ Direct query support
- ✅ Type-safe

**Cons**:
- ❌ Requires database migration
- ❌ Requires schema synchronization
- ❌ Requires backend code changes
- ❌ Doesn't work for historical data
- ❌ Over-engineering for this use case

**Not recommended** - Adds complexity without significant benefit.

---

### ❌ Solution C: Use `time_to_first_byte_ms` Inference

**Pros**:
- ✅ Simple check

**Cons**:
- ❌ TTFB could theoretically exist for non-streaming requests
- ❌ Less explicit than `original_response.streamed`
- ❌ Not as clear as direct flag

**Not recommended** - Less reliable than Solution A.

---

## 3. Implementation Plan (Solution A)

### 3.1 Frontend Changes

**File**: `src/client/components/logs/LogExplorer.tsx`

#### Step 1: Add helper function to detect streaming

```typescript
/**
 * Check if a request log represents a streaming request
 * by parsing the original_response JSON field
 */
function isStreamingRequest(log: RequestLog): boolean {
  if (!log.originalResponse) return false;

  try {
    const originalResponse = JSON.parse(log.originalResponse);
    return originalResponse.streamed === true;
  } catch {
    return false;
  }
}
```

**Location**: After existing helper functions (around line 100)

#### Step 2: Create StreamingBadge component

```typescript
/**
 * Streaming Badge Component - Indicates if request was streamed
 */
const StreamingBadge: React.FC<{ log: RequestLog }> = ({ log }) => {
  const isStreaming = isStreamingRequest(log);

  if (!isStreaming) return null;

  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20"
      title="Streaming response"
    >
      ⚡ Stream
    </span>
  );
};
```

**Location**: After `VendorBadge` component (around line 570)

#### Step 3: Add badge to list items

```typescript
{/* In the badges section, after existing badges */}
<StreamingBadge log={log} />
```

**Location**: Line 1630 (after `<VendorBadge />`)

#### Step 4: Add badge to detail view header

```typescript
{/* In the detail view header badges section */}
<StreamingBadge log={selectedLog} />
```

**Location**: Line 1691 (after `<VendorBadge />`)

#### Step 5: Add streaming stats to detail view

**Optional enhancement**: Display TTFB and chunk count in the stats section:

```typescript
{selectedLog.timeToFirstByteMs && (
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500">TTFB:</span>
    <span className="text-xs font-mono text-purple-400">
      {selectedLog.timeToFirstByteMs}ms
    </span>
  </div>
)}
```

**Location**: In the stats section (around line 1710-1720)

---

### 3.2 Alternative Design Options

#### Option 1: Lightning Badge (Default)
```typescript
<span className="bg-purple-500/10 text-purple-400 border-purple-500/20">
  ⚡ Stream
</span>
```

#### Option 2: Wave Badge
```typescript
<span className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
  🌊 Streaming
</span>
```

#### Option 3: Minimal Badge
```typescript
<span className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
  SSE
</span>
```

#### Option 4: Icon Only
```typescript
<span className="text-purple-400" title="Streaming response">
  <Zap className="w-3.5 h-3.5" />
</span>
```

**Recommendation**: Option 1 (Lightning Badge) for clarity and visual appeal.

---

## 4. Testing Plan

### 4.1 Unit Tests

**File**: `src/client/components/logs/__tests__/streaming-indicator.test.ts` (new)

```typescript
import { isStreamingRequest } from '../LogExplorer';
import { RequestLog } from '@shared/types';

describe('isStreamingRequest', () => {
  it('returns true when original_response contains streamed: true', () => {
    const log: Partial<RequestLog> = {
      originalResponse: JSON.stringify({ streamed: true, chunkCount: 5 })
    };
    expect(isStreamingRequest(log as RequestLog)).toBe(true);
  });

  it('returns false when original_response contains streamed: false', () => {
    const log: Partial<RequestLog> = {
      originalResponse: JSON.stringify({ streamed: false })
    };
    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });

  it('returns false when original_response is missing', () => {
    const log: Partial<RequestLog> = {};
    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });

  it('returns false when original_response is invalid JSON', () => {
    const log: Partial<RequestLog> = {
      originalResponse: 'invalid json'
    };
    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });
});
```

### 4.2 Integration Tests

**Manual testing steps**:

1. **Test streaming request badge**
   - Make a streaming request via playground
   - Check that badge appears in log list
   - Click log and verify badge in detail view
   - Verify TTFB is displayed

2. **Test non-streaming request**
   - Make a non-streaming request
   - Verify no streaming badge appears
   - Verify TTFB is not displayed

3. **Test historical data**
   - Check existing logs from before the change
   - Verify streaming badges appear correctly

4. **Test edge cases**
   - Logs with missing `original_response`
   - Logs with malformed `original_response`
   - Logs with `streamed: false`

### 4.3 Performance Testing

- Verify JSON parsing doesn't cause lag when rendering large log lists
- Check that badge rendering doesn't impact scroll performance

---

## 5. Code Changes Summary

### Files to Modify

1. **`src/client/components/logs/LogExplorer.tsx`**
   - Add `isStreamingRequest()` helper function
   - Add `StreamingBadge` component
   - Add badge to list item rendering
   - Add badge to detail view rendering
   - (Optional) Add TTFB display in stats

### Files to Create

1. **`src/client/components/logs/__tests__/streaming-indicator.test.ts`**
   - Unit tests for `isStreamingRequest()`

### No Changes Needed

- ✅ Backend code - data already exists
- ✅ Database schema - fields already present
- ✅ Type definitions - already complete
- ✅ API endpoints - already return data

---

## 6. Implementation Timeline

| Task | Estimated Time |
|------|---------------|
| Add helper function | 5 minutes |
| Create badge component | 10 minutes |
| Add badges to UI | 10 minutes |
| (Optional) Add TTFB display | 10 minutes |
| Write unit tests | 15 minutes |
| Manual testing | 15 minutes |
| **Total** | **55-65 minutes** |

---

## 7. Alternative Considerations

### 7.1 Future Enhancement: Stream Parameter Capture

**If we want to capture the `stream` parameter explicitly** (not recommended now):

**Backend changes**:
```typescript
// gateway-controller.ts Line 230-241
const logId = await requestLogService.createLog({
  // ... existing params
  requestParams: {
    stream, // ✅ Add stream parameter
    ...rest
  }
});
```

**This would require**:
1. Passing `stream` and `rest` to `createLog()`
2. Ensuring `request_params` is saved correctly
3. Still need frontend parsing

**Verdict**: Not worth the effort - `original_response` already provides this data.

---

### 7.2 Schema Synchronization (Technical Debt)

**Issue**: Drizzle schema is missing some fields that exist in the database:

```typescript
// Missing from schema.ts but present in DB:
request_params: text('request_params', { mode: 'json' }),
time_to_first_byte_ms: integer('time_to_first_byte_ms'),
response_tool_calls: text('response_tool_calls', { mode: 'json' }),
is_favorited: integer('is_favorited', { mode: 'boolean' }),
original_response: text('original_response'),
original_response_format: text('original_response_format'),
```

**Recommendation**: Create a separate task to sync the schema with the actual database structure.

---

## 8. Conclusion

**Recommendation**: Implement Solution A using `original_response` detection.

**Reasons**:
1. ✅ Zero backend changes required
2. ✅ Zero database changes required
3. ✅ Works immediately with existing data
4. ✅ Simple, reliable implementation
5. ✅ Consistent with existing badge pattern
6. ✅ Minimal code changes

**Next Steps**:
1. Implement frontend changes
2. Add unit tests
3. Manual testing
4. Deploy and monitor

---

## 9. Open Questions

1. **Design preference**: Which badge style do you prefer?
   - Lightning ⚡ (default)
   - Wave 🌊
   - Text "SSE"
   - Icon only

2. **TTFB display**: Should we show TTFB in the stats section?

3. **Filtering**: Do you want to add a filter to show only streaming/non-streaming logs?

4. **Schema sync**: Should we create a separate task to sync the Drizzle schema?

---

**End of Investigation Report**
