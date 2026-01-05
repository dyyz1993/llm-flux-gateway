---
paths: src/**/*.test.ts, src/**/*.test.tsx
---

# Testing Standards

## 📂 Organization & Location

### 测试文件位置

统一使用 `__tests__/` 子目录存放测试文件：

- **客户端**: `src/client/**/*.ts` → `src/client/**/__tests__/*.test.ts`
  - `src/client/stores/exampleStore.ts` → `src/client/stores/__tests__/exampleStore.test.ts`
  - `src/client/services/apiClient.ts` → `src/client/services/__tests__/apiClient.test.ts`

- **服务端**: `server/**/*.ts` → `server/**/__tests__/*.test.ts`
  - `server/routes/file.ts` → `server/routes/__tests__/file.test.ts`
  - `server/services/shell.ts` → `server/services/__tests__/shell.test.ts`

### 目录结构示例

```
src/client/
  stores/
    exampleStore.ts
    __tests__/
      exampleStore.test.ts
  services/
    apiClient.ts
    __tests__/
      apiClient.test.ts
server/
  routes/
    user.ts
    __tests__/
      user.test.ts
```

### 必须覆盖

- `src/client/services/` 中的所有业务逻辑文件
- `server/routes/` 和 `server/services/` (待实现后)

### 共享测试工具

- 客户端：内联在测试文件中或放在 `src/client/utils/test-helpers.ts`
- 服务端：`server/utils/test-helpers.ts` (待实现)

## 🧪 Test Writing Standards

### Vitest 配置

- **配置文件**: `vitest.config.ts` (已配置)
- **Setup 文件**: `vitest.setup.ts` (已配置)
- **测试环境**: jsdom (客户端) / node (服务端)
- **路径别名**: 已配置 `@shared`, `@client`, `@server`

### Response 克隆策略

**推荐**在测试辅助函数中克隆 Response 后再解析 JSON（避免流已被读取）：

```typescript
// 推荐做法
const clone = response.clone();
const json = await clone.json();
```

注意：当前代码库中未强制使用此模式，但在涉及多次读取 Response 时应采用。

### 特殊类型验证

- **Streaming/SSE**: 验证 `Content-Type: text/event-stream`
- **Binary/Images**: 验证 Magic Numbers (如 PNG 的 `89 50 4E 47`)

### WebSocket 测试 (待实现)

- 使用 `startTestServer` 启动真实端口
- 完成至少一次完整的请求-响应往返

## 🔄 Lifecycle Management

### Setup

使用 `beforeAll` 或 `beforeEach` 进行预处理：

- 模拟登录
- 准备数据库或 localStorage
- 初始化测试数据

### Teardown

使用 `afterAll` 或 `afterEach` 清理：

- 删除临时文件
- 清除 localStorage
- 重置 mock 状态

## 🛡 Coverage & Assertion Requirements

### 🚫 禁止简单的真值断言

**核心原则**: 测试必须验证具体数值，而非简单的 true/false/0/1

```typescript
// ❌ 错误 - 过于简单，没有验证实际业务逻辑
expect(result.success).toBe(true);
expect(data.length).toBeGreaterThan(0);
expect(user.active).toBe(true);
expect(fish).toBeTruthy();

// ✅ 正确 - 验证具体的业务值
expect(result).toEqual({
  success: true,
  data: {
    id: 'fish-123',
    name: 'Clownfish',
    style: 'cartoon',
    stats: { speed: 65, agility: 50 },
  },
});
expect(data.items).toHaveLength(3);
expect(data.items[0].name).toBe('Blue Tang');
expect(user.level).toBe(5);
expect(user.experience).toBe(1250);
```

### ✅ 断言数量要求

**每个测试必须包含 2-3 个具体数值的断言**

```typescript
// ✅ 正确 - 验证多个具体字段
it('应当创建新鱼并设置初始属性', async () => {
  const fish = await createFish('test-user', {
    name: 'Goldfish',
    style: 'scientific',
  });

  // 验证 ID 生成规则
  expect(fish.id).toMatch(/^fish-/);

  // 验证所有者关联
  expect(fish.ownerId).toBe('test-user');

  // 验证初始状态值
  expect(fish.likes).toBe(0);
  expect(fish.inPond).toBe(false);
  expect(fish.isApproved).toBe(false);

  // 验证时间戳
  expect(fish.createdAt).toBeLessThanOrEqual(Date.now());
});

// ❌ 错误 - 仅一个简单断言
it('应当创建新鱼', async () => {
  const fish = await createFish('test-user', { name: 'Test' });
  expect(fish).toBeTruthy(); // 没有验证任何实际属性
});
```

