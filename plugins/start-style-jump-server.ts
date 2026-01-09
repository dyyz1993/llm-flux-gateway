/**
 * 独立的样式跳转服务器
 *
 * 作为独立进程启动，不依赖 Vite/Hono
 * Vite 插件会在开发模式时启动它
 *
 * 特性：
 * - 使用随机端口（避免冲突）
 * - 将端口写入 .style-jump-port 文件
 * - 提供编辑器跳转 API
 * - 智能编辑器检测（环境变量 + 进程检测）
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { writeFileSync, unlink } from 'fs';
import { resolve } from 'path';
import type { AddressInfo } from 'net';
import { jumpToEditor as jumpToEditorImpl } from './shared/editor-detector.js';

interface StyleLocation {
  file: string;
  line: number;
  column: number;
  selector: string;
  type: string;
}

interface StyleMap {
  [styleId: string]: StyleLocation;
}

// 使用端口 0 让操作系统自动分配可用端口
const PORT = 0;
const PORT_FILE = resolve('.style-jump-port');

const styleMap: StyleMap = {};

/**
 * 跳转到编辑器（使用智能检测）
 */
async function jumpToEditor(location: StyleLocation): Promise<boolean> {
  return jumpToEditorImpl(location.file, location.line, location.column);
}

const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  console.log(`[style-jump] ${method} ${path}`);

  // GET /health
  if (path === '/health' && method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const address = server.address() as AddressInfo;
    res.end(JSON.stringify({ status: 'ok', port: address?.port }));
    return;
  }

  // GET /api/style-map
  if (path === '/api/style-map' && method === 'GET') {
    const count = Object.keys(styleMap).length;
    console.log(`[style-jump] 📋 返回样式映射 (${count} 条)`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(styleMap, null, 2));
    return;
  }

  // PUT /api/style-map
  if (path === '/api/style-map' && method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const newStyleMap: StyleMap = JSON.parse(body);
        const newCount = Object.keys(newStyleMap).length;

        Object.assign(styleMap, newStyleMap);
        const totalCount = Object.keys(styleMap).length;

        console.log(`[style-jump] 📥 收到样式映射 (${newCount} 条, 总计 ${totalCount} 条)`);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          count: totalCount,
          message: `已更新样式映射，共 ${totalCount} 条`
        }));
      } catch (error) {
        console.error('[style-jump] ❌ 解析失败:', error);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: String(error)
        }));
      }
    });
    return;
  }

  // POST /api/jump-to-editor
  if (path === '/api/jump-to-editor' && method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const location: StyleLocation = JSON.parse(body);
        console.log(`[style-jump] 🎯 跳转:`, location);

        const success = await jumpToEditor(location);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success,
          message: success ? '已跳转到编辑器' : '跳转失败'
        }));
      } catch (error) {
        console.error('[style-jump] ❌ 跳转错误:', error);
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
});

// 启动服务器并获取分配的端口
server.listen(PORT, '127.0.0.1', () => {
  const address = server.address();
  const actualPort = (address as AddressInfo)?.port ?? 3000;

  console.log(`
╔═══════════════════════════════════════════════════════╗
║     🎯 样式跳转服务已启动                              ║
╠═══════════════════════════════════════════════════════╣
║  端口: ${actualPort} (自动分配)                                ║
║  健康检查: http://localhost:${actualPort}/health              ║
╚═══════════════════════════════════════════════════════╝
  `);

  // 将端口写入文件，供 Vite 插件读取（使用同步写入确保立即完成）
  try {
    writeFileSync(PORT_FILE, String(actualPort));
    console.log(`[style-jump] ✅ 端口已写入: ${PORT_FILE}`);
  } catch (err) {
    console.error('[style-jump] ❌ 无法写入端口文件:', err);
  }
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('[style-jump] 关闭服务...');

  // 删除端口文件
  unlink(PORT_FILE, () => {
    // 忽略错误（文件可能不存在）
  });

  server.close(() => {
    console.log('[style-jump] 已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[style-jump] 收到中断信号，关闭中...');
  process.exit(0);
});
