# Streaming Indicator Implementation Guide

**Based on Investigation Report**: `docs/STREAMING_INDICATOR_INVESTIGATION.md`

---

## Quick Summary

**Solution**: Use existing `original_response` JSON field to detect streaming
**Time Estimate**: 55-65 minutes
**Risk Level**: Low (no backend or database changes)

---

## Implementation Steps

### Step 1: Add Helper Function

**File**: `src/client/components/logs/LogExplorer.tsx`

**Location**: After line 46 (after `tryFormatJson` function)

**Add this function**:

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

---

### Step 2: Create StreamingBadge Component

**File**: `src/client/components/logs/LogExplorer.tsx`

**Location**: After line 569 (after `VendorBadge` component)

**Add this component**:

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
      title="Streaming response (Server-Sent Events)"
    >
      ⚡ Stream
    </span>
  );
};
```

---

### Step 3: Add Badge to Log List Items

**File**: `src/client/components/logs/LogExplorer.tsx`

**Location**: Line 1628-1630 (in the badges section)

**Find this code**:
```typescript
{/* Protocol and Vendor Badges */}
<ProtocolBadge format={log.originalResponseFormat} />
<VendorBadge modelName={log.originalModel} vendors={vendors} />
```

**Replace with**:
```typescript
{/* Protocol and Vendor Badges */}
<ProtocolBadge format={log.originalResponseFormat} />
<VendorBadge modelName={log.originalModel} vendors={vendors} />
{/* Streaming Badge */}
<StreamingBadge log={log} />
```

---

### Step 4: Add Badge to Detail View Header

**File**: `src/client/components/logs/LogExplorer.tsx`

**Location**: Line 1690-1692 (in detail view badges section)

**Find this code**:
```typescript
<div className="flex items-center gap-2">
  <ProtocolBadge format={selectedLog.originalResponseFormat} />
  <VendorBadge modelName={selectedLog.originalModel} vendors={vendors} />
</div>
```

**Replace with**:
```typescript
<div className="flex items-center gap-2">
  <ProtocolBadge format={selectedLog.originalResponseFormat} />
  <VendorBadge modelName={selectedLog.originalModel} vendors={vendors} />
  <StreamingBadge log={selectedLog} />
</div>
```

---

### Step 5: (Optional) Add TTFB Display

**File**: `src/client/components/logs/LogExplorer.tsx`

**Location**: In the stats section (around line 1710-1720)

**Find the stats section** (look for latency, tokens display) and add:

```typescript
{selectedLog.timeToFirstByteMs && (
  <div className="flex items-center gap-1.5">
    <Zap className="w-3.5 h-3.5 text-purple-500" />
    <div>
      <div className="text-[10px] text-gray-600">Time to First Byte</div>
      <div className="text-sm font-semibold text-purple-400">
        {selectedLog.timeToFirstByteMs}ms
      </div>
    </div>
  </div>
)}
```

**Note**: If you add this, make sure `Zap` is imported from `lucide-react` (it should already be there).

---

### Step 6: (Optional) Add Unit Tests

**Create new file**: `src/client/components/logs/__tests__/streaming-indicator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { RequestLog } from '@shared/types';

// Mock the helper function (copy the implementation)
function isStreamingRequest(log: RequestLog): boolean {
  if (!log.originalResponse) return false;

  try {
    const originalResponse = JSON.parse(log.originalResponse);
    return originalResponse.streamed === true;
  } catch {
    return false;
  }
}