### 🎯 造数据验证

**必须创建完整的测试实体，验证业务逻辑的真实性**

```typescript
// ✅ 正确 - 创建完整的测试数据
const testFish: FishEntity = {
  id: 'test-fish-001',
  ownerId: 'user-123',
  name: 'Golden Angelfish',
  imageUrl: 'https://example.com/fish.png',
  style: 'scientific',
  skeleton: {
    facing: 'right',
    standard: {
      head: { x: 85, y: 50 },
      tail: { x: 15, y: 50 },
      // ... 所有必需字段
    },
    aggressive: {
      head: { x: 85, y: 50 },
      tail: { x: 15, y: 50 },
    },
    source: 'AI_High_Precision',
  },
  stats: { speed: 75, agility: 60 },
  likes: 3,
  inPond: true,
  isApproved: true,
  createdAt: Date.now(),
};

it('应当正确更新鱼的统计值', () => {
  const updated = updateFishStats(testFish, { speed: 80, agility: 70 });

  // 验证更新的值
  expect(updated.stats.speed).toBe(80);
  expect(updated.stats.agility).toBe(70);

  // 验证不变的值
  expect(updated.id).toBe('test-fish-001');
  expect(updated.name).toBe('Golden Angelfish');

  // 验证时间戳更新
  expect(updated.updatedAt).toBeGreaterThan(testFish.createdAt);
});

// ❌ 错误 - 使用不完整或虚假的数据
it('应当更新鱼', () => {
  const fish = { id: '123' } as any; // 类型断言掩盖问题
  const result = updateFishStats(fish, { speed: 80 });
  expect(result).toBeTruthy(); // 没有验证实际更新
});
```

### 🔄 生命周期管理（强制）

**必须使用 beforeEach 和 afterEach**

```typescript
describe('FishService', () => {
  let mockDb: any;
  let testUserId: string;

  beforeEach(() => {
    // 前置处理：初始化 mock 和测试数据
    mockDb = createMockDatabase();
    testUserId = 'user-test-001';

    // 创建测试用户
    mockDb.users.insert({
      id: testUserId,
      name: 'Test User',
      level: 5,
      experience: 1000,
    });
  });

  afterEach(() => {
    // 后置清理：销毁数据，重置状态
    mockDb?.destroy?.();
    mockDb = null;
    testUserId = '';

    // 清除所有 mock
    vi.clearAllMocks();
  });

  it('应当为用户创建新鱼', async () => {
    const fish = await service.createFish(testUserId, {
      name: 'Test Fish',
      style: 'scientific',
    });

    // 验证具体数值
    expect(fish.ownerId).toBe(testUserId);
    expect(fish.stats.level).toBe(1);
    expect(fish.stats.experience).toBe(0);
  });
});
```

### 测试用例类型

- **正向用例**: 验证成功场景 (Status 200)
- **业务逻辑验证**:
  - 数据内容: `expect(json.data.name).toBe('Specific Value')`
  - 数值验证: `expect(json.data.count).toBe(5)`
  - 状态标志: `expect(json.data.active).toBe(true)`
  - 副作用: 写操作后通过读操作验证结果
- **验证用例**: 验证输入校验 (Status 400)
- **安全用例**: 验证权限和边界条件 (Status 403)
- **错误用例**: 验证错误处理 (Status 404/500)

### 示例

```typescript
describe('ModernFishingEngine', () => {
  let engine: ModernFishingEngine;

  beforeEach(() => {
    // 初始化测试状态
    engine = new ModernFishingEngine();
  });

  it('应当正确计算张力（静止鱼）', () => {
    const fish = createTestFish({ velocity: 0 });
    const result = engine.calculateTension(fish, 0, 0);

    // 验证具体数值
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
    expect(result).toBe(0); // 静止鱼，无拉力
  });

  it('应当正确计算张力（移动鱼，相反方向拉）', () => {
    const fish = createTestFish({ velocity: { x: 5, y: 0 } });
    const mouse = { x: -10, y: 0 };
    const result = engine.calculateTension(fish, mouse.x, mouse.y);

    // 相反方向应该产生更高张力
    expect(result).toBeGreaterThan(50);
    expect(result).toBeLessThan(100);
  });

  afterEach(() => {
    // 清理
    engine.destroy();
  });
});
```

