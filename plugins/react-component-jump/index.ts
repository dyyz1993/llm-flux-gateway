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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
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

/**
 * 兄弟组件信息接口
 */
interface SiblingComponent {
  name: string;
  file: string;
  line: number;
  endLine: number;
  lineCount: number;
}

/**
 * 并列元素信息接口
 */
interface SiblingElement {
  name: string;          // 元素/组件名
  type: 'react' | 'html'; // 类型
  tagName?: string;       // HTML 标签名（如果是 HTML 元素）
  file: string;
  line: number;
  endLine: number;
  lineCount: number;
}

/**
 * 查找组件的兄弟组件（同一目录下的其他组件）
 */
function findSiblingComponents(
  componentName: string,
  componentRegistry: ComponentRegistry
): {
  current: SiblingComponent | null;
  siblings: SiblingComponent[];
  directory: string;
  copyFormats: {
    fileNameAndLines: string;
    llmSearch: string;
  };
} {
  const currentComponent = componentRegistry.components[componentName];
  if (!currentComponent) {
    return {
      current: null,
      siblings: [],
      directory: '',
      copyFormats: { fileNameAndLines: '', llmSearch: '' }
    };
  }

  const componentFile = currentComponent.file;
  const componentDir = dirname(componentFile);
  const fileName = basename(componentFile);

  // 查找同一目录下的所有组件文件
  const siblings: SiblingComponent[] = [];
  try {
    const files = readdirSync(componentDir);
    const componentFiles = files.filter(f =>
      /\.(tsx|ts|jsx|js)$/.test(f) &&
      f !== fileName && // 排除当前文件
      !f.startsWith('.') && // 排除隐藏文件
      !f.includes('.test.') && // 排除测试文件
      !f.includes('.spec.')
    );

    for (const file of componentFiles) {
      const filePath = join(componentDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const components = extractComponentsFromCode(content);

        for (const comp of components) {
          siblings.push({
            name: comp.name,
            file: filePath,
            line: comp.line,
            endLine: comp.endIndex ? getLineNumberForPosition(content, comp.endIndex) : comp.line,
            lineCount: comp.endIndex
              ? getLineNumberForPosition(content, comp.endIndex) - comp.line + 1
              : 0
          });
        }
      } catch (err) {
        console.error(`[react-component-jump] ❌ 读取文件失败: ${filePath}`, err);
      }
    }
  } catch (err) {
    console.error(`[react-component-jump] ❌ 读取目录失败: ${componentDir}`, err);
  }

  // 计算当前组件的结束行
  const currentEndLine = currentComponent.endIndex
    ? getLineNumberForPosition(
        readFileSync(componentFile, 'utf-8'),
        currentComponent.endIndex
      )
    : currentComponent.line;

  const currentLineCount = currentEndLine - currentComponent.line + 1;

  const current: SiblingComponent = {
    name: componentName,
    file: componentFile,
    line: currentComponent.line,
    endLine: currentEndLine,
    lineCount: currentLineCount
  };

  // 生成复制格式
  const shortFileName = basename(componentFile);
  const copyFormats = {
    fileNameAndLines: `${shortFileName}:${current.line}-${currentEndLine}`,
    llmSearch: `查看 ${shortFileName} 文件第 ${current.line} 行开始的 ${componentName} 组件`
  };

  return {
    current,
    siblings,
    directory: componentDir,
    copyFormats
  };
}

/**
 * 从文件内容获取指定位置的行号
 */
function getLineNumberForPosition(content: string, position: number): number {
  const lines = content.substring(0, position).split('\n');
  return lines.length;
}

/**
 * 从组件的 JSX 中提取并列元素（只提取顶层元素，不提取嵌套元素）
 */
