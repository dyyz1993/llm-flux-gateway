# E2E 测试 (Playwright) 详解

## 运行命令

```bash
# Run all E2E tests
npx playwright test

# Run with UI mode (recommended for debugging)
npx playwright test --ui

# Run in debug mode (step-through)
npx playwright test --debug

# Run specific file
npx playwright test e2e/login.spec.ts

# Run on specific browser
npx playwright test --project=chromium

# Generate test code by recording
npx playwright codegen http://localhost:3010
```

## 强制规范

1. **禁止使用 `--headed` 参数**
2. **必须使用 `test.afterEach` 释放资源**
3. **产物目录**: `playwright-artifacts/`
4. **使用 `data-testid` 选择元素**

## 资源清理 (强制)

```typescript
test.describe('Admin Panel', () => {
  test.afterEach(async ({ page, context }) => {
    // Clear storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Close all pages in context
    const pages = context.pages();
    for (const p of pages) {
      if (p !== page) {
        await p.close();
      }
    }
  });
});
```

## 基础测试模式

### 页面导航

```typescript
test('should navigate to dashboard', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin');
  await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible();
});
```

### 表单填写

```typescript
test('should submit form', async ({ page }) => {
  await page.goto('/login');

  // Fill with concrete values
  await page.fill('[data-testid="username"]', 'testuser');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="submit-button"]');

  // Verify redirect
  await expect(page).toHaveURL('/dashboard');
});
```

### 验证具体数据

```typescript
test('should display user info', async ({ page }) => {
  await page.goto('/profile');

  // Verify specific text content
  await expect(page.locator('[data-testid="user-name"]')).toHaveText('testuser');
  await expect(page.locator('[data-testid="user-email"]')).toHaveText('test@example.com');
});
```

## 网络拦截

```typescript
test('should handle API response', async ({ page }) => {
  // Mock API response
  await page.route('**/api/data', (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({ items: [{ id: '1', name: 'Test' }] }),
    });
  });

  await page.goto('/data');
  await expect(page.locator('[data-testid="item-1"]')).toBeVisible();
});
```

## Page Objects 模式

```typescript
class LoginPage {
  constructor(private page: Page) {}

  async login(username: string, password: string) {
    await this.page.fill('[data-testid="username"]', username);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="login-button"]');
  }

  async verifyLoggedIn() {
    await expect(this.page.locator('[data-testid="dashboard"]')).toBeVisible();
  }
}

test('should login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.login('admin', 'password123');
  await loginPage.verifyLoggedIn();
});
```

## Playwright vs Testing Library

| Aspect      | Playwright (E2E)          | Testing Library (Unit)  |
| ----------- | ------------------------- | ----------------------- |
| Environment | Real browser              | jsdom (simulated)       |
| Speed       | Slower                    | Fast                    |
| Scope       | Full user flows           | Single component        |
| Network     | Real requests (or mocked) | Always mocked           |
| Use when    | Multi-page workflows      | Component logic testing |
| Run command | `npx playwright test`     | `npx vitest run`        |

## Configuration

配置文件: `playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:3010',
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
});
```

## 重要注意事项

- **Do NOT use `--headed` flag**: Per project rules, always run headless
- **Pre-commit hooks**: E2E tests are NOT run in pre-commit (too slow)
- **CI/CD**: Run E2E tests in CI pipeline only
- **Test data**: Use concrete values, avoid random data for reproducibility
- **Cleanup**: Use `test.afterEach()` to clean up test data
