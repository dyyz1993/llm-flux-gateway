import { test, expect } from '@playwright/test';

test.describe('Playground Tool Calling', () => {
  test.beforeEach(async ({ page }) => {
    // Setup console log capture
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`Browser console error:`, msg.text());
      } else {
        console.log(`Browser console [${msg.type()}]:`, msg.text());
      }
    });

    // Setup network response capture
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/api/gateway/chat') || url.includes('/stream')) {
        console.log(`API Response [${response.status()}]: ${url}`);
        try {
          const contentType = response.headers()['content-type'];
          if (contentType?.includes('text/event-stream')) {
            console.log('SSE Stream detected');
          }
        } catch (e) {
          // Ignore
        }
      }
    });

    await page.goto('http://localhost:3000');
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to playground and check UI elements', async ({ page }) => {
    console.log('📋 Test: Navigate to playground and check UI');

    // Click on Playground link
    await page.click('a[href="/playground"]', { timeout: 5000 });
    console.log('✅ Navigated to playground');

    // Wait for page to stabilize
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/playground-initial.png', fullPage: true });
    console.log('📸 Screenshot saved to /tmp/playground-initial.png');

    // Check for header
    const header = page.locator('h2:has-text("Chat Playground")');
    await expect(header).toBeVisible({ timeout: 5000 });
    console.log('✅ Chat Playground header is visible');

    // Check for tools enabled indicator
    const toolsIndicator = page.locator('text=/Tools enabled:/');
    const hasTools = await toolsIndicator.count();
    if (hasTools > 0) {
      console.log('✅ Tools indicator is visible');
      const toolsText = await toolsIndicator.textContent();
      console.log(`   ${toolsText}`);
    }

    // Check for input area
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    console.log('✅ Chat input textarea is visible');

    // Check for send button or submit button
    const button = page.locator('button:has-text("Send"), button[type="submit"]');
    const hasButton = await button.count();
    if (hasButton > 0) {
      console.log('✅ Send button is visible');
    }
  });

  test('should send message and observe streaming response', async ({ page }) => {
    console.log('📋 Test: Send message and observe streaming');

    // Click on Playground link
    await page.click('a[href="/playground"]');
    await page.waitForTimeout(2000);

    // Enter a simple test message first (without tools)
    const textarea = page.locator('textarea');
    await textarea.fill('Hello, can you hear me?');
    console.log('✅ Entered test message');

    // Send the message
    await page.keyboard.press('Enter');
    console.log('✅ Pressed Enter to send');

    // Wait for response
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/playground-after-message.png', fullPage: true });
    console.log('📸 Screenshot saved');

    // Check for any assistant response
    const messages = page.locator('div[class*="message"], div[class*="chat"]');
    const messageCount = await messages.count();
    console.log(`📊 Found ${messageCount} message elements`);

    // Log page structure
    const pageContent = await page.content();
    const hasAssistant = pageContent.includes('assistant') || pageContent.includes('Assistant');
    const hasToolCall = pageContent.includes('tool') || pageContent.includes('Tool');

    console.log(`📊 Has assistant content: ${hasAssistant}`);
    console.log(`📊 Has tool call content: ${hasToolCall}`);
  });

  test('should attempt tool call with weather question', async ({ page }) => {
    console.log('📋 Test: Attempt tool call with weather question');

    // Click on Playground link
    await page.click('a[href="/playground"]');
    await page.waitForTimeout(2000);

    // Check if we need to select a model
    const modelSelector = page.locator('select, button:has-text("Model")');
    const modelCount = await modelSelector.count();

    if (modelCount > 0) {
      console.log('⚠️ Model selector found, may need to select model');
      // Try to select first available model
      await modelSelector.first().click();
      await page.waitForTimeout(500);
    }

    // Clear any existing text and enter weather question
    const textarea = page.locator('textarea');
    await textarea.fill('');
    await textarea.fill('What is the weather in Tokyo?');
    console.log('✅ Entered weather question');

    // Send the message
    await page.keyboard.press('Enter');
    console.log('✅ Sent message');

    // Wait for streaming response
    console.log('⏳ Waiting for response...');
    await page.waitForTimeout(8000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/playground-weather-test.png', fullPage: true });
    console.log('📸 Screenshot saved');

    // Check page content for tool calls
    const pageContent = await page.content();

    const hasWeatherTool = pageContent.toLowerCase().includes('weather') ||
                           pageContent.toLowerCase().includes('get_weather');
    const hasToolCall = pageContent.includes('tool_call') ||
                       pageContent.includes('toolCall') ||
                       pageContent.includes('Wrench');

    console.log(`📊 Page has weather tool: ${hasWeatherTool}`);
    console.log(`📊 Page has tool call indicator: ${hasToolCall}`);

    // Look for Wrench icon (tool indicator)
    const wrenchIcon = page.locator('svg:has([d*="M14.7"])'); // Lucide Wrench icon path
    const hasWrench = await wrenchIcon.count();
    console.log(`📊 Found ${hasWrench} wrench icons`);

    // Check for loading state
    const loadingElements = page.locator('text=/Loading|Sending|Thinking/');
    const loadingCount = await loadingElements.count();
    console.log(`📊 Loading elements: ${loadingCount}`);
  });

  test('should test calculator tool', async ({ page }) => {
    console.log('📋 Test: Calculator tool');

    // Click on Playground link
    await page.click('a[href="/playground"]');
    await page.waitForTimeout(2000);

    // Enter calculator question
    const textarea = page.locator('textarea');
    await textarea.fill('');
    await textarea.fill('Calculate 123 + 456');
    console.log('✅ Entered calculator question');

    // Send the message
    await page.keyboard.press('Enter');
    console.log('✅ Sent message');

    // Wait for response
    await page.waitForTimeout(8000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/playground-calculator-test.png', fullPage: true });
    console.log('📸 Screenshot saved');

    // Check for result
    const pageContent = await page.content();
    const hasNumber = pageContent.includes('579') ||
                     pageContent.includes('123') ||
                     pageContent.includes('456');

    console.log(`📊 Page contains numbers: ${hasNumber}`);

    // Look for calculator tool
    const hasCalculator = pageContent.toLowerCase().includes('calculator') ||
                         pageContent.toLowerCase().includes('calculate');

    console.log(`📊 Page mentions calculator: ${hasCalculator}`);
  });
});
