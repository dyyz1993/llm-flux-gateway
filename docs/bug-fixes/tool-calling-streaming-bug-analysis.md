# Tool Calling Bug - Critical Finding

## Issue Summary

**Severity**: CRITICAL
**Status**: CONFIRMED
**Location**: `src/server/module-gateway/controllers/gateway-controller.ts`

## The Problem

When streaming responses with tool calls, the gateway controller:
1. ✅ Receives tool calls from upstream API correctly
2. ✅ Accumulates them in memory (`accumulatedToolCalls` Map)
3. ❌ **NEVER sends them to the client**

## Evidence

### Upstream API Response (What Zhipu Sends)
**File**: `logs/sse-traces/openai-2026-01-03T14-35-09-229Z.log`

```json
{
  "choices": [{
    "index": 0,
    "delta": {
      "tool_calls": [{
        "id": "call_815e48818a67469f9e8e7d61",
        "index": 0,
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\":\"Tokyo\"}"
        }
      }]
    }
  }]
}
```

### Client Response (What Frontend Receives)
**File**: `/tmp/tool-calling-stream-output.txt`

```json
{
  "choices": [{
    "index": 0,
    "finish_reason": "tool_calls",
    "delta": {
      "role": "assistant",
      "content": ""
    }
  }]
}
```

**Notice**: No `tool_calls` array!

## Root Cause

### Code Location
`src/server/module-gateway/controllers/gateway-controller.ts`
Lines: 194-210 (accumulation)
Lines: 268-283 (stream ending)

### The Bug

```typescript
// Lines 194-210: Tool calls are accumulated
if (internalChunk.choices?.[0]?.delta?.toolCalls) {
  const newToolCalls = internalChunk.choices[0].delta.toolCalls;
  newToolCalls.forEach((newCall: any) => {
    const index = newCall.index ?? accumulatedToolCalls.size;
    const existing = accumulatedToolCalls.get(index);
    if (!existing) {
      accumulatedToolCalls.set(index, { ...newCall, index });
    } else if (newCall.function?.arguments) {
      if (existing.function?.arguments) {
        existing.function.arguments += newCall.function.arguments;
      } else {
        existing.function = newCall.function;
      }
    }
  });
}

// Lines 268-283: Stream ends WITHOUT sending tool calls
console.log('[Gateway] Streaming completed:', {
  chunkCount,
  toolCallsCollected: accumulatedToolCalls.size,  // Logged but not sent!
  // ...
});

await stream.write('data: [DONE]\n\n');  // Stream ends here

// Line 295: Tool calls only used for database
const toolCallsArray = accumulatedToolCalls.size > 0 ?
  Array.from(accumulatedToolCalls.values()) : undefined;
```

### What's Missing

Before writing `data: [DONE]`, the code should:

1. Check if `accumulatedToolCalls.size > 0`
2. Create a final chunk with the complete tool calls
3. Convert it to the source format
4. Write it to the stream

## The Fix

### Insert Before Line 283

```typescript
// Before sending [DONE], send accumulated tool calls if present
if (accumulatedToolCalls.size > 0) {
  console.log('[Gateway] Sending accumulated tool calls:', accumulatedToolCalls.size);

  const toolCallsChunk = {
    id: responseParams.id,
    object: 'chat.completion.chunk',
    created: responseParams.created,
    model: responseParams.model,
    choices: [{
      index: 0,
      delta: {
        role: 'assistant',
        tool_calls: Array.from(accumulatedToolCalls.values()).map(tc => ({
          index: tc.index,
          id: tc.id,
          type: tc.type,
          function: tc.function
        }))
      },
      finish_reason: responseParams.finish_reason || 'tool_calls'
    }]
  };

  // Convert to source format
  const fromInternalResult = protocolTranspiler.transpileStreamChunk(
    toolCallsChunk,
    'openai',
    sourceVendor
  );

  if (fromInternalResult.success && fromInternalResult.data) {
    const sseString = typeof fromInternalResult.data === 'string' ?
      fromInternalResult.data :
      `data: ${JSON.stringify(fromInternalResult.data)}\n\n`;

    console.log('[Gateway] Sending tool calls chunk:', sseString.substring(0, 200));
    await stream.write(sseString);
  } else {
    console.warn('[Gateway] Failed to convert tool calls chunk:', fromInternalResult.errors);
  }
}

await stream.write('data: [DONE]\n\n');
```

## Why This Happens

### Design Misunderstanding

The current implementation seems to assume:
1. Tool calls come in incremental chunks (true)
2. Each chunk should be forwarded as-is (false - OpenAI format requires accumulation)
3. The final complete tool call object should be sent at the end (missing implementation)

### OpenAI Streaming Format

OpenAI's streaming format for tool calls:

1. **Start chunk**: Contains tool call id and type
2. **Middle chunks**: Contain partial arguments
3. **Final chunk**: Contains complete arguments with finish_reason

The gateway correctly accumulates but forgets to send the final accumulated object.

## Impact

### User Experience
- ❌ Playground cannot demonstrate tool calling
- ❌ Frontend cannot display tool execution
- ❌ Multi-turn conversations break
- ❌ Tool-based features appear non-functional

### Technical Impact
- Frontend tool call handlers never trigger
- `useAIStream.ts` accumulation logic never runs
- Tool execution workflow incomplete

## Verification Steps

After applying the fix:

1. Run the test script:
   ```bash
   /tmp/test-tool-calling-final.sh
   ```

2. Check the streaming output:
   ```bash
   cat /tmp/tool-calling-stream-output.txt | grep "tool_calls"
   ```

3. Verify in Playground:
   - Open http://localhost:3000
   - Send: "What's 123 + 456?"
   - Should see tool call UI appear
   - Should see final answer after tool execution

## Related Files

- `src/server/module-gateway/controllers/gateway-controller.ts` - **FIX HERE**
- `src/server/module-gateway/services/upstream.service.ts` - Works correctly
- `src/client/hooks/useAIStream.ts` - Works correctly (waits for tool calls)
- `src/server/module-protocol-transpiler/converters/*.converter.ts` - All work correctly

## Testing

### Automated Test
```bash
cd /Users/xuyingzhou/Downloads/llm-flux-gateway
/tmp/test-tool-calling-final.sh
```

### Manual Test
1. Open Playground at http://localhost:3000
2. Enter API key: `sk-flux-c24bc70d2f9f4f99bb4973791cabd994`
3. Send: "Calculate 123 + 456 using the calculator"
4. Expected: Tool call UI appears, then result

## Summary

This is a **single-line omission** (well, ~20 lines) that prevents an entire feature category from working. The infrastructure is solid, the converters are perfect, the accumulation logic is correct - we just need to send the accumulated data to the client!

**Effort to Fix**: ~30 minutes
**Impact**: Enables complete tool calling functionality
**Risk**: Low (isolated change, well-tested infrastructure)
