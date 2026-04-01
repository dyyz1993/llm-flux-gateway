import { queryAll, queryFirst, queryRun } from '@server/shared/database';
import { randomUUID } from 'node:crypto';

// ============================================
// Type Definitions
// ============================================

export type ApiKeyStatus = 'active' | 'revoked';

export interface ApiKey {
  id: string;
  keyToken: string;
  name: string;
  status: ApiKeyStatus;
  createdAt: Date;
  lastUsedAt: Date | null;
  updatedAt: Date;
  routes?: KeyRouteAssociation[]; // Associated routes with details
}

export interface CreateApiKeyInput {
  name: string;
  keyToken?: string; // Optional, will auto-generate if not provided
  routeIds?: string[]; // Route IDs to associate with this key
}

export interface KeyRouteAssociation {
  routeId: string;
  routeName: string;
  priority: number;
  weight: number;
  healthStatus: 'healthy' | 'unhealthy' | 'degraded';
  failCount: number;
  successCount: number;
  lastCheckAt: number | null;
  lastSuccessAt: number | null;
  lastFailAt: number | null;
  avgLatencyMs: number | null;
}

export interface UpdateApiKeyInput {
  name?: string;
  status?: ApiKeyStatus;
  routeIds?: string[];
  routeWeights?: { routeId: string; weight: number }[];
}

// ============================================
// Service Class
// ============================================

/**
 * Keys Service
 *
 * Handles API key CRUD operations with full type safety
 */
export class KeysService {
  /**
   * Generate a secure API key token
   */
  private generateKeyToken(): string {
    const uuid = randomUUID();
    return `sk-flux-${uuid.replace(/-/g, '').substring(0, 32)}`;
  }

  /**
   * Get all API keys with associated routes
   */
  async getAll(): Promise<ApiKey[]> {
    const rows = queryAll<any>(`
      SELECT id, key_token, name, status, created_at, last_used_at, updated_at
      FROM api_keys
      ORDER BY created_at DESC
    `);

    const keys = await Promise.all(
      rows.map(async (row) => {
        const apiKey = this.mapRowToApiKey(row);
        apiKey.routes = await this.getKeyRoutes(apiKey.id);
        return apiKey;
      })
    );

    return keys;
  }

  /**
   * Get API key by ID with associated routes
   */
  async getById(id: string): Promise<ApiKey | null> {
    const row = queryFirst<any>(
      `
      SELECT id, key_token, name, status, created_at, last_used_at, updated_at
      FROM api_keys
      WHERE id = ?
      `,
      [id]
    );

    if (!row) return null;

    const apiKey = this.mapRowToApiKey(row);
    apiKey.routes = await this.getKeyRoutes(apiKey.id);
    return apiKey;
  }

  /**
   * Get API key by token (for authentication)
   */
  async getByToken(keyToken: string): Promise<ApiKey | null> {
    const row = queryFirst<any>(
      `
      SELECT id, key_token, name, status, created_at, last_used_at, updated_at
      FROM api_keys
      WHERE key_token = ?
      `,
      [keyToken]
    );

    return row ? this.mapRowToApiKey(row) : null;
  }

