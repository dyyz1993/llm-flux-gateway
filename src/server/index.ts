import { Hono } from 'hono';
import { setGlobalDispatcher, Agent } from 'undici';
import { corsMiddleware } from './shared/middleware/cors';
import { loggerMiddleware } from './shared/middleware/logger';
import { errorLoggerMiddleware } from './shared/middleware/logger';
import { adminAuthMiddleware } from './shared/middleware/admin-auth';
import { initDatabase } from './shared/database';
import gatewayRouter from './module-gateway/routes/gateway-routes';
import keysRouter from './module-keys/routes/keys-routes';
import routesRouter from './module-gateway/routes/routes-routes';
import assetsRouter from './module-assets/routes/assets-routes';
import vendorsRouter from './module-vendors/routes/vendors-routes';
import logsRouter from './module-gateway/routes/logs-routes';
import logsStreamRouter from './module-gateway/routes/logs-stream-routes';
import analyticsRouter from './module-gateway/routes/analytics-routes';
import configAssistantRouter from './module-config-assistant/routes/config-assistant-routes';
import systemRouter from './module-system/main';
import authRouter from './module-auth';
import styleJumpRouter from './module-style-jump/routes/style-jump-routes';

// Configure global fetch agent to prevent 60s/70s timeouts (undici defaults)
// This is critical for LLM reasoning models that take a long time to start responding
//
// ⚠️ Docker 环境注意事项：
// - 容器网络增加了额外的延迟
// - connectTimeout 从 60s 增加到 180s (3分钟) 以适应 Docker + GLM API
// - GLM API (bigmodel.cn) 连接建立较慢，需要更长的超时时间
setGlobalDispatcher(new Agent({
  headersTimeout: 600000, // 10 minutes
  bodyTimeout: 600000,    // 10 minutes
  connectTimeout: 180000, // 3 minutes (increased for Docker + GLM API)
  keepAliveTimeout: 60000, // 1 minute
}));

// Initialize database
await initDatabase();

// Create Hono app
const app = new Hono();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', errorLoggerMiddleware);
app.use('*', loggerMiddleware);

// Health check
app.get('/health', (c) => {
  return c.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// API routes
// Auth routes (public - no middleware)
app.route('/api/auth', authRouter);

// Style jump routes (public - dev tool, no auth needed)
app.route('/api/style-jump', styleJumpRouter);

// Protected admin routes (require authentication)
const protectedKeysRouter = new Hono();
protectedKeysRouter.use('*', adminAuthMiddleware);
protectedKeysRouter.route('/', keysRouter);

const protectedRoutesRouter = new Hono();
protectedRoutesRouter.use('*', adminAuthMiddleware);
protectedRoutesRouter.route('/', routesRouter);

const protectedAssetsRouter = new Hono();
protectedAssetsRouter.use('*', adminAuthMiddleware);
protectedAssetsRouter.route('/', assetsRouter);

const protectedVendorsRouter = new Hono();
protectedVendorsRouter.use('*', adminAuthMiddleware);
protectedVendorsRouter.route('/', vendorsRouter);

const protectedSystemRouter = new Hono();
protectedSystemRouter.use('*', adminAuthMiddleware);
protectedSystemRouter.route('/', systemRouter);

const protectedLogsStreamRouter = new Hono();
protectedLogsStreamRouter.use('*', adminAuthMiddleware);
protectedLogsStreamRouter.route('/', logsStreamRouter);

const protectedLogsRouter = new Hono();
protectedLogsRouter.use('*', adminAuthMiddleware);
protectedLogsRouter.route('/', logsRouter);

const protectedAnalyticsRouter = new Hono();
protectedAnalyticsRouter.use('*', adminAuthMiddleware);
protectedAnalyticsRouter.route('/', analyticsRouter);

app.route('/api/keys', protectedKeysRouter);
app.route('/api/routes', protectedRoutesRouter);
app.route('/api/assets', protectedAssetsRouter);
app.route('/api/vendors', protectedVendorsRouter);
app.route('/api/system', protectedSystemRouter);
// Note: Mount /api/logs/stream BEFORE /api/logs to avoid :id route catching "stream"
app.route('/api/logs/stream', protectedLogsStreamRouter);
app.route('/api/logs', protectedLogsRouter);
app.route('/api/analytics', protectedAnalyticsRouter);
app.route('/api/config-assistant', configAssistantRouter);

// Gateway proxy routes (OpenAI-compatible endpoints)
// Mount gateway router at root - it handles /v1/* with auth middleware
app.route('/', gatewayRouter);

// Note: No 404 handler - let unmatched routes fall through to Vite

// Error handler
app.onError((err, c) => {
  const requestId = c.get('requestId') || 'unknown';
  console.error(`[Unhandled Error] ${requestId}:`, err);
  // 尝试记录请求体到日志
  try {
    const { writeFile, mkdir } = require('node:fs/promises');
    const { join } = require('node:path');
    const logsDir = join(process.cwd(), 'logs', 'request-traces');
    mkdir(logsDir, { recursive: true }).then(() => {
      writeFile(join(logsDir, `error-${requestId}-${Date.now()}.json`), JSON.stringify({
        error: err instanceof Error ? { message: err.message, stack: err.stack?.split('\n').slice(0, 3).join('\n') } : String(err),
        timestamp: new Date().toISOString(),
      }, null, 2)).catch(() => {});
    }).catch(() => {});
  } catch {}
  return c.json({
    error: { message: err instanceof Error ? err.message : 'Internal Server Error', type: 'api_error' },
  }, 500);
});

// Export for Vite dev server
export default app;
