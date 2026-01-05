# Logging System - Quick Reference

## Chunk Flow

```
Upstream API → parseStreamWith() → Internal Chunk → transpileStreamChunk()
                                                          ↓
                                            ┌────────────────────────┐
                                            │ Success && !empty?     │
                                            └────────────────────────┘
                                                   ↓
                                    ┌──────────────┴──────────────┐
                                    ↓                             ↓
                                    YES                           NO
                                    ↓                             ↓
                            ✅ LOG CHUNK                   ❌ SKIP
                            ✅ SEND TO CLIENT               - Increment emptyChunks
                            ✅ chunkCount++                 - Increment conversionErrors
                                                                  - continue
```

## Variables Explained

| Variable | Meaning | When Updated |
|----------|---------|--------------|
| `receivedChunks` | Total chunks from upstream | Every iteration |
| `chunkCount` | Chunks sent to client | Only when sent |
| `emptyChunks` | Chunks skipped (empty) | When `__empty` is true |
| `conversionErrors` | Chunks skipped (errors) | When `success` is false |

## Log Output Example

```
Chunk Statistics:
  - Received from upstream: 15    ← receivedChunks
  - Sent to client:        12    ← chunkCount
  - Empty/skipped:         2     ← emptyChunks
  - Conversion errors:     1     ← conversionErrors
```

**Math check:** 15 = 12 + 2 + 1 ✓

## Debugging Tips

### If you see "Total Chunks: 0"

**Before fix:**
- Log showed 0 chunks even though upstream returned data
- Could not tell if data was received or processed

**After fix:**
- Check `receivedChunks` - if > 0, data was received
- Check `emptyChunks` - if high, many chunks are being filtered
- Check `conversionErrors` - if > 0, conversion is failing

### If frontend receives no data

1. Check console output:
   ```typescript
   console.log('[Gateway] Streaming completed:', {
     receivedChunks,
     sentChunks: chunkCount,
     emptyChunks,
     conversionErrors
   });
   ```

2. Scenarios:
   - `receivedChunks = 0`: Upstream not sending data
   - `chunkCount = 0` but `receivedChunks > 0`: All chunks being skipped
   - `emptyChunks > 0`: Filter logic is working (expected)
   - `conversionErrors > 0`: Conversion broken (needs fixing)

## Code Locations

| Feature | File | Lines |
|---------|------|-------|
| Chunk tracking | `gateway-controller.ts` | 212-214 |
| Skip logic | `gateway-controller.ts` | 257-294 |
| Logging call | `gateway-controller.ts` | 266-272 |
| Statistics display | `protocol-transformation-logger.service.ts` | 467-501 |

## Common Issues

### Issue: Logs show 0 chunks but console shows receivedChunks > 0

**Diagnosis:** All chunks are being skipped

**Check:**
```typescript
// In gateway-controller.ts
if (sseResult.success && !(sseResult.data as any).__empty) {
  // This block should execute
} else {
  // Chunk is being skipped here
  if (!sseResult.success) {
    console.error('Conversion failed:', sseResult.errors);
  }
}
```

### Issue: High emptyChunks count

**Expected behavior:** Some vendors send empty chunks (metadata-only)

**Fix:** Nothing - this is normal. Only `chunkCount` matters for client delivery.

### Issue: conversionErrors > 0

**Problem:** `transpileStreamChunk()` is failing

**Debug:**
```typescript
if (!sseResult.success) {
  console.error('[Gateway] Failed to convert chunk:', sseResult.errors);
  conversionErrors++;
}
```

Check `sseResult.errors` for specific conversion issues.
