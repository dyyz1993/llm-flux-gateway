# Skill Development Workflow (开发工作流程)

## Overview

Evaluation-Driven Development (评估驱动开发)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Identify Gaps (识别差距)                         │
├─────────────────────────────────────────────────────────────┤
│  不使用 skill 运行任务                                       │
│  记录失败点和重复模式                                        │
│  文档化缺失的上下文                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Create Evaluation (创建评估)                     │
├─────────────────────────────────────────────────────────────┤
│  构建 3 个代表性测试场景                                     │
│  定义预期行为                                               │
│  准备测试数据                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Establish Baseline (建立基线)                    │
├─────────────────────────────────────────────────────────────┤
│  不使用 skill 运行评估                                       │
│  测量性能指标                                               │
│  记录失败模式                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Write Minimal Skill (编写最小 Skill)              │
├─────────────────────────────────────────────────────────────┤
│  编写足够通过评估的内容                                      │
│  关注核心约束和原则                                          │
│  保持简洁                                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 5: Test and Iterate (测试和迭代)                     │
├─────────────────────────────────────────────────────────────┤
│  使用 skill 运行评估                                         │
│  对比基线性能                                               │
│  优化和精简                                                 │
│  跨模型测试                                                 │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Identify Gaps

### 步骤

1. **选择代表性任务**
   - 选择 3-5 个典型任务
   - 确保覆盖不同场景
   - 记录每个任务的具体需求

2. **执行任务（无 skill）**
   - 让 Claude 完成任务
   - 观察需要多少额外上下文
   - 记录失败点

3. **记录模式**
   - 重复出现的上下文需求
   - 频繁的纠正或澄清
   - 常见错误路径

### 示例：PDF Processing

**观察**:

- Claude 不知道该用哪个 PDF 库
- 需要反复解释表单提取逻辑
- OCR vs text extraction 混淆

**差距识别**:

- 需要默认库推荐
- 需要表单处理工作流
- 需要场景判断指导

## Phase 2: Create Evaluation

### Evaluation Structure

```json
{
  "skills": ["pdf-processing"],
  "query": "Extract all text from this PDF file and save it to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Successfully reads PDF using pdfplumber",
    "Extracts text from all pages",
    "Saves to output.txt"
  ]
}
```

### Three Scenarios

```json
// Scenario 1: Basic text extraction
{
  "query": "Extract text from PDF",
  "files": ["simple.pdf"],
  "expected": ["Uses pdfplumber", "Extracts all text"]
}

// Scenario 2: Table extraction
{
  "query": "Extract tables from financial report",
  "files": ["report.pdf"],
  "expected": ["Uses pdfplumber", "Extracts tables correctly"]
}

// Scenario 3: OCR for scanned PDF
{
  "query": "Extract text from scanned document",
  "files": ["scanned.pdf"],
  "expected": ["Detects need for OCR", "Uses pdf2image + pytesseract"]
}
```

## Phase 3: Establish Baseline

### Metrics

| 指标         | 测量方法             |
| ------------ | -------------------- |
| Success Rate | 成功完成任务的比例   |
| Token Usage  | 完成任务所需 tokens  |
| Turns Needed | 需要的对话轮数       |
| Error Rate   | 错误或需要纠正的次数 |

### Baseline Template

```markdown
# Baseline: PDF Processing (No Skill)

## Scenario 1: Basic Text Extraction

- Success: ✅ / ❌
- Tokens: \_\_\_
- Turns: \_\_\_
- Errors: \_\_\_

## Scenario 2: Table Extraction

- Success: ✅ / ❌
- Tokens: \_\_\_
- Turns: \_\_\_
- Errors: \_\_\_

## Scenario 3: OCR

- Success: ✅ / ❌
- Tokens: \_\_\_
- Turns: \_\_\_
- Errors: \_\_\_
```

## Phase 4: Write Minimal Skill

### 策略

只编写足够通过评估的内容：

1. **SKILL.md**:
   - Quick Start
   - 核心工作流
   - 链接到 references

