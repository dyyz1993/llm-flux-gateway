/**
 * React Component Jump Plugin - Dependency Graph
 *
 * 插件内部使用的依赖图工具
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
    console.warn(`[react-component-jump] ⚠️  组件 ${componentName} 不存在`);
    return null;
  }

  // 检测循环依赖
  if (visited.has(componentName)) {
    console.warn(`[react-component-jump] ⚠️  检测到循环依赖: ${componentName}`);
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
