---
name: investigating-bugs
description: >
  Debug software issues systematically using scientific method and log analysis.
  Use when: investigating bugs, analyzing errors, troubleshooting production issues,
  or when user mentions "debug", "error", "bug", "crash", "not working", "fail".
  Supports: crash analysis, performance issues, memory leaks, race conditions, log analysis.
  Triggers: "debugging", "troubleshooting", "error analysis", "production incident".
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---

# Investigating Bugs

Systematic debugging using scientific method and observability.

## Quick Start

```bash
# Step 1: Gather error context
grep -r "ERROR" /var/log/app.log | tail -50

# Step 2: Trace request flow
grep "correlation_id_abc123" /var/log/*/app.log

# Step 3: Form hypothesis
# Ask: What could cause this?

# Step 4: Test hypothesis
# Design test to verify

# Step 5: Iterate based on findings
```

## Debugging Workflow

### Phase 1: Initial Assessment (Minutes 0-15)

1. **Classify problem**: Crash? Performance? Incorrect output?
2. **Stabilize system**: Prevent further damage if critical
3. **Gather context**: Recent changes, error rates, system state
4. **Reproduce bug**: Create minimal reproducible case

### Phase 2: Investigation (Minutes 15-90)

5. **Form hypotheses**: Based on evidence, list possible causes
6. **Design tests**: Each test should have mutually exclusive outcomes
7. **Execute tests**: Start with highest-likelihood, lowest-risk
8. **Narrow search space**: Use divide-and-conquer, binary search

### Phase 3: Root Cause (Hours 1-8+)

9. **Confirm root cause**: Reproduce at will
10. **Implement fix**: Write test proving bug exists
11. **Verify fix**: Test thoroughly, no regressions
12. **Prevent recurrence**: Postmortem, monitoring, documentation

## Core Principles

### 1. Scientific Method (强制)

```
观察 → 假设 → 实验 → 分析 → 迭代
```

- 让数据引导假设
- 一次只测试一个假设
- 记录负结果（什么不起作用）

### 2. Stabilize First (强制)

**先止血，再查因**：

- 转移流量
- 禁用故障子系统
- 防止数据损坏
- 实施紧急缓解

### 3. Reproducibility (强制)

- 创建最小可复现用例
- 记录精确重现步骤
- 自动化复现（特别是不稳定bug）

### 4. Divide and Conquer (强制)

- 二分法：每次排除一半代码
- 逐层测试：从栈的一端测试到另一端
- 组件隔离：禁用功能直到bug消失

### 5. Root Cause Over Quick Fix (强制)

- 治本而非治标
- 不用 if/try-catch 压制错误
- 找到并消除根本原因

## Log Analysis

### Structured Logging Pattern

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "INFO",
  "message": "user_login",
  "userId": "user_123",
  "correlationId": "req_xyz-789",
  "duration": 234
}
```

### Log Analysis Commands

```bash
# Trace request across services
grep "correlation_id_abc" /var/log/*/app.log

# Find error patterns
grep "ERROR" app.log | awk '{print $5}' | sort | uniq -c

# Extract slow requests
jq 'select(.duration > 1000)' requests.json

# Analyze time-based patterns
awk '/\[10:[0-5][0-9]:/' app.log
```

See [references/log-analysis.md](references/log-analysis.md) for detailed patterns.

## AI-Assisted Debugging

### Effective Prompt Template

````markdown
## Bug Report

**Context**:

- Language: TypeScript 5.2
- Framework: React 19
- Error: [paste exact error]

**Expected**: [what should happen]
**Actual**: [what's happening]

**Code**:

```typescript
[paste minimal snippet]
```
````

**What I tried**:

1. [attempt 1]
2. [attempt 2]

**Task**: Analyze root cause and explain why this happens

```

### AI Workflow

```

本地调查 → 寻求假设 → 测试验证 → 迭代反馈

```

See [references/ai-debugging.md](references/ai-debugging.md) for AI patterns.

## Tool Recommendations

| Bug Type | Tools | Strategy |
|----------|-------|----------|
| **Crashes** | GDB, LLDB, Core Dumps | Post-mortem analysis |
| **Performance** | perf, FlameGraphs | Find hotspots first |
| **Memory Leaks** | Valgrind, Heaptrack | Heap snapshot comparison |
| **Race Conditions** | ThreadSanitizer | Detect data races |
| **Heisenbugs** | Enhanced logging | Statistical reproduction |

See [references/tools.md](references/tools.md) for complete guide.

## Common Anti-Patterns (禁止)

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| **Shotgun debugging** | Multiple changes at once | One change at a time |
| **Premature optimization** | Assuming performance issue | Profile first |
| **Blaming the tool** | Assuming framework bug | Start with your code |
| **Adding workarounds** | Suppressing symptoms | Fix root cause |
| **Over-logging** | Performance degradation | Strategic logging only |

## Validation Checklist

Before considering bug fixed:

- [x] Root cause identified
- [x] Fix implemented
- [x] Test added proving bug exists
- [x] Fix verified (no regressions)
- [x] Edge cases considered
- [x] Documentation updated

## Additional Resources

- [references/scientific-method.md](references/scientific-method.md) - Hypothetico-deductive debugging
- [references/log-analysis.md](references/log-analysis.md) - Log patterns and analysis
- [references/ai-debugging.md](references/ai-debugging.md) - AI-assisted debugging
- [references/tools.md](references/tools.md) - Tool recommendations by bug type
- [references/heisenbugs.md](references/heisenbugs.md) - Intermittent bug strategies
```
