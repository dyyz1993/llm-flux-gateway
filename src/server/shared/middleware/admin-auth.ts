import { Context, Next } from 'hono';
import { queryFirst, queryRun } from '../database';

/**
 * Admin Session record from database
 */
interface AdminSession {
  id: string;
  token: string;
  created_at: number;
  expires_at: number;
}

/**
 * Admin Authentication Middleware
 *
 * Validates the admin session token and attaches adminSession to context.
 * Returns 401 if token is invalid or expired.
 */
export async function adminAuthMiddleware(c: Context, next: Next): Promise<void | Response> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const now = Math.floor(Date.now() / 1000);

  // Look up the session in database
  const session = queryFirst<AdminSession>(
    'SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ? LIMIT 1',
    [token, now]
  );

  if (!session) {
    return c.json({ success: false, error: 'Invalid or expired session' }, 401);
  }

  // Attach to context
  c.set('adminSession', session);
  c.set('adminToken', token);

  await next();
}

/**
 * Check if an IP is blocked due to too many failed login attempts
 *
 * @param ip - Client IP address
 * @returns true if blocked, false otherwise
 */
export function isIpBlocked(ip: string): boolean {
  const record = queryFirst<{
    attempts: number;
    blocked_until: number | null;
  }>(
    'SELECT attempts, blocked_until FROM login_attempts WHERE ip = ? LIMIT 1',
    [ip]
  );

  if (!record) {
    return false;
  }

  // If there's a block_until time, check if it's still valid
  if (record.blocked_until) {
    const now = Math.floor(Date.now() / 1000);
    return now < record.blocked_until;
  }

  // Check if attempts exceed max
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
  return record.attempts >= maxAttempts;
}

/**
 * Record a failed login attempt
 *
 * @param ip - Client IP address
 * @returns Object with attempts count and whether IP is now blocked
 */
export function recordFailedAttempt(ip: string): { attempts: number; blocked: boolean } {
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
  const blockMinutes = parseInt(process.env.LOGIN_BLOCK_MINUTES || '5', 10);
  const now = Math.floor(Date.now() / 1000);

  const existing = queryFirst<{ id: string; attempts: number }>(
    'SELECT id, attempts FROM login_attempts WHERE ip = ? LIMIT 1',
    [ip]
  );

  if (existing) {
    const newAttempts = existing.attempts + 1;
    const blockedUntil = newAttempts >= maxAttempts ? now + (blockMinutes * 60) : null;

    queryRun(
      'UPDATE login_attempts SET attempts = ?, last_attempt = ?, blocked_until = ? WHERE id = ?',
      [newAttempts, now, blockedUntil, existing.id]
    );

    return { attempts: newAttempts, blocked: newAttempts >= maxAttempts };
  } else {
    const id = crypto.randomUUID();
    const blockedUntil = 1 >= maxAttempts ? now + (blockMinutes * 60) : null;

    queryRun(
      'INSERT INTO login_attempts (id, ip, attempts, last_attempt, blocked_until) VALUES (?, ?, 1, ?, ?)',
      [id, ip, now, blockedUntil]
    );

    return { attempts: 1, blocked: 1 >= maxAttempts };
  }
}

/**
 * Clear failed login attempts for an IP (after successful login)
 *
 * @param ip - Client IP address
 */
export function clearFailedAttempts(ip: string): void {
  queryRun('DELETE FROM login_attempts WHERE ip = ?', [ip]);
}

/**
 * Get client IP address from request headers
 *
 * @param c - Hono context
 * @returns Client IP address
 */
export function getClientIp(c: Context): string {
  // Check common proxy headers
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    const firstIp = forwarded.split(',')[0];
    if (firstIp) {
      return firstIp.trim();
    }
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = c.req.header('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fall back to remote address (might not be available in all environments)
  return c.req.header('x-forwarded-host') || 'unknown';
}
