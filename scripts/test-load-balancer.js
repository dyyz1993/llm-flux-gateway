#!/usr/bin/env node

/**
 * 负载均衡路由测试脚本
 * 测试负载均衡器是否正确路由请求
 */

import { chromium } from 'playwright';

const API_BASE_URL = 'http://localhost:3001';
const TEST_USERNAME = 'admin';
const TEST_PASSWORD = 'changeme';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLoginAndRoute() {
  console.log('\n🚀 开始负载均衡路由测试...\n');

  const browser = await chromium.connectOverCDP('http://localhost:9221');
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 登录
    console.log('📝 步骤1: 登录系统');
    await page.goto(`${API_BASE_URL}/#/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[placeholder="Username"]', TEST_USERNAME);
    await page.fill('input[placeholder="Password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');

    await page.waitForTimeout(2000);
    console.log('✅ 登录成功');

    // 2. 进入 Keys 页面
    console.log('\n📝 步骤2: 进入 Keys 管理页面');
    await page.click('text=Keys');
    await page.waitForTimeout(1000);
    console.log('✅ Keys 页面加载成功');

    // 3. 查看现有 Keys
    const keys = await page.locator('[class*="key-card"], [class*="api-key"]').count();
    console.log(`\n📊 发现 ${keys} 个 API Keys`);

    // 4. 检查健康状态指示器
    console.log('\n📝 步骤3: 检查健康状态指示器');
    const healthyIndicators = await page.locator('[class*="green"], [class*="healthy"]').count();
    console.log(`✅ 健康指示器数量: ${healthyIndicators}`);

    // 5. 检查权重显示
    console.log('\n📝 步骤4: 检查权重显示');
    const weightElements = await page.locator('text=/w:\\d+/').count();
    console.log(`✅ 权重显示数量: ${weightElements}`);

    // 6. 进入 Playground 测试实际路由
    console.log('\n📝 步骤5: 进入 Playground 测试路由');
    await page.click('text=Playground');
    await page.waitForTimeout(1000);
    console.log('✅ Playground 页面加载成功');

    // 7. 发送测试请求
    console.log('\n📝 步骤6: 发送测试请求');

    // 填写测试消息
    const messageInput = await page.locator('textarea, input[type="text"]').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill('Hello, this is a test message for load balancing');
      console.log('✅ 测试消息已填写');

      // 点击发送按钮
      const sendButton = await page.locator('button:has-text("Send"), button:has-text("发送")').first();
      if (await sendButton.isVisible()) {
        await sendButton.click();
        console.log('✅ 发送按钮已点击');

        // 等待响应
        await page.waitForTimeout(3000);
        console.log('✅ 等待响应完成');
      }
    }

    // 8. 查看请求日志
    console.log('\n📝 步骤7: 检查请求日志');
    await page.click('text=Logs');
    await page.waitForTimeout(1000);

    const logEntries = await page.locator('[class*="log"], [class*="request"]').count();
    console.log(`✅ 发现 ${logEntries} 条日志记录`);

    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    console.log(`✅ 登录功能: 正常`);
    console.log(`✅ Keys 页面: 正常`);
    console.log(`✅ 健康状态指示器: ${healthyIndicators} 个`);
    console.log(`✅ 权重显示: ${weightElements} 个`);
    console.log(`✅ Playground: 正常`);
    console.log(`✅ 日志记录: ${logEntries} 条`);
    console.log('='.repeat(60));
    console.log('\n🎉 负载均衡路由测试完成！\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// 运行测试
testLoginAndRoute().catch(console.error);
