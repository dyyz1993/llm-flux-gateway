---
name: vitest-test
description: >
  Write comprehensive tests following project testing standards.
  Use when: Creating tests for services, components, stores, API clients, or E2E tests.
  Supports: Unit tests (Vitest + jsdom), Integration tests (node), E2E tests (Playwright).
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# Vitest Test Skill

## Quick Start

```bash
npx vitest run                    # Unit tests (jsdom)
npm run test:integration          # Integration tests (node)
npx playwright test               # E2E tests (headless)
```

## Test Location (强制)

| Type             | Location                                           | Environment       |
| ---------------- | -------------------------------------------------- | ----------------- |
| Client Service   | `src/client/services/__tests__/*.test.ts`          | jsdom             |
| Client Store     | `src/client/stores/__tests__/*.test.ts`            | jsdom             |
| Client Component | `src/client/components/__tests__/*.test.tsx`       | jsdom             |
| Server Service   | `src/server/module-*/services/__tests__/*.test.ts` | jsdom (mocked)    |
| Server Routes    | `src/server/module-*/routes/__tests__/*.test.ts`   | jsdom (mocked)    |
| Integration      | `src/server/integration/__tests__/*.test.ts`       | node (real DB)    |
| E2E              | `e2e/*.spec.ts`                                    | Playwright (real) |

## Templates

Reference templates in [templates/](templates/):

| Template                       | Description                  |
| ------------------------------ | ---------------------------- |
| `service.test.ts.template`     | Service unit test pattern    |
| `store.test.ts.template`       | Zustand store test pattern   |
| `component.test.tsx.template`  | React component test pattern |
| `integration.test.ts.template` | Integration test with DB     |
| `e2e.spec.ts.template`         | Playwright E2E test pattern  |

## Test Case Development (强制工作流)

### 原则：调研 → 设计 → 实现 → 验证

1. **调研**: 阅读源代码、数据库表结构、内存变量
2. **设计**: 编写测试用例文档 (`__tests__/*.test-cases.md`)
3. **审查**: 用户确认测试用例
4. **实现**: 根据确认的用例编写代码

### 测试用例文档 (必须)

```
src/server/module-admin/services/
├── admin-service.ts
├── __tests__/
│   ├── admin-service.test.ts
│   └── admin-service.test-cases.md  ← 必须存在
```

文档必须包含:

- **功能概述**: 功能描述、相关文件、数据库表
- **测试数据**: 完整实体对象（所有必需字段）
- **测试用例列表**: 前置条件、测试步骤、预期结果、验证点

详见 [references/test-case-workflow.md](references/test-case-workflow.md)

## Core Principles (核心约束)

### 1. 数据验证 (强制)

- 禁止简单真值断言
- 每个测试至少 2-3 个具体数值断言
- 验证数据结构完整性

```typescript
// ✅ expect(user.level).toBe(5)
// ❌ expect(user).toBeTruthy()
```

### 2. 测试数据 (强制)

- 使用完整实体对象
- 使用具体值，避免随机数据
- 数据应覆盖边界条件

### 3. 生命周期管理 (强制)

```typescript
beforeEach(() => {
  /* Setup */
});
afterEach(() => {
  vi.clearAllMocks();
  // 清理测试数据
});
```

E2E 测试必须释放 Playwright 资源:

```typescript
test.afterEach(async ({ page, context }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  // Close all pages
});
```

### 4. Mock 原则 (强制)

- Mock 外部依赖，测试真实业务逻辑
- 禁止 Mock 被测函数

详见 [references/mocking-patterns.md](references/mocking-patterns.md)

### 5. E2E 测试规范 (强制)

- 禁止使用 `--headed` 参数
- 必须使用 `test.afterEach` 释放资源
- 产物目录: `playwright-artifacts/`
- 使用 `data-testid` 选择元素

详见 [references/e2e-testing.md](references/e2e-testing.md)

## Additional Resources

- [references/test-case-workflow.md](references/test-case-workflow.md) - 测试用例开发详解
- [references/mocking-patterns.md](references/mocking-patterns.md) - Mock 模式和真实性
- [references/e2e-testing.md](references/e2e-testing.md) - E2E 测试完整指南
- [../rules/testing-standards.md](../../rules/testing-standards.md) - 项目测试规范
