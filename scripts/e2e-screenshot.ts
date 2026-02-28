import { chromium, Page, Browser, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '../docs/screenshots');
const VIEWPORT = { width: 1920, height: 1080 };

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

interface ScreenshotTask {
  category: string;
  filename: string;
  description: string;
  action: (page: Page) => Promise<void>;
}

async function takeScreenshot(page: Page, category: string, filename: string) {
  const dir = path.join(SCREENSHOT_DIR, category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filepath = path.join(dir, filename);
  await page.screenshot({
    path: filepath,
    fullPage: false,
  });
  console.log(`✅ Screenshot saved: ${category}/${filename}`);
}

async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function main() {
  console.log('🚀 Starting E2E Screenshot Capture...');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`📁 Screenshot Directory: ${SCREENSHOT_DIR}`);

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100,
  });
  
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'zh-CN',
  });
  
  const page = await context.newPage();

  try {
    // ========================================
    // 场景 1: 登录页面
    // ========================================
    console.log('\n📋 Scene 1: Login Page');
    
    await page.goto(`${BASE_URL}/#/login`);
    await waitForPageLoad(page);
    await takeScreenshot(page, '01-login', '01-login-page.png');

    // 输入错误凭据
    await page.fill('input[type="text"]', 'wronguser');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '01-login', '02-login-error.png');

    // 正确登录
    await page.fill('input[type="text"]', ADMIN_USERNAME);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/#\/dashboard/, { timeout: 10000 });
    await waitForPageLoad(page);

    // ========================================
    // 场景 2: 数据分析仪表盘
    // ========================================
    console.log('\n📋 Scene 2: Analytics Dashboard');
    
    await page.goto(`${BASE_URL}/#/dashboard`);
    await waitForPageLoad(page);
    await takeScreenshot(page, '02-dashboard', '01-overview.png');

    // 滚动到 Token 使用趋势
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);
    await takeScreenshot(page, '02-dashboard', '02-token-usage.png');

    // 滚动到模型分布
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(300);
    await takeScreenshot(page, '02-dashboard', '03-model-distribution.png');

    // 滚动到最近请求
    await page.evaluate(() => window.scrollTo(0, 1800));
    await page.waitForTimeout(300);
    await takeScreenshot(page, '02-dashboard', '04-recent-requests.png');

    // 滚动回顶部
    await page.evaluate(() => window.scrollTo(0, 0));

    // ========================================
    // 场景 3: 厂商管理
    // ========================================
    console.log('\n📋 Scene 3: Vendor Management');
    
    await page.click('button:has-text("Vendors")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '03-vendors', '01-vendor-list.png');

    // 点击 Sync from YAML
    const syncButton = page.locator('button:has-text("Sync from YAML")');
    if (await syncButton.isVisible()) {
      await syncButton.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '03-vendors', '02-sync-yaml.png');
    }

    // 点击 Edit YAML
    const editYamlButton = page.locator('button:has-text("Edit YAML")');
    if (await editYamlButton.isVisible()) {
      await editYamlButton.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, '03-vendors', '03-edit-yaml.png');
      // 关闭弹窗
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // ========================================
    // 场景 4: 资产管理
    // ========================================
    console.log('\n📋 Scene 4: Asset Management');
    
    await page.click('button:has-text("Assets")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '04-assets', '01-asset-list.png');

    // 点击 Add Asset
    const addAssetButton = page.locator('button:has-text("Add Asset")');
    if (await addAssetButton.isVisible()) {
      await addAssetButton.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, '04-assets', '02-create-asset-step1.png');

      // 选择第一个厂商
      const vendorButton = page.locator('.grid button').first();
      if (await vendorButton.isVisible()) {
        await vendorButton.click();
        await page.waitForTimeout(300);
      }

      // 点击 Next
      const nextButton = page.locator('button:has-text("Next")');
      if (await nextButton.isVisible()) {
        await nextButton.click();
        await page.waitForTimeout(300);
        await takeScreenshot(page, '04-assets', '03-create-asset-step2.png');
      }

      // 点击 Next 进入步骤3
      const nextButton2 = page.locator('button:has-text("Next")');
      if (await nextButton2.isVisible()) {
        await nextButton2.click();
        await page.waitForTimeout(300);
        await takeScreenshot(page, '04-assets', '04-create-asset-step3.png');
      }

      // 关闭弹窗
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // ========================================
    // 场景 5: 路由管理
    // ========================================
    console.log('\n📋 Scene 5: Route Management');
    
    await page.click('button:has-text("Route Flux")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '05-routes', '01-route-list.png');

    // 创建路由表单
    const routeNameInput = page.locator('input[placeholder="Route name"]');
    if (await routeNameInput.isVisible()) {
      await routeNameInput.fill('Test Route');
      await takeScreenshot(page, '05-routes', '02-create-route.png');
    }

    // 点击编辑按钮（如果存在路由）
    const editButton = page.locator('button[title="Edit"]').first();
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(300);
      await takeScreenshot(page, '05-routes', '03-edit-route.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // ========================================
    // 场景 6: 密钥管理
    // ========================================
    console.log('\n📋 Scene 6: Key Management');
    
    await page.click('button:has-text("Access Keys")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '06-keys', '01-key-list.png');

    // 填写生成密钥表单
    const keyNameInput = page.locator('input[placeholder*="Client name"]');
    if (await keyNameInput.isVisible()) {
      await keyNameInput.fill('Test Client');
      await takeScreenshot(page, '06-keys', '02-generate-key.png');
    }

    // 检查是否有成功提示
    const successCard = page.locator('text=API Key Generated Successfully');
    if (await successCard.isVisible()) {
      await takeScreenshot(page, '06-keys', '03-key-success.png');
    }

    // ========================================
    // 场景 7: Playground
    // ========================================
    console.log('\n📋 Scene 7: Playground');
    
    await page.click('button:has-text("Playground")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '07-playground', '01-chat-interface.png');

    // 展开配置面板
    const configButton = page.locator('button[title*="configuration"], button:has(svg)').filter({ hasText: '' });
    const settingsButton = page.locator('button').filter({ has: page.locator('svg') }).nth(1);
    await settingsButton.click();
    await page.waitForTimeout(300);
    await takeScreenshot(page, '07-playground', '02-model-selector.png');

    // 关闭配置面板
    await settingsButton.click();
    await page.waitForTimeout(200);

    // Debug 按钮
    const debugButton = page.locator('button[title="Toggle debug panel"]');
    if (await debugButton.isVisible()) {
      await debugButton.click();
      await page.waitForTimeout(300);
      await takeScreenshot(page, '07-playground', '05-debug-panel.png');
      await debugButton.click();
      await page.waitForTimeout(200);
    }

    // ========================================
    // 场景 8: 日志查询
    // ========================================
    console.log('\n📋 Scene 8: Log Explorer');
    
    await page.click('button:has-text("Logs")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '08-logs', '01-log-list.png');

    // 点击日志详情
    const logRow = page.locator('[data-class-id="LogList"] table tbody tr').first();
    if (await logRow.isVisible()) {
      await logRow.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, '08-logs', '02-log-detail.png');
    }

    // 高级过滤
    const filterButton = page.locator('button:has-text("Filters")');
    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(300);
      await takeScreenshot(page, '08-logs', '03-filter-logs.png');
      await filterButton.click();
      await page.waitForTimeout(200);
    }

    // ========================================
    // 场景 9: 系统设置
    // ========================================
    console.log('\n📋 Scene 9: System Settings');
    
    await page.click('button:has-text("System")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '09-system', '01-system-settings.png');

    // ========================================
    // 场景 10: 完整工作流
    // ========================================
    console.log('\n📋 Scene 10: Complete Workflows');

    // 首次配置流程
    await page.click('button:has-text("Vendors")');
    await waitForPageLoad(page);
    const syncBtn = page.locator('button:has-text("Sync from YAML")');
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '10-workflows/01-first-time-setup', 'step1-sync-vendors.png');
    }

    await page.click('button:has-text("Assets")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-workflows/01-first-time-setup', 'step2-create-asset.png');

    await page.click('button:has-text("Route Flux")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-workflows/01-first-time-setup', 'step3-create-route.png');

    await page.click('button:has-text("Access Keys")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-workflows/01-first-time-setup', 'step4-generate-key.png');

    await page.click('button:has-text("Playground")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-workflows/01-first-time-setup', 'step5-test.png');

    // 日常使用流程
    await page.click('button:has-text("Analytics")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-workflows/02-daily-usage', 'view-analytics.png');

    await page.click('button:has-text("Playground")');
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-workflows/02-daily-usage', 'test-model.png');

    console.log('\n✨ Screenshot capture completed!');
    console.log(`📁 Total screenshots saved to: ${SCREENSHOT_DIR}`);

  } catch (error) {
    console.error('❌ Error during screenshot capture:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
