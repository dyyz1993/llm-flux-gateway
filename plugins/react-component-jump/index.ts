/**
 * Vite 插件：React 组件追踪与依赖图生成（增强版）
 *
 * 特性：
 * - 解析 React 组件文件（.tsx）
 * - 生成组件名 → 文件路径的映射
 * - 在组件中使用全局变量注入组件标识
 * - 提供组件跳转 API
 * - 生成组件依赖关系图
 * - 计算组件和文件 hash
 * - 检测循环依赖
 * - 生成组件注册表 JSON 文件
 * - 智能编辑器检测
 */

import { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import * as parser from '@babel/parser';
// @ts-ignore - Babel traverse uses CommonJS default export
import traverseNamespace from '@babel/traverse';
const traverse = (traverseNamespace as any).default || traverseNamespace;

import type {
  ComponentRegistry,
  ComponentInfo as RegistryComponentInfo,
} from './types.js';
import {
  extractImports,
  extractComponentNamesFromImports,
  computeComponentHash,
  computeFileHash,
  buildDependencyGraph,
  detectCircularDeps,
  validateRegistry,
} from './utils.js';
import { getDependencyTree } from './dependency-graph.js';
import { jumpToEditor as jumpToEditorImpl } from '../shared/editor-detector.js';

export interface ComponentLocation {
  file: string;
  componentName: string;
  line: number;
  column: number;
}

interface ComponentMap {
  [componentId: string]: ComponentLocation;
}

// 组件名到文件路径的映射
const componentNameToFileMap = new Map<string, string>();

// 运行时存储的组件注册表
let componentRegistry: ComponentRegistry = {
  version: '1.0.0',
  lastUpdate: new Date().toISOString(),
  components: {},
  dependencies: {
    nodes: [],
    edges: [],
    cycles: [],
  },
  fileHashes: {},
  totalComponents: 0,
  totalFiles: 0,
};

/**
 * 生成组件 ID
 */
function generateComponentId(componentName: string, file: string): string {
  const hash = createHash('md5').update(componentName + file).digest('hex').slice(0, 8);
  return `${componentName}--${hash}`;
}

// 删除未使用的 extractComponentNameFromPath 函数

/**
 * 使用 AST 从代码中提取所有组件
 */
interface ComponentInfo {
  name: string;
  startIndex: number;
  endIndex?: number;
  line: number;
  column: number;
  returnStatementStart?: number;
  returnStatementEnd?: number;
}

function extractComponentsFromCode(code: string): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });

    traverse(ast, {
      // 处理 function ComponentName() {...}
      FunctionDeclaration(path: any) {
        const node = path.node as any;
        const name = node.id?.name;
        if (name && /^[A-Z]/.test(name)) {
          const component: ComponentInfo = {
            name,
            startIndex: node.start || 0,
            endIndex: node.end || 0,
            line: node.loc?.start.line || 1,
            column: node.loc?.start.column || 1,
          };

          // 查找 return 语句
          path.traverse({
            ReturnStatement(returnPath: any) {
              const returnNode = returnPath.node;
              if (returnNode.argument && (returnNode.argument.type === 'JSXElement' || returnNode.argument.type === 'JSXFragment')) {
                component.returnStatementStart = returnNode.start;
                component.returnStatementEnd = returnNode.end;
              }
            },
          });

          if (component.returnStatementStart) {
            components.push(component);
            console.log(`[react-component-jump] 🔍 找到函数组件: ${name} (行 ${component.line}, 列 ${component.column})`);
          }
        }
      },

      // 处理 const ComponentName = () => {...}
      VariableDeclarator(path: any) {
        const node = path.node;
        if (
          node.id.type === 'Identifier' &&
          /^[A-Z]/.test(node.id.name) &&
          (node.init?.type === 'ArrowFunctionExpression' ||
           node.init?.type === 'FunctionExpression')
        ) {
          const name = node.id.name;
          const component: ComponentInfo = {
            name,
            startIndex: node.start || 0,
            endIndex: node.end || 0,
            line: node.loc?.start.line || 1,
            column: node.loc?.start.column || 1,
          };

          // 处理箭头函数直接返回 JSX: const Comp = () => <JSX />
          if (node.init?.type === 'ArrowFunctionExpression') {
            const body = node.init.body;
            if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
              // 直接返回 JSX（无 return 关键字）
              component.returnStatementStart = body.start;
              component.returnStatementEnd = body.end;
              components.push(component);
              console.log(`[react-component-jump] 🔍 找到直接返回组件: ${name} (行 ${component.line}, 列 ${component.column})`);
              return;
            }
          }

          // 查找 return 语句（函数体有花括号的情况）
          if (node.init) {
            path.get('init')?.traverse({
              ReturnStatement(returnPath: any) {
                const returnNode = returnPath.node;
                if (returnNode.argument && (returnNode.argument.type === 'JSXElement' || returnNode.argument.type === 'JSXFragment')) {
                  component.returnStatementStart = returnNode.start;
                  component.returnStatementEnd = returnNode.end;
                }
              },
            });
          }

          if (component.returnStatementStart) {
            components.push(component);
            console.log(`[react-component-jump] 🔍 找到箭头函数组件: ${name} (行 ${component.line}, 列 ${component.column})`);
          }
        }
      },
    });

    console.log(`[react-component-jump] 📦 共提取 ${components.length} 个组件:`, components.map(c => c.name));
  } catch (error) {
    console.error('[react-component-jump] ❌ AST 解析失败:', error);
  }

  return components;
}

