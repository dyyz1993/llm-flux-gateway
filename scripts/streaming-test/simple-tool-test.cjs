#!/usr/bin/env node

/**
 * Simple Tool Call Test
 * Tests the API directly to verify tool call streaming
 */

const http = require('http');

const payload = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'user',
      content: 'What is the weather in Tokyo?'
    }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state'
            }
          },
          required: ['location']
        }
      }
    }
  ],
  stream: true
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Authorization': 'Bearer sk-flux-your-key-here'
  }
};

console.log('🔍 Tool Call Verification Test');
console.log('================================\n');
console.log('📡 Sending request to http://localhost:3000/v1/chat/completions\n');

let chunkCount = 0;
let toolCallCount = 0;
let contentCount = 0;
let doneReceived = false;
const chunks = [];

const req = http.request(options, (res) => {
  console.log(`✅ Response Status: ${res.statusCode}`);
  console.log(`📋 Response Headers:`, res.headers);
  console.log('\n📥 Receiving SSE Stream:\n');

  let buffer = '';

  res.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        chunkCount++;
        const data = line.slice(6);

        if (data === '[DONE]') {
          console.log(`✅ Chunk #${chunkCount}: [DONE]`);
          doneReceived = true;
          chunks.push({ count: chunkCount, type: 'done' });
        } else {
          try {
            const parsed = JSON.parse(data);
            const hasToolCalls = !!parsed.choices?.[0]?.delta?.tool_calls;
            const hasContent = !!parsed.choices?.[0]?.delta?.content;
            const finishReason = parsed.choices?.[0]?.finish_reason;

            const chunkInfo = {
              count: chunkCount,
              hasToolCalls,
              hasContent,
              finishReason,
              toolCalls: parsed.choices?.[0]?.delta?.tool_calls,
              content: parsed.choices?.[0]?.delta?.content
            };

            chunks.push(chunkInfo);

            if (hasToolCalls) {
              toolCallCount++;
              console.log(`🔧 Chunk #${chunkCount}: TOOL CALL`);
              console.log(`   ${JSON.stringify(chunkInfo.toolCalls, null, 2)}`);
            } else if (hasContent) {
              contentCount++;
              console.log(`📝 Chunk #${chunkCount}: Content - "${chunkInfo.content}"`);
            } else if (finishReason) {
              console.log(`⏹️  Chunk #${chunkCount}: Finish Reason - ${finishReason}`);
            } else {
              // Log first 10 and last 5 "other" chunks for debugging
              if (chunkCount <= 10 || chunkCount >= 50) {
                console.log(`📦 Chunk #${chunkCount}: Other - Full:`, JSON.stringify(parsed, null, 2));
              } else {
                console.log(`📦 Chunk #${chunkCount}: Other`);
              }
            }
          } catch (e) {
            console.log(`❌ Chunk #${chunkCount}: Parse Error - ${data}`);
            chunks.push({ count: chunkCount, error: 'parse_error', raw: data });
          }
        }
      }
    }
  });

  res.on('end', () => {
    console.log('\n================================');
    console.log('📊 TEST SUMMARY');
    console.log('================================');
    console.log(`Total Chunks: ${chunkCount}`);
    console.log(`Tool Call Chunks: ${toolCallCount}`);
    console.log(`Content Chunks: ${contentCount}`);
    console.log(`Stream Completed: ${doneReceived ? '✅ YES' : '❌ NO'}`);
    console.log('================================\n');

    // Save report
    const fs = require('fs');
    const report = {
      timestamp: new Date().toISOString(),
      totalChunks: chunkCount,
      toolCallChunks: toolCallCount,
      contentChunks: contentCount,
      doneReceived,
      chunks,
      summary: {
        toolCallsReceived: toolCallCount > 0,
        contentReceived: contentCount > 0,
        streamCompleted: doneReceived
      }
    };

    const reportPath = '/tmp/tool-call-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${reportPath}\n`);

    // Final verdict
    if (toolCallCount > 0) {
      console.log('✅ SUCCESS: Tool calls were received in the stream\n');
      process.exit(0);
    } else {
      console.log('❌ FAILURE: No tool calls detected in the stream\n');
      console.log('Possible reasons:');
      console.log('  1. The model does not support tool calls');
      console.log('  2. The tool call format is incorrect');
      console.log('  3. The query does not trigger tool calls');
      console.log('  4. Server is not properly configured');
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
  console.log('\nMake sure the server is running on http://localhost:3000');
  console.log('Start it with: npm run dev');
  process.exit(1);
});

req.write(payload);
req.end();

console.log('Waiting for response...\n');
