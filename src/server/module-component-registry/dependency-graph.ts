/**
 * Dependency Graph Utilities
 *
 * 用于：
 * - 获取组件依赖链
 * - 拓扑排序
 * - 生成可视化数据
 * - 检测循环依赖
 */

import type { ComponentInfo } from './types.js';

/**
 * 依赖树节点（用于可视化）
 */
export interface DependencyTreeNode {
  /** 组件名 */
  name: string;
  /** 文件路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 直接依赖的组件数量 */
  depCount: number;
  /** 子节点（依赖的组件） */
  children: DependencyTreeNode[];
  /** 是否展开（用于 UI） */
  expanded?: boolean;
}

/**
 * 依赖链路径
 */
export interface DependencyChain {
  /** 路径中的组件名列表 */
  path: string[];
  /** 总深度 */
  depth: number;
}

/**
 * 获取单个组件的依赖树
 *
 * @param componentName - 组件名
 * @param components - 组件信息映射
 * @param maxDepth - 最大深度（默认无限）
 * @param visited - 已访问的组件（用于防止循环）
 * @returns 依赖树
 */
export function getDependencyTree(
  componentName: string,
  components: Record<string, ComponentInfo>,
  maxDepth: number = Infinity,
  visited: Set<string> = new Set()
): DependencyTreeNode | null {
  const component = components[componentName];

  if (!component) {
    console.warn(`[dependency-graph] ⚠️  组件 ${componentName} 不存在`);
    return null;
  }

  // 检测循环依赖
  if (visited.has(componentName)) {
    console.warn(`[dependency-graph] ⚠️  检测到循环依赖: ${componentName}`);
    return {
      name: componentName,
      file: component.file,
      line: component.line,
      depCount: 0,
      children: [],
      expanded: false,
    };
  }

  // 检查深度限制
  if (visited.size >= maxDepth) {
    return {
      name: componentName,
      file: component.file,
      line: component.line,
      depCount: component.dependencies.length,
      children: [],
      expanded: false,
    };
  }

  // 递归构建依赖树
  const newVisited = new Set(visited);
  newVisited.add(componentName);

  const children: DependencyTreeNode[] = [];
  for (const depName of component.dependencies) {
    const childTree = getDependencyTree(depName, components, maxDepth, newVisited);
    if (childTree) {
      children.push(childTree);
    }
  }

  return {
    name: componentName,
    file: component.file,
    line: component.line,
    depCount: component.dependencies.length,
    children,
    expanded: false,
  };
}

/**
 * 获取组件的所有依赖链（从根到叶子）
 *
 * @param componentName - 组件名
 * @param components - 组件信息映射
 * @param maxDepth - 最大深度
 * @returns 所有依赖链
 */
export function getDependencyChains(
  componentName: string,
  components: Record<string, ComponentInfo>,
  maxDepth: number = Infinity
): DependencyChain[] {
  const chains: DependencyChain[] = [];
  const currentPath: string[] = [];

  function dfs(name: string, depth: number) {
    // 检测循环
    if (currentPath.includes(name)) {
      // 循环依赖，记录路径但不继续
      chains.push({
        path: [...currentPath, name],
        depth: currentPath.length + 1,
      });
      return;
    }

    // 检查深度
    if (depth > maxDepth) {
      chains.push({
        path: [...currentPath],
        depth: currentPath.length,
      });
      return;
    }

    const component = components[name];
    if (!component) {
      chains.push({
        path: [...currentPath, name],
        depth: currentPath.length + 1,
      });
      return;
    }

    currentPath.push(name);

    // 叶子节点（没有依赖）
    if (component.dependencies.length === 0) {
      chains.push({
        path: [...currentPath],
        depth: currentPath.length,
      });
    } else {
      // 递归处理所有依赖
      for (const depName of component.dependencies) {
        dfs(depName, depth + 1);
      }
    }

    currentPath.pop();
  }

  dfs(componentName, 0);

  return chains;
}

/**
 * 获取组件的反向依赖树（谁依赖了它）
 *
 * @param componentName - 组件名
 * @param components - 组件信息映射
 * @param maxDepth - 最大深度
 * @param visited - 已访问的组件
 * @returns 反向依赖树
 */