/**
 * 为组件添加 data-component-name 属性
 */
function addComponentNamesToCode(
  code: string,
  _filePath: string
): { code: string; components: ComponentInfo[] } {
  const components = extractComponentsFromCode(code);

  let modifiedCode = code;

  // 为每个组件添加 data-component-name 属性
  // 按照位置倒序处理，避免索引偏移问题
  const sortedComponents = [...components].sort((a, b) =>
    (b.returnStatementStart || 0) - (a.returnStatementStart || 0)
  );

  for (const component of sortedComponents) {
    const componentName = component.name;
    const returnStart = component.returnStatementStart;
    const returnEnd = component.returnStatementEnd;

    if (returnStart === undefined || returnEnd === undefined) {
      continue;
    }

    // 提取 return 语句后的代码
    const returnCode = modifiedCode.substring(returnStart, returnEnd);

    // 查找第一个 JSX 标签
    const tagMatch = returnCode.match(/<([a-zA-Z][a-zA-Z0-9]*)/);
    if (!tagMatch) {
      continue;
    }

    const tagName = tagMatch[1];
    if (!tagName) {
      continue;
    }
    const tagStartInReturn = returnCode.indexOf('<' + tagName);
    const tagEndInReturn = returnCode.indexOf('>', tagStartInReturn);

    if (tagEndInReturn === -1) {
      continue;
    }

    // 提取完整的标签
    const fullTag = returnCode.substring(tagStartInReturn, tagEndInReturn + 1);

    // 检查是否已经有 data-component-name 属性
    if (fullTag.includes('data-component-name')) {
      continue;
    }

    // 在标签中添加 data-component-name 属性
    const newTag = fullTag.replace(
      new RegExp(`^(<${tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\s|>)`),
      `$1 data-component-name="${componentName}"$2`
    );

    // 计算在原代码中的绝对位置
    const absoluteTagStart = returnStart + tagStartInReturn;

    // 替换原代码
    modifiedCode =
      modifiedCode.substring(0, absoluteTagStart) +
      newTag +
      modifiedCode.substring(absoluteTagStart + fullTag.length);

    console.log(`[react-component-jump] ✓ 为 ${componentName} 添加 data-component-name`);
  }

  return { code: modifiedCode, components };
}

