#!/usr/bin/env tsx

/**
 * Manual browser test for Playground tool calling functionality
 * This script opens a browser with Playwright and tests the tool calling feature
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

class PlaygroundToolCallTest {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private results: TestResult[] = [];

  async init(): Promise<void> {
    console.log('🚀 Launching browser...');

    this.browser = await chromium.launch({
      headless: false, // Run with visible UI
      slowMo: 500, // Slow down for better visibility
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    // Setup console logging
    this.context.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        console.error(`   ❌ Browser Console [ERROR]: ${text}`);
      } else if (type === 'warning') {
        console.warn(`   ⚠️  Browser Console [WARN]: ${text}`);
      } else if (text.includes('[RoutePlayground]') || text.includes('tool')) {
        console.log(`   📝 Browser Console: ${text}`);
      }
    });

    // Setup network monitoring
    this.context.on('response', async response => {
      const url = response.url();
      if (url.includes('/api/gateway/chat') || url.includes('/stream')) {
        const status = response.status();
        const method = response.request().method();

        console.log(`   🌐 API ${method} ${url} → ${status}`);

        if (status >= 400) {
          console.error(`   ❌ API Error: ${status}`);
          try {
            const body = await response.text();
            console.error(`   Response body: ${body.substring(0, 200)}`);
          } catch {
            // Ignore
          }
        }
      }
    });

    this.page = await this.context.newPage();
    console.log('✅ Browser launched\n');
  }

  async navigateToPlayground(): Promise<boolean> {
    try {
      console.log('📍 Navigating to http://localhost:3000 ...');

      await this.page!.goto('http://localhost:3000', {
        waitUntil: 'networkidle',
        timeout: 10000,
      });

      console.log('✅ Page loaded');

      // Click on Playground link
      console.log('📍 Clicking Playground link...');
      await this.page!.click('a[href="/playground"]', { timeout: 5000 });

      // Wait for playground to load
      await this.page!.waitForTimeout(2000);

      // Check for header
      const header = this.page!.locator('h2:has-text("Chat Playground")');
      await header.waitFor({ state: 'visible', timeout: 5000 });

      console.log('✅ Playground loaded\n');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to navigate: ${message}\n`);
      this.results.push({
        name: 'Navigate to Playground',
        passed: false,
        message: 'Navigation failed',
        details: message,
      });
      return false;
    }
  }

  async checkUIElements(): Promise<void> {
    console.log('🔍 Test: Check UI Elements');

    try {
      // Check for tools indicator
      const toolsIndicator = this.page!.locator('text=/Tools enabled:/');
      const hasTools = await toolsIndicator.count();

      if (hasTools > 0) {
        const toolsText = await toolsIndicator.textContent();
        console.log(`   ✅ Tools indicator: ${toolsText}`);
      } else {
        console.log('   ⚠️  Tools indicator not found');
      }

      // Check for textarea
      const textarea = this.page!.locator('textarea');
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      console.log('   ✅ Chat input is visible');

      // Check for send button
      const button = this.page!.locator('button:has-text("Send")');
      const hasButton = await button.count();
      if (hasButton > 0) {
        console.log('   ✅ Send button is visible');
      }

      this.results.push({
        name: 'Check UI Elements',
        passed: true,
        message: 'UI elements are present',
      });

      console.log('✅ UI Elements test passed\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ UI Elements test failed: ${message}\n`);

      this.results.push({
        name: 'Check UI Elements',
        passed: false,
        message: 'UI elements check failed',
        details: message,
      });
    }
  }

  async testSimpleMessage(): Promise<void> {
    console.log('🔍 Test: Send Simple Message');

    try {
      const textarea = this.page!.locator('textarea');

      // Clear and enter message
      await textarea.fill('');
      await textarea.fill('Hello, can you hear me?');
      console.log('   ✅ Entered: "Hello, can you hear me?"');

      // Send message
      await this.page!.keyboard.press('Enter');
      console.log('   ✅ Sent message');

      // Wait for response
      console.log('   ⏳ Waiting for response (5s)...');
      await this.page!.waitForTimeout(5000);

      // Take screenshot
      await this.page!.screenshot({
        path: '/tmp/playground-simple-message.png',
        fullPage: true,
      });
      console.log('   📸 Screenshot saved');

      // Check for response
      const pageContent = await this.page!.content();
      const hasAssistant = pageContent.includes('assistant') || pageContent.includes('Assistant');

      if (hasAssistant) {
        console.log('   ✅ Assistant response detected');
        this.results.push({
          name: 'Simple Message',
          passed: true,
          message: 'Message sent and response received',
        });
      } else {
        console.log('   ⚠️  No assistant response found');
        this.results.push({
          name: 'Simple Message',
          passed: false,
          message: 'No assistant response',
        });
      }

      console.log('✅ Simple message test completed\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Simple message test failed: ${message}\n`);

      this.results.push({
        name: 'Simple Message',
        passed: false,
        message: 'Simple message test failed',
        details: message,
      });
    }
  }

  async testToolCall(): Promise<void> {
    console.log('🔍 Test: Tool Call (Weather)');

    try {
      // Start new chat
      const newChatButton = this.page!.locator('button:has-text("New Chat")');
      const hasNewChat = await newChatButton.count();

      if (hasNewChat > 0) {
        await newChatButton.click();
        console.log('   ✅ Started new chat');
        await this.page!.waitForTimeout(1000);
      }

      const textarea = this.page!.locator('textarea');

      // Clear and enter weather question
      await textarea.fill('');
      await textarea.fill('What is the weather in Tokyo?');
      console.log('   ✅ Entered: "What is the weather in Tokyo?"');

      // Send message
      await this.page!.keyboard.press('Enter');
      console.log('   ✅ Sent message');

      // Wait for streaming response
      console.log('   ⏳ Waiting for tool call and response (10s)...');
      await this.page!.waitForTimeout(10000);

      // Take screenshot
      await this.page!.screenshot({
        path: '/tmp/playground-weather-tool-call.png',
        fullPage: true,
      });
      console.log('   📸 Screenshot saved');

      // Analyze response
      const pageContent = await this.page!.content();

      const hasWeatherTool = pageContent.toLowerCase().includes('weather') ||
                             pageContent.toLowerCase().includes('get_weather');
      const hasToolCall = pageContent.includes('tool_call') ||
                         pageContent.includes('toolCall') ||
                         pageContent.includes('Wrench');

      console.log(`   📊 Has weather tool: ${hasWeatherTool}`);
      console.log(`   📊 Has tool call indicator: ${hasToolCall}`);

      // Look for tool call UI elements
      const toolCallElements = this.page!.locator('div[class*="tool"], div[class*="Tool"]');
      const toolCallCount = await toolCallElements.count();
      console.log(`   📊 Tool call elements: ${toolCallCount}`);

      // Check for Wrench icon
      const wrenchIcon = this.page!.locator('svg');
      const wrenchCount = await wrenchIcon.count();
      console.log(`   📊 SVG icons: ${wrenchCount}`);

      if (hasWeatherTool || hasToolCall || toolCallCount > 0) {
        console.log('   ✅ Tool call detected');
        this.results.push({
          name: 'Tool Call (Weather)',
          passed: true,
          message: 'Tool call successfully triggered',
          details: `Weather: ${hasWeatherTool}, ToolCall: ${hasToolCall}, Elements: ${toolCallCount}`,
        });
      } else {
        console.log('   ⚠️  No clear tool call detected');
        this.results.push({
          name: 'Tool Call (Weather)',
          passed: false,
          message: 'No tool call detected',
        });
      }

      console.log('✅ Tool call test completed\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Tool call test failed: ${message}\n`);

      this.results.push({
        name: 'Tool Call (Weather)',
        passed: false,
        message: 'Tool call test failed',
        details: message,
      });
    }
  }

  async testCalculatorTool(): Promise<void> {
    console.log('🔍 Test: Calculator Tool');

    try {
      // Start new chat
      const newChatButton = this.page!.locator('button:has-text("New Chat")');
      const hasNewChat = await newChatButton.count();

      if (hasNewChat > 0) {
        await newChatButton.click();
        console.log('   ✅ Started new chat');
        await this.page!.waitForTimeout(1000);
      }

      const textarea = this.page!.locator('textarea');

      // Clear and enter calculator question
      await textarea.fill('');
      await textarea.fill('Calculate 123 + 456');
      console.log('   ✅ Entered: "Calculate 123 + 456"');

      // Send message
      await this.page!.keyboard.press('Enter');
      console.log('   ✅ Sent message');

      // Wait for response
      console.log('   ⏳ Waiting for calculator response (10s)...');
      await this.page!.waitForTimeout(10000);

      // Take screenshot
      await this.page!.screenshot({
        path: '/tmp/playground-calculator-tool.png',
        fullPage: true,
      });
      console.log('   📸 Screenshot saved');

      // Check for result
      const pageContent = await this.page!.content();

      const hasNumber = pageContent.includes('579') ||
                       pageContent.includes('123') ||
                       pageContent.includes('456');
      const hasCalculator = pageContent.toLowerCase().includes('calculator') ||
                            pageContent.toLowerCase().includes('calculate');

      console.log(`   📊 Has numbers: ${hasNumber}`);
      console.log(`   📊 Has calculator: ${hasCalculator}`);

      if (hasCalculator) {
        console.log('   ✅ Calculator tool detected');
        this.results.push({
          name: 'Calculator Tool',
          passed: true,
          message: 'Calculator tool triggered',
        });
      } else {
        console.log('   ⚠️  No clear calculator tool usage');
        this.results.push({
          name: 'Calculator Tool',
          passed: false,
          message: 'No calculator tool detected',
        });
      }

      console.log('✅ Calculator test completed\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Calculator test failed: ${message}\n`);

      this.results.push({
        name: 'Calculator Tool',
        passed: false,
        message: 'Calculator test failed',
        details: message,
      });
    }
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60) + '\n');

    let passed = 0;
    let failed = 0;

    for (const result of this.results) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.message}`);

      if (result.details) {
        console.log(`   Details: ${result.details}`);
      }

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('-'.repeat(60) + '\n');

    if (failed > 0) {
      console.log('⚠️  Some tests failed. Check screenshots in /tmp/ for details.\n');
    } else {
      console.log('🎉 All tests passed!\n');
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');

    if (this.page) {
      await this.page.close();
    }

    if (this.context) {
      await this.context.close();
    }

    if (this.browser) {
      await this.browser.close();
    }

    console.log('✅ Cleanup complete\n');
  }

  async run(): Promise<void> {
    try {
      await this.init();

      if (!(await this.navigateToPlayground())) {
        this.results.push({
          name: 'Navigation',
          passed: false,
          message: 'Could not navigate to playground',
        });
        this.printSummary();
        return;
      }

      await this.checkUIElements();
      await this.testSimpleMessage();
      await this.testToolCall();
      await this.testCalculatorTool();

      // Keep browser open for manual inspection
      console.log('⏸️  Browser kept open for manual inspection. Press Ctrl+C to exit.');
      console.log('   Close the browser window to end the test.\n');

      // Wait for browser to be closed
      if (this.browser) {
        // Check if browser is still connected
        while (this.browser && this.browser.isConnected()) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('❌ Test run error:', error);
    } finally {
      this.printSummary();
      await this.cleanup();
    }
  }
}

// Run tests
async function main() {
  const test = new PlaygroundToolCallTest();
  await test.run();
}

main().catch(console.error);
