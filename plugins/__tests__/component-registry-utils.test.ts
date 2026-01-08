/**
 * 单元测试：组件注册表工具函数
 */

import { describe, it, expect } from 'vitest';
import {
  extractImports,
  extractComponentNamesFromImports,
  computeComponentHash,
  computeFileHash,
  buildDependencyGraph,
  detectCircularDeps,
  validateRegistry,
  compareHashes,
  findAffectedComponents,
  buildFileHashRecords,
} from '../../src/server/module-component-registry/utils.js';
import type { ComponentInfo, DependencyGraph } from '../../src/server/module-component-registry/types.js';

describe('component-registry-utils', () => {
  describe('extractImports', () => {
    it('应该提取默认导入', () => {
      const code = "import App from './App';";
      const imports = extractImports(code);
      expect(imports).toHaveLength(1);
      expect(imports[0].type).toBe('default');
      expect(imports[0].defaultName).toBe('App');
      expect(imports[0].source).toBe('./App');
    });

    it('应该提取命名导入', () => {
      const code = "import { Card, Button } from './components';";
      const imports = extractImports(code);
      expect(imports).toHaveLength(1);
      expect(imports[0].type).toBe('named');
      expect(imports[0].namedImports).toEqual(['Card', 'Button']);
      expect(imports[0].source).toBe('./components');
    });

    it('应该提取混合导入', () => {
      const code = `
        import React, { useState } from 'react';
        import { Card, Button as Btn } from './components';
        import Layout from './Layout';
      `;
      const imports = extractImports(code);
      // React 导入会被跳过（不是相对路径），所以只有 2 个
      expect(imports.length).toBeGreaterThanOrEqual(2);

      // React 导入应该被跳过（不是相对路径）
      const reactImport = imports.find((imp) => imp.source === 'react');
      expect(reactImport).toBeUndefined();

      // Card 和 Btn 应该被提取
      const componentsImport = imports.find((imp) => imp.source === './components');
      expect(componentsImport).toBeDefined();
      expect(componentsImport?.namedImports).toContain('Card');
      expect(componentsImport?.namedImports).toContain('Button');

      // Layout 默认导入
      const layoutImport = imports.find((imp) => imp.source === './Layout');
      expect(layoutImport).toBeDefined();
      expect(layoutImport?.type).toBe('default');
      expect(layoutImport?.defaultName).toBe('Layout');
    });

    it('应该提取命名空间导入', () => {
      const code = "import * as Utils from './utils';";
      const imports = extractImports(code);
      expect(imports).toHaveLength(1);
      expect(imports[0].type).toBe('namespace');
      expect(imports[0].namespaceName).toBe('Utils');
      expect(imports[0].source).toBe('./utils');
    });

    it('应该跳过 node_modules 导入', () => {
      const code = `
        import React from 'react';
        import { Button } from 'antd';
        import lodash from 'lodash';
        import { Foo } from './foo';
      `;
      const imports = extractImports(code);
      // 只有 Foo 应该被提取（相对路径）
      expect(imports).toHaveLength(1);
      expect(imports[0].source).toBe('./foo');
    });

    it('应该处理别名导入', () => {
      const code = "import { Button as Btn } from './components';";
      const imports = extractImports(code);
      expect(imports).toHaveLength(1);
      expect(imports[0].type).toBe('named');
      expect(imports[0].namedImports).toContain('Button'); // 原始名称
    });

    it('应该处理空的导入数组', () => {
      const code = 'const x = 42;';
      const imports = extractImports(code);
      expect(imports).toHaveLength(0);
    });

    it('应该处理无效的代码', () => {
      const code = 'this is not valid javascript !!!';
      const imports = extractImports(code);
      expect(imports).toHaveLength(0);
    });
  });

  describe('extractComponentNamesFromImports', () => {
    it('应该从默认导入中提取组件名', () => {
      const imports = [
        { type: 'default' as const, defaultName: 'App', source: './App', start: 0, end: 20 },
        { type: 'default' as const, defaultName: 'foo', source: './foo', start: 21, end: 40 },
      ];
      const names = extractComponentNamesFromImports(imports);
      expect(names).toEqual(['App']); // 只有 App 以大写字母开头
    });

    it('应该从命名导入中提取组件名', () => {
      const imports = [
        {
          type: 'named' as const,
          namedImports: ['Card', 'Button', 'foo'],
          source: './components',
          start: 0,
          end: 50,
        },
      ];
      const names = extractComponentNamesFromImports(imports);
      expect(names).toEqual(['Card', 'Button']); // 只有大写字母开头的
    });

    it('应该混合默认和命名导入', () => {
      const imports = [
        { type: 'default' as const, defaultName: 'Layout', source: './Layout', start: 0, end: 25 },
        {
          type: 'named' as const,
          namedImports: ['Header', 'footer', 'Sidebar'],
          source: './components',
          start: 26,
          end: 80,
        },
      ];
      const names = extractComponentNamesFromImports(imports);
      expect(names).toEqual(['Layout', 'Header', 'Sidebar']);
    });

    it('应该跳过命名空间导入', () => {
      const imports = [
        {
          type: 'namespace' as const,
          namespaceName: 'Utils',
          source: './utils',
          start: 0,
          end: 30,
        },
      ];
      const names = extractComponentNamesFromImports(imports);
      expect(names).toHaveLength(0);
    });
  });

  describe('computeComponentHash', () => {
    it('应该为相同内容生成相同 hash', () => {
      const code = 'export function Foo() { return <div />; }';
      const component = {
        startIndex: 0,
        endIndex: code.length,
      };
      const hash1 = computeComponentHash(code, component);
      const hash2 = computeComponentHash(code, component);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32); // MD5 hash length
      expect(hash1).toMatch(/^[a-f0-9]{32}$/);
    });

    it('应该为不同内容生成不同 hash', () => {
      const code1 = 'export function Foo() { return <div />; }';
      const code2 = 'export function Foo() { return <span />; }';
      const component1 = {
        startIndex: 0,
        endIndex: code1.length,
      };
      const component2 = {
        startIndex: 0,
        endIndex: code2.length,
      };
      const hash1 = computeComponentHash(code1, component1);
      const hash2 = computeComponentHash(code2, component2);
      expect(hash1).not.toBe(hash2);
    });

    it('应该只使用指定范围内的代码计算 hash', () => {
      const componentCode = 'export function Foo() { return <div />; }';
      const code1 = `const x = 1;\n${componentCode}\nconst y = 2;`;
      const code2 = `const x = 999;\n${componentCode}\nconst y = 888;`;

      // 在两个版本中找到组件的起始和结束位置
      const startPos1 = code1.indexOf(componentCode);
      const endPos1 = startPos1 + componentCode.length;
      const startPos2 = code2.indexOf(componentCode);
      const endPos2 = startPos2 + componentCode.length;

      const component1 = { startIndex: startPos1, endIndex: endPos1 };
      const component2 = { startIndex: startPos2, endIndex: endPos2 };

      const hash1 = computeComponentHash(code1, component1);
      const hash2 = computeComponentHash(code2, component2);

      // 相同的组件代码应该生成相同的 hash
      expect(hash1).toBe(hash2);
    });

    it('应该处理没有 endIndex 的组件', () => {
      const code = 'export function Foo() { return <div />; }';
      const component = {
        startIndex: 0,
        // endIndex: undefined
      };
      const hash = computeComponentHash(code, component);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(32);
    });
  });

  describe('computeFileHash', () => {
    it('应该为相同内容生成相同 hash', () => {
      const code = 'export function Foo() { return <div />; }';
      const hash1 = computeFileHash(code);
      const hash2 = computeFileHash(code);
      expect(hash1).toBe(hash2);
    });

    it('应该为不同内容生成不同 hash', () => {
      const code1 = 'export function Foo() { return <div />; }';
      const code2 = 'export function Foo() { return <span />; }';
      const hash1 = computeFileHash(code1);
      const hash2 = computeFileHash(code2);
      expect(hash1).not.toBe(hash2);
    });

    it('应该处理空字符串', () => {
      const hash = computeFileHash('');
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(32);
    });

    it('应该对整个文件敏感', () => {
      const code1 = 'const x = 1;\nexport function Foo() { return <div />; }';
      const code2 = 'const x = 2;\nexport function Foo() { return <div />; }';
      const hash1 = computeFileHash(code1);
      const hash2 = computeFileHash(code2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('buildFileHashRecords', () => {
    it('应该构建文件 hash 记录', () => {
      const fileHashes = {
        '/path/to/file1.tsx': 'hash1',
        '/path/to/file2.tsx': 'hash2',
      };
      const components = [
        {
          name: 'Component1',
          file: '/path/to/file1.tsx',
          line: 1,
          column: 0,
          hash: 'comp1',
          fileHash: 'hash1',
          dependencies: [],
          dependents: [],
          startIndex: 0,
        },
        {
          name: 'Component2',
          file: '/path/to/file1.tsx',
          line: 10,
          column: 0,
          hash: 'comp2',
          fileHash: 'hash1',
          dependencies: [],
          dependents: [],
          startIndex: 100,
        },
        {
          name: 'Component3',
          file: '/path/to/file2.tsx',
          line: 1,
          column: 0,
          hash: 'comp3',
          fileHash: 'hash2',
          dependencies: [],
          dependents: [],
          startIndex: 0,
        },
      ] as ComponentInfo[];

      const records = buildFileHashRecords(fileHashes, components);
      expect(records).toHaveLength(2);

      const record1 = records.find((r) => r.file === '/path/to/file1.tsx');
      expect(record1).toBeDefined();
      expect(record1?.hash).toBe('hash1');
      expect(record1?.components).toEqual(['Component1', 'Component2']);

      const record2 = records.find((r) => r.file === '/path/to/file2.tsx');
      expect(record2).toBeDefined();
      expect(record2?.hash).toBe('hash2');
      expect(record2?.components).toEqual(['Component3']);
    });
  });

  describe('buildDependencyGraph', () => {
    it('应该构建简单的依赖图', () => {
      const components = {
        App: {
          name: 'App',
          file: '/App.tsx',
          line: 1,
          column: 0,
          hash: 'hash1',
          fileHash: 'fileHash1',
          dependencies: ['Header', 'Footer'],
          dependents: [],
          startIndex: 0,
        },
        Header: {
          name: 'Header',
          file: '/Header.tsx',
          line: 1,
          column: 0,
          hash: 'hash2',
          fileHash: 'fileHash2',
          dependencies: [],
          dependents: [],
          startIndex: 0,
        },
        Footer: {
          name: 'Footer',
          file: '/Footer.tsx',
          line: 1,
          column: 0,
          hash: 'hash3',
          fileHash: 'fileHash3',
          dependencies: [],
          dependents: [],
          startIndex: 0,
        },
      } as Record<string, ComponentInfo>;

      const graph = buildDependencyGraph(components);

      expect(graph.nodes).toEqual(['App', 'Header', 'Footer']);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges).toContainEqual({ from: 'App', to: 'Header' });
      expect(graph.edges).toContainEqual({ from: 'App', to: 'Footer' });

      // 验证反向依赖
      expect(components.Header.dependents).toContain('App');
      expect(components.Footer.dependents).toContain('App');
    });

    it('应该构建复杂的依赖图', () => {
      const components = {
        A: createComponent('A', ['B', 'C']),
        B: createComponent('B', ['D']),
        C: createComponent('C', ['D']),
        D: createComponent('D', []),
      } as Record<string, ComponentInfo>;

      const graph = buildDependencyGraph(components);

      expect(graph.nodes).toEqual(['A', 'B', 'C', 'D']);
      expect(graph.edges).toHaveLength(4);

      // 验证边
      expect(graph.edges).toContainEqual({ from: 'A', to: 'B' });
      expect(graph.edges).toContainEqual({ from: 'A', to: 'C' });
      expect(graph.edges).toContainEqual({ from: 'B', to: 'D' });
      expect(graph.edges).toContainEqual({ from: 'C', to: 'D' });

      // 验证反向依赖
      expect(components.B.dependents).toEqual(['A']);
      expect(components.C.dependents).toEqual(['A']);
      expect(components.D.dependents).toEqual(['B', 'C']);
    });

    it('应该忽略未注册的依赖', () => {
      const components = {
        App: createComponent('App', ['Header', 'UnknownComponent']),
        Header: createComponent('Header', []),
      } as Record<string, ComponentInfo>;

      const graph = buildDependencyGraph(components);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({ from: 'App', to: 'Header' });
    });
  });

  describe('detectCircularDeps', () => {
    it('应该检测到简单循环依赖', () => {
      const graph: DependencyGraph = {
        nodes: ['A', 'B'],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' },
        ],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('A');
      expect(cycles[0]).toContain('B');
    });

    it('应该检测到复杂循环依赖', () => {
      const graph: DependencyGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'A' },
        ],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('A');
      expect(cycles[0]).toContain('B');
      expect(cycles[0]).toContain('C');
    });

    it('应该检测到多条独立的循环', () => {
      const graph: DependencyGraph = {
        nodes: ['A', 'B', 'C', 'D'],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' },
          { from: 'C', to: 'D' },
          { from: 'D', to: 'C' },
        ],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      // 应该检测到至少 2 个循环
      expect(cycles.length).toBeGreaterThanOrEqual(2);
    });

    it('应该检测到自循环', () => {
      const graph: DependencyGraph = {
        nodes: ['A'],
        edges: [{ from: 'A', to: 'A' }],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      expect(cycles.length).toBe(1);
      expect(cycles[0]).toEqual(['A', 'A']);
    });

    it('应该在没有循环依赖时返回空数组', () => {
      const graph: DependencyGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
        ],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      expect(cycles).toHaveLength(0);
    });

    it('应该处理空图', () => {
      const graph: DependencyGraph = {
        nodes: [],
        edges: [],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      expect(cycles).toHaveLength(0);
    });

    it('应该处理没有边的图', () => {
      const graph: DependencyGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [],
        cycles: [],
      };

      const cycles = detectCircularDeps(graph);

      expect(cycles).toHaveLength(0);
    });
  });

  describe('validateRegistry', () => {
    it('应该验证有效的注册表', () => {
      const components = {
        App: createComponent('App', ['Header']),
        Header: createComponent('Header', []),
      } as Record<string, ComponentInfo>;

      const dependencies = buildDependencyGraph(components);

      const result = validateRegistry({ components, dependencies });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺失的依赖', () => {
      const components = {
        App: createComponent('App', ['Header', 'MissingComponent']),
        Header: createComponent('Header', []),
      } as Record<string, ComponentInfo>;

      const dependencies = buildDependencyGraph(components);

      const result = validateRegistry({ components, dependencies });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('MissingComponent');
    });

    it('应该检测依赖图中多余的节点', () => {
      const components = {
        App: createComponent('App', []),
      } as Record<string, ComponentInfo>;

      const dependencies: DependencyGraph = {
        nodes: ['App', 'Ghost'],
        edges: [],
        cycles: [],
      };

      const result = validateRegistry({ components, dependencies });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Ghost');
    });
  });

  describe('compareHashes', () => {
    it('应该返回 true 对于相同的 hash', () => {
      const hash = 'abc123';
      expect(compareHashes(hash, hash)).toBe(true);
    });

    it('应该返回 false 对于不同的 hash', () => {
      expect(compareHashes('abc123', 'def456')).toBe(false);
    });
  });

  describe('findAffectedComponents', () => {
    it('应该找出直接依赖者', () => {
      const components = {
        A: createComponent('A', []),
        B: createComponent('B', ['A']),
        C: createComponent('C', ['A']),
      } as Record<string, ComponentInfo>;

      // 先构建依赖图以填充 dependents 数组
      buildDependencyGraph(components);

      const affected = findAffectedComponents(['A'], components);

      expect(affected).toContain('A');
      expect(affected).toContain('B');
      expect(affected).toContain('C');
    });

    it('应该找出传递依赖者', () => {
      const components = {
        A: createComponent('A', []),
        B: createComponent('B', ['A']),
        C: createComponent('C', ['B']),
      } as Record<string, ComponentInfo>;

      // 先构建依赖图以填充 dependents 数组
      buildDependencyGraph(components);

      const affected = findAffectedComponents(['A'], components);

      expect(affected).toContain('A');
      expect(affected).toContain('B');
      expect(affected).toContain('C');
    });

    it('应该处理多个变更的组件', () => {
      const components = {
        A: createComponent('A', []),
        B: createComponent('B', ['A']),
        C: createComponent('C', ['A']),
        D: createComponent('D', []),
        E: createComponent('E', ['D']),
      } as Record<string, ComponentInfo>;

      // 先构建依赖图以填充 dependents 数组
      buildDependencyGraph(components);

      const affected = findAffectedComponents(['A', 'D'], components);

      expect(affected).toContain('A');
      expect(affected).toContain('B');
      expect(affected).toContain('C');
      expect(affected).toContain('D');
      expect(affected).toContain('E');
    });

    it('应该处理没有依赖者的组件', () => {
      const components = {
        A: createComponent('A', []),
      } as Record<string, ComponentInfo>;

      const affected = findAffectedComponents(['A'], components);

      expect(affected).toEqual(['A']);
    });
  });
});

// 辅助函数：创建测试用的组件对象
function createComponent(
  name: string,
  dependencies: string[]
): ComponentInfo {
  return {
    name,
    file: `/${name}.tsx`,
    line: 1,
    column: 0,
    hash: `hash_${name}`,
    fileHash: `fileHash_${name}`,
    dependencies,
    dependents: [],
    startIndex: 0,
    endIndex: 100,
  };
}
