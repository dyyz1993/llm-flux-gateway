/**
 * AI 组件分析服务
 *
 * 功能：
 * - 计算组件代码 hash
 * - 检测代码变化
 * - 调用 LLM 分析组件
 * - 缓存分析结果到文件系统
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import type {
  ComponentAnalysis,
  AnalysisCache,
  AnalyzeRequest,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载 .env 文件（Vite 插件运行在 Node.js 上下文，需要显式加载环境变量）
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const result = config({ path: envPath });
  if (result.error) {
    console.warn('[ai-analyzer] ⚠️ 加载 .env 文件失败:', result.error);
  } else {
    console.log('[ai-analyzer] ✅ 已加载 .env 文件:', envPath);
  }
} else {
  console.warn('[ai-analyzer] ⚠️ .env 文件不存在:', envPath);
}

// 缓存目录
const CACHE_DIR = join(__dirname, 'cache', 'component-analysis');

// 确保 cache 目录存在
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * 计算代码 hash (用于变化检测)
 */
export function computeCodeHash(code: string, file: string, line: number, endLine: number): string {
  const data = `${file}:${line}-${endLine}:${code}`;
  return createHash('md5').update(data).digest('hex');
}

/**
 * 读取缓存
 */
export function readCache(hash: string): AnalysisCache | null {
  ensureCacheDir();
  const cachePath = join(CACHE_DIR, `${hash}.json`);

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as AnalysisCache;
  } catch (error) {
    console.error(`[ai-analyzer] ❌ 读取缓存失败: ${hash}`, error);
    return null;
  }
}

/**
 * 写入缓存
 */
export function writeCache(cache: AnalysisCache): void {
  ensureCacheDir();
  const cachePath = join(CACHE_DIR, `${cache.component.hash}.json`);

  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`[ai-analyzer] ✅ 缓存已保存: ${cache.component.name} (${cache.component.hash})`);
  } catch (error) {
    console.error(`[ai-analyzer] ❌ 写入缓存失败: ${cache.component.hash}`, error);
  }
}

/**
 * 清理过期缓存 (可选)
 */