describe('isStreamingRequest', () => {
  it('returns true when original_response contains streamed: true', () => {
    const log: Partial<RequestLog> = {
      id: 'test-1',
      timestamp: Date.now() / 1000,
      apiKeyId: 'key-1',
      routeId: 'route-1',
      originalModel: 'claude-3-sonnet',
      finalModel: 'claude-3-sonnet',
      method: 'POST',
      path: '/v1/messages',
      messageCount: 1,
      firstMessage: 'test',
      hasTools: false,
      toolCount: 0,
      messages: [],
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 1000,
      statusCode: 200,
      overwrittenAttributes: {},
      originalResponse: JSON.stringify({
        streamed: true,
        chunkCount: 5,
        targetFormat: 'anthropic'
      })
    };

    expect(isStreamingRequest(log as RequestLog)).toBe(true);
  });

  it('returns false when original_response contains streamed: false', () => {
    const log: Partial<RequestLog> = {
      id: 'test-2',
      timestamp: Date.now() / 1000,
      apiKeyId: 'key-1',
      routeId: 'route-1',
      originalModel: 'claude-3-sonnet',
      finalModel: 'claude-3-sonnet',
      method: 'POST',
      path: '/v1/messages',
      messageCount: 1,
      firstMessage: 'test',
      hasTools: false,
      toolCount: 0,
      messages: [],
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 1000,
      statusCode: 200,
      overwrittenAttributes: {},
      originalResponse: JSON.stringify({ streamed: false })
    };

    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });

  it('returns false when original_response is missing', () => {
    const log: Partial<RequestLog> = {
      id: 'test-3',
      timestamp: Date.now() / 1000,
      apiKeyId: 'key-1',
      routeId: 'route-1',
      originalModel: 'claude-3-sonnet',
      finalModel: 'claude-3-sonnet',
      method: 'POST',
      path: '/v1/messages',
      messageCount: 1,
      firstMessage: 'test',
      hasTools: false,
      toolCount: 0,
      messages: [],
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 1000,
      statusCode: 200,
      overwrittenAttributes: {}
    };

    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });

  it('returns false when original_response is invalid JSON', () => {
    const log: Partial<RequestLog> = {
      id: 'test-4',
      timestamp: Date.now() / 1000,
      apiKeyId: 'key-1',
      routeId: 'route-1',
      originalModel: 'claude-3-sonnet',
      finalModel: 'claude-3-sonnet',
      method: 'POST',
      path: '/v1/messages',
      messageCount: 1,
      firstMessage: 'test',
      hasTools: false,
      toolCount: 0,
      messages: [],
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 1000,
      statusCode: 200,
      overwrittenAttributes: {},
      originalResponse: 'invalid json{{{'
    };

    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });

  it('returns false when original_response is valid JSON but missing streamed field', () => {
    const log: Partial<RequestLog> = {
      id: 'test-5',
      timestamp: Date.now() / 1000,
      apiKeyId: 'key-1',
      routeId: 'route-1',
      originalModel: 'claude-3-sonnet',
      finalModel: 'claude-3-sonnet',
      method: 'POST',
      path: '/v1/messages',
      messageCount: 1,
      firstMessage: 'test',
      hasTools: false,
      toolCount: 0,
      messages: [],
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 1000,
      statusCode: 200,
      overwrittenAttributes: {},
      originalResponse: JSON.stringify({ someOtherField: 'value' })
    };

    expect(isStreamingRequest(log as RequestLog)).toBe(false);
  });
});
```

---

## Testing Checklist

### Manual Testing

- [ ] **Streaming Request Badge**
  1. Open the playground
  2. Make a streaming request (ensure `stream: true`)
  3. Go to Logs tab
  4. Verify purple "⚡ Stream" badge appears in the log list
  5. Click the log and verify badge appears in detail view
  6. (Optional) Verify TTFB is displayed in stats

- [ ] **Non-Streaming Request**
  1. Make a non-streaming request
  2. Verify NO streaming badge appears
  3. Verify TTFB is NOT displayed

- [ ] **Historical Data**
  1. Check logs from before the change
  2. Verify streaming badges appear correctly for old streaming requests

- [ ] **Edge Cases**
  1. Find logs with missing `original_response` - should handle gracefully
  2. Find logs with malformed JSON - should not crash

- [ ] **Performance**
  1. Load 100+ logs
  2. Verify no lag when scrolling
  3. Check browser console for errors

### Unit Tests

```bash
# Run the new tests
npm test -- streaming-indicator.test.ts

