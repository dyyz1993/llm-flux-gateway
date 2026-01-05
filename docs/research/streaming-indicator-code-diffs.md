# Streaming Indicator - Code Diffs

**Ready to apply changes**

---

## Diff 1: Add Helper Function

**File**: `src/client/components/logs/LogExplorer.tsx`
**Location**: After line 46 (after `tryFormatJson` function)

```diff
--- a/src/client/components/logs/LogExplorer.tsx
+++ b/src/client/components/logs/LogExplorer.tsx
@@ -43,6 +43,19 @@ function tryFormatJson(content: string | any): { formatted: string; isJson: bo
   }
 }

+/**
+ * Check if a request log represents a streaming request
+ * by parsing the original_response JSON field
+ */
+function isStreamingRequest(log: RequestLog): boolean {
+  if (!log.originalResponse) return false;
+
+  try {
+    const originalResponse = JSON.parse(log.originalResponse);
+    return originalResponse.streamed === true;
+  } catch {
+    return false;
+  }
+}

 /**
  * Try to parse tool_calls from responseContent when finish_reason is "tool_calls"
  * Returns the tool_calls array if found, null otherwise
```

---

## Diff 2: Add StreamingBadge Component

**File**: `src/client/components/logs/LogExplorer.tsx`
**Location**: After line 569 (after `VendorBadge` component)

```diff
--- a/src/client/components/logs/LogExplorer.tsx
+++ b/src/client/components/logs/LogExplorer.tsx
@@ -566,6 +566,22 @@ const VendorBadge: React.FC<{ modelName?: string; vendors: Vendor[] }> = ({
   );
 };

+/**
+ * Streaming Badge Component - Indicates if request was streamed
+ */
+const StreamingBadge: React.FC<{ log: RequestLog }> = ({ log }) => {
+  const isStreaming = isStreamingRequest(log);
+
+  if (!isStreaming) return null;
+
+  return (
+    <span
+      className="text-[9px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20"
+      title="Streaming response (Server-Sent Events)"
+    >
+      ⚡ Stream
+    </span>
+  );
+};

 // --- Helper Functions ---
```

---

## Diff 3: Add Badge to Log List Items

**File**: `src/client/components/logs/LogExplorer.tsx`
**Location**: Line 1628-1630 (in badges section)

```diff
--- a/src/client/components/logs/LogExplorer.tsx
+++ b/src/client/components/logs/LogExplorer.tsx
@@ -1625,8 +1625,10 @@ const LogExplorer: React.FC = () => {
                  )}
                  {/* Protocol and Vendor Badges */}
                  <ProtocolBadge format={log.originalResponseFormat} />
-                 <VendorBadge modelName={log.originalModel} vendors={vendors} />
+                 <VendorBadge modelName={log.originalModel} vendors={vendors} />
+                 {/* Streaming Badge */}
+                 <StreamingBadge log={log} />
               </div>

               {/* Optional: Show Key Name and baseUrl in list item if filtering is "All" */}
```

---

## Diff 4: Add Badge to Detail View Header

**File**: `src/client/components/logs/LogExplorer.tsx`
**Location**: Line 1686-1694 (in detail view header)

```diff
--- a/src/client/components/logs/LogExplorer.tsx
+++ b/src/client/components/logs/LogExplorer.tsx
@@ -1683,11 +1683,13 @@ const LogExplorer: React.FC = () => {
                            {/* Protocol and Vendor Info */}
                            {(selectedLog.originalResponseFormat || selectedLog.originalModel) && (
                              <>
-                               <span>•</span>
+                               <span>•</span>
                                <div className="flex items-center gap-2">
                                  <ProtocolBadge format={selectedLog.originalResponseFormat} />
                                  <VendorBadge modelName={selectedLog.originalModel} vendors={vendors} />
+                                 <StreamingBadge log={selectedLog} />
                                </div>
                              </>
                            )}
```

---

## Diff 5 (Optional): Add TTFB Display

**File**: `src/client/components/logs/LogExplorer.tsx`
**Location**: In the stats section (find where latency/tokens are displayed)