export function getDependentTree(
  componentName: string,
  components: Record<string, ComponentInfo>,
  maxDepth: number = Infinity,
  visited: Set<string> = new Set()
): DependencyTreeNode | null {
  const component = components[componentName];

  if (!component) {
    console.warn(`[dependency-graph] ⚠️  组件 ${componentName} 不存在`);
    return null;
  }

  // 检测循环
  if (visited.has(componentName)) {
    console.warn(`[dependency-graph] ⚠️  检测到循环依赖: ${componentName}`);
    return {
      name: componentName,
      file: component.file,
      line: component.line,
      depCount: 0,
      children: [],
      expanded: false,
    };
  }

  // 检查深度
  if (visited.size >= maxDepth) {
    return {
      name: componentName,
      file: component.file,
      line: component.line,
      depCount: component.dependents.length,
      children: [],
      expanded: false,
    };
  }

  // 递归构建反向依赖树
  const newVisited = new Set(visited);
  newVisited.add(componentName);

  const children: DependencyTreeNode[] = [];
  for (const depName of component.dependents) {
    const childTree = getDependentTree(depName, components, maxDepth, newVisited);
    if (childTree) {
      children.push(childTree);
    }
  }

  return {
    name: componentName,
    file: component.file,
    line: component.line,
    depCount: component.dependents.length,
    children,
    expanded: false,
  };
}

/**
 * 拓扑排序（Kahn 算法）
 *
 * @param components - 组件信息映射
 * @returns 拓扑排序后的组件名列表（如果有循环依赖则返回空数组）
 */
export function topologicalSort(components: Record<string, ComponentInfo>): string[] {
  // 计算入度
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const [name] of Object.entries(components)) {
    inDegree.set(name, 0);
    adjList.set(name, []);
  }

  // 构建邻接表和入度
  for (const [name, component] of Object.entries(components)) {
    for (const depName of component.dependencies) {
      if (components[depName]) {
        adjList.get(depName)!.push(name);
        inDegree.set(name, (inDegree.get(name) || 0) + 1);
      }
    }
  }

  // 找出所有入度为 0 的节点
  const queue: string[] = [];
  for (const [name, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  const result: string[] = [];

  // BFS
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const neighbor of adjList.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // 检查是否有循环依赖
  if (result.length !== Object.keys(components).length) {
    console.error('[dependency-graph] ❌ 检测到循环依赖，无法完成拓扑排序');
    return [];
  }

  return result;
}

/**
 * 生成 Mermaid 图表代码
 *
 * @param componentName - 组件名
 * @param components - 组件信息映射
 * @param direction - 方向（TB: top-bottom, LR: left-right）
 * @returns Mermaid 代码
 */
export function generateMermaidDiagram(
  componentName: string,
  components: Record<string, ComponentInfo>,
  direction: 'TB' | 'LR' = 'TB'
): string {
  const tree = getDependencyTree(componentName, components);
  if (!tree) {
    return '';
  }

  const edges: string[] = [];
  const visited = new Set<string>();

  function collectEdges(node: DependencyTreeNode) {
    if (visited.has(node.name)) {
      return;
    }
    visited.add(node.name);

    for (const child of node.children) {
      edges.push(`  ${node.name} --> ${child.name}`);
      collectEdges(child);
    }
  }

  collectEdges(tree);

  return `graph ${direction}\n${edges.join('\n')}`;
}

/**
 * 生成文本格式的依赖树（用于控制台显示）
 *
 * @param tree - 依赖树
 * @param indent - 缩进量
 * @returns 文本格式的树
 */
export function formatDependencyTree(tree: DependencyTreeNode, indent: number = 0): string {
  const prefix = '  '.repeat(indent);
  const connector = indent === 0 ? '' : '└── ';
  const depCount = tree.depCount > 0 ? ` (${tree.depCount})` : '';
  let result = `${prefix}${connector}${tree.name}${depCount}\n`;

  for (const child of tree.children) {
    result += formatDependencyTree(child, indent + 1);
  }

  return result;
}

/**
 * 获取组件的依赖关系摘要
 *
 * @param componentName - 组件名
 * @param components - 组件信息映射
 * @returns 依赖关系摘要
 */
export function getDependencySummary(
  componentName: string,
  components: Record<string, ComponentInfo>
): {
  /** 组件名 */
  name: string;
  /** 直接依赖数量 */
  directDeps: number;
  /** 所有依赖数量（包括传递依赖） */
  allDeps: number;
  /** 被依赖数量（有多少组件依赖它） */
  dependents: number;
  /** 最大深度 */
  maxDepth: number;
  /** 是否有循环依赖 */
  hasCycle: boolean;
} {
  const component = components[componentName];

  if (!component) {
    return {
      name: componentName,
      directDeps: 0,
      allDeps: 0,
      dependents: 0,
      maxDepth: 0,
      hasCycle: false,
    };
  }

  // 计算所有依赖（包括传递依赖）
  const allDepsSet = new Set<string>();
  const visited = new Set<string>();

  function collectAllDeps(name: string) {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);

    const comp = components[name];
    if (!comp) {
      return;
    }

    for (const depName of comp.dependencies) {
      allDepsSet.add(depName);
      collectAllDeps(depName);
    }
  }

  collectAllDeps(componentName);

  // 计算最大深度
  let maxDepth = 0;
  const chains = getDependencyChains(componentName, components);
  for (const chain of chains) {
    maxDepth = Math.max(maxDepth, chain.depth);
  }

  // 检测循环依赖
  const hasCycle = chains.some(chain => {
    const uniqueNames = new Set(chain.path);
    return uniqueNames.size !== chain.path.length;
  });

  return {
    name: componentName,
    directDeps: component.dependencies.length,
    allDeps: allDepsSet.size,
    dependents: component.dependents.length,
    maxDepth,
    hasCycle,
  };
}

