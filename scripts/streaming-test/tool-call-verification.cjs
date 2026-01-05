#!/usr/bin/env node

/**
 * Tool Call Verification Script
 *
 * This script tests the Playground's tool calling functionality by:
 * 1. Opening the Playground in a browser
 * 2. Sending a message that triggers tool calls
 * 3. Intercepting and analyzing the SSE stream
 * 4. Reporting detailed results
 */

const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyToolCalls() {
  console.log('🔍 Starting Tool Call Verification...\n');

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
  });

  const page = await browser.newPage();

  // Enable console logging from the browser
  page.on('console', msg => {
    console.log('🖥️  Browser Console:', msg.text());
  });

  // Enable network monitoring
  await page.setRequestInterception(true);

  let chatRequestCaptured = null;
  let chatResponseChunks = [];

  page.on('request', async (request) => {
    const url = request.url();

    if (url.includes('/chat/completions')) {
      console.log('\n📤 Capturing chat completions request...');

      try {
        const postData = request.postData();
        if (postData) {
          chatRequestCaptured = JSON.parse(postData);
          console.log('📦 Request Payload:', JSON.stringify(chatRequestCaptured, null, 2));
        }
      } catch (e) {
        console.log('⚠️  Could not parse request payload:', e.message);
      }
    }

    request.continue();
  });

  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('/chat/completions')) {
      console.log('\n📥 Capturing chat completions response...');

      try {
        // Get the response body as a stream
        const reader = response._client;

        // We'll intercept the response via the page
        await page.evaluate(() => {
          window.capturedChunks = [];
          window.chunkCount = 0;

          // Override fetch to intercept SSE
          const originalFetch = window.fetch;
          window.fetch = function(...args) {
            return originalFetch.apply(this, args).then(async response => {
              if (args[0].includes('/chat/completions')) {
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
                      window.chunkCount++;
                      const data = line.slice(6);

                      if (data === '[DONE]') {
                        window.capturedChunks.push({ type: 'done', count: window.chunkCount });
                      } else {
                        try {
                          const parsed = JSON.parse(data);
                          window.capturedChunks.push({
                            count: window.chunkCount,
                            hasContent: !!parsed.choices?.[0]?.delta?.content,
                            hasToolCalls: !!parsed.choices?.[0]?.delta?.tool_calls,
                            finishReason: parsed.choices?.[0]?.finish_reason,
                            toolCalls: parsed.choices?.[0]?.delta?.tool_calls,
                            fullChunk: parsed
                          });
                        } catch (e) {
                          window.capturedChunks.push({
                            count: window.chunkCount,
                            error: 'JSON Parse Error',
                            raw: data
                          });
                        }
                      }
                    }
                  }
                }

                // Return a new Response with the original body
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

          console.log('✅ Fetch interceptor installed');
        });

      } catch (e) {
        console.log('⚠️  Could not intercept response:', e.message);
      }
    }
  });

  // Navigate to Playground
  console.log('🌐 Navigating to Playground...');
  await page.goto('http://localhost:3000/playground', { waitUntil: 'networkidle2' });

  console.log('📸 Taking initial screenshot...');
  await page.screenshot({ path: '/tmp/playground-initial.png', fullPage: true });

  // Wait for page to load
  await sleep(2000);

  // Take snapshot of the page
  console.log('\n📋 Page Snapshot:');
  const snapshot = await page.accessibility.snapshot();
  console.log(JSON.stringify(snapshot, null, 2).substring(0, 500));

  // Try to find and interact with the chat input
  console.log('\n⌨️  Looking for chat input...');

  // Try multiple selectors for the input
  const inputSelectors = [
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="Type"]',
    'textarea[placeholder*="Ask"]',
    'textarea.chat-input',
    'textarea.input',
    'textarea',
    'input[type="text"]',
    '[contenteditable="true"]'
  ];

  let inputElement = null;
  for (const selector of inputSelectors) {
    try {
      inputElement = await page.$(selector);
      if (inputElement) {
        console.log(`✅ Found input with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!inputElement) {
    console.log('⚠️  Could not find input element, trying to evaluate in page...');

    // Try to find input by evaluating JavaScript
    const inputFound = await page.evaluate(() => {
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (ta.offsetParent !== null) {  // Visible
          ta.focus();
          ta.value = 'What is the weather in Tokyo?';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    });

    if (!inputFound) {
      console.log('❌ Could not find or interact with input element');
      console.log('📸 Taking screenshot of current state...');
      await page.screenshot({ path: '/tmp/playground-no-input.png', fullPage: true });
      await browser.close();
      return;
    }
  } else {
    await inputElement.click();
    await inputElement.type('What is the weather in Tokyo?');
  }

  console.log('✅ Entered text in input');

  // Take screenshot after entering text
  await page.screenshot({ path: '/tmp/playground-after-input.png', fullPage: true });

  // Look for send button
  console.log('\n🔍 Looking for send button...');

  const buttonSelectors = [
    'button[type="submit"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button.send',
    'button.submit',
    'button:has-text("Send")',
    'button:has-text("send")',
  ];

  let sendButton = null;
  for (const selector of buttonSelectors) {
    try {
      sendButton = await page.$(selector);
      if (sendButton) {
        console.log(`✅ Found send button with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  if (!sendButton) {
    console.log('⚠️  Could not find send button, trying Enter key...');

    // Try pressing Enter
    try {
      await page.keyboard.press('Enter');
      console.log('✅ Pressed Enter');
    } catch (e) {
      console.log('❌ Could not send message:', e.message);
      await browser.close();
      return;
    }
  } else {
    await sendButton.click();
    console.log('✅ Clicked send button');
  }

  // Wait for response
  console.log('\n⏳ Waiting for response...');
  await sleep(5000);

  // Get captured chunks from the browser
  console.log('\n📊 Retrieving captured chunks...');
  const capturedData = await page.evaluate(() => {
    return {
      chunks: window.capturedChunks || [],
      totalCount: window.chunkCount || 0
    };
  });

  console.log(`\n📈 Total Chunks Captured: ${capturedData.totalCount}`);

  // Analyze chunks
  console.log('\n🔍 Analyzing chunks...\n');

  let toolCallChunks = [];
  let contentChunks = [];
  let doneChunk = null;

  for (const chunk of capturedData.chunks) {
    if (chunk.type === 'done') {
      doneChunk = chunk;
      console.log(`✅ Chunk #${chunk.count}: [DONE]`);
    } else if (chunk.error) {
      console.log(`❌ Chunk #${chunk.count}: ${chunk.error} - ${chunk.raw}`);
    } else if (chunk.hasToolCalls) {
      toolCallChunks.push(chunk);
      console.log(`🔧 Chunk #${chunk.count}: Tool Calls`, JSON.stringify(chunk.toolCalls, null, 2));
    } else if (chunk.hasContent) {
      contentChunks.push(chunk);
      console.log(`📝 Chunk #${chunk.count}: Content`);
    } else {
      console.log(`📦 Chunk #${chunk.count}: Other (finish_reason: ${chunk.finishReason})`);
    }
  }

  // Final screenshot
  console.log('\n📸 Taking final screenshot...');
  await page.screenshot({ path: '/tmp/playground-final.png', fullPage: true });

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    requestPayload: chatRequestCaptured,
    totalChunks: capturedData.totalCount,
    toolCallChunks: toolCallChunks.length,
    contentChunks: contentChunks.length,
    hasDoneChunk: !!doneChunk,
    chunks: capturedData.chunks,
    summary: {
      toolCallsReceived: toolCallChunks.length > 0,
      contentReceived: contentChunks.length > 0,
      streamCompleted: !!doneChunk,
      finishReason: doneChunk ? 'stream_completed' : 'unknown'
    }
  };

  const reportPath = '/tmp/tool-call-verification-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tool Calls Received: ${report.summary.toolCallsReceived ? '✅ YES' : '❌ NO'}`);
  console.log(`Content Received: ${report.summary.contentReceived ? '✅ YES' : '❌ NO'}`);
  console.log(`Stream Completed: ${report.summary.streamCompleted ? '✅ YES' : '❌ NO'}`);
  console.log(`Total Tool Call Chunks: ${toolCallChunks.length}`);
  console.log(`Total Content Chunks: ${contentChunks.length}`);
  console.log('='.repeat(60));

  // Keep browser open for inspection
  console.log('\n⏸️  Browser staying open for inspection. Press Ctrl+C to close.');
  console.log('📸 Screenshots saved to /tmp/playground-*.png');

  // Wait for user to close
  await new Promise(() => {}); // Never resolve, wait for Ctrl+C

  await browser.close();
}

// Run the verification
verifyToolCalls().catch(console.error);
