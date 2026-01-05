import { Context, Next } from 'hono';

/**
 * Request Logging Middleware
 *
 * Logs all incoming requests with timing information
 */
export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // Log request start
  console.log(`[Request] ${method} ${path}`);

  await next();

  // Log request completion
  const duration = Date.now() - start;
  const status = c.res.status;

  console.log(`[Response] ${method} ${path} ${status} (${duration}ms)`);
}

/**
 * Error Logging Middleware
 */
export async function errorLoggerMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error(`[Error] ${c.req.method} ${c.req.path}:`, error);
    throw error; // Re-throw for error handler
  }
}
