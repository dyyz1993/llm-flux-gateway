import { queryAll, queryFirst, queryRun } from '@server/shared/database';
import { randomUUID } from 'node:crypto';
import { inferFormatFromVendorTemplate, type VendorTemplateForInference } from '../utils/format-inferer';
import { ApiFormat } from '../../module-protocol-transpiler';

// ============================================
// Type Definitions
// ============================================

export type ConfigType = 'yaml' | 'json';

export interface OverrideRule {
  match: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export interface Route {
  id: string;
  name: string;
  assetId: string;
  isActive: boolean;
  overrides: OverrideRule[];
  configType: ConfigType;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  // JOIN fields from asset
  assetName?: string;
  assetVendorDisplayName?: string;
  assetBaseUrl?: string;
  assetEndpoint?: string;
  assetApiKey?: string;
  assetModels?: string[]; // model IDs
  // Inferred format from vendor template
  requestFormat?: ApiFormat;
  responseFormat?: ApiFormat;
}

export interface CreateRouteInput {
  name: string;
  assetId: string;
  overrides?: OverrideRule[];
  configType?: ConfigType;
  priority?: number;
  isActive?: boolean;
}

export interface UpdateRouteInput {
  name?: string;
  assetId?: string;
  overrides?: OverrideRule[];
  configType?: ConfigType;
  priority?: number;
  isActive?: boolean;
}

// ============================================
// Service Class
// ============================================

/**
 * Routes Service
 *
 * Handles route configuration business logic with full type safety
 * Routes are linked to Assets for upstream API configuration
 * Uses native node:sqlite for database operations
 */
export class RoutesService {
  /**
   * Get all routes with asset information
   */
  async getAll(): Promise<Route[]> {
    const rows = queryAll<any>(`
      SELECT
        r.id,
        r.name,
        r.asset_id as assetId,
        r.is_active as isActive,
        r.overrides,
        r.config_type as configType,
        r.priority,
        r.created_at as createdAt,
        r.updated_at as updatedAt,
        a.name as assetName,
        a.api_key as assetApiKey,
        v.display_name as assetVendorDisplayName,
        v.base_url as assetBaseUrl,
        v.endpoint as assetEndpoint
      FROM routes r
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      ORDER BY r.priority DESC, r.created_at DESC
    `);

    const routes = rows.map((row) => this.mapRowToRoute(row));

    // Fetch models for each route's asset
    for (const route of routes) {
      const modelRows = queryAll<any>(`
        SELECT model_id
        FROM asset_models
        WHERE asset_id = ?
      `, [route.assetId]);
      route.assetModels = modelRows.map((r) => r.model_id as string);
    }

    return routes;
  }

  /**
   * Get route by ID with asset information
   */
  async getById(id: string): Promise<Route | null> {
    const row = queryFirst<any>(`
      SELECT
        r.id,
        r.name,
        r.asset_id as assetId,
        r.is_active as isActive,
        r.overrides,
        r.config_type as configType,
        r.priority,
        r.created_at as createdAt,
        r.updated_at as updatedAt,
        a.name as assetName,
        a.api_key as assetApiKey,
        v.display_name as assetVendorDisplayName,
        v.base_url as assetBaseUrl,
        v.endpoint as assetEndpoint
      FROM routes r
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE r.id = ?
    `, [id]);

    if (!row) return null;

    const route = this.mapRowToRoute(row);

    // Fetch models for the route's asset
    const modelRows = queryAll<any>(`
      SELECT model_id
      FROM asset_models
      WHERE asset_id = ?
    `, [route.assetId]);
    route.assetModels = modelRows.map((r) => r.model_id as string);

    return route;
  }

