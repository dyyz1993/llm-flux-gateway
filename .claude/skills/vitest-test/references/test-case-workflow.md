# 测试用例开发工作流

## 工作流概览

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: 调研 (Investigation)                                  │
├─────────────────────────────────────────────────────────────────┤
│  ✓ 阅读源代码 (理解业务逻辑)                                     │
│  ✓ 查看数据库表结构 (schema.ts)                                  │
│  ✓ 分析内存状态和变量                                            │
│  ✓ 梳理数据流和边界条件                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: 设计 (Design)                                         │
├─────────────────────────────────────────────────────────────────┤
│  ✓ 编写测试用例文档 (Test Case Document)                        │
│  ✓ 定义输入数据 (完整实体)                                       │
│  ✓ 定义预期输出 (2-3个具体数值)                                  │
│  ✓ 定义边界条件 (成功/失败/异常)                                 │
│  ✓ 用户审查 (User Review)                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: 实现 (Implementation)                                 │
├─────────────────────────────────────────────────────────────────┤
│  ✓ 根据测试用例编写测试代码                                       │
│  ✓ Mock 外部依赖                                                 │
│  ✓ 设置测试环境                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: 验证 (Validation)                                     │
├─────────────────────────────────────────────────────────────────┤
│  ✓ 运行测试                                                      │
│  ✓ 检查覆盖率                                                    │
│  ✓ 修复问题                                                      │
│  ✓ 确认所有测试通过                                              │
└─────────────────────────────────────────────────────────────────┘
```

## 测试用例文档模板

测试用例文档应存放在 `__tests__/` 目录下，与测试文件并列：

```
src/server/module-admin/services/
├── admin-service.ts
├── __tests__/
│   ├── admin-service.test.ts
│   └── admin-service.test-cases.md  ← 测试用例文档
```

### 文档结构

````markdown
# [功能名称] 测试用例文档

## 功能概述

- **功能**: [简要描述功能]
- **相关文件**: [文件路径]
- **数据库表**: [涉及的表]

## 测试环境

- **测试类型**: [单元测试/集成测试/E2E测试]
- **Mock 策略**: [说明哪些需要 mock]

## 测试数据

### 基础测试数据

```typescript
const testUser = {
  id: 'user-test-001',
  name: 'Test User',
  // ...
};
```
````

## 测试用例列表

### TC-001: [用例标题]

**优先级**: P0/P1/P2/P3
**类型**: 正向/逆向/边界/异常

**前置条件**:

- 条件 1
- 条件 2

**测试步骤**:

1. 步骤 1
2. 步骤 2
3. 步骤 3

**预期结果**:

- 结果 1: 具体数值
- 结果 2: 具体数值
- 结果 3: 具体数值

**验证点**:

- [ ] 验证点 1
- [ ] 验证点 2
- [ ] 验证点 3

**相关代码**:

- 文件: `path/to/file.ts`
- 行号: `123-145`

---

### TC-002: [用例标题]

...

````

## 示例：鱼审核功能测试用例

```markdown
# 鱼审核功能测试用例

## 功能概述
- **功能**: 管理员审核用户创建的鱼
- **相关文件**: `src/server/module-admin/services/admin-service.ts`
- **数据库表**: `fish_table`

## 业务逻辑
```typescript
// 审核通过: 更新 isApproved = true, updatedAt = now
// 审核拒绝: 删除记录
async approveFish(fishId: string, approve: boolean): Promise<boolean>
````

## 测试数据

### 基础测试数据

```typescript
const pendingFish = {
  id: 'fish-pending-001',
  name: 'Goldfish',
  ownerId: 'user-123',
  isApproved: false,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};
```

## 测试用例列表

### TC-001: 审核通过待审核的鱼

**优先级**: P0
**类型**: 正向测试

**前置条件**:

- 数据库存在 fishId = 'fish-pending-001' 的待审核记录
- isApproved = false

**测试步骤**:

1. 创建 pendingFish 测试数据
2. Mock 数据库 update 操作，返回 rowCount = 1
3. 调用 service.approveFish('fish-pending-001', true)
4. 验证返回值和 Mock 调用

**预期结果**:

- 返回值 = true
- update 被调用 1 次
- set 被调用，参数包含 isApproved: true
- updatedAt 被更新为当前时间

**验证点**:

- [x] expect(result).toBe(true)
- [x] expect(mockDb.update).toHaveBeenCalledTimes(1)
- [x] expect(mockDb.set).toHaveBeenCalledWith({ isApproved: true, updatedAt: expect.any(Date) })

**相关代码**:

- 文件: `src/server/module-admin/services/admin-service.ts`
- 行号: `114-127`

---

### TC-002: 拒绝待审核的鱼

**优先级**: P0
**类型**: 正向测试

**前置条件**:

- 数据库存在 fishId = 'fish-pending-002' 的待审核记录

**测试步骤**:

1. 创建 pendingFish 测试数据
2. Mock 数据库 delete 操作，返回 rowCount = 1
3. 调用 service.approveFish('fish-pending-002', false)
4. 验证返回值和 Mock 调用

**预期结果**:

- 返回值 = true
- delete 被调用 1 次
- where 被调用，参数包含 fishId

**验证点**:

- [x] expect(result).toBe(true)
- [x] expect(mockDb.delete).toHaveBeenCalledTimes(1)

---

### TC-003: 审核不存在的鱼

**优先级**: P1
**类型**: 逆向测试

**前置条件**:

- 数据库不存在指定 fishId

**测试步骤**:

1. Mock 数据库 update 操作，返回 rowCount = 0
2. 调用 service.approveFish('fish-not-exist', true)

**预期结果**:

- 返回值 = false

**验证点**:

- [x] expect(result).toBe(false)

---

## 边界场景

### TC-004: 多次审核同一条记录

**优先级**: P2
**类型**: 边界测试

**说明**: 验证重复审核不会产生副作用

````

## 使用流程

### 1. 开始新功能测试时

```bash
# 1. 调研阶段
# 阅读源代码和表结构
cat src/server/module-admin/services/admin-service.ts
cat src/server/shared/schema.ts

# 2. 创建测试用例文档
touch src/server/module-admin/services/__tests__/admin-service.test-cases.md

# 3. 编写测试用例（使用上面的模板）
# ...

# 4. 用户审查
# 提交 test-cases.md 给团队审查

# 5. 编写测试代码
# 根据审查通过的用例编写测试

# 6. 运行验证
npx vitest run src/server/module-admin/services/__tests__/admin-service.test.ts
````

### 2. 技能使用流程

**场景**: 用户说"我需要为 [功能名] 编写测试"

1. **Phase 1: 调研**
   - 使用 Read 工具查看相关源代码
   - 使用 Grep 工具搜索关键字段
   - 理解业务逻辑和数据流

2. **Phase 2: 设计**
   - 创建 `test-cases.md` 文档
   - 使用上面的模板编写测试用例
   - 定义测试数据（完整实体）
   - 列出所有验证点

3. **Phase 3: 产出**
   - 输出测试用例文档给用户审查
   - 用户确认后再编写测试代码

### 3. 输出示例

当用户要求编写测试时，按以下顺序输出：

```
[Step 1] 测试用例文档
→ 先输出 .test-cases.md 文档内容
→ 包含完整的测试数据定义
→ 列出所有测试用例和验证点

[Step 2] 等待用户确认
→ "请审查以上测试用例，确认后我将继续编写测试代码"

[Step 3] 编写测试代码
→ 根据确认的用例编写测试代码
→ 确保每个测试有 2-3 个具体数值断言
```
