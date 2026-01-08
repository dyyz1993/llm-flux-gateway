/**
 * Dependency Graph Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import type { ComponentInfo } from '../../src/server/module-component-registry/types.js';
import {
  getDependencyTree,
  getDependencyChains,
  getDependentTree,
  topologicalSort,
  generateMermaidDiagram,
  formatDependencyTree,
  getDependencySummary,
  filterDependencyTree,
  findRootComponents,
  findLeafComponents,
  computeComponentImportance,
} from '../../src/server/module-component-registry/dependency-graph.js';

// 创建测试用的组件信息
function createMockComponent(
  name: string,
  dependencies: string[] = [],
  dependents: string[] = []
): ComponentInfo {
  return {
    name,
    file: `/src/${name}.tsx`,
    line: 1,
    column: 0,
    startIndex: 0,
    endIndex: 100,
    hash: `hash-${name}`,
    fileHash: `file-${name}`,
    dependencies,
    dependents,
  };
}

describe('getDependencyTree', () => {
  it('应该获取单个组件的依赖树', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card', 'Sidebar']),
      Card: createMockComponent('Card', ['Button']),
      Button: createMockComponent('Button'),
      Sidebar: createMockComponent('Sidebar'),
    };

    const tree = getDependencyTree('App', components);

    expect(tree).toBeDefined();
    expect(tree?.name).toBe('App');
    expect(tree?.depCount).toBe(1);
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0].name).toBe('Dashboard');
    expect(tree?.children[0].children).toHaveLength(2);
  });

  it('应该检测循环依赖', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', ['B']),
      B: createMockComponent('B', ['C']),
      C: createMockComponent('C', ['A']), // 循环
    };

    const tree = getDependencyTree('A', components);

    expect(tree).toBeDefined();
    expect(tree?.name).toBe('A');
    expect(tree?.children[0].name).toBe('B');
    expect(tree?.children[0].children[0].name).toBe('C');
    // C 依赖 A，但 A 已经在路径中，所以应该停止
  });

  it('应该限制深度', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', ['B']),
      B: createMockComponent('B', ['C']),
      C: createMockComponent('C', ['D']),
      D: createMockComponent('D'),
    };

    const tree = getDependencyTree('A', components, 2);

    expect(tree?.name).toBe('A');
    expect(tree?.children[0].name).toBe('B');
    expect(tree?.children[0].children[0].name).toBe('C');
    // D 应该不在树中，因为深度限制
  });

  it('应该在组件不存在时返回 null', () => {
    const components: Record<string, ComponentInfo> = {};
    const tree = getDependencyTree('NonExistent', components);

    expect(tree).toBeNull();
  });
});

describe('getDependencyChains', () => {
  it('应该获取所有依赖链', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card', 'Sidebar']),
      Card: createMockComponent('Card', ['Button']),
      Button: createMockComponent('Button'),
      Sidebar: createMockComponent('Sidebar'),
    };

    const chains = getDependencyChains('App', components);

    expect(chains).toHaveLength(2); // 两条路径：App->Dashboard->Card->Button 和 App->Dashboard->Sidebar
    expect(chains[0].path).toContain('App');
    expect(chains[0].path).toContain('Dashboard');
  });

  it('应该正确计算深度', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card']),
      Card: createMockComponent('Card'),
    };

    const chains = getDependencyChains('App', components);

    expect(chains).toHaveLength(1);
    expect(chains[0].depth).toBe(3); // App -> Dashboard -> Card
  });

  it('应该限制深度', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', ['B']),
      B: createMockComponent('B', ['C']),
      C: createMockComponent('C', ['D']),
      D: createMockComponent('D'),
    };

    const chains = getDependencyChains('A', components, 2);

    expect(chains).toHaveLength(1);
    expect(chains[0].depth).toBe(3); // A -> B -> C（深度限制是2，但depth是从0开始计数，所以是3）
  });
});

describe('getDependentTree', () => {
  it('应该获取反向依赖树', () => {
    const components: Record<string, ComponentInfo> = {
      Button: createMockComponent('Button', [], ['Card']),
      Card: createMockComponent('Card', ['Button'], ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card'], ['App']),
      App: createMockComponent('App', ['Dashboard'], []),
    };

    const tree = getDependentTree('Button', components);

    expect(tree).toBeDefined();
    expect(tree?.name).toBe('Button');
    expect(tree?.depCount).toBe(1);
    expect(tree?.children[0].name).toBe('Card');
    expect(tree?.children[0].children[0].name).toBe('Dashboard');
    expect(tree?.children[0].children[0].children[0].name).toBe('App');
  });

  it('应该在组件没有依赖者时返回只有根节点的树', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', [], []),
    };

    const tree = getDependentTree('App', components);

    expect(tree).toBeDefined();
    expect(tree?.name).toBe('App');
    expect(tree?.children).toHaveLength(0);
  });
});

describe('topologicalSort', () => {
  it('应该正确排序没有循环依赖的组件', () => {
    const components: Record<string, ComponentInfo> = {
      Button: createMockComponent('Button', [], ['Card']),
      Card: createMockComponent('Card', ['Button'], ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card'], ['App']),
      App: createMockComponent('App', ['Dashboard'], []),
    };

    const sorted = topologicalSort(components);

    expect(sorted).toHaveLength(4);
    // Button 应该在 Card 之前
    expect(sorted.indexOf('Button')).toBeLessThan(sorted.indexOf('Card'));
    // Card 应该在 Dashboard 之前
    expect(sorted.indexOf('Card')).toBeLessThan(sorted.indexOf('Dashboard'));
    // Dashboard 应该在 App 之前
    expect(sorted.indexOf('Dashboard')).toBeLessThan(sorted.indexOf('App'));
  });

  it('应该在检测到循环依赖时返回空数组', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', ['B'], ['C']),
      B: createMockComponent('B', ['C'], ['A']),
      C: createMockComponent('C', ['A'], ['B']),
    };

    const sorted = topologicalSort(components);

    expect(sorted).toHaveLength(0);
  });

  it('应该正确处理独立的组件', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', [], []),
      B: createMockComponent('B', [], []),
      C: createMockComponent('C', [], []),
    };

    const sorted = topologicalSort(components);

    expect(sorted).toHaveLength(3);
    expect(sorted).toContain('A');
    expect(sorted).toContain('B');
    expect(sorted).toContain('C');
  });
});

describe('generateMermaidDiagram', () => {
  it('应该生成正确的 Mermaid 图表', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card']),
      Card: createMockComponent('Card'),
    };

    const mermaid = generateMermaidDiagram('App', components);

    expect(mermaid).toContain('graph TB');
    expect(mermaid).toContain('App --> Dashboard');
    expect(mermaid).toContain('Dashboard --> Card');
  });

  it('应该支持 LR 方向', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard'),
    };

    const mermaid = generateMermaidDiagram('App', components, 'LR');

    expect(mermaid).toContain('graph LR');
  });

  it('应该在组件不存在时返回空字符串', () => {
    const components: Record<string, ComponentInfo> = {};
    const mermaid = generateMermaidDiagram('NonExistent', components);

    expect(mermaid).toBe('');
  });
});

describe('formatDependencyTree', () => {
  it('应该正确格式化依赖树', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard', ['Card']),
      Card: createMockComponent('Card'),
    };

    const tree = getDependencyTree('App', components);
    const formatted = tree ? formatDependencyTree(tree) : '';

    expect(formatted).toContain('App');
    expect(formatted).toContain('Dashboard');
    expect(formatted).toContain('Card');
    expect(formatted).toContain('└──');
  });
});

describe('getDependencySummary', () => {
  it('应该正确计算依赖摘要', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard'], []),
      Dashboard: createMockComponent('Dashboard', ['Card'], ['App']),
      Card: createMockComponent('Card', ['Button'], ['Dashboard']),
      Button: createMockComponent('Button', [], ['Card']),
    };

    const summary = getDependencySummary('App', components);

    expect(summary.name).toBe('App');
    expect(summary.directDeps).toBe(1); // Dashboard
    expect(summary.allDeps).toBe(3); // Dashboard, Card, Button
    expect(summary.dependents).toBe(0); // 没有人依赖 App
    expect(summary.maxDepth).toBe(4); // App -> Dashboard -> Card -> Button（4个节点）
    expect(summary.hasCycle).toBe(false);
  });

  it('应该检测循环依赖', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', ['B'], ['C']),
      B: createMockComponent('B', ['C'], ['A']),
      C: createMockComponent('C', ['A'], ['B']),
    };

    const summary = getDependencySummary('A', components);

    expect(summary.hasCycle).toBe(true);
  });

  it('应该在组件不存在时返回零值', () => {
    const components: Record<string, ComponentInfo> = {};
    const summary = getDependencySummary('NonExistent', components);

    expect(summary.name).toBe('NonExistent');
    expect(summary.directDeps).toBe(0);
    expect(summary.allDeps).toBe(0);
    expect(summary.dependents).toBe(0);
    expect(summary.maxDepth).toBe(0);
    expect(summary.hasCycle).toBe(false);
  });
});

describe('filterDependencyTree', () => {
  it('应该过滤依赖树', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard', 'Sidebar']),
      Dashboard: createMockComponent('Dashboard', ['Card']),
      Card: createMockComponent('Card'),
      Sidebar: createMockComponent('Sidebar'),
    };

    const tree = getDependencyTree('App', components);
    const filterNames = new Set(['App', 'Dashboard', 'Card']);
    const filtered = tree ? filterDependencyTree(tree, filterNames) : null;

    expect(filtered).toBeDefined();
    expect(filtered?.name).toBe('App');
    expect(filtered?.children).toHaveLength(1);
    expect(filtered?.children[0].name).toBe('Dashboard');
    expect(filtered?.children[0].children[0].name).toBe('Card');
    // Sidebar 应该被过滤掉
  });

  it('应该在根节点不在过滤列表中时返回 null', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard']),
      Dashboard: createMockComponent('Dashboard'),
    };

    const tree = getDependencyTree('App', components);
    const filterNames = new Set(['Dashboard']);
    const filtered = tree ? filterDependencyTree(tree, filterNames) : null;

    expect(filtered).toBeNull();
  });
});

describe('findRootComponents', () => {
  it('应该找到所有根节点（没有被依赖的组件）', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', [], []), // 根节点
      Dashboard: createMockComponent('Dashboard', [], ['App']),
      Card: createMockComponent('Card', [], ['Dashboard']),
    };

    const roots = findRootComponents(components);

    expect(roots).toHaveLength(1);
    expect(roots).toContain('App');
  });

  it('应该返回所有独立组件', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', [], []),
      B: createMockComponent('B', [], []),
      C: createMockComponent('C', [], []),
    };

    const roots = findRootComponents(components);

    expect(roots).toHaveLength(3);
    expect(roots).toContain('A');
    expect(roots).toContain('B');
    expect(roots).toContain('C');
  });
});

describe('findLeafComponents', () => {
  it('应该找到所有叶子节点（没有依赖的组件）', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard'], []),
      Dashboard: createMockComponent('Dashboard', ['Card'], ['App']),
      Card: createMockComponent('Card', [], ['Dashboard']), // 叶子节点
    };

    const leaves = findLeafComponents(components);

    expect(leaves).toHaveLength(1);
    expect(leaves).toContain('Card');
  });

  it('应该返回所有独立组件', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', [], []),
      B: createMockComponent('B', [], []),
      C: createMockComponent('C', [], []),
    };

    const leaves = findLeafComponents(components);

    expect(leaves).toHaveLength(3);
  });
});

describe('computeComponentImportance', () => {
  it('应该正确计算组件重要性', () => {
    const components: Record<string, ComponentInfo> = {
      App: createMockComponent('App', ['Dashboard'], []), // 根节点，低重要性
      Dashboard: createMockComponent('Dashboard', ['Button'], ['App']),
      Button: createMockComponent('Button', [], ['Dashboard', 'Card', 'Sidebar']), // 基础组件，高重要性
      Card: createMockComponent('Card', ['Button'], []),
      Sidebar: createMockComponent('Sidebar', ['Button'], []),
    };

    const buttonImportance = computeComponentImportance('Button', components);
    const appImportance = computeComponentImportance('App', components);

    expect(buttonImportance).toBeGreaterThan(appImportance);
  });

  it('应该在组件不存在时返回 0', () => {
    const components: Record<string, ComponentInfo> = {};
    const importance = computeComponentImportance('NonExistent', components);

    expect(importance).toBe(0);
  });

  it('应该返回 0-1 之间的值', () => {
    const components: Record<string, ComponentInfo> = {
      A: createMockComponent('A', [], ['B', 'C', 'D']),
      B: createMockComponent('B', [], ['A']),
      C: createMockComponent('C', [], ['A']),
      D: createMockComponent('D', [], ['A']),
    };

    const importance = computeComponentImportance('A', components);

    expect(importance).toBeGreaterThanOrEqual(0);
    expect(importance).toBeLessThanOrEqual(1);
  });
});
