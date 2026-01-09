/**
 * React Component Jump Plugin Utils
 *
 * 插件内部使用的工具函数
 */

import { createHash } from 'node:crypto';
import * as parser from '@babel/parser';
// @ts-ignore - Babel traverse uses CommonJS default export
import traverseNamespace from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
const traverse = (traverseNamespace as any).default || traverseNamespace;
import * as t from '@babel/types';

import type {
  ComponentInfo,
  DependencyGraph,
  ImportDeclaration,
} from './types.js';

/**
 * 从代码中提取所有导入声明
 *
 * @param code - 源代码
 * @returns 导入声明数组
 */
export function extractImports(code: string): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [];

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });

    traverse(ast, {
      ImportDeclaration(path: NodePath<any>) {
        const node = path.node;
        const source = node.source.value;

        // 跳过 node_modules 导入
        if (!source.startsWith('.') && !source.startsWith('/')) {
          return;
        }

        const declaration: ImportDeclaration = {
          type: 'named', // Default, will be overridden based on specifier
          source,
          start: node.start || 0,
          end: node.end || 0,
        };

        // 分析导入的 specifier
        for (const specifier of node.specifiers) {
          if (t.isImportDefaultSpecifier(specifier)) {
            // default import: import Foo from './foo'
            declaration.type = 'default';
            declaration.defaultName = specifier.local.name;
          } else if (t.isImportSpecifier(specifier)) {
            // named import: import { Foo, Bar } from './foo'
            declaration.type = 'named';
            if (!declaration.namedImports) {
              declaration.namedImports = [];
            }
            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported.value;
            declaration.namedImports.push(importedName);
          } else if (t.isImportNamespaceSpecifier(specifier)) {
            // namespace import: import * as Foo from './foo'
            declaration.type = 'namespace';
            declaration.namespaceName = specifier.local.name;
          }
        }

        imports.push(declaration);
      },
    });
  } catch (error) {
    console.error('[react-component-jump] ❌ 解析导入失败:', error);
  }

  return imports;
}

/**
 * 从导入声明中提取可能是组件的名称
 *
 * @param imports - 导入声明数组
 * @returns 组件名数组（以大写字母开头的）
 */
export function extractComponentNamesFromImports(
  imports: ImportDeclaration[]
): string[] {
  const componentNames: string[] = [];

  for (const imp of imports) {
    if (imp.type === 'default' && imp.defaultName) {
      // 默认导入：可能是组件
      if (/^[A-Z]/.test(imp.defaultName)) {
        componentNames.push(imp.defaultName);
      }
    } else if (imp.type === 'named' && imp.namedImports) {
      // 命名导入：筛选以大写字母开头的
      for (const name of imp.namedImports) {
        if (/^[A-Z]/.test(name)) {
          componentNames.push(name);
        }
      }
    }
    // 命名空间导入通常不是组件，跳过
  }

  return componentNames;
}

/**
 * 计算组件源码的 hash
 *
 * @param code - 完整的源代码
 * @param component - 组件信息（包含位置信息）
 * @returns MD5 hash 字符串
 */
export function computeComponentHash(
  code: string,
  component: Pick<ComponentInfo, 'startIndex' | 'endIndex'>
): string {
  const start = component.startIndex;
  const end = component.endIndex || code.length;

  // 提取组件的源代码
  const componentSource = code.substring(start, end);

  // 计算 MD5 hash
  return createHash('md5').update(componentSource).digest('hex');
}

/**
 * 计算文件的 hash
 *
 * @param code - 文件内容
 * @returns MD5 hash 字符串
 */
export function computeFileHash(code: string): string {
  return createHash('md5').update(code).digest('hex');
}

/**
 * 构建依赖关系图
 *
 * @param components - 组件信息映射
 * @returns 依赖关系图
 */
export function buildDependencyGraph(
  components: Record<string, ComponentInfo>
): DependencyGraph {
  const nodes = Object.keys(components);
  const edges: Array<{ from: string; to: string }> = [];

  // 构建边：对于每个组件，遍历它的依赖
  for (const [componentName, componentInfo] of Object.entries(components)) {
    // 确保 dependencies 是数组
    const deps = componentInfo.dependencies || [];
    for (const depName of deps) {
      // 只添加指向已注册组件的边
      if (components[depName]) {
        edges.push({
          from: componentName,
          to: depName,
        });

        // 反向填充 dependents
        if (!components[depName].dependents.includes(componentName)) {
          components[depName].dependents.push(componentName);
        }
      }
    }
  }

  return {
    nodes,
    edges,
    cycles: [],
  };
}

/**
 * 使用 DFS 检测循环依赖
 *
 * @param graph - 依赖关系图
 * @returns 所有循环路径的数组
 */
export function detectCircularDeps(
  graph: DependencyGraph
): string[][] {
  const { nodes, edges } = graph;
  const cycles: string[][] = [];

  // 构建邻接表
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node, []);
  }
  for (const edge of edges) {
    adj.get(edge.from)?.push(edge.to);
  }

  // DFS 状态
  enum Color {
    WHITE = 0, // 未访问
    GRAY = 1,  // 访问中（在当前路径上）
    BLACK = 2, // 已访问完成
  }

  const color = new Map<string, Color>();
  const parent = new Map<string, string | null>();
  const path: string[] = [];

  for (const node of nodes) {
    color.set(node, Color.WHITE);
    parent.set(node, null);
  }

  function dfs(u: string): void {
    color.set(u, Color.GRAY);
    path.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (color.get(v) === Color.GRAY) {
        // 发现回边，提取环
        const cycleStart = path.indexOf(v);
        const cycle = [...path.slice(cycleStart), v];
        cycles.push(cycle);
      } else if (color.get(v) === Color.WHITE) {
        parent.set(v, u);
        dfs(v);
      }
    }

    color.set(u, Color.BLACK);
    path.pop();
  }

  // 对所有未访问的节点进行 DFS
  for (const node of nodes) {
    if (color.get(node) === Color.WHITE) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * 验证组件注册表的一致性
 *
 * @param registry - 组件注册表
 * @returns 验证结果和错误信息
 */
export function validateRegistry(registry: {
  components: Record<string, ComponentInfo>;
  dependencies: DependencyGraph;
}): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查所有依赖都存在
  for (const [name, component] of Object.entries(registry.components)) {
    for (const dep of component.dependencies) {
      if (!registry.components[dep]) {
        errors.push(
          `组件 "${name}" 依赖 "${dep}"，但 "${dep}" 未在注册表中找到`
        );
      }
    }
  }

  // 检查依赖图的一致性
  const componentNames = new Set(Object.keys(registry.components));
  for (const node of registry.dependencies.nodes) {
    if (!componentNames.has(node)) {
      errors.push(`依赖图中的节点 "${node}" 在组件注册表中不存在`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