export function cleanOldCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
  ensureCacheDir();
  let cleaned = 0;

  try {
    const files = readdirSync(CACHE_DIR);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(CACHE_DIR, file);
      const stats = readFileSync(filePath, 'utf-8');
      const cache = JSON.parse(stats) as AnalysisCache;
      const analyzedAt = new Date(cache.meta.analyzedAt).getTime();
      const age = now - analyzedAt;

      if (age > maxAge) {
        unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ai-analyzer] 🧹 清理了 ${cleaned} 个过期缓存`);
    }
  } catch (error) {
    console.error('[ai-analyzer] ❌ 清理缓存失败:', error);
  }

  return cleaned;
}

/**
 * 获取组件代码
 */
export function getComponentCode(file: string, line: number, endLine: number): string {
  try {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(line - 1, endLine).join('\n');
  } catch (error) {
    console.error(`[ai-analyzer] ❌ 读取代码失败: ${file}:${line}-${endLine}`, error);
    return '';
  }
}

/**
 * 分析提示词模板
 */
function buildAnalysisPrompt(request: AnalyzeRequest, code: string): {
  system: string;
  user: string;
} {
  const { componentName, context } = request;

  const systemPrompt = `你是一个资深的 React 组件架构师和代码分析专家。

你的任务是分析 React 组件代码，并以严格的 JSON 格式返回分析结果。

## 重要说明

**当前提供的是代码片段，不是完整文件！**
- 只包含组件的函数体部分（从函数声明到 return 语句）
- **不包含**文件顶部的 import 语句
- **不要**针对"缺少 import"或"未导入某个模块"给出建议
- 专注于分析组件内部的逻辑、状态管理、性能问题等
- 假设所有必要的依赖都已经正确导入

## 输出格式

你必须返回一个合法的 JSON 对象，包含以下字段：

{
  "description": "用一句话描述这个组件的核心功能",
  "purpose": "这个组件解决了什么业务问题",
  "props": [
    {
      "name": "propName",
      "type": "string | number | ...",
      "required": true,
      "description": "这个 prop 的作用",
      "defaultValue": "默认值（如果有）"
    }
  ],
  "state": [
    {
      "name": "stateName",
      "type": "type",
      "purpose": "这个状态的用途"
    }
  ],
  "dependencies": {
    "external": ["依赖的外部库"],
    "internal": ["依赖的内部组件"]
  },
  "businessLogic": ["业务逻辑点1", "业务逻辑点2"],
  "usage": "典型的使用场景和使用方式",
  "issues": {
    "critical": [
      {
        "file": "文件路径（相对于项目根目录）",
        "startLine": 起始行号（数字）,
        "lineCount": 总行数（数字）,
        "description": "问题描述",
        "aiPrompt": "可以直接复制给 AI 的完整提示，包含：文件路径、起始行号、行数、问题描述和修复建议"
      }
    ],
    "potential": [
      {
        "file": "文件路径",
        "startLine": 起始行号,
        "lineCount": 总行数,
        "description": "问题描述",
        "aiPrompt": "AI 提示"
      }
    ],
    "improvements": [
      {
        "file": "文件路径",
        "startLine": 起始行号,
        "lineCount": 总行数,
        "description": "改进建议描述",
        "aiPrompt": "AI 提示"
      }
    ]
  }
}

## 问题分类标准

1. **严重缺陷 (critical)**：
   - 阻止代码正常运行的错误（语法错误、类型错误）
   - 导致运行时崩溃的代码（空指针、未捕获的异常）
   - 安全漏洞（XSS、注入攻击）
   - 严重的性能问题（无限循环、内存泄漏）
   - 数据丢失风险

2. **潜在问题 (potential)**：
   - 可能导致错误的边界条件处理
   - 缺少错误处理
   - 潜在的竞态条件
   - 未验证的用户输入
   - 性能优化机会

3. **改进建议 (improvements)**：
   - 代码可读性改进
   - 最佳实践建议
   - 类型安全改进
   - 代码结构优化
   - 文档和注释建议

## AI Prompt 格式要求

每条建议的 aiPrompt 必须是完整、独立的提示，包含以下格式：

"请帮我修复以下问题：
文件：{file}
位置：第 {startLine} 行，共 {lineCount} 行
问题描述：{description}
修复建议：{具体的修复方案}

请提供修改后的代码。"

## 分析要点

1. **单一职责**：判断组件是否做了太多事情
2. **副作用识别**：检查 useEffect 中的操作
3. **性能问题**：识别不必要的渲染、大列表、缺少 memo 等
4. **可复用性**：评估组件的通用性
5. **类型安全**：检查 TypeScript 类型定义
6. **空值处理**：如果组件没有 props 或 state，返回空数组

## 重要提示

- 只返回 JSON，不要添加任何其他文字、解释或 markdown 代码块标记
- 确保返回的是合法的 JSON 格式
- 所有字符串值使用双引号
- 行号从 1 开始计数
- 如果没有某类问题，返回空数组`;

  const userPrompt = `请分析以下 React 组件：

## 组件名称
${componentName}

## 文件位置
${request.file} (第 ${request.line} - ${request.endLine} 行，共 ${request.endLine - request.line + 1} 行)

## 组件代码
\`\`\`typescript
${code}
\`\`\`

## 上下文信息
${context?.childComponents?.length ? `- **子组件**: ${context.childComponents.join(', ')}` : ''}
${context?.siblingComponents?.length ? `- **兄弟组件**: ${context.siblingComponents.join(', ')}` : ''}
${context?.parentComponent ? `- **父组件**: ${context.parentComponent}` : ''}

请返回 JSON 格式的分析结果。注意：
1. 准确定位问题代码的起始行号（相对于整个文件，不是相对于组件代码片段）
2. lineCount 是问题代码段的总行数（endLine - startLine + 1）
3. aiPrompt 必须是完整、可复制粘贴的提示
4. 如果没有某类问题，相应字段返回空数组`;

  return { system: systemPrompt, user: userPrompt };
}