# Run all tests
npm test
```

---

## Visual Design Options

If you want to change the badge appearance, here are alternatives:

### Option 1: Lightning (Default) ✅
```typescript
className="bg-purple-500/10 text-purple-400 border-purple-500/20"
```
Display: `⚡ Stream`

### Option 2: Wave
```typescript
className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
```
Display: `🌊 Streaming`

### Option 3: Minimal
```typescript
className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
```
Display: `SSE`

### Option 4: Icon Only
```typescript
<Zap className="w-3 h-3 text-purple-400" title="Streaming response" />
```

---

## Troubleshooting

### Issue: Badge not appearing

**Check**:
1. Does `log.originalResponse` exist?
2. Does it contain valid JSON?
3. Does the JSON have `streamed: true`?

**Debug**:
```typescript
// Add temporary logging in isStreamingRequest
function isStreamingRequest(log: RequestLog): boolean {
  console.log('[Streaming Check] log.originalResponse:', log.originalResponse);
  // ... rest of function
}
```

### Issue: TypeScript error

**Make sure**:
1. `RequestLog` type is imported from `@shared/types`
2. The helper function is placed before component usage

### Issue: Performance problems

**Solution**: Use `useMemo` to cache streaming detection

```typescript
const StreamingBadge: React.FC<{ log: RequestLog }> = ({ log }) => {
  const isStreaming = useMemo(() => isStreamingRequest(log), [log.originalResponse]);

  if (!isStreaming) return null;

  return (
    // ... component
  );
};
```

---

## Future Enhancements

### 1. Add Streaming Filter

Add a filter button to show only streaming/non-streaming logs:

```typescript
const [showStreamingOnly, setShowStreamingOnly] = useState<boolean | null>(null);

const filteredLogs = useMemo(() => {
  return logs.filter(log => {
    if (showStreamingOnly === true) return isStreamingRequest(log);
    if (showStreamingOnly === false) return !isStreamingRequest(log);
    return true;
  });
}, [logs, showStreamingOnly]);
```

### 2. Add Streaming Statistics

Add a streaming percentage to the overview stats:

```typescript
const streamingCount = logs.filter(isStreamingRequest).length;
const streamingPercentage = (streamingCount / logs.length) * 100;
```

### 3. Add Chunk Count Display

If available, display the number of chunks:

```typescript
function getChunkCount(log: RequestLog): number | undefined {
  if (!log.originalResponse) return undefined;

  try {
    const originalResponse = JSON.parse(log.originalResponse);
    return originalResponse.chunkCount;
  } catch {
    return undefined;
  }
}

// Display in badge
{getChunkCount(log) && (
  <span className="text-[9px] text-purple-300">
    ({getChunkCount(log)} chunks)
  </span>
)}
```

---

## Summary of Changes

**Files Modified**:
- `src/client/components/logs/LogExplorer.tsx` (4 changes)

**Files Created** (optional):
- `src/client/components/logs/__tests__/streaming-indicator.test.ts`

**Lines Added**: ~40 (excluding tests)
**Time Estimate**: 55-65 minutes
**Risk Level**: Low

**No changes needed to**:
- Backend code
- Database schema
- API endpoints
- Type definitions

---

## Deployment

1. Commit changes with message:
   ```
   feat(logs): add streaming indicator badge to log entries

   - Add isStreamingRequest() helper to detect streaming from original_response
   - Add StreamingBadge component with purple lightning icon
   - Display badge in log list and detail view
   - Optionally show TTFB (time to first byte) for streaming requests

   Closes #[issue-number]
   ```

2. Create pull request
3. Merge after review
4. Deploy to production

---

**End of Implementation Guide**