function extractSiblingElementsFromJSX(
  jsxCode: string,
  fileContentStartPosition: number,
  file: string,
  fileContent: string
): SiblingElement[] {
  const elements: SiblingElement[] = [];
  const elementStack: Array<{ name: string; start: number; depth: number }> = [];
  let pos = 0;
  let depth = 0; // 当前嵌套深度

  while (pos < jsxCode.length) {
    // 跳过空白
    while (pos < jsxCode.length && /\s/.test(jsxCode[pos]!)) {
      pos++;
    }

    if (pos >= jsxCode.length) {
      break;
    }

    // 跳过注释 {/* ... */}
    if (pos + 1 < jsxCode.length && jsxCode[pos] === '{' && jsxCode[pos + 1] === '*') {
      const commentEnd = jsxCode.indexOf('*/', pos);
      if (commentEnd !== -1) {
        pos = commentEnd + 2;
        continue;
      }
    }

    // 跳过注释 </...>
    if (pos + 3 < jsxCode.length && jsxCode[pos] === '<' && jsxCode[pos + 1] === '!' && jsxCode[pos + 2] === '-' && jsxCode[pos + 3] === '-') {
      const commentEnd = jsxCode.indexOf('-->', pos);
      if (commentEnd !== -1) {
        pos = commentEnd + 3;
        continue;
      }
    }

    // 查找 JSX 标签开始
    if (jsxCode[pos] === '<') {
      const isClosingTag = jsxCode[pos + 1] === '/';

      // 处理闭合标签
      if (isClosingTag) {
        const closeBracket = jsxCode.indexOf('>', pos);
        if (closeBracket !== -1) {
          // 获取闭合标签的名称
          const tagNameMatch = jsxCode.substring(pos + 2, closeBracket).match(/^([a-zA-Z][a-zA-Z0-9]*)/);
          if (tagNameMatch) {
            const closeTagName = tagNameMatch[1];

            // 检查栈顶元素是否匹配
            if (elementStack.length > 0 && elementStack[elementStack.length - 1]!.name === closeTagName) {
              const popped = elementStack.pop()!;
              // 只有深度为 1 的元素才是我们需要的直接子元素
              if (popped.depth === 1) {
                const absoluteEndPosition = fileContentStartPosition + closeBracket + 1;
                const endLine = getLineNumberForPosition(fileContent, absoluteEndPosition);

                // 找到对应的元素并更新结束位置
                const element = elements.find(e => e.name === popped.name && e.line === popped.start);
                if (element) {
                  element.endLine = endLine;
                  element.lineCount = endLine - element.line + 1;
                }
              }
            }
            depth--;
          }
          pos = closeBracket + 1;
        }
        continue;
      }

      // 处理开始标签
      const tagStart = pos;
      pos++; // 跳过 <

      // 获取标签名
      const tagNameMatch = jsxCode.substring(pos).match(/^([a-zA-Z][a-zA-Z0-9]*)/);
      if (!tagNameMatch) {
        pos++;
        continue;
      }

      const tagName = tagNameMatch[1];
      pos += tagNameMatch[0].length; // 跳过标签名

      // 跳过标签属性
      let foundClosing = false;
      while (pos < jsxCode.length && !foundClosing) {
        if (jsxCode[pos] === '>') {
          pos++; // 跳过 >
          foundClosing = true;
          break;
        } else if (pos + 1 < jsxCode.length && jsxCode[pos] === '/' && jsxCode[pos + 1] === '>') {
          pos += 2; // 跳过 />
          foundClosing = true;
          break;
        } else {
          pos++;
        }
      }

      // 检查是否是自闭合标签
      const wasSelfClosing = foundClosing && pos > 2 && jsxCode[pos - 2] === '/' && jsxCode[pos - 1] === '>';

      // 计算开始行号
      const absolutePosition = fileContentStartPosition + tagStart;
      const startLine = getLineNumberForPosition(fileContent, absolutePosition);

      // 只在深度为 1 时提取元素（直接子元素，不是根元素）
      if (depth === 1 && !wasSelfClosing) {
        // 判断是 React 组件还是 HTML 元素
        const isReactComponent = /^[A-Z]/.test(tagName!);

        elements.push({
          name: tagName!,
          type: isReactComponent ? 'react' : 'html',
          tagName: isReactComponent ? undefined : tagName!,
          file,
          line: startLine,
          endLine: startLine, // 先设置为开始行，后面会更新
          lineCount: 1, // 先设置为 1，后面会更新
        });

        // 记录到栈中
        elementStack.push({ name: tagName!, start: startLine, depth });
      }

      // 如果不是自闭合标签，增加深度并压栈
      if (!wasSelfClosing) {
        depth++;
      }
    } else {
      pos++;
    }
  }

  return elements;
}

