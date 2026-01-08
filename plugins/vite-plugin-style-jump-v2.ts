/**
 * Vite 插件：样式跳转 V2 - 带组件名
 *
 * 改进：
 * 1. 使用 AST 解析识别组件根元素
 * 2. 注入时包含组件名：data-style-id="ComponentName-styleName-hash"
 * 3. 只注入组件第一级元素
 */

import { Plugin } from 'vite';
import { parse } from 'postcss';
import { createHash } from 'crypto';
import { transformSync } from '@babel/core';

interface StyleLocation {
  file: string;
  line: number;
  column: number;
  selector: string;
  type: 'css' | 'scss' | 'less';
  componentName?: string; // 新增：组件名
}

interface StyleMap {
  [styleId: string]: StyleLocation;
}

/**
 * 生成组件名 + 样式名组合的 ID
 */
function generateStyleId(
  componentName: string,
  selector: string,
  file: string,
  line: number
): string {
  const className = selector.replace(/^\.?/, '');
  const hash = createHash('md5')
    .update(componentName + selector + file + line)
    .digest('hex')
    .slice(0, 6);
  return `${componentName}-${className}-${hash}`;
}

/**
 * 简化的 JSX 转换：只注入根元素
 */
function transformJSX(code: string, filename: string): { code: string; componentName: string } {
  // 提取组件名
  const componentNameMatch = code.match(/export\s+(?:const|function)\s+(\w+)/);
  const componentName = componentNameMatch?.[1] || 'Anonymous';

  // 使用 Babel 解析和转换
  try {
    const result = transformSync(code, {
      filename,
      presets: ['@babel/preset-react', '@babel/preset-typescript'],
      plugins: [
        () => ({
          visitor: {
            JSXElement(path) {
              // 只处理组件的根元素
              const isRootElement =
                path.parentPath.isReturnStatement() ||
                (path.parentPath.isBlock() && path.parentPath.parentPath.isReturnStatement());

              if (!isRootElement) return;

              // 跳过 Fragment
              if (path.node.openingElement.name.type === 'JSXIdentifier' &&
                  path.node.openingElement.name.name === 'Fragment') {
                return;
              }

              // 找到或创建 className 属性
              const attrs = path.node.openingElement.attributes;
              let classNameAttr = attrs.find((attr: any) =>
                attr.type === 'JSXAttribute' &&
                attr.name.name === 'className'
              );

              if (classNameAttr && classNameAttr.value) {
                // 已有 className，添加 data-style-id
                const existingClass = classNameAttr.value.value;
                if (typeof existingClass === 'string') {
                  const styleId = `${componentName}-root-${createHash('md5').update(filename).digest('hex').slice(0, 4)}`;

                  // 创建 data-style-id 属性
                  attrs.unshift({
                    type: 'JSXAttribute',
                    name: { type: 'JSXIdentifier', name: 'data-style-id' },
                    value: { type: 'StringLiteral', value: styleId }
                  } as any);
                }
              } else {
                // 没有 className，添加 data-style-id
                const styleId = `${componentName}-root-${createHash('md5').update(filename).digest('hex').slice(0, 4)}`;

                attrs.unshift({
                  type: 'JSXAttribute',
                  name: { type: 'JSXIdentifier', name: 'data-style-id' },
                  value: { type: 'StringLiteral', value: styleId }
                } as any);
              }
            }
          }
        })
      ],
      code: false,
    });

    return { code: result?.code || code, componentName };
  } catch (error) {
    console.error('[style-jump] Babel transform error:', error);
    return { code, componentName };
  }
}

export function styleJumpPluginV2(options: { enabled?: boolean } = {}): Plugin {
  const config = { enabled: options.enabled ?? true };
  const styleMap: StyleMap = {};

  return {
    name: 'vite-plugin-style-jump-v2',

    transform(code, id) {
      if (!config.enabled) return null;

      const normalizedId = id.replace(/\\/g, '/');

      // 处理样式文件
      if (/\.(css|scss|less)$/.test(normalizedId)) {
        const root = parse(code);

        root.each((node) => {
          if (node.type === 'rule') {
            const rule = node as any;
            const selector = rule.selector;

            if (!selector || selector.startsWith('@')) return;

            const line = rule.source?.start?.line || 0;
            const styleId = generateStyleId('Global', selector, normalizedId, line);

            styleMap[styleId] = {
              file: normalizedId,
              line,
              column: rule.source?.start?.column || 0,
              selector,
              type: normalizedId.endsWith('.scss') ? 'scss' : normalizedId.endsWith('.less') ? 'less' : 'css',
              componentName: 'Global'
            };
          }
        });

        return { code, map: null };
      }

      // 处理 React 组件
      if (/\.(tsx|jsx)$/.test(normalizedId)) {
        const { code: transformed } = transformJSX(code, normalizedId);
        return { code: transformed, map: null };
      }

      return null;
    },

    buildEnd() {
      if (!config.enabled || Object.keys(styleMap).length === 0) return;

      this.emitFile({
        type: 'asset',
        fileName: 'style-map.json',
        source: JSON.stringify(styleMap, null, 2),
      });

      console.log(`[style-jump-v2] ✅ Generated ${Object.keys(styleMap).length} style mappings`);
    },

    configureServer(server) {
      return () => {
        server.middlewares.use('/api/style-map', (req, res) => {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(styleMap, null, 2));
          }
        });

        console.log('[style-jump-v2] ✅ API endpoint registered');
      };
    },
  };
}