/**
 * 过滤依赖树（只包含指定路径上的组件）
 *
 * @param tree - 依赖树
 * @param filterNames - 要保留的组件名列表
 * @returns 过滤后的依赖树
 */
export function filterDependencyTree(
  tree: DependencyTreeNode,
  filterNames: Set<string>
): DependencyTreeNode | null {
  if (!filterNames.has(tree.name)) {
    return null;
  }

  const filteredChildren: DependencyTreeNode[] = [];
  for (const child of tree.children) {
    const filteredChild = filterDependencyTree(child, filterNames);
    if (filteredChild) {
      filteredChildren.push(filteredChild);
    }
  }

  return {
    ...tree,
    children: filteredChildren,
  };
}

/**
 * 从依赖图中找到根节点（没有被依赖的组件）
 *
 * @param components - 组件信息映射
 * @returns 根节点列表
 */
export function findRootComponents(components: Record<string, ComponentInfo>): string[] {
  const roots: string[] = [];

  for (const [name, component] of Object.entries(components)) {
    if (component.dependents.length === 0) {
      roots.push(name);
    }
  }

  return roots;
}

/**
 * 从依赖图中找到叶子节点（没有依赖的组件）
 *
 * @param components - 组件信息映射
 * @returns 叶子节点列表
 */
export function findLeafComponents(components: Record<string, ComponentInfo>): string[] {
  const leaves: string[] = [];

  for (const [name, component] of Object.entries(components)) {
    if (component.dependencies.length === 0) {
      leaves.push(name);
    }
  }

  return leaves;
}

/**
 * 计算组件的重要性（基于被依赖的数量和深度）
 *
 * @param componentName - 组件名
 * @param components - 组件信息映射
 * @returns 重要性分数（0-1）
 */
export function computeComponentImportance(
  componentName: string,
  components: Record<string, ComponentInfo>
): number {
  const component = components[componentName];

  if (!component) {
    return 0;
  }

  // 简单的启发式：
  // 1. 被依赖的数量越多，重要性越高
  // 2. 依赖的数量越少，重要性越高（说明是基础组件）
  const dependentCount = component.dependents.length;
  const dependencyCount = component.dependencies.length;

  // 归一化到 0-1
  const totalComponents = Object.keys(components).length;
  const normalizedDependents = Math.min(dependentCount / totalComponents, 1);
  const normalizedDeps = 1 - Math.min(dependencyCount / 10, 1);

  return (normalizedDependents * 0.7 + normalizedDeps * 0.3);
}
