import { Hono } from 'hono';
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
import systemRouter from './module-system/main';
import authRouter from './module-auth';
import styleJumpRouter from './module-style-jump/routes/style-jump-routes';
import { vendorsService } from './module-vendors/services/vendors.service';

// Initialize database
await initDatabase();

// Sync vendors from YAML config on startup
try {
  const syncResult = await vendorsService.syncFromYaml();
  console.log('[Init] Vendors synced from YAML:', syncResult);
} catch (error) {
  console.error('[Init] Failed to sync vendors from YAML:', error);
  // Continue anyway - vendors might already exist in DB
}

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

// Gateway proxy routes (OpenAI-compatible endpoints)
// Mount gateway router at root - it handles /v1/* with auth middleware
app.route('/', gatewayRouter);

// Note: No 404 handler - let unmatched routes fall through to Vite

// Error handler
app.onError((err, c) => {
  console.error('[Unhandled Error]', err);
  return c.json({
    success: false,
    error: err instanceof Error ? err.message : 'Internal Server Error',
  }, 500);
});

// Export for Vite dev server
export default app;