## 🛠 Tooling & Automation

### 运行测试

```bash
# Vitest 单元测试
npm run test              # 运行所有测试
npm run test -- --ui      # 使用 Vitest UI
npm run test -- --coverage  # 生成覆盖率报告

# Playwright E2E 测试 (需先安装 @playwright/test)
npx playwright test       # 运行所有 E2E 测试
npx playwright test --ui  # 使用 UI 模式
npx playwright test --debug  # 调试模式
```

### CI/CD

**已实现**:

- **Git hooks**: `.husky/pre-commit` 已配置
  - 运行 `lint-staged` (代码格式检查)
  - 运行所有 Vitest 测试 `npm test -- --run`
  - 运行验证器 `tsx scripts/validate-all.ts`
  - **E2E 测试不在 pre-commit 中运行**（太慢）

**测试隔离**:

- 单元测试: `**/__tests__/**/*.test.ts` (随测试套件运行)
- 集成测试: `**/integration/**` (需要单独运行，已排除)
- E2E 测试: `e2e/*.spec.ts` (仅在 CI/CD 或手动运行)

## 🌐 E2E 测试规范 (Playwright)

### E2E 测试适用场景

使用 Playwright 进行端到端测试的场景：

| 场景           | 示例                              | 不适用           |
| -------------- | --------------------------------- | ---------------- |
| 多页面用户流程 | 注册 → 登录 → 创建鱼 → 添加到鱼塘 | 单组件交互       |
| 跨页面状态     | 购物车在不同页面保持一致          | 状态管理逻辑     |
| 真实浏览器行为 | 网络请求、文件上传、本地存储      | 可用 mock 替代   |
| 多浏览器兼容性 | Chrome/Firefox/Safari 差异测试    | 不涉及浏览器特性 |

### E2E 测试规则

**🚫 禁止使用 `--headed` 参数**

```bash
# ❌ 禁止 - 会打开浏览器窗口
npx playwright test --headed

# ✅ 正确 - 无头模式运行
npx playwright test
```

**理由**: 项目规则要求测试自动化运行，不依赖图形界面。

### 测试文件位置

```
e2e/
├── auth/
│   ├── login.spec.ts
│   └── register.spec.ts
├── fish/
│   ├── create.spec.ts
│   └── share.spec.ts
└── pond/
    └── add-to-pond.spec.ts
```

### E2E 测试编写规范

#### 1. 数据验证原则（与单元测试相同）

```typescript
// ✅ 正确 - 验证具体数值
test('should display user profile with correct data', async ({ page }) => {
  await page.goto('/profile');

  // 验证用户名和等级
  await expect(page.locator('.user-name')).toHaveText('testuser');
  await expect(page.locator('.user-level')).toHaveText('Level: 5');
  await expect(page.locator('.user-exp')).toHaveText('1,250 XP');

  // 验证鱼的数量
  await expect(page.locator('.fish-item')).toHaveCount(3);
});

// ❌ 错误 - 过于简单
test('should display profile', async ({ page }) => {
  await page.goto('/profile');
  const element = await page.$('.user-name');
  expect(element).toBeTruthy(); // 没有验证实际内容
});
```

#### 2. 使用 data-testid 选择器

```typescript
// ✅ 正确 - 使用稳定的 data-testid
await page.click('[data-testid="submit-button"]');
await page.fill('[data-testid="username-input"]', 'testuser');

// ❌ 错误 - 使用不稳定的 CSS 类
await page.click('.btn-primary'); // 类名可能变化
await page.click('button[type="submit"]'); // 可能有多个
```

#### 3. 避免固定等待时间

```typescript
// ✅ 正确 - 使用自动等待
await expect(page.locator('.result')).toBeVisible();
await page.waitForURL('/dashboard');
await page.waitForResponse('**/api/data');

// ❌ 错误 - 固定等待
await page.waitForTimeout(3000); // 浪费时间且不稳定
```

#### 4. 生命周期管理

```typescript
test.describe('User Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // 前置：清空 localStorage
    await page.evaluate(() => localStorage.clear());
  });

  test.afterEach(async ({ page }) => {
    // 后置：清理测试数据
    await page.request.delete('/api/test-data');
  });

  test('should login and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // 验证跳转和数据显示
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.user-name')).toHaveText('testuser');
  });
});
```