  /**
   * Get active API keys only with routes
   */
  async getActive(): Promise<ApiKey[]> {
    const rows = queryAll<any>(`
      SELECT id, key_token, name, status, created_at, last_used_at, updated_at
      FROM api_keys
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    const keys = await Promise.all(
      rows.map(async (row) => {
        const apiKey = this.mapRowToApiKey(row);
        apiKey.routes = await this.getKeyRoutes(apiKey.id);
        return apiKey;
      })
    );

    return keys;
  }

  /**
   * Create a new API key with optional route associations
   */
  async create(input: CreateApiKeyInput): Promise<ApiKey> {
    const id = randomUUID();
    const keyToken = input.keyToken || this.generateKeyToken();
    const now = Math.floor(Date.now() / 1000);

    queryRun(
      `
      INSERT INTO api_keys (id, key_token, name, status, created_at, last_used_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, NULL, ?)
      `,
      [id, keyToken, input.name, now, now]
    );

    // Associate routes if provided
    if (input.routeIds && input.routeIds.length > 0) {
      for (let i = 0; i < input.routeIds.length; i++) {
        const associationId = randomUUID();
        const priority = i + 1;
        const weight = 100;
        queryRun(
          `
          INSERT INTO api_key_routes (id, api_key_id, route_id, priority, weight, health_status, fail_count, success_count, created_at)
          VALUES (?, ?, ?, ?, ?, 'healthy', 0, 0, ?)
          `,
          [associationId, id, input.routeIds[i], priority, weight, now]
        );
      }
    }

    // Return the created key with routes
    const apiKey: ApiKey = {
      id,
      keyToken,
      name: input.name,
      status: 'active',
      createdAt: new Date(now * 1000),
      lastUsedAt: null,
      updatedAt: new Date(now * 1000),
      routes: input.routeIds ? await this.getKeyRoutes(id) : [],
    };

    return apiKey;
  }

  /**
   * Update an existing API key
   */
  async update(id: string, input: UpdateApiKeyInput): Promise<ApiKey | null> {
    // Get existing key
    const existing = await this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }

    // Update the api_keys table if there are changes
    if (updates.length > 0) {
      updates.push('updated_at = ?');
      const now = Math.floor(Date.now() / 1000);
      values.push(now);
      values.push(id);

      queryRun(
        `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Handle route associations if provided
    if (input.routeIds !== undefined) {
      // Delete existing associations
      queryRun(
        `DELETE FROM api_key_routes WHERE api_key_id = ?`,
        [id]
      );

      // Add new associations if any
      if (input.routeIds.length > 0) {
        const now = Math.floor(Date.now() / 1000);
        for (let i = 0; i < input.routeIds.length; i++) {
          const routeWeight = input.routeWeights?.find((rw) => rw.routeId === input.routeIds![i]);
          const weight = routeWeight?.weight ?? 100;
          queryRun(
            `INSERT INTO api_key_routes (id, api_key_id, route_id, priority, weight, health_status, fail_count, success_count, created_at) VALUES (?, ?, ?, ?, ?, 'healthy', 0, 0, ?)`,
            [randomUUID(), id, input.routeIds[i], i, weight, now]
          );
        }
      }
    }

    return this.getById(id);
  }

  /**
   * Delete an API key
   */
  async delete(id: string): Promise<boolean> {
    const result = queryRun(
      `DELETE FROM api_keys WHERE id = ?`,
      [id]
    );

    return result.changes > 0;
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    queryRun(
      `UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
      [now, id]
    );
  }

  /**
   * Get routes associated with a key
   */
  async getKeyRoutes(apiKeyId: string): Promise<KeyRouteAssociation[]> {
    const rows = queryAll<any>(
      `
      SELECT
        kr.route_id as routeId,
        rt.name as routeName,
        kr.priority as priority,
        kr.weight as weight,
        kr.health_status as healthStatus,
        kr.fail_count as failCount,
        kr.success_count as successCount,
        kr.last_check_at as lastCheckAt,
        kr.last_success_at as lastSuccessAt,
        kr.last_fail_at as lastFailAt,
        kr.avg_latency_ms as avgLatencyMs
      FROM api_key_routes kr
      INNER JOIN routes rt ON kr.route_id = rt.id
      WHERE kr.api_key_id = ?
      ORDER BY kr.priority ASC
      `,
      [apiKeyId]
    );

    return rows.map((row) => ({
      routeId: row.routeId,
      routeName: row.routeName,
      priority: row.priority,
      weight: row.weight ?? 100,
      healthStatus: row.healthStatus ?? 'healthy',
      failCount: row.failCount ?? 0,
      successCount: row.successCount ?? 0,
      lastCheckAt: row.lastCheckAt,
      lastSuccessAt: row.lastSuccessAt,
      lastFailAt: row.lastFailAt,
      avgLatencyMs: row.avgLatencyMs,
    }));
  }

  /**
   * Map database row to ApiKey type
   */
  private mapRowToApiKey(row: any): ApiKey {
    return {
      id: row.id,
      keyToken: row.key_token,
      name: row.name,
      status: row.status,
      createdAt: new Date(row.created_at * 1000),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at * 1000) : null,
      updatedAt: new Date(row.updated_at * 1000),
    };
  }
}

// Export singleton instance
export const keysService = new KeysService();
