# Streaming Indicator - Quick Reference

**Date**: 2026-01-05
**Status**: Ready to Implement

---

## TL;DR

**Problem**: Need to show which logs are streaming requests
**Solution**: Parse existing `original_response` JSON field
**Changes**: Frontend only (~40 lines)
**Risk**: Low (no backend/DB changes)

---

## Data Source

**Location**: `request_logs.original_response` (JSON field)

**Format**:
```json
{
  "streamed": true,  // ← Use this flag
  "chunkCount": 24,
  "targetFormat": "anthropic"
}
```

**Alternative**: `time_to_first_byte_ms` field (only exists for streaming)

---

## Implementation

### 1. Helper Function
```typescript
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

### 2. Badge Component
```typescript
const StreamingBadge: React.FC<{ log: RequestLog }> = ({ log }) => {
  const isStreaming = isStreamingRequest(log);
  if (!isStreaming) return null;

  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20"
          title="Streaming response">
      ⚡ Stream
    </span>
  );
};
```

### 3. Add to UI
```typescript
{/* In list item (line ~1630) */}
<StreamingBadge log={log} />

{/* In detail view (line ~1691) */}
<StreamingBadge log={selectedLog} />
```

---

## File Locations

**File**: `src/client/components/logs/LogExplorer.tsx`

**Insert Points**:
- Line ~46: Add `isStreamingRequest()` function
- Line ~569: Add `StreamingBadge` component
- Line ~1630: Add badge to list
- Line ~1691: Add badge to detail view

---

## Verification

**Check existing data**:
```sql
SELECT id, original_response
FROM request_logs
WHERE original_response LIKE '%streamed%';
```

**Expected results**:
```json
{"streamed": true, "chunkCount": 4, "targetFormat": "anthropic"}
```

---

## Design Options

| Style | Colors | Icon |
|-------|--------|------|
| Lightning (default) | Purple | ⚡ |
| Wave | Cyan | 🌊 |
| Minimal | Indigo | SSE |
| Icon only | Purple | <Zap /> |

---

## Testing

**Manual**:
1. Make streaming request → badge appears
2. Make non-streaming request → no badge
3. Check historical logs → badges appear correctly

**Unit tests** (optional):
```bash
npm test -- streaming-indicator.test.ts
```

---

## Alternative Designs

### Simple Text Badge
```typescript
<span className="bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded text-xs">
  Streaming
</span>
```

### Icon Only
```typescript
<Zap className="w-4 h-4 text-purple-400" title="Streaming" />
```

### With Chunk Count
```typescript
<span>
  ⚡ Stream ({chunkCount} chunks)
</span>
```

---

## Optional Enhancements

### TTFB Display
```typescript
{selectedLog.timeToFirstByteMs && (
  <div className="text-sm">
    ⚡ TTFB: {selectedLog.timeToFirstByteMs}ms
  </div>
)}
```

### Streaming Filter
```typescript
const [streamFilter, setStreamFilter] = useState<'all' | 'streaming' | 'non-streaming'>('all');
```

### Chunk Count Display
```typescript
const chunkCount = JSON.parse(log.originalResponse)?.chunkCount;
<span>⚡ {chunkCount} chunks</span>
```

---

## Common Issues

**Issue**: Badge not appearing
- **Fix**: Check `log.originalResponse` exists and has `streamed: true`

**Issue**: Performance lag
- **Fix**: Use `useMemo` to cache detection

**Issue**: TypeScript error
- **Fix**: Import `RequestLog` from `@shared/types`

---

## Related Files

**Documentation**:
- `docs/STREAMING_INDICATOR_INVESTIGATION.md` - Full investigation
- `docs/STREAMING_INDICATOR_IMPLEMENTATION.md` - Detailed guide

**Tests**:
- `src/client/components/logs/__tests__/streaming-indicator.test.ts`

---

## Next Steps

1. ✅ Investigation complete
2. ⏳ Implement frontend changes (55-65 min)
3. ⏳ Test manually + unit tests
4. ⏳ Deploy to production

---

**Questions?**
- See `docs/STREAMING_INDICATOR_INVESTIGATION.md` for detailed analysis
- See `docs/STREAMING_INDICATOR_IMPLEMENTATION.md` for step-by-step guide
