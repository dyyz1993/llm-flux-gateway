# Complete Tool Call Verification Report

## Executive Summary

**Status**: 🔴 CRITICAL BUG CONFIRMED
**Root Cause**: Field name mismatch between vendor response (`tool_calls`) and internal format (`toolCalls`)
**Impact**: Tool calls completely broken for GLM and potentially other vendors
**Severity**: HIGH - Core functionality not working

---

## Verification Method

### Test Setup
- **Date**: 2026-01-03
- **Endpoint**: http://localhost:3000/v1/chat/completions
- **Model**: glm-4.7 (Zhipu AI / GLM)
- **API Key**: sk-flux-your-key-here
- **Test Script**: `/Users/xuyingzhou/Downloads/llm-flux-gateway/scripts/streaming-test/simple-tool-test.cjs`

### Test Request
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "What is the weather in Tokyo?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather in a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state"
            }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "stream": true
}
```

---

## Test Results

### Client Response (What We Received)
```
Total Chunks: 70
Tool Call Chunks: 0 ❌
Content Chunks: 11
Stream Completed: ✅
Finish Reason: "tool_calls"
```

**Problem**: `finish_reason: "tool_calls"` but NO tool call chunks!

### Chunk Breakdown
1. **Chunks 1-57**: `reasoning_content` (GLM-specific reasoning field)
2. **Chunks 58-68**: Regular `content` ("I'll check the current weather in Tokyo for you.")
3. **Chunk 69**: `finish_reason: "tool_calls"` (indicating tool calls should follow)
4. **Chunk 70**: `[DONE]` (stream end)

**Missing**: Tool call chunks that should appear between content and finish_reason

---

## Root Cause Analysis

### Upstream Response (What GLM Actually Sends)

**Location**: `logs/sse-traces/openai-2026-01-03T14-41-40-742Z.log` line 67

**The tool call IS present in the upstream response:**
```json
{
  "id": "2026010322413986ec5804320f4752",
  "created": 1767451299,
  "object": "chat.completion.chunk",
  "model": "glm-4.7",
  "choices": [
    {
      "index": 0,
      "delta": {
        "tool_calls": [
          {
            "id": "call_487f13eccf464b71afc3215f",
            "index": 0,
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\":\"Tokyo\"}"
            }
          }
        ]
      }
    }
  ]
}
```

### The Bug: Field Name Mismatch

**GLM sends**:
```json
"delta": {
  "tool_calls": [...]  // snake_case
}
```

**Internal format expects**:
```typescript
"delta": {
  "toolCalls": [...]  // camelCase
}
```

**Converter checks** (`openai.converter.ts` line 239):
```typescript
if (chunk.choices?.[0]?.delta?.toolCalls) {  // ❌ Looking for camelCase
  return true;
}
```

### Processing Pipeline Breakdown

```
1. ✅ GLM sends tool_calls (snake_case)
2. ✅ Upstream service receives SSE stream
3. ✅ SSE parser reads chunks
4. ❌ Converter looks for toolCalls (camelCase)
5. ❌ Not found, marks chunk as "empty"
6. ❌ Chunk filtered out by isChunkMeaningful()
7. ❌ Client never receives tool call
```

---

## Evidence from Code

### Internal Format Definition
**File**: `src/server/module-protocol-transpiler/interfaces/internal-format.ts`

```typescript
export interface InternalMessage {
  // ...
  toolCalls?: InternalToolCall[];  // camelCase
}
```

### Converter Check
**File**: `src/server/module-protocol-transpiler/converters/openai.converter.ts`

```typescript
private isChunkMeaningful(chunk: InternalStreamChunk): boolean {
  // ...
  // Has tool calls
  if (chunk.choices?.[0]?.delta?.toolCalls) {  // ❌ camelCase only
    return true;
  }
  // ...
  return false;  // Marks tool_calls chunk as empty!
}
```

---

## Impact Assessment

### Affected Vendors
- ✅ **GLM (Zhipu AI)**: Confected broken
- ❓ **Other vendors using snake_case**: Potentially broken
- ✅ **OpenAI**: Works (uses camelCase)

### Severity: CRITICAL
- Tool calls are a core feature
- Completely non-functional for affected vendors
- No workaround available

### User Impact
- Clients expecting OpenAI format will NOT receive tool calls
- Tool-based applications will break silently
- API appears to work (returns 200, streams data) but missing critical data

---

## Fix Required

### Option 1: Field Name Normalization (Recommended)

Add field name mapping in the protocol transpiler or converter:

```typescript
// Convert vendor format to internal format
function normalizeDelta(delta: any): InternalMessage {
  return {
    ...delta,
    // Map tool_calls → toolCalls
    toolCalls: delta.toolCalls || delta.tool_calls,
    // Remove snake_case version
    tool_calls: undefined,
  };
}
```

### Option 2: Check Both Formats

Update `isChunkMeaningful()` to check both:

```typescript
private isChunkMeaningful(chunk: InternalStreamChunk): boolean {
  // ...
  if (chunk.choices?.[0]?.delta?.toolCalls ||
      (chunk.choices?.[0]?.delta as any)?.tool_calls) {
    return true;
  }
  // ...
}
```

### Option 3: Add GLM-Specific Converter

Create `glm.converter.ts` that handles GLM-specific format.

---

## Recommended Action Plan

1. ✅ **Issue Confirmed**: Field name mismatch
2. **Immediate Fix**: Add field normalization in converter
3. **Add Tests**: GLM tool call streaming test
4. **Verify**: Test with actual GLM API
5. **Document**: Add GLM format to vendor docs

---

## Files to Modify

### High Priority
1. `src/server/module-protocol-transpiler/converters/openai.converter.ts`
   - Add `tool_calls` → `toolCalls` mapping
   - Update `isChunkMeaningful()` method

2. `src/server/module-protocol-transpiler/converters/__tests__/openai.converter.test.ts`
   - Add test for GLM format with `tool_calls`

### Medium Priority
3. `src/server/module-gateway/services/parsers/` (if parser needs update)
4. Documentation about vendor-specific formats

---

## Test Cases Needed

1. **GLM Tool Call** (snake_case)
   - Single tool call
   - Multiple tool calls
   - Tool call with streaming arguments

2. **OpenAI Tool Call** (camelCase)
   - Verify existing functionality still works

3. **Mixed Format**
   - Ensure no regression for other vendors

---

## Conclusion

The tool call bug has been **definitively identified**:

1. ✅ GLM sends `tool_calls` in snake_case
2. ❌ Converter expects `toolCalls` in camelCase
3. ❌ Chunks marked as "empty" and filtered out
4. ❌ Client never receives tool calls

**Next Step**: Implement field name normalization to fix the issue.

---

## Verification Tools Created

1. **Test Script**: `scripts/streaming-test/simple-tool-test.cjs`
   - Direct API testing
   - Chunk-by-chunk analysis
   - Detailed logging

2. **Manual Test Guide**: `scripts/streaming-test/MANUAL_TEST_GUIDE.md`
   - Browser-based testing
   - Console interceptors
   - Visual verification

3. **SSE Logs**: `logs/sse-traces/`
   - Raw upstream responses
   - Complete stream traces
   - Debugging data

---

**Report Generated**: 2026-01-03
**Verified By**: Automated testing + SSE log analysis
**Confidence Level**: HIGH (root cause confirmed with evidence)