2. **references/**:
   - 详细场景
   - 错误处理
   - 示例

### 最小可行示例

````markdown
---
name: pdf-processing
description: >
  Extract text and tables from PDF files.
  Use when: working with PDFs, forms, or .pdf files.
---

# PDF Processing

## Quick Start

Extract text:

```python
import pdfplumber
text = pdfplumber.open("file.pdf").pages[0].extract_text()
```
````

## Scenarios

**Text extraction**: Use pdfplumber
**Tables**: See [references/tables.md](references/tables.md)
**Forms**: See [references/forms.md](references/forms.md)
**OCR**: See [references/ocr.md](references/ocr.md)

````

## Phase 5: Test and Iterate

### 测试流程

1. **运行评估**
   ```bash
   # 使用 skill 运行测试
````

2. **对比基线**
   - 成功率提升？
   - Token 使用减少？
   - Turns 减少？

3. **识别问题**
   - 哪些场景仍然失败？
   - 哪些指令不清楚？
   - 哪些链接断裂？

4. **优化**
   - 添加缺失内容
   - 澄清模糊指令
   - 简化冗余内容

### 跨模型测试

测试多个模型：

| 模型              | 关注点               |
| ----------------- | -------------------- |
| **Claude Haiku**  | skill 提供足够指导？ |
| **Claude Sonnet** | skill 清晰高效？     |
| **Claude Opus**   | skill 避免过度解释？ |

### Hierarchical Development

```
┌─────────────────────────────────────────────────────────────┐
│  Claude A (Expert)                                           │
│  帮助设计和优化 skill                                         │
│  Review conciseness                                          │
│  Check information architecture                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Claude B (User)                                             │
│  使用 skill 执行实际工作                                      │
│  在真实任务中测试                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Observation & Feedback                                      │
│  观察 B 如何使用 skill                                       │
│  记录导航模式                                                │
│  识别困惑点                                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
  带回洞察给 Claude A → 迭代改进
```

## Iteration Checklist

每次迭代检查：

- [ ] Description 触发正确？
- [ ] Quick Start 可工作？
- [ ] References 链接有效？
- [ ] 无重复内容？
- [ ] 保持简洁？
- [ ] 所有场景通过？

## Common Iteration Patterns

### Pattern: Add Missing Context

**问题**: Claude 在某点卡住

**修复**:

````markdown
## Before

Extract text from PDF.

## After

Extract text using pdfplumber:

```python
import pdfplumber
text = pdfplumber.open("file.pdf").pages[0].extract_text()
```
````

````

### Pattern: Move to References

**问题**: SKILL.md 太长

**修复**:
```markdown
## Before (in SKILL.md)
[20 lines of table extraction details]

## After (in SKILL.md)
**Tables**: See [references/tables.md](references/tables.md)

## In references/tables.md
[Complete table extraction guide]
````

### Pattern: Clarify Description

**问题**: Skill 未触发

**修复**:

```yaml
# Before
description: Extracts PDF text

# After
description: >
  Extract text and tables from PDF files.
  Use when: working with PDFs, forms, or .pdf files.
```

## Maintenance Workflow

### 定期审查

每个 skill 应定期：

1. **Review Usage**
   - 哪些部分最常用？
   - 哪些部分从不使用？

2. **Check for Drift**
   - API 是否更新？
   - 依赖是否变更？

3. **Update Content**
   - 移除过时信息
   - 添加新模式
   - 简化冗余内容

### 版本管理

使用 Git 追踪变更：

```bash
# Major version change
git tag skill-name-v2.0

# View history
git log --tags --simplify-by-decoration --pretty="format:%ci %d"
```

## Team Collaboration

### Review Process

创建 skill 前：

1. **Draft**: 创建初始版本
2. **Peer Review**: 团队审查
3. **Testing**: 跨模型测试
4. **Refinement**: 根据反馈优化
5. **Deploy**: 合并到主分支

### Documentation

记录决策：

```markdown
## Decision Log

### 2025-01-15: Use pdfplumber as default

**Reason**: Better table extraction than alternatives
**Alternative**: PyMuPDF (faster but less accurate)

### 2025-02-01: Add OCR workflow

**Reason**: Support for scanned PDFs requested
**Impact**: Added references/ocr.md
```

## Sources

- [Anthropic Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Evaluation-Driven Development](https://mikhail.io/2025/10/claude-code-skills/)
