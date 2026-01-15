import { createServer, Server } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './index';

/**
 * 生产环境入口文件
 * 使用 Node.js 原生 HTTP 服务器启动
 *
 * ⚠️ 重要：超时配置必须在服务器开始监听之前设置
 * 之前使用 @hono/node-server 的 serve() 函数会在内部立即调用 listen()
 * 导致超时配置生效时服务器已经接受了连接，可能触发默认的 60s/70s 超时
 */

// 托管前端构建后的静态文件
app.use('/*', serveStatic({
  root: './dist',
  rewriteRequestPath: (path) => {
    // 如果请求不是 API 或 Gateway 路由，且没有文件后缀，则重写到 index.html (SPA 支持)
    if (!path.startsWith('/api') && !path.startsWith('/v1') && !path.includes('.')) {
      return '/index.html';
    }
    return path;
  }
}));

const port = Number(process.env.PORT) || 3000;
console.log(`服务器启动在端口: ${port}`);

// 创建 Node.js HTTP 服务器
// 使用 getRequestListener 将 Hono app 转换为 Node.js 请求处理函数
const requestListener = getRequestListener(app.fetch);
const server = createServer(requestListener) as Server;

// ⚠️ 关键修复：在服务器开始监听之前配置超时
// Node.js 默认 headersTimeout 为 60s，常导致约 70s 时断开连接
// 特别是当服务器繁忙或等待缓慢的上游响应时
server.headersTimeout = 600000; // 10 分钟
server.requestTimeout = 600000; // 10 分钟
server.keepAliveTimeout = 60000; // 1 分钟
server.timeout = 600000; // 10 分钟（通用 socket 超时）

console.log('[Server] 超时配置已应用:', {
  headersTimeout: '600000ms (10 分钟)',
  requestTimeout: '600000ms (10 分钟)',
  keepAliveTimeout: '60000ms (1 分钟)',
  timeout: '600000ms (10 分钟)',
});

// 开始监听端口（在超时配置之后）
server.listen(port, () => {
  console.log(`[Server] 正在监听端口 ${port}`);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
  console.log('[Server] 收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('[Server] 服务器已关闭');
    process.exit(0);
  });
});