```diff
--- a/src/client/components/logs/LogExplorer.tsx
+++ b/src/client/components/logs/LogExplorer.tsx
@@ -1705,6 +1705,16 @@ const LogExplorer: React.FC = () => {
                        <div className="text-sm font-semibold text-gray-300">{selectedLog.finalModel}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
+                      {selectedLog.timeToFirstByteMs && (
+                        <div className="flex items-center gap-1.5">
+                          <Zap className="w-3.5 h-3.5 text-purple-500" />
+                          <div>
+                            <div className="text-[10px] text-gray-600">TTFB</div>
+                            <div className="text-sm font-semibold text-purple-400">
+                              {selectedLog.timeToFirstByteMs}ms
+                            </div>
+                          </div>
+                        </div>
+                      )}
                       <div className="flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-gray-600" />
                          <div>
```

---

## Complete File Summary

**Total Changes**:
- 4 required diffs
- 1 optional diff (TTFB display)
- ~40 lines added
- 0 lines removed

**Files Modified**: 1
- `src/client/components/logs/LogExplorer.tsx`

**Time Estimate**: 55-65 minutes

---

## Alternative Badge Styles

### Option 1: Lightning (Default) ✅
```typescript
className="bg-purple-500/10 text-purple-400 border-purple-500/20"
title="Streaming response (Server-Sent Events)"
```
Display: `⚡ Stream`

### Option 2: Wave
```typescript
className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
title="Streaming response"
```
Display: `🌊 Stream`

### Option 3: Minimal
```typescript
className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
title="Server-Sent Events"
```
Display: `SSE`

### Option 4: Icon Only
```typescript
<Zap className="w-3.5 h-3.5 text-purple-400" title="Streaming response" />
```

---

## Performance Optimization (Optional)

If you experience performance issues with large log lists, use `useMemo`:

```diff
--- a/src/client/components/logs/LogExplorer.tsx
+++ b/src/client/components/logs/LogExplorer.tsx
@@ -573,6 +573,7 @@ const StreamingBadge: React.FC<{ log: RequestLog }> = ({ log }) => {
-  const isStreaming = isStreamingRequest(log);
+  const isStreaming = useMemo(() => isStreamingRequest(log), [log.originalResponse]);

   if (!isStreaming) return null;

```

---

## Testing Commands

```bash
# Run all tests
npm test

# Run specific test file (if you create it)
npm test -- streaming-indicator.test.ts

# Run with coverage
npm test -- --coverage

# Type check
npx tsc --noEmit
```

---

## Git Commit Message

```
feat(logs): add streaming indicator badge to log entries

Add visual indicator to identify streaming vs non-streaming requests.

Changes:
- Add isStreamingRequest() helper to detect streaming from original_response
- Add StreamingBadge component with purple lightning icon
- Display badge in log list and detail view
- Optionally show TTFB (time to first byte) for streaming requests

The implementation uses existing data from the original_response JSON field
(no backend or database changes required).

Closes #[issue-number]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Rollback Instructions

If you need to revert the changes:

```bash
# Revert the commit
git revert HEAD

# Or reset to previous commit (if not pushed)
git reset --hard HEAD~1

# Or manually remove the changes
git checkout HEAD -- src/client/components/logs/LogExplorer.tsx
```

---

## Verification Steps

After applying the diffs:

1. **Build check**
   ```bash
   npm run build
   ```

2. **Type check**
   ```bash
   npx tsc --noEmit
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Manual verification**
   - Open the app
   - Go to Logs tab
   - Make a streaming request
   - Verify purple "⚡ Stream" badge appears
   - Click the log and verify badge in detail view

---

## Support

**Documentation**:
- `docs/STREAMING_INDICATOR_INVESTIGATION.md` - Full investigation report
- `docs/STREAMING_INDICATOR_IMPLEMENTATION.md` - Detailed implementation guide
- `docs/STREAMING_INDICATOR_QUICK_REFERENCE.md` - Quick reference

**Issues**:
- Check browser console for errors
- Verify `original_response` contains valid JSON
- Check that `streamed: true` is present in the JSON

---

**End of Code Diffs**
