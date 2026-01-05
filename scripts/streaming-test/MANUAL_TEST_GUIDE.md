# Manual Tool Call Verification Guide

Since automated testing tools are not available, here's a manual verification process using Chrome DevTools.

## Prerequisites

1. Server running on `http://localhost:3000`
2. Access to Playground
3. Chrome/Chromium browser with DevTools

## Step-by-Step Verification

### 1. Open Chrome DevTools Console

1. Open Chrome
2. Navigate to `http://localhost:3000/playground`
3. Press `F12` or `Cmd+Option+I` (Mac) to open DevTools
4. Switch to **Console** tab

### 2. Install SSE Interceptor

Copy and paste this script into the Console and press Enter:

```javascript
// Install SSE interceptor
(function() {
  window.toolCallData = {
    chunks: [],
    chunkCount: 0,
    toolCallChunks: [],
    contentChunks: []
  };

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(async response => {
      if (args[0].includes('/chat/completions')) {
        console.log('🚀 Chat Completions Request Detected');

        // Log request payload
        response.clone().json().then(data => {
          console.log('📤 Request Payload:', data);
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const {done, value} = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, {stream: true});
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              window.toolCallData.chunkCount++;
              const data = line.slice(6);

              if (data === '[DONE]') {
                console.log(`✅ Chunk #${window.toolCallData.chunkCount}: [DONE]`);
                window.toolCallData.chunks.push({
                  count: window.toolCallData.chunkCount,
                  type: 'done'
                });
              } else {
                try {
                  const parsed = JSON.parse(data);
                  const chunkInfo = {
                    count: window.toolCallData.chunkCount,
                    hasContent: !!parsed.choices?.[0]?.delta?.content,
                    hasToolCalls: !!parsed.choices?.[0]?.delta?.tool_calls,
                    finishReason: parsed.choices?.[0]?.finish_reason,
                    toolCalls: parsed.choices?.[0]?.delta?.tool_calls,
                    content: parsed.choices?.[0]?.delta?.content,
                    fullChunk: parsed
                  };

                  window.toolCallData.chunks.push(chunkInfo);

                  if (chunkInfo.hasToolCalls) {
                    window.toolCallData.toolCallChunks.push(chunkInfo);
                    console.log(`🔧 Chunk #${window.toolCallData.chunkCount}: TOOL CALL`,
                      JSON.stringify(chunkInfo.toolCalls, null, 2));
                  } else if (chunkInfo.hasContent) {
                    window.toolCallData.contentChunks.push(chunkInfo);
                    console.log(`📝 Chunk #${window.toolCallData.chunkCount}: Content -`,
                      chunkInfo.content);
                  } else if (chunkInfo.finishReason) {
                    console.log(`⏹️  Chunk #${window.toolCallData.chunkCount}: Finish -`,
                      chunkInfo.finishReason);
                  }
                } catch (e) {
                  console.log(`❌ Chunk #${window.toolCallData.chunkCount}: Parse Error -`, data);
                }
              }
            }
          }
        }

        console.log('📊 Summary:', {
          totalChunks: window.toolCallData.chunkCount,
          toolCallChunks: window.toolCallData.toolCallChunks.length,
          contentChunks: window.toolCallData.contentChunks.length
        });

        // Return new Response with original body
        const body = new ReadableStream({
          async start(controller) {
            reader.releaseLock();
            const newReader = response.body.getReader();
            while (true) {
              const {done, value} = await newReader.read();
              if (done) {
                controller.close();
                break;
              }
              controller.enqueue(value);
            }
          }
        });

        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
      return response;
    });
  };

  console.log('✅ SSE Interceptor installed successfully!');
  console.log('ℹ️  Now send a message with a tool call to see the chunks');
})();
```

### 3. Switch to Network Tab

1. In DevTools, switch to the **Network** tab
2. Filter by `Fetch/XHR`
3. Keep the DevTools open

### 4. Send a Tool Call Request

In the Playground:

1. Find the message input box
2. Type: `What is the weather in Tokyo?`
3. Click Send

### 5. Observe Results

#### In Console Tab

Look for:
- 🚀 "Chat Completions Request Detected"
- 🔧 Chunks with "TOOL CALL" labels
- 📝 Chunks with "Content" labels
- ✅ "[DONE]" marker
- 📊 Summary at the end

#### In Network Tab

1. Find the `/chat/completions` request
2. Click on it
3. Go to **Response** tab
4. Look for SSE events with `tool_calls` field

### 6. Retrieve Full Report

After the request completes, run this in the Console:

```javascript
console.log('=== TOOL CALL VERIFICATION REPORT ===');
console.log(JSON.stringify(window.toolCallData, null, 2));
```

Or get a summary:

```javascript
console.log('=== SUMMARY ===');
console.log('Total Chunks:', window.toolCallData.chunkCount);
console.log('Tool Call Chunks:', window.toolCallData.toolCallChunks.length);
console.log('Content Chunks:', window.toolCallData.contentChunks.length);
console.log('Has Tool Calls:', window.toolCallData.toolCallChunks.length > 0 ? '✅ YES' : '❌ NO');
console.log('\nTool Call Details:');
window.toolCallData.toolCallChunks.forEach(chunk => {
  console.log(`  Chunk #${chunk.count}:`, chunk.toolCalls);
});
```

## Expected Results

### Successful Tool Call

```
🔧 Chunk #X: TOOL CALL [
  {
    "index": 0,
    "id": "call_xxx",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\":\"Tokyo\"}"
    }
  }
]
```

### Key Indicators

- ✅ At least one chunk with `hasToolCalls: true`
- ✅ `tool_calls` array contains `id`, `function.name`, `function.arguments`
- ✅ `[DONE]` marker received at the end
- ✅ `finish_reason: "tool_calls"` (if applicable)

## Common Issues

### No Tool Calls Received

1. Check if the vendor supports tool calls
2. Verify the request payload includes `tools` parameter
3. Check if the model requires tool calls for the query

### Malformed Tool Calls

1. Check if `function.arguments` is complete (may be streamed)
2. Look for multiple chunks that build up the arguments

### Stream Not Captured

1. Ensure the interceptor was installed before sending the message
2. Check browser console for errors
3. Try refreshing the page and reinstalling the interceptor

## Screenshot Guide

Take screenshots of:

1. **Console Output** - Show all chunk messages
2. **Network Request** - Show the `/chat/completions` request
3. **Network Response** - Show SSE events
4. **Playground UI** - Show the tool call being displayed (if applicable)

## Export Results

To save results:

```javascript
// Save to clipboard
copy(JSON.stringify(window.toolCallData, null, 2));

// Or download as file
const blob = new Blob([JSON.stringify(window.toolCallData, null, 2)],
  {type: 'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'tool-call-verification.json';
a.click();
```

## Next Steps

After verification:

1. If tool calls work: Document the successful flow
2. If tool calls fail: Identify which chunk is missing or malformed
3. Compare with different vendors (OpenAI, Anthropic, Gemini)
