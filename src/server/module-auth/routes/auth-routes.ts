import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  isIpBlocked,
  recordFailedAttempt,
  clearFailedAttempts,
  getClientIp,
} from '../../shared/middleware/admin-auth';
import { queryFirst, queryRun } from '../../shared/database';
import { apiResponse, apiError } from '../../shared';

// ============================================
// Validation Schemas
// ============================================

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// ============================================
// Configuration
// ============================================

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_EXPIRE_DAYS = parseInt(process.env.SESSION_EXPIRE_DAYS || '7', 10);
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const LOGIN_BLOCK_MINUTES = parseInt(process.env.LOGIN_BLOCK_MINUTES || '5', 10);

// ============================================
// Routes Definition
// ============================================

/**
 * Auth Routes
 *
 * Handles admin login and logout
 */
const router = new Hono()

  // POST /api/auth/login - Admin login
  .post(
    '/login',
    zValidator('json', loginSchema),
    async (c) => {
      const { username, password } = c.req.valid('json');
      const ip = getClientIp(c);

      // Check if IP is blocked
      if (isIpBlocked(ip)) {
        return c.json(
          apiError(
            `Too many failed login attempts. Please try again after ${LOGIN_BLOCK_MINUTES} minutes.`
          ),
          429
        );
      }

      // Verify credentials
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        const result = recordFailedAttempt(ip);
        const remainingAttempts = MAX_LOGIN_ATTEMPTS - result.attempts;

        return c.json(
          apiError(
            result.blocked
              ? `Too many failed attempts. Blocked for ${LOGIN_BLOCK_MINUTES} minutes.`
              : `Invalid credentials. ${remainingAttempts} attempts remaining.`
          ),
          401
        );
      }

      // Clear failed attempts on successful login
      clearFailedAttempts(ip);

      // Create session
      const token = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + SESSION_EXPIRE_DAYS * 24 * 60 * 60;

      const sessionId = crypto.randomUUID();
      queryRun(
        'INSERT INTO admin_sessions (id, token, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [sessionId, token, now, expiresAt]
      );

      return c.json(apiResponse({ token, expiresIn: SESSION_EXPIRE_DAYS * 24 * 60 * 60 }));
    }
  )

  // POST /api/auth/logout - Admin logout
  .post('/logout', async (c) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(apiError('No session to logout'), 400);
    }

    const token = authHeader.substring(7);

    // Delete the session
    queryRun('DELETE FROM admin_sessions WHERE token = ?', [token]);

    return c.json(apiResponse({ loggedOut: true }));
  })

  // GET /api/auth/me - Get current session info
  .get('/me', async (c) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(apiError('Not authenticated'), 401);
    }

    const token = authHeader.substring(7);
    const now = Math.floor(Date.now() / 1000);

    const session = queryFirst<{
      id: string;
      token: string;
      created_at: number;
      expires_at: number;
    }>(
      'SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ? LIMIT 1',
      [token, now]
    );

    if (!session) {
      return c.json(apiError('Invalid or expired session'), 401);
    }

    return c.json(
      apiResponse({
        authenticated: true,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
      })
    );
  })

  // POST /api/auth/cleanup - Clean up expired sessions (maintenance endpoint)
  .post('/cleanup', async (c) => {
    const now = Math.floor(Date.now() / 1000);
    const result = queryRun('DELETE FROM admin_sessions WHERE expires_at < ?', [now]);

    return c.json(apiResponse({ deletedCount: result.changes }));
  });

export default router;
