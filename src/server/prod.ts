import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './index';
// import path from 'path';
// import { fileURLToPath } from 'url';

/**
 * 生产环境入口文件
 * 使用 @hono/node-server 启动服务器并托管静态资源
 */

// __dirname 和 __filename 可用于未来的静态资源配置
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// 托管前端构建后的静态文件
// 假设前端构建输出到项目根目录下的 dist 目录
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

serve({
  fetch: app.fetch,
  port
});
