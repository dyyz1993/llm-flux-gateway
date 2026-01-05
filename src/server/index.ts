import { Hono } from 'hono';
import { corsMiddleware } from './shared/middleware/cors';
import { loggerMiddleware } from './shared/middleware/logger';
import { errorLoggerMiddleware } from './shared/middleware/logger';
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
app.route('/api/keys', keysRouter);
app.route('/api/routes', routesRouter);
app.route('/api/assets', assetsRouter);
app.route('/api/vendors', vendorsRouter);
app.route('/api/system', systemRouter);
// Note: Mount /api/logs/stream BEFORE /api/logs to avoid :id route catching "stream"
app.route('/api/logs/stream', logsStreamRouter);
app.route('/api/logs', logsRouter);
app.route('/api/analytics', analyticsRouter);

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
