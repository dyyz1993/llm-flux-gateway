import { Context, Next } from 'hono';
import { queryFirst, queryRun } from '../database';

/**
 * API Key record from database
 */
interface ApiKeyRecord {
  id: string;
  key_token: string;
  name: string;
  status: 'active' | 'revoked';
  created_at: number;
  last_used_at: number | null;
  updated_at: number;
}

/**
 * API Key Authentication Middleware
 *
 * Validates the Bearer token and attaches apiKeyId to context
 */
export async function authMiddleware(c: Context, next: Next): Promise<void | Response> {
  const authHeader = c.req.header('Authorization') || c.req.header('x-api-key');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Look up the API key in database
  const apiKey = queryFirst<ApiKeyRecord>(
    'SELECT * FROM api_keys WHERE key_token = ? LIMIT 1',
    [token]
  );

  if (!apiKey) {
    return c.json({ success: false, error: 'Invalid API key' }, 401);
  }

  if (apiKey.status !== 'active') {
    return c.json({ success: false, error: 'API key has been revoked' }, 401);
  }

  // Update last_used_at
  queryRun(
    'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
    [Math.floor(Date.now() / 1000), apiKey.id]
  );

  // Attach to context
  c.set('apiKeyId', apiKey.id);
  c.set('apiKey', apiKey);

  await next();
}

/**
 * Optional auth middleware (doesn't fail if no key)
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')|| c.req.header('x-api-key');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    const apiKey = queryFirst<ApiKeyRecord>(
      'SELECT * FROM api_keys WHERE key_token = ? LIMIT 1',
      [token]
    );

    if (apiKey && apiKey.status === 'active') {
      c.set('apiKeyId', apiKey.id);
      c.set('apiKey', apiKey);
    }
  }

  await next();
}
