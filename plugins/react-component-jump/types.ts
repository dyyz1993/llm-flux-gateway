/**
 * React Component Jump Plugin Types
 *
 * 插件内部使用的类型定义
 */

/**
 * 组件信息
 */
export interface ComponentInfo {
  /** 组件名 */
  name: string;
  /** 文件路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 组件内容 hash（基于 AST 提取的代码） */
  hash: string;
  /** 文件 hash */
  fileHash: string;
  /** 直接依赖的其他组件（从 import 分析） */
  dependencies: string[];
  /** 被谁依赖（反向依赖） */
  dependents: string[];
  /** Props 类型（可选） */
  props?: string;
  /** 组件的起始位置（在源码中） */
  startIndex: number;
  /** 组件的结束位置（在源码中） */
  endIndex?: number;
  /** return 语句的起始位置（用于提取并列元素） */
  returnStatementStart?: number;
  /** return 语句的结束位置（用于提取并列元素） */
  returnStatementEnd?: number;
}

/**
 * 依赖关系边
 */
export interface DependencyEdge {
  /** 依赖者 */
  from: string;
  /** 被依赖者 */
  to: string;
}

/**
 * 依赖图
 */
export interface DependencyGraph {
  /** 所有组件名（节点） */
  nodes: string[];
  /** 依赖关系（有向边） */
  edges: DependencyEdge[];
  /** 循环依赖警告 */
  cycles: string[][];
}

/**
 * 组件注册表
 */
export interface ComponentRegistry {
  /** 版本号 */
  version: string;
  /** 最后更新时间（ISO 8601 格式） */
  lastUpdate: string;
  /** 所有组件信息（key: 组件名） */
  components: Record<string, ComponentInfo>;
  /** 依赖关系图 */
  dependencies: DependencyGraph;
  /** 文件 hash 记录（key: 文件路径） */
  fileHashes: Record<string, string>;
  /** 总组件数 */
  totalComponents: number;
  /** 总文件数 */
  totalFiles: number;
}

/**
 * 导入声明信息
 */
export interface ImportDeclaration {
  /** 导入的类型：default 或 named */
  type: 'default' | 'named' | 'namespace';
  /** 默认导入的名称 */
  defaultName?: string;
  /** 命名导入的名称列表 */
  namedImports?: string[];
  /** 命名空间导入的名称 */
  namespaceName?: string;
  /** 源路径 */
  source: string;
  /** 在源码中的位置 */
  start: number;
  end: number;
}

/**
 * AI 组件分析结果
 */
export interface ComponentAnalysis {
  /** 组件描述 */
  description: string;
  /** 组件目的 */
  purpose: string;
  /** Props 信息 */
  props: PropDescription[];
  /** State 信息 */
  state: StateDescription[];
  /** 依赖 */
  dependencies: {
    external: string[];
    internal: string[];
  };
  /** 业务逻辑 */
  businessLogic: string[];
  /** 使用场景 */
  usage: string;
  /** 问题分类 */
  issues?: {
    /** 严重缺陷 */
    critical?: IssueItem[];
    /** 潜在问题 */
    potential?: IssueItem[];
    /** 改进建议 */
    improvements?: IssueItem[];
  };
  /** 向后兼容：旧格式的 concerns 和 suggestions */
  concerns?: string[];
  suggestions?: string[];
}

/**
 * 问题/建议项
 */
export interface IssueItem {
  /** 文件路径 */
  file: string;
  /** 起始行号 */
  startLine: number;
  /** 总行数 */
  lineCount: number;
  /** 问题描述 */
  description: string;
  /** 可直接复制给 AI 的提示 */
  aiPrompt: string;
}

/**
 * Prop 描述
 */
export interface PropDescription {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

/**
 * State 描述
 */
export interface StateDescription {
  name: string;
  type: string;
  purpose: string;
}

/**
 * 组件分析缓存
 */
export interface AnalysisCache {
  component: {
    name: string;
    file: string;
    line: number;
    endLine: number;
    hash: string;
  };
  code: string;
  analysis: ComponentAnalysis;
  meta: {
    analyzedAt: string;
    model: string;
    version: string;
  };
}

/**
 * AI 分析请求
 */
export interface AnalyzeRequest {
  componentName: string;
  file: string;
  line: number;
  endLine: number;
  code: string;
  context?: {
    imports?: string[];
    childComponents?: string[];
    siblingComponents?: string[];
    parentComponent?: string;
  };
  force?: boolean; // 强制重新分析
}

/**
 * AI 分析响应
 */
export interface AnalyzeResponse {
  success: boolean;
  cached: boolean;
  analysis?: ComponentAnalysis;
  error?: string;
}
