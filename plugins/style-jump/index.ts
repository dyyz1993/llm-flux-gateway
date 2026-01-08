/**
 * Vite 插件：样式追踪与跳转
 *
 * 特性：
 * - 解析 CSS 文件并生成样式映射
 * - 启动独立服务（随机端口）
 * - 使用中间件转发请求（__style_jump 前缀）
 * - 用户只需 `npm run dev` 即可
 */

import { Plugin } from 'vite';
import { parse } from 'postcss';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { unlink } from 'fs';
import { resolve } from 'path';
import { request as httpRequest } from 'http';

export interface StyleLocation {
  file: string;
  sourceFile?: string; // 真实源文件路径（如果是虚拟文件）
  line: number;
  column: number;
  selector: string;
  type: 'css' | 'scss' | 'less';
  componentName?: string; // 组件名
}

interface StyleMap {
  [styleId: string]: StyleLocation;
}

// CSS 文件到组件名的映射
const cssToComponentMap = new Map<string, string>();

// 虚拟文件到源文件的映射
const virtualToSourceMap = new Map<string, string>();

// 源文件到虚拟文件的映射（一对多）
const sourceToVirtualMap = new Map<string, string[]>();

const PORT_FILE = resolve('.style-jump-port');

export function styleJumpPlugin(options: {
  enabled?: boolean;
  styleExtensions?: string[];
} = {}): Plugin {
  const config = {
    enabled: options.enabled ?? true,
    styleExtensions: options.styleExtensions ?? ['.css', '.scss', '.less'],
  };

  let serverProcess: any = null;
  let viteServer: any = null; // 保存 Vite 服务器实例
  let actualPort: number | null = null;
  let portResolveCallbacks: Array<(port: number) => void> = [];
  const styleMap: StyleMap = {};

  /**
   * 读取端口文件获取动态端口
   */
  async function getServerPort(): Promise<number | null> {
    try {
      const port = await readFile(PORT_FILE, 'utf-8');
      const parsed = parseInt(port.trim());
      console.log(`[style-jump] 📄 读取端口文件: ${PORT_FILE} -> ${port} -> ${parsed}`);
      return parsed;
    } catch (error) {
      console.log(`[style-jump] ❌ 读取端口文件失败: ${error}`);
      return null;
    }
  }

  /**
   * 从文件路径提取组件名
   */
  function extractComponentName(filePath: string): string {
    // 匹配路径中的组件文件名，如 TestPage.tsx, TestStyleJump.tsx
    const match = filePath.match(/\/([A-Z][a-zA-Z0-9]*)\.(tsx|ts|jsx|js)$/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * 生成样式 ID（包含组件名）
   */
  function generateStyleId(selector: string, file: string, line: number, componentName?: string): string {
    const hash = createHash('md5').update(selector + file + line).digest('hex').slice(0, 8);

    // 如果有组件名，生成格式：ComponentName-selector-hash
    if (componentName) {
      // 清理选择器：去掉 . 和其他特殊字符，但保留有意义的部分
      // .btn-primary -> btn-primary
      // .header-title -> header-title
      const cleanSelector = selector
        .replace(/^\./, '') // 去掉开头的点
        .replace(/[^a-zA-Z0-9-]/g, '-') // 替换其他特殊字符
        .replace(/-+/g, '-') // 合并连续的 -
        .replace(/^-|-$/g, ''); // 去掉首尾的 -

      return `${componentName}--${cleanSelector}--${hash}`;
    }

    return `style-${hash}`;
  }

  /**
   * 检查是否为虚拟文件（Vite 生成的临时文件）
   */
  function isVirtualFile(filePath: string): boolean {
    // Vite 虚拟文件特征
    return (
      filePath.includes('?html-proxy') ||
      filePath.includes('?direct') ||
      filePath.includes('?v=')
    );
  }

  /**
   * 从虚拟文件路径提取源文件路径
   *
   * Vite 的虚拟文件格式：
   * - /path/to/index.html?html-proxy&direct&index=0.css
   * - /path/to/component.tsx?direct&index=1.css
   *
   * 策略：
   * 1. 查找映射表（优先级最高）
   * 2. 从虚拟文件路径推断
   * 3. 使用模块图查找
   */
  function resolveSourceFile(virtualPath: string): string | null {
    // 策略 1: 查找映射表
    const mappedSource = virtualToSourceMap.get(virtualPath);
    if (mappedSource) {
      console.log(`[style-jump] 🔗 从映射表找到源文件: ${virtualPath} -> ${mappedSource}`);
      return mappedSource;
    }

    // 策略 2: 从虚拟文件路径推断
    // 格式: /path/to/index.html?html-proxy&direct&index=0.css
    // 我们需要找到真正导入的 CSS 文件

    // 尝试从路径中移除查询参数
    const basePath = virtualPath.split('?')[0];

    // 如果是 HTML 文件，查找最近导入的 CSS
    if (basePath.endsWith('.html')) {
      console.log(`[style-jump] 🔍 HTML 文件的虚拟 CSS，需要查找导入的 CSS 文件`);
      // 这需要结合模块图来查找
      return null;
    }

    // 策略 3: 使用模块图（需要在 configureServer 后才能使用）
    // 这会在运行时处理
    return null;
  }

  /**
   * 记录源文件到虚拟文件的映射
   */
  function recordVirtualMapping(sourceFile: string, virtualFile: string) {
    console.log(`[style-jump] 📝 记录映射: ${sourceFile} -> ${virtualFile}`);

    // 记录虚拟 -> 源文件
    virtualToSourceMap.set(virtualFile, sourceFile);

    // 记录源 -> 虚拟文件（一对多）
    if (!sourceToVirtualMap.has(sourceFile)) {
      sourceToVirtualMap.set(sourceFile, []);
    }
    sourceToVirtualMap.get(sourceFile)!.push(virtualFile);
  }

  /**
   * 使用 Vite 模块图解析虚拟文件到源文件
   */
  async function resolveViaModuleGraph(
    server: any,
    virtualPath: string
  ): Promise<string | null> {
    try {
      // 获取模块图
      const moduleGraph = server.moduleGraph || server.environments?.client?.moduleGraph;
      if (!moduleGraph) {
        console.log('[style-jump] ⚠️  模块图不可用');
        return null;
      }

      // 查找虚拟文件模块
      const virtualModule = moduleGraph.getModuleById(virtualPath);
      if (!virtualModule) {
        console.log(`[style-jump] ⚠️  未找到模块: ${virtualPath}`);
        return null;
      }

      console.log(`[style-jump] 🔍 找到虚拟模块:`, {
        id: virtualModule.id,
        file: virtualModule.file,
        url: virtualModule.url,
      });

      // 查找导入者（importers），找到真实的源文件
      for (const importer of virtualModule.importers) {
        console.log(`[style-jump] 🔍 导入者:`, {
          id: importer.id,
          file: importer.file,
          url: importer.url,
        });

        // 如果导入者是真实的 CSS 文件
        if (importer.file && importer.file.endsWith('.css')) {
          console.log(`[style-jump] ✅ 找到源文件: ${importer.file}`);
          return importer.file;
        }

        // 如果导入者是 TypeScript/JavaScript 文件
        if (importer.file && /\.(tsx|ts|jsx|js)$/.test(importer.file)) {
          // 需要解析这个文件中导入的 CSS
          console.log(`[style-jump] 🔍 需要解析 ${importer.file} 中的 CSS 导入`);
          // 这里可以读取文件内容，查找 import 语句
          return null;
        }
      }

      // 如果没有找到，尝试从 transformResult 获取源映射
      if (virtualModule.transformResult?.map) {
        const sourceMap = virtualModule.transformResult.map;
        if (sourceMap.sources && sourceMap.sources.length > 0) {
          const source = sourceMap.sources[0];
          console.log(`[style-jump] ✅ 从 SourceMap 找到源文件: ${source}`);
          return source;
        }
      }

      return null;
    } catch (error) {
      console.error('[style-jump] ❌ 解析模块图失败:', error);
      return null;
    }
  }

  /**
   * 解析 CSS 并更新映射表
   *
   * 注意：虚拟文件也会被解析并维护在映射表中
   * 过滤逻辑只在客户端的显示和跳转时处理
   */
  function parseCSS(code: string, id: string, componentName?: string, sourceFile?: string) {
    console.log(`[style-jump] 🔧 parseCSS() 开始: id=${id}, componentName=${componentName || 'undefined'}, sourceFile=${sourceFile || 'undefined'}, codeLength=${code.length}`);
    const root = parse(code);
    let ruleCount = 0;
    root.each((node) => {
      if (node.type === 'rule') {
        const rule = node as any;
        const selector = rule.selector;
        if (!selector || selector.startsWith('@')) return;

        ruleCount++;
        const line = rule.source?.start?.line || 0;
        const styleId = generateStyleId(selector, id, line, componentName);

        const isVirtual = isVirtualFile(id);

        styleMap[styleId] = {
          file: id,
          sourceFile: isVirtual ? sourceFile : undefined, // 如果是虚拟文件，记录真实源文件
          line,
          column: rule.source?.start?.column || 0,
          selector,
          type: id.endsWith('.scss') ? 'scss' : id.endsWith('.less') ? 'less' : 'css',
          componentName,
        };

        const componentInfo = componentName ? `[${componentName}] ` : '';
        const virtualInfo = isVirtual ? ` [VIRTUAL -> ${sourceFile || '未知'}]` : '';
        console.log(`[style-jump] ✓ ${styleId} ← ${componentInfo}${selector} @ ${id}:${line}${virtualInfo}`);
      }
    });
    console.log(`[style-jump] 🔧 parseCSS() 完成: 找到 ${ruleCount} 条规则`);
  }

  /**
   * 同步映射表到独立服务
   */
  async function syncToServer() {
    const styleCount = Object.keys(styleMap).length;
    console.log(`[style-jump] 🔄 syncToServer() 被调用: actualPort=${actualPort}, styleCount=${styleCount}`);

    // 如果端口还没准备好，等待端口就绪
    if (!actualPort) {
      console.log('[style-jump] ⏳ 端口未就绪，等待端口回调...');
      await new Promise<void>((resolve) => {
        portResolveCallbacks.push(() => {
          console.log(`[style-jump] ✅ 端口回调被触发: port=${actualPort}`);
          resolve();
        });
      });
      console.log(`[style-jump] ✅ 端口等待结束: actualPort=${actualPort}`);
    }

    if (!actualPort) {
      console.error('[style-jump] ❌ 端口仍为 null，无法同步！');
      return;
    }

    try {
      const url = `http://localhost:${actualPort}/api/style-map`;
      console.log(`[style-jump] 📤 发送 PUT 请求到: ${url}, 样式数量: ${styleCount}`);

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(styleMap),
      });

      if (!response.ok) {
        console.error(`[style-jump] ❌ 同步失败: ${response.status} ${response.statusText}`);
        return;
      }

      const result = await response.json() as { success: boolean; count?: number };
      console.log(`[style-jump] ✅ 已同步 ${styleCount} 个样式 (服务器确认: ${result.count || 'N/A'} 条)`);
    } catch (e) {
      console.error('[style-jump] ❌ 同步失败:', (e as Error).message);
      console.error('[style-jump] 错误堆栈:', (e as Error).stack);
    }
  }

  return {
    name: 'vite-plugin-style-jump',

    // 配置 Vite 服务器中间件
    configureServer(server) {
      if (!config.enabled) return;

      // 保存服务器实例，用于后续访问模块图
      viteServer = server;
      console.log('[style-jump] ✅ 已保存 Vite 服务器实例');

      server.middlewares.use(async (req, res, next) => {
        // 只处理 __style_jump 路径
        if (req.url && req.url.startsWith('/__style_jump')) {
          const port = await getServerPort();
          if (!port) {
            res.statusCode = 503;
            res.end('Style jump service not available');
            return;
          }

          // 去掉前缀
          const targetPath = req.url.replace('/__style_jump', '');

          console.log(`[style-jump] → 转发: ${req.url} → http://localhost:${port}${targetPath}`);

          // 转发请求到独立服务
          const options = {
            hostname: '127.0.0.1',
            port: port,
            path: targetPath,
            method: req.method,
            headers: {
              ...req.headers,
              host: `127.0.0.1:${port}`,
            },
          };

          const proxyReq = httpRequest(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
          });

          proxyReq.on('error', (err) => {
            console.error('[style-jump] ❌ 转发错误:', err.message);
            res.statusCode = 502;
            res.end('Bad Gateway');
          });

          // 转发请求体
          req.pipe(proxyReq);
        } else {
          next();
        }
      });
    },

    // 启动独立服务
    buildStart() {
      if (!config.enabled) return;

      console.log('[style-jump] 🚀 启动独立服务...');

      serverProcess = spawn('npx', ['tsx', './plugins/start-style-jump-server.ts'], {
        stdio: 'inherit',
        detached: false,
      });

      serverProcess.on('error', (err: Error) => {
        console.error('[style-jump] ❌ 服务启动失败:', err);
      });

      serverProcess.on('exit', (code: number) => {
        console.log(`[style-jump] 服务已退出 (code: ${code})`);
        serverProcess = null;
        actualPort = null;
      });

      // 等待服务启动并读取端口
      const checkPort = async () => {
        // 先等待一下让服务器有时间启动
        await new Promise(r => setTimeout(r, 500));

        console.log('[style-jump] 🔍 开始轮询端口文件...');
        for (let i = 0; i < 100; i++) {
          await new Promise(r => setTimeout(r, 200));
          const port = await getServerPort();
          console.log(`[style-jump] 🔍 轮询 ${i}/100: port=${port}, callbacks=${portResolveCallbacks.length}`);
          if (port) {
            actualPort = port;
            console.log(`[style-jump] ✅ 独立服务已启动 (端口 ${port})`);
            console.log(`[style-jump] 🔗 代理路径: /__style_jump/* → http://localhost:${port}/*`);

            // 触发所有等待的回调
            console.log(`[style-jump] 🔄 触发 ${portResolveCallbacks.length} 个端口回调`);
            portResolveCallbacks.forEach(callback => {
              try {
                callback(port);
              } catch (e) {
                console.error('[style-jump] ❌ 端口回调错误:', e);
              }
            });
            portResolveCallbacks = [];

            // 立即同步已解析的样式
            const currentStyleCount = Object.keys(styleMap).length;
            console.log(`[style-jump] 📊 当前已解析样式: ${currentStyleCount} 个`);
            if (currentStyleCount > 0) {
              console.log(`[style-jump] 📤 端口就绪，同步 ${currentStyleCount} 个已解析的样式`);
              await syncToServer();
            } else {
              console.log(`[style-jump] ℹ️  端口就绪，但还没有样式需要同步`);
            }
            return;
          }
        }
        console.log('[style-jump] ⚠️  等待服务启动超时');
      };

      checkPort();
    },

    buildEnd() {
      if (serverProcess) {
        console.log('[style-jump] 🛑 关闭独立服务...');
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        actualPort = null;
      }
    },

    transform(code, id) {
      if (!config.enabled) return null;

      // 调试：记录所有 transform 调用
      if (id.includes('test-styles') || id.includes('TestStyleJump')) {
        console.log(`[style-jump] 🔧 transform called: ${id}`);
      }

      // 处理 React 组件文件 - 解析 CSS import 并记录映射
      if (/\.(tsx|ts|jsx|js)$/.test(id) && !id.includes('node_modules')) {
        const componentName = extractComponentName(id);

        // 查找 CSS import: import './xxx.css' 或 import '../xxx.css'
        const cssImportRegex = /import\s+['"]\.\/.*?(\.css|\.scss|\.less)['"]/g;
        let match;
        const foundCssImports = [];

        while ((match = cssImportRegex.exec(code)) !== null) {
          foundCssImports.push(match[0]);
        }

        if (foundCssImports.length > 0) {
          console.log(`[style-jump] 📦 ${componentName} 引入了 ${foundCssImports.length} 个 CSS 文件`);

          // 为每个找到的 CSS 文件建立组件映射
          foundCssImports.forEach((importStatement) => {
            // 提取 CSS 文件路径
            const importPathMatch = importStatement.match(/import\s+['"](.+?)['"]/);
            if (importPathMatch) {
              const importPath = importPathMatch[1];
              // 解析为绝对路径
              const cssDir = id.substring(0, id.lastIndexOf('/'));
              const absoluteCssPath = resolve(cssDir, importPath);

              console.log(`[style-jump] 🔗 组件映射: ${componentName} -> ${absoluteCssPath}`);
              cssToComponentMap.set(absoluteCssPath, componentName);
            }
          });
        }
      }

      // 处理样式文件
      if (config.styleExtensions.some((ext) => id.endsWith(ext))) {
        const isVirtual = isVirtualFile(id);
        console.log(`[style-jump] 🎨 处理 CSS 文件: ${id} (虚拟文件: ${isVirtual}, 当前端口状态: actualPort=${actualPort})`);

        // 尝试找到引用这个 CSS 的组件
        let componentName: string | undefined;
        let sourceFile: string | undefined;

        if (!isVirtual) {
          // 真实文件：查找组件映射
          componentName = cssToComponentMap.get(id);

          // 方案2: 如果没有映射，尝试从路径推断
          if (!componentName) {
            const dir = id.substring(0, id.lastIndexOf('/'));
            const cssFileName = id.substring(id.lastIndexOf('/') + 1).replace(/\.(css|scss|less)$/, '');

            const pascalCaseName = cssFileName
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join('');

            if (pascalCaseName.match(/^[A-Z][a-zA-Z0-9]*$/)) {
              componentName = pascalCaseName;
              console.log(`[style-jump] 📦 推断组件名: ${cssFileName} → ${componentName}`);
            }
          }

          sourceFile = id; // 真实文件的源文件就是自己
        } else {
          // 虚拟文件：尝试解析源文件
          console.log(`[style-jump] 🔍 处理虚拟文件: ${id}`);

          // 策略 1: 查找已记录的映射
          sourceFile = virtualToSourceMap.get(id);

          // 策略 2: 如果没有映射，尝试使用模块图异步解析
          if (!sourceFile && viteServer) {
            // 异步解析，不阻塞当前 transform
            resolveViaModuleGraph(viteServer, id).then((resolvedSource) => {
              if (resolvedSource) {
                console.log(`[style-jump] ✅ 异步解析源文件: ${id} -> ${resolvedSource}`);
                recordVirtualMapping(resolvedSource, id);

                // 更新已解析的样式映射
                Object.entries(styleMap).forEach(([styleId, location]) => {
                  if (location.file === id && !location.sourceFile) {
                    location.sourceFile = resolvedSource;
                    console.log(`[style-jump] 🔄 更新样式 ${styleId} 的源文件: ${resolvedSource}`);
                  }
                });

                // 同步更新
                syncToServer().catch(err => {
                  console.error('[style-jump] ❌ syncToServer 异步错误:', err);
                });
              }
            }).catch(err => {
              console.error('[style-jump] ❌ 异步解析源文件失败:', err);
            });
          }

          // 对于虚拟文件，组件名可以从路径推断
          const basePath = id.split('?')[0];
          if (basePath.endsWith('.html')) {
            // HTML 文件的虚拟 CSS，尝试从导入的 CSS 推断
            // 这需要等待模块图解析
          }
        }

        parseCSS(code, id, componentName, sourceFile);

        // 调试：显示解析后的样式数量
        const stylesBeforeSync = Object.keys(styleMap).length;
        console.log(`[style-jump] 📊 解析完成，当前样式总数: ${stylesBeforeSync}`);

        // 异步同步，不阻塞 transform
        syncToServer().catch(err => {
          console.error('[style-jump] ❌ syncToServer 异步错误:', err);
        });
        return null;
      }

      return null;
    },
  };
}
