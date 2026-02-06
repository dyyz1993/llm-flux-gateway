import { Context, Next } from 'hono';

/**
 * CORS Middleware
 *
 * Enables Cross-Origin Resource Sharing for the API
 */
export async function corsMiddleware(c: Context, next: Next): Promise<void | Response> {
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
  const origin = c.req.header('Origin');

  // Check if origin is allowed
  if (origin) {
    if (allowedOrigins.includes('*')) {
      c.res.headers.set('Access-Control-Allow-Origin', '*');
    } else if (allowedOrigins.includes(origin)) {
      c.res.headers.set('Access-Control-Allow-Origin', origin);
    }
  }

  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  c.res.headers.set('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    // If it's a preflight request and origin is allowed, but we didn't set the header yet (e.g. wildcard allowed)
    // Actually the logic above handles it.
    return c.body(null, 204);
  }

  await next();
}