/**
 * 清理 LLM 响应，移除可能的 markdown 代码块标记
 */
function cleanLLMResponse(content: string): string {
  let cleaned = content.trim();

  // 移除开头的 ```json 或 ```
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  // 移除结尾的 ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

/**
 * 调用 LLM API
 */
async function callLLM(systemPrompt: string, userPrompt: string): Promise<ComponentAnalysis> {
  const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  // 调试：打印环境变量状态
  console.log('[ai-analyzer] 🔑 环境变量检查:', {
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY ? '***已设置***' : '未设置',
    LLM_MODEL: process.env.LLM_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***已设置***' : '未设置',
  });

  if (!apiKey) {
    throw new Error('LLM_API_KEY 环境变量未设置');
  }

  console.log(`[ai-analyzer] 🤖 调用 LLM: ${baseURL} (model: ${model})`);

  // 构建请求体
  const requestBody: any = {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  };

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API 错误 ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('LLM 返回空响应');
  }

  try {
    // 清理可能的 markdown 代码块标记
    const cleanedContent = cleanLLMResponse(content);
    console.log('[ai-analyzer] 🧹 清理后的响应长度:', cleanedContent.length);

    const analysis = JSON.parse(cleanedContent) as ComponentAnalysis;
    console.log(`[ai-analyzer] ✅ LLM 分析完成`);
    return analysis;
  } catch (error) {
    console.error('[ai-analyzer] ❌ 解析 LLM 响应失败:', content);
    console.error('[ai-analyzer] 📄 原始响应内容:', content.substring(0, 500));
    throw new Error('LLM 返回的 JSON 格式不正确');
  }
}

/**
 * 分析组件
 */
export async function analyzeComponent(request: AnalyzeRequest): Promise<{
  success: boolean;
  cached: boolean;
  analysis?: ComponentAnalysis;
  error?: string;
}> {
  try {
    // 获取代码
    const code = request.code || getComponentCode(request.file, request.line, request.endLine);
    if (!code) {
      return { success: false, cached: false, error: '无法读取组件代码' };
    }

    console.log(`[ai-analyzer] 📄 代码提取成功: ${request.file}:${request.line}-${request.endLine} (${code.length} 字符)`);

    // 计算 hash
    const hash = computeCodeHash(code, request.file, request.line, request.endLine);

    // 检查缓存（除非强制重新分析）
    if (!request.force) {
      const cached = readCache(hash);
      if (cached) {
        console.log(`[ai-analyzer] 💾 使用缓存: ${request.componentName} (${hash})`);
        return { success: true, cached: true, analysis: cached.analysis };
      }
    }

    // 调用 LLM
    const { system, user } = buildAnalysisPrompt(request, code);
    const analysis = await callLLM(system, user);

    // 保存缓存
    const cache: AnalysisCache = {
      component: {
        name: request.componentName,
        file: request.file,
        line: request.line,
        endLine: request.endLine,
        hash,
      },
      code,
      analysis,
      meta: {
        analyzedAt: new Date().toISOString(),
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        version: '1.0',
      },
    };
    writeCache(cache);

    return { success: true, cached: false, analysis };
  } catch (error) {
    console.error(`[ai-analyzer] ❌ 分析失败: ${request.componentName}`, error);
    return {
      success: false,
      cached: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 获取所有缓存的分析结果
 */
export function getAllCachedAnalyses(): AnalysisCache[] {
  ensureCacheDir();
  const analyses: AnalysisCache[] = [];

  try {
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(CACHE_DIR, file);
      const content = readFileSync(filePath, 'utf-8');
      try {
        const cache = JSON.parse(content) as AnalysisCache;
        analyses.push(cache);
      } catch {
        // 跳过损坏的缓存
      }
    }
  } catch (error) {
    console.error('[ai-analyzer] ❌ 读取缓存目录失败:', error);
  }

  return analyses;
}

/**
 * 获取特定组件的分析结果
 */
export function getCachedAnalysis(componentName: string): AnalysisCache | null {
  const analyses = getAllCachedAnalyses();
  return analyses.find(a => a.component.name === componentName) || null;
}