/**
 * 查找组件内部的并列元素（React 组件 + HTML 元素）
 */
function findSiblingElements(
  elementName: string,
  componentRegistry: ComponentRegistry
): {
  current: SiblingElement | null;
  siblings: SiblingElement[];
  parentComponent: string | null;
} {
  // 解析元素名称
  // 格式1: ComponentName (React 组件)
  // 格式2: ComponentName__tagName__position (HTML 元素)
  const isHtmlElement = elementName.includes('__');

  let targetComponent: string;
  let targetElement: string | null = null;

  if (isHtmlElement) {
    const parts = elementName.split('__');
    targetComponent = parts[0]!;
    targetElement = parts[1] || null; // HTML 标签名
  } else {
    targetComponent = elementName;
  }

  const componentInfo = componentRegistry.components[targetComponent];
  if (!componentInfo) {
    return {
      current: null,
      siblings: [],
      parentComponent: null,
    };
  }

  // 读取组件文件内容
  let fileContent: string;
  try {
    fileContent = readFileSync(componentInfo.file, 'utf-8');
  } catch (err) {
    console.error(`[react-component-jump] ❌ 读取文件失败: ${componentInfo.file}`, err);
    return {
      current: null,
      siblings: [],
      parentComponent: targetComponent,
    };
  }

  // 提取 return 语句内的 JSX
  const returnStart = componentInfo.returnStatementStart;
  const returnEnd = componentInfo.returnStatementEnd;

  if (!returnStart || !returnEnd) {
    return {
      current: null,
      siblings: [],
      parentComponent: targetComponent,
    };
  }

  const returnCode = fileContent.substring(returnStart, returnEnd);

  // 查找第一个标签的结束位置
  const firstTagEnd = returnCode.indexOf('>');
  if (firstTagEnd === -1) {
    return {
      current: null,
      siblings: [],
      parentComponent: targetComponent,
    };
  }

  // 提取根标签内的 JSX 内容
  const innerJSX = returnCode.substring(firstTagEnd + 1);

  // 计算根标签后的位置（相对于文件开头）
  const innerJSXStartPosition = returnStart + firstTagEnd + 1;

  // 提取所有并列元素（传递文件内容以计算正确的行号）
  const allElements = extractSiblingElementsFromJSX(
    innerJSX,
    innerJSXStartPosition,
    componentInfo.file,
    fileContent
  );

  // 找到当前元素
  let current: SiblingElement | null = null;
  const siblings: SiblingElement[] = [];

  if (isHtmlElement && targetElement) {
    // HTML 元素：查找同名的所有元素，取第一个作为当前元素
    for (const elem of allElements) {
      if (elem.type === 'html' && elem.tagName === targetElement) {
        if (!current) {
          current = elem;
        } else {
          siblings.push(elem);
        }
      } else {
        siblings.push(elem);
      }
    }
  } else {
    // React 组件：当前元素就是组件本身（使用组件注册表中的信息）
    current = {
      name: componentInfo.name,
      type: 'react',
      file: componentInfo.file,
      line: componentInfo.line,
      endLine: componentInfo.endIndex
        ? getLineNumberForPosition(fileContent, componentInfo.endIndex)
        : componentInfo.line,
      lineCount: componentInfo.endIndex
        ? getLineNumberForPosition(fileContent, componentInfo.endIndex) - componentInfo.line + 1
        : 0,
    };
    // siblings 是 JSX 内部的所有直接子元素
    siblings.push(...allElements);
  }

  return {
    current,
    siblings,
    parentComponent: targetComponent,
  };
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
 * HTML 元素信息接口
 */
interface HTMLElementInfo {
  name: string;
  startIndex: number;
  endIndex: number;
  line: number;
  isSelfClosing: boolean;
}

/**
 * 从 JSX 代码中提取并列的 HTML 元素
 */
function extractHTMLElementsFromJSX(
  jsxCode: string,
  baseLine: number
): HTMLElementInfo[] {
  const elements: HTMLElementInfo[] = [];
  let pos = 0;

  while (pos < jsxCode.length) {
    // 跳过空白和注释
    while (pos < jsxCode.length && /\s/.test(jsxCode[pos]!)) {
      pos++;
    }

    // 检查是否到达结尾
    if (pos >= jsxCode.length) {
      break;
    }

    // 检查是否是注释 {/* ... */}
    if (jsxCode.substr(pos, 2) === '{' && jsxCode.substr(pos, 2) === '/*') {
      const commentEnd = jsxCode.indexOf('*/', pos);
      if (commentEnd !== -1) {
        pos = commentEnd + 2;
        continue;
      }
    }

    // 查找 JSX 标签开始
    if (jsxCode[pos] === '<') {
      // 跳过 </>
      if (jsxCode[pos + 1] === '/') {
        // 找到对应的 >
        const closeBracket = jsxCode.indexOf('>', pos);
        if (closeBracket !== -1) {
          pos = closeBracket + 1;
          continue;
        }
      }

      // 获取标签名
      const tagNameMatch = jsxCode.substr(pos + 1).match(/^([a-zA-Z][a-zA-Z0-9]*)/);
      if (!tagNameMatch) {
        pos++;
        continue;
      }

      const tagName = tagNameMatch[1]!;

      // 跳过大写字母开头的（React 组件）
      if (/^[A-Z]/.test(tagName)) {
        // 找到这个 React 组件的结束位置
        pos += tagNameMatch[0].length + 1; // 跳过 <TagName

        // 跳过标签属性
        while (pos < jsxCode.length) {
          if (jsxCode[pos] === '>') {
            pos++;
            break;
          } else if (jsxCode.substr(pos, 2) === '/>') {
            pos += 2;
            break;
          } else {
            pos++;
          }
        }

        // 如果不是自闭合的，需要找到闭合标签
        if (pos > 0 && jsxCode[pos - 1] !== '/' && pos > 0 && jsxCode[pos - 2] !== '/') {
          // 查找闭合标签
          const closeTag = `</${tagName}>`;
          const closeIndex = jsxCode.indexOf(closeTag, pos);
          if (closeIndex !== -1) {
            pos = closeIndex + closeTag.length;
          }
        }
        continue;
      }

      // 这是一个 HTML 元素（小写开头）
      const elementStart = pos;
      pos += tagNameMatch[0].length + 1; // 跳过 <tagname

      // 检查是否是自闭合标签
      let isSelfClosing = false;
      while (pos < jsxCode.length) {
        if (jsxCode[pos] === '>') {
          pos++;
          break;
        } else if (jsxCode.substr(pos, 2) === '/>') {
          pos += 2;
          isSelfClosing = true;
          break;
        } else {
          pos++;
        }
      }

      // 如果不是自闭合的，需要找到闭合标签
      let elementEnd = pos;
      if (!isSelfClosing) {
        const closeTag = `</${tagName}>`;
        const closeIndex = jsxCode.indexOf(closeTag, pos);
        if (closeIndex !== -1) {
          elementEnd = closeIndex + closeTag.length;
        }
      }

      // 计算行号
      const elementLine = baseLine; // 简化处理，使用基准行号

      elements.push({
        name: tagName,
        startIndex: elementStart,
        endIndex: elementEnd,
        line: elementLine,
        isSelfClosing,
      });

      pos = elementEnd;
    } else {
      pos++;
    }
  }

  return elements;
}

/**
 * 为组件添加 data-component-name 和 data-element-name 属性
 * 同时标记并列的 HTML 元素
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

    // 提取并列的 HTML 元素并添加标记
    const jsxContent = returnCode.substring(tagEndInReturn + 1);
    const htmlElements = extractHTMLElementsFromJSX(jsxContent, component.line);

    // 为 HTML 元素添加 data-element-name 属性（倒序处理）
    const sortedElements = [...htmlElements].sort((a, b) => b.startIndex - a.startIndex);

    for (const element of sortedElements) {
      const elementAbsoluteStart = returnStart + tagEndInReturn + 1 + element.startIndex;
      const elementTagEnd = modifiedCode.indexOf('>', elementAbsoluteStart);

      if (elementTagEnd === -1) {
        continue;
      }

      const elementFullTag = modifiedCode.substring(elementAbsoluteStart, elementTagEnd + 1);

      // 检查是否已经有属性
      if (elementFullTag.includes('data-element-name') || elementFullTag.includes('data-component-name')) {
        continue;
      }

      // 生成唯一的元素 ID
      const elementId = `${componentName}__${element.name}__${elementAbsoluteStart}`;

      // 添加 data-element-name 属性
      const newElementTag = elementFullTag.replace(
        new RegExp(`^(<${element.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\s|>)`),
        `$1 data-element-name="${elementId}"$2`
      );

      // 替换原代码
      modifiedCode =
        modifiedCode.substring(0, elementAbsoluteStart) +
        newElementTag +
        modifiedCode.substring(elementAbsoluteStart + elementFullTag.length);

      console.log(`[react-component-jump]   ↳ 为 ${element.name} 添加 data-element-name`);
    }
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
          returnStatementStart: component.returnStatementStart,
          returnStatementEnd: component.returnStatementEnd,
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
                const data = JSON.parse(body);

                // 支持两种参数格式：
                // 1. { filePath, line } - 新格式（直接传入文件路径）
                // 2. { componentName } - 旧格式（组件名，需要查表）
                let filePath: string;
                let line: number;
                let column: number;

                if (data.filePath) {
                  // 新格式：直接使用文件路径
                  filePath = data.filePath;
                  line = data.line || 1;
                  column = 0;
                } else if (data.componentName) {
                  // 旧格式：通过组件名查找文件路径
                  const componentName = data.componentName;
                  const foundPath = componentNameToFileMap.get(componentName);

                  if (!foundPath) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: false,
                      error: `Component ${componentName} not found`
                    }));
                    return;
                  }

                  filePath = foundPath;

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

                  line = location.line;
                  column = location.column;
                } else {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: 'Either filePath or componentName is required'
                  }));
                  return;
                }

                console.log(`[react-component-jump] 🎯 跳转到: ${filePath}:${line}:${column}`);

                // 使用实际的行号和列号调用编辑器跳转
                const success = await jumpToEditor(filePath, line, column);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success,
                  file: filePath,
                  line,
                  column,
                  message: success ? `已跳转到 ${filePath.split('/').pop()}:${line}:${column}` : '跳转失败'
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

          // GET /api/sibling-components/:componentName
          if (targetPath.startsWith('/api/sibling-components/') && req.method === 'GET') {
            const componentName = decodeURIComponent(targetPath.split('/').pop() || '');

            console.log(`[react-component-jump] 🔍 查找兄弟组件: ${componentName}`);

            // 更新统计信息
            componentRegistry.totalComponents = Object.keys(componentRegistry.components).length;
            componentRegistry.totalFiles = Object.keys(componentRegistry.fileHashes).length;
            componentRegistry.lastUpdate = new Date().toISOString();

            // 查找兄弟组件
            const result = findSiblingComponents(componentName, componentRegistry);

            console.log(`[react-component-jump] ✓ 找到 ${result.siblings.length} 个兄弟组件`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              ...result,
            }, null, 2));
            return;
          }

          // GET /api/sibling-elements/:elementName
          if (targetPath.startsWith('/api/sibling-elements/') && req.method === 'GET') {
            const elementName = decodeURIComponent(targetPath.split('/').pop() || '');

            console.log(`[react-component-jump] 🔍 查找并列元素: ${elementName}`);

            // 更新统计信息
            componentRegistry.totalComponents = Object.keys(componentRegistry.components).length;
            componentRegistry.totalFiles = Object.keys(componentRegistry.fileHashes).length;
            componentRegistry.lastUpdate = new Date().toISOString();

            // 查找并列元素
            const result = findSiblingElements(elementName, componentRegistry);

            console.log(`[react-component-jump] ✓ 找到 ${result.siblings.length} 个并列元素`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              ...result,
            }, null, 2));
            return;
          }

          // GET /api/code-snippet?file=...&line=...&endLine=...
          if (targetPath.startsWith('/api/code-snippet') && req.method === 'GET') {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const filePath = url.searchParams.get('file');
            const line = parseInt(url.searchParams.get('line') || '1', 10);
            const endLine = parseInt(url.searchParams.get('endLine') || String(line), 10);

            if (!filePath) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                error: 'file parameter is required'
              }));
              return;
            }

            try {
              const fileContent = readFileSync(filePath, 'utf-8');
              const lines = fileContent.split('\n');
              const snippetLines = lines.slice(line - 1, endLine);
              const snippet = snippetLines.join('\n');

              // 计算上下文（前后各几行）
              const contextBefore = Math.max(0, line - 3);
              const contextAfter = Math.min(lines.length, endLine + 2);
              const contextLines = lines.slice(contextBefore, contextAfter);
              const contextStartLine = contextBefore + 1;

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                file: filePath,
                line,
                endLine,
                snippet,
                context: {
                  startLine: contextStartLine,
                  endLine: contextAfter,
                  lines: contextLines,
                },
              }, null, 2));
            } catch (error) {
              console.error('[react-component-jump] ❌ 读取文件失败:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                error: String(error)
              }));
            }
            return;
          }

          // POST /api/ai-analyze
          if (targetPath === '/api/ai-analyze' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const data = JSON.parse(body);

                // 验证必需参数
                if (!data.componentName || !data.file || !data.line || !data.endLine) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: '缺少必需参数: componentName, file, line, endLine'
                  }));
                  return;
                }

                // 导入 AI 分析器
                const { analyzeComponent } = await import('./ai-analyzer.js');

                // 调用分析
                const result = await analyzeComponent({
                  componentName: data.componentName,
                  file: data.file,
                  line: data.line,
                  endLine: data.endLine,
                  code: data.code,
                  context: data.context,
                  force: data.force || false,
                });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result, null, 2));
              } catch (error) {
                console.error('[react-component-jump] ❌ AI 分析失败:', error);
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

          // GET /api/ai-analyses
          if (targetPath === '/api/ai-analyses' && req.method === 'GET') {
            try {
              const { getAllCachedAnalyses } = await import('./ai-analyzer.js');
              const analyses = getAllCachedAnalyses();

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                count: analyses.length,
                analyses,
              }, null, 2));
            } catch (error) {
              console.error('[react-component-jump] ❌ 获取分析列表失败:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                error: String(error)
              }));
            }
            return;
          }

          // GET /api/ai-analysis/:componentName
          if (targetPath.startsWith('/api/ai-analysis/') && req.method === 'GET') {
            try {
              const componentName = decodeURIComponent(targetPath.split('/').pop() || '');
              const { getCachedAnalysis } = await import('./ai-analyzer.js');
              const analysis = getCachedAnalysis(componentName);

              if (!analysis) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: `未找到组件 ${componentName} 的分析结果`
                }));
                return;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                analysis,
              }, null, 2));
            } catch (error) {
              console.error('[react-component-jump] ❌ 获取分析结果失败:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                error: String(error)
              }));
            }
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