export function reactComponentJumpPlugin(options: {
  enabled?: boolean;
  generateRegistry?: boolean; // 是否生成组件注册表
} = {}): Plugin {
  const config = {
    enabled: options.enabled ?? true,
    generateRegistry: options.generateRegistry ?? true,
  };

  const componentMap: ComponentMap = {};

  return {
    name: 'vite-plugin-react-component-jump-enhanced',
    enforce: 'pre', // 在 React 插件之前运行，确保 JSX 未被转换

    transform(code, id) {
      if (!config.enabled) return null;

      // 只处理 React 组件文件
      if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) {
        return null;
      }

      // 跳过 node_modules
      if (id.includes('node_modules')) {
        return null;
      }

      console.log(`[react-component-jump] 🔧 transform: ${id}`);

      // 检查是否是 React 组件（包含 JSX）
      if (!code.includes('return') && !code.includes('=>')) {
        console.log(`[react-component-jump] ⏭️  跳过（无 return/=>）: ${id}`);
        return null;
      }

      // 计算文件 hash
      const fileHash = computeFileHash(code);

      // 修改代码，添加 data-component-name 属性
      const { code: modifiedCode, components } = addComponentNamesToCode(code, id);

      console.log(`[react-component-jump] 📝 找到 ${components.length} 个组件:`, components.map(c => c.name));

      // 提取导入的组件
      const imports = extractImports(code);
      const importedComponentNames = extractComponentNamesFromImports(imports);

      console.log(`[react-component-jump] 📦 导入的组件:`, importedComponentNames);

      // 记录组件映射
      for (const component of components) {
        const componentId = generateComponentId(component.name, id);
        const componentHash = computeComponentHash(code, component);

        // 存储到组件注册表
        const registryComponent: RegistryComponentInfo = {
          name: component.name,
          file: id,
          line: component.line,
          column: component.column,
          hash: componentHash,
          fileHash,
          dependencies: importedComponentNames,
          dependents: [],
          startIndex: component.startIndex,
          endIndex: component.endIndex,
        };

        componentRegistry.components[component.name] = registryComponent;
        componentRegistry.fileHashes[id] = fileHash;

        // 旧的 componentMap 保持兼容
        componentMap[componentId] = {
          file: id,
          componentName: component.name,
          line: component.line,
          column: component.column,
        };

        // 记录组件名到文件路径的映射（包含位置信息）
        componentNameToFileMap.set(component.name, id);

        console.log(`[react-component-jump] ✓ ${component.name} ← ${id}:${component.line}:${component.column}`);
      }

      // 如果有组件被修改，返回修改后的代码
      if (components.length > 0 && modifiedCode !== code) {
        console.log(`[react-component-jump] ✅ 代码已修改: ${id}`);
        return {
          code: modifiedCode,
        };
      }

      return null;
    },

    buildEnd() {
      if (!config.enabled || !config.generateRegistry) {
        return;
      }

      console.log(`[react-component-jump] 📊 构建完成，生成组件注册表...`);

      // 更新统计信息
      componentRegistry.totalComponents = Object.keys(componentRegistry.components).length;
      componentRegistry.totalFiles = Object.keys(componentRegistry.fileHashes).length;
      componentRegistry.lastUpdate = new Date().toISOString();

      // 构建依赖图
      console.log(`[react-component-jump] 🔗 构建依赖图...`);
      componentRegistry.dependencies = buildDependencyGraph(componentRegistry.components);

      // 检测循环依赖
      console.log(`[react-component-jump] 🔍 检测循环依赖...`);
      const cycles = detectCircularDeps(componentRegistry.dependencies);
      componentRegistry.dependencies.cycles = cycles;

      if (cycles.length > 0) {
        console.warn(`[react-component-jump] ⚠️  检测到 ${cycles.length} 个循环依赖:`);
        for (const cycle of cycles) {
          console.warn(`[react-component-jump]   ${cycle.join(' → ')}`);
        }
      } else {
        console.log(`[react-component-jump] ✅ 未检测到循环依赖`);
      }

      // 验证注册表
      console.log(`[react-component-jump] ✔️  验证注册表...`);
      const validation = validateRegistry(componentRegistry);
      if (!validation.valid) {
        console.error(`[react-component-jump] ❌ 注册表验证失败:`);
        for (const error of validation.errors) {
          console.error(`[react-component-jump]   ${error}`);
        }
      } else {
        console.log(`[react-component-jump] ✅ 注册表验证通过`);
      }

      // 输出到文件
      const registryJson = JSON.stringify(componentRegistry, null, 2);
      this.emitFile({
        type: 'asset',
        fileName: '__component_registry.json',
        source: registryJson,
      });

      console.log(`[react-component-jump] 📊 组件注册表已生成:`);
      console.log(`[react-component-jump]   - 组件总数: ${componentRegistry.totalComponents}`);
      console.log(`[react-component-jump]   - 文件总数: ${componentRegistry.totalFiles}`);
      console.log(`[react-component-jump]   - 依赖边数: ${componentRegistry.dependencies.edges.length}`);
      console.log(`[react-component-jump]   - 循环依赖: ${cycles.length}`);
    },

    configureServer(server) {
      if (!config.enabled) return;

      server.middlewares.use(async (req, res, next) => {
        // 只处理 __react_component_jump 路径
        if (req.url && req.url.startsWith('/__react_component_jump')) {
          const targetPath = req.url.replace('/__react_component_jump', '');

          console.log(`[react-component-jump] → 处理请求: ${req.url}`);

          // GET /api/component-map
          if (targetPath === '/api/component-map' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(componentMap, null, 2));
            return;
          }

          // GET /api/component-registry
          if (targetPath === '/api/component-registry' && req.method === 'GET') {
            // 更新统计信息
            componentRegistry.totalComponents = Object.keys(componentRegistry.components).length;
            componentRegistry.totalFiles = Object.keys(componentRegistry.fileHashes).length;
            componentRegistry.lastUpdate = new Date().toISOString();

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(componentRegistry, null, 2));
            return;
          }

          // POST /api/jump-to-component
          if (targetPath === '/api/jump-to-component' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const { componentName } = JSON.parse(body);
                const filePath = componentNameToFileMap.get(componentName);

                if (!filePath) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: `Component ${componentName} not found`
                  }));
                  return;
                }

                // 查找组件的位置信息
                const componentId = generateComponentId(componentName, filePath);
                const location = componentMap[componentId];

                if (!location) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: `Component location ${componentName} not found`
                  }));
                  return;
                }

                // 使用实际的行号和列号调用编辑器跳转
                const success = await jumpToEditor(filePath, location.line, location.column);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success,
                  file: filePath,
                  line: location.line,
                  column: location.column,
                  message: success ? `已跳转到 ${componentName}:${location.line}:${location.column}` : '跳转失败'
                }));
              } catch (error) {
                console.error('[react-component-jump] ❌ 跳转错误:', error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: String(error)
                }));
              }
            });
            return;
          }

          // GET /api/dependency-graph
          if (targetPath === '/api/dependency-graph' && req.method === 'GET') {
            // 动态构建依赖图（开发模式 buildEnd 不会立即触发）
            const graph = buildDependencyGraph(componentRegistry.components);
            const cycles = detectCircularDeps(graph);
            componentRegistry.dependencies = {
              ...graph,
              cycles,
            };

            // 更新统计信息
            componentRegistry.totalComponents = Object.keys(componentRegistry.components).length;
            componentRegistry.totalFiles = Object.keys(componentRegistry.fileHashes).length;
            componentRegistry.lastUpdate = new Date().toISOString();

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(componentRegistry, null, 2));
            return;
          }

          // GET /api/dependency-graph/:componentName
          if (targetPath.startsWith('/api/dependency-graph/') && req.method === 'GET') {
            const componentName = decodeURIComponent(targetPath.split('/').pop() || '');
            const component = componentRegistry.components[componentName];

            if (!component) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                error: `Component ${componentName} not found`
              }));
              return;
            }

            // 获取依赖树
            const dependencyTree = getDependencyTree(componentName, componentRegistry.components);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              component,
              dependencyTree,
            }, null, 2));
            return;
          }

          // 404
          res.statusCode = 404;
          res.end('Not Found');
        } else {
          next();
        }
      });
    },
  };
}

/**
 * 跳转到编辑器（使用智能检测）
 */
async function jumpToEditor(filePath: string, line: number, column: number): Promise<boolean> {
  return jumpToEditorImpl(filePath, line, column);
}