  /**
   * Get active routes only
   */
  async getActive(): Promise<Route[]> {
    const rows = queryAll<any>(`
      SELECT
        r.id,
        r.name,
        r.asset_id as assetId,
        r.is_active as isActive,
        r.overrides,
        r.config_type as configType,
        r.priority,
        r.created_at as createdAt,
        r.updated_at as updatedAt,
        a.name as assetName,
        a.api_key as assetApiKey,
        v.display_name as assetVendorDisplayName,
        v.base_url as assetBaseUrl,
        v.endpoint as assetEndpoint
      FROM routes r
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE r.is_active = 1
      ORDER BY r.priority DESC, r.created_at DESC
    `);

    const routes = rows.map((row) => this.mapRowToRoute(row));

    // Fetch models for each route's asset
    for (const route of routes) {
      const modelRows = queryAll<any>(`
        SELECT model_id
        FROM asset_models
        WHERE asset_id = ?
      `, [route.assetId]);
      route.assetModels = modelRows.map((r) => r.model_id as string);
    }

    return routes;
  }

  /**
   * Create a new route
   */
  async create(input: CreateRouteInput): Promise<Route> {
    const id = randomUUID();
    const now = Date.now();
    const overridesJson = JSON.stringify(input.overrides || []);

    queryRun(
      `
      INSERT INTO routes (
        id, name, asset_id, is_active, overrides, config_type, priority,
        request_format, response_format, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.name,
        input.assetId,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : 1,
        overridesJson,
        input.configType || 'yaml',
        input.priority ?? 0,
        'openai', // Default value (will be inferred at runtime)
        'openai', // Default value (will be inferred at runtime)
        now,
        now,
      ]
    );

    return (await this.getById(id))!;
  }

  /**
   * Update an existing route
   */
  async update(id: string, input: UpdateRouteInput): Promise<Route | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }

    if (input.assetId !== undefined) {
      updates.push('asset_id = ?');
      values.push(input.assetId);
    }

    if (input.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(input.isActive ? 1 : 0);
    }

    if (input.overrides !== undefined) {
      updates.push('overrides = ?');
      values.push(JSON.stringify(input.overrides));
    }

    if (input.configType !== undefined) {
      updates.push('config_type = ?');
      values.push(input.configType);
    }

    if (input.priority !== undefined) {
      updates.push('priority = ?');
      values.push(input.priority);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    queryRun(
      `UPDATE routes SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.getById(id);
  }

  /**
   * Delete a route
   */
  async delete(id: string): Promise<boolean> {
    const result = queryRun(
      `DELETE FROM routes WHERE id = ?`,
      [id]
    );

    return result.changes > 0;
  }

  /**
   * Toggle route active status
   */
  async toggleActive(id: string): Promise<Route | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const newStatus = !existing.isActive;
    const now = Date.now();

    queryRun(
      `UPDATE routes SET is_active = ?, updated_at = ? WHERE id = ?`,
      [newStatus ? 1 : 0, now, id]
    );

    return this.getById(id);
  }

  /**
   * Map database row to Route type
   */
  private mapRowToRoute(row: any): Route {
    // Infer format from vendor template
    const vendorTemplate: VendorTemplateForInference = {
      baseUrl: row.assetBaseUrl,
      endpoint: row.assetEndpoint || '/chat/completions',
    };
    const inferredFormat = inferFormatFromVendorTemplate(vendorTemplate);

    return {
      id: row.id,
      name: row.name,
      assetId: row.assetId,
      isActive: row.is_active === 1,
      overrides: this.parseOverrides(row.overrides),
      configType: row.config_type as ConfigType,
      priority: row.priority,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      assetName: row.assetName,
      assetVendorDisplayName: row.assetVendorDisplayName,
      assetBaseUrl: row.assetBaseUrl,
      assetEndpoint: row.assetEndpoint,
      assetApiKey: row.assetApiKey,
      assetModels: [],
      requestFormat: inferredFormat,
      responseFormat: inferredFormat,
    };
  }

  /**
   * Parse overrides JSON safely
   */
  private parseOverrides(overridesJson: string): OverrideRule[] {
    try {
      const parsed = JSON.parse(overridesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

// Export singleton instance
export const routesService = new RoutesService();
