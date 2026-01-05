# Mock 模式和测试真实性

## 核心原则

**Mock 外部依赖，测试真实业务逻辑**

### ✅ 正确做法

```typescript
// Mock 外部 API
vi.mock('./externalApi', () => ({
  fetchData: vi.fn().mockResolvedValue({
    items: [{ id: '1', value: 100 }],
    total: 1,
  }),
}));

it('should process data correctly', async () => {
  const result = await processItems();

  // 验证业务逻辑
  expect(result.processed[0].calculated).toBe(200);
  expect(result.summary.count).toBe(1);
});
```

### ❌ 错误做法

```typescript
// 不要 Mock 被测函数本身
vi.mock('./myService', () => ({
  processItems: vi.fn().mockResolvedValue({ success: true }),
}));
```

## Mock 策略

### 数据库 Mock

```typescript
const mockDb = {
  update: vi.fn().mockResolvedValue({ rowCount: 1 }),
  delete: vi.fn().mockResolvedValue({ rowCount: 1 }),
  select: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
};

vi.mock('drizzle-orm', () => ({
  drizzle: () => mockDb,
}));
```

### API Client Mock

```typescript
vi.mock('@client/services/apiClient', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ success: true, data: {} }),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
```

### Store Mock

```typescript
const mockState = {
  users: [{ id: '1', name: 'Test' }],
  currentUser: null,
};

vi.mock('@client/stores/appStore', () => ({
  useAppStore: vi.fn((selector) => selector(mockState)),
}));
```

## 清理 Mock

```typescript
afterEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});
```
