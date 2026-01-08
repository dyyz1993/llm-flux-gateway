/**
 * Vite 插件：React 组件追踪与跳转
 *
 * 特性：
 * - 解析 React 组件文件（.tsx）
 * - 生成组件名 → 文件路径的映射
 * - 在组件中使用全局变量注入组件标识
 * - 提供组件跳转 API
 */

import { Plugin } from 'vite';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as parser from '@babel/parser';
// @ts-ignore - Babel traverse uses CommonJS default export
import traverseNamespace from '@babel/traverse';
const traverse = (traverseNamespace as any).default || traverseNamespace;

const execAsync = promisify(exec);

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

/**
 * 生成组件 ID
 */
function generateComponentId(componentName: string, file: string): string {
  const hash = createHash('md5').update(componentName + file).digest('hex').slice(0, 8);
  return `${componentName}--${hash}`;
}

/**
 * 从文件路径提取组件名
 */
function extractComponentNameFromPath(filePath: string): string {
  const match = filePath.match(/\/([A-Z][a-zA-Z0-9]*)\.(tsx|ts|jsx|js)$/);
  return match ? match[1] : 'Unknown';
}

/**
 * 使用 AST 从代码中提取所有组件
 */
interface ComponentInfo {
  name: string;
  startIndex: number;
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
      FunctionDeclaration(path) {
        const node = path.node as FunctionDeclaration;
        const name = node.id?.name;
        if (name && /^[A-Z]/.test(name)) {
          const component: ComponentInfo = {
            name,
            startIndex: node.start || 0,
            line: node.loc?.start.line || 1,
            column: node.loc?.start.column || 1,
          };

          // 查找 return 语句
          path.traverse({
            ReturnStatement(returnPath) {
              const returnNode = returnPath.node as ReturnStatement;
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
      VariableDeclarator(path) {
        const node = path.node as VariableDeclarator;
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
            line: node.loc?.start.line || 1,
            column: node.loc?.start.column || 1,
          };

          // 处理箭头函数直接返回 JSX: const Comp = () => <JSX />
          if (node.init?.type === 'ArrowFunctionExpression') {
            const body = (node.init as ArrowFunctionExpression).body;
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
              ReturnStatement(returnPath) {
                const returnNode = returnPath.node as ReturnStatement;
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
 *
 * 策略：
 * 1. 使用 AST 提取组件信息（包括 return 语句位置）
 * 2. 在 return 语句的 JSX 元素上添加 data-component-name 属性
 * 3. 使用字符串替换的方式注入
 */
function addComponentNamesToCode(
  code: string,
  filePath: string
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
} = {}): Plugin {
  const config = {
    enabled: options.enabled ?? true,
  };

  const componentMap: ComponentMap = {};

  return {
    name: 'vite-plugin-react-component-jump',
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

      // 修改代码，添加 data-component-name 属性
      const { code: modifiedCode, components } = addComponentNamesToCode(code, id);

      console.log(`[react-component-jump] 📝 找到 ${components.length} 个组件:`, components.map(c => c.name));

      // 记录组件映射
      for (const component of components) {
        const componentId = generateComponentId(component.name, id);
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
 * 直接调用编辑器跳转
 */
async function jumpToEditor(filePath: string, line: number, column: number): Promise<boolean> {
  const editors = [
    { name: 'Trae', cmd: 'trae', test: 'which trae' },
    { name: 'VSCode', cmd: 'code', test: 'which code' }
  ];

  for (const editor of editors) {
    try {
      await execAsync(editor.test);

      const absolutePath = filePath.startsWith('/')
        ? filePath
        : `/Users/xuyingzhou/Downloads/llm-flux-gateway/${filePath}`;

      const cmd = `${editor.cmd} --goto "${absolutePath}:${line}:${column}"`;
      console.log(`[react-component-jump] 📂 ${cmd}`);

      await execAsync(cmd);
      console.log(`[react-component-jump] ✅ 已在 ${editor.name} 中打开`);
      return true;
    } catch (e) {
      continue;
    }
  }

  console.error('[react-component-jump] ❌ 未找到可用的编辑器');
  return false;
}