#### 5. Mock API 响应（加速测试）

```typescript
test('should load fish data quickly', async ({ page }) => {
  // Mock API 响应
  await page.route('**/api/fishes', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: '1', name: 'Clownfish', style: 'cartoon' },
          { id: '2', name: 'Angelfish', style: 'scientific' },
        ],
        total: 2,
      }),
    });
  });

  await page.goto('/pond');

  // 验证 mocked 数据
  await expect(page.locator('.fish-item').first()).toHaveText('Clownfish');
  await expect(page.locator('.fish-item').nth(1)).toHaveText('Angelfish');
});
```

### E2E 测试不在 pre-commit 中运行

**理由**: E2E 测试启动真实浏览器，运行时间较长（通常 30s - 2min）。

**运行时机**:

- CI/CD Pipeline 中
- 手动运行 `npx playwright test`
- 开发特定功能时

### 资源释放规范（强制）

**🚫 必须在测试后释放 Playwright 资源**

```typescript
// ✅ 正确 - 使用 test.afterEach 释放资源
test.describe('Admin Panel', () => {
  test.afterEach(async ({ page, context }) => {
    // 清理测试数据
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // 关闭所有额外页面
    const pages = context.pages();
    for (const p of pages) {
      if (p !== page) {
        await p.close();
      }
    }
  });

  test('should do something', async ({ page }) => {
    // 测试逻辑
  });
});

// ✅ 正确 - 显式关闭创建的资源
test('should test with explicit cleanup', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 测试逻辑
    await page.goto('/admin');
    // ...
  } finally {
    // 确保资源被释放（即使测试失败）
    await page.close();
    await context.close();
  }
});

// ❌ 错误 - 未释放资源
test('should test with leak', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // 测试逻辑，但没有关闭 page 和 context
  // 这会导致内存泄漏
});
```

**资源释放清单**:

| 资源               | 释放方式                | 自动管理 |
| ------------------ | ----------------------- | -------- |
| page (fixture)     | Playwright 自动关闭     | ✅       |
| context (fixture)  | Playwright 自动关闭     | ✅       |
| browser (fixture)  | Playwright 自动关闭     | ✅       |
| 手动创建的 page    | `await page.close()`    | ❌       |
| 手动创建的 context | `await context.close()` | ❌       |
| 手动创建的 browser | `await browser.close()` | ❌       |

**最佳实践**:

1. 优先使用 fixtures，它们会自动管理生命周期
2. 如果手动创建资源，必须在 `test.afterEach` 或 `finally` 块中释放
3. 使用 `try/finally` 确保即使测试失败也能释放资源

### 产物目录规范

**📁 所有 E2E 测试产物必须存储在专用目录中**

配置在 `playwright.config.ts` 中：

```typescript
// 产物存储目录结构
playwright-artifacts/
├── screenshots/     // 失败时的截图
├── videos/          // 失败时的录制视频
├── traces/          // 运行追踪（用于调试）
└── downloads/       // 下载的文件

playwright-report/
├── html/            // HTML 测试报告
└── results.json     // JSON 测试结果

test-results/        // Playwright 临时文件
```

**.gitignore 配置**:

```gitignore
# Playwright E2E test artifacts
playwright-artifacts/
playwright-report/
test-results/
```

**清理产物**:

```bash
# 删除所有测试产物
rm -rf playwright-artifacts playwright-report test-results

# 或者在 package.json 中添加清理脚本
npm run test:e2e:clean
```

### 与单元测试的对比

| 维度       | 单元测试 (Vitest) | E2E 测试 (Playwright) |
| ---------- | ----------------- | --------------------- |
| 运行环境   | jsdom / node      | 真实浏览器            |
| 运行速度   | 快 (毫秒级)       | 慢 (秒级)             |
| 测试范围   | 函数/组件/服务    | 完整用户流程          |
| Pre-commit | ✅ 运行           | ❌ 不运行             |
| CI/CD      | ✅ 运行           | ✅ 运行               |

## 📝 Current State

- **测试框架**: Vitest 4.0.16
- **配置文件**: `vitest.config.ts` (已配置)
- **Setup 文件**: `vitest.setup.ts` (已配置)
- **Git Hooks**: `.husky/pre-commit` (已实现)
- **现有测试**: ModernFishingEngine, apiClient, appStore, pondFishMesh 等
- **覆盖率**: 已配置 v8 provider，支持 text/json/html 报告
