import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { queryAll, queryFirst, queryRun } from '@server/shared/database';
import { randomUUID } from 'node:crypto';
import type { VendorsYamlSimple } from '@shared/types';
import yaml from 'js-yaml';

// ============================================
// Service Class
// ============================================

/**
 * Vendors Service
 *
 * Manages vendor templates and their supported models
 * Supports loading from simplified YAML config file and syncing to database
 */
export class VendorsService {
  private configPath: string;

  constructor(configPath: string = 'config/vendors.yaml') {
    this.configPath = resolve(process.cwd(), configPath);
  }

  /**
   * Load vendor configuration from YAML file
   */
  async loadFromYaml(): Promise<VendorsYamlSimple> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      return this.parseYaml(content);
    } catch (error) {
      console.error('[Vendors] Error loading YAML:', error);
      throw new Error(`Failed to load vendor config: ${error}`);
    }
  }

  /**
   * Parse simplified YAML content using js-yaml
   */
  private parseYaml(content: string): VendorsYamlSimple {
    try {
      // Pre-process: Replace backticks with double quotes to support user's template-string style
      // but keep standard YAML compliance.
      const preProcessed = content.replace(/`([^`]*)`/g, '"$1"');
      
      const parsed = yaml.load(preProcessed) as VendorsYamlSimple;
      
      if (!parsed || !parsed.vendors || !Array.isArray(parsed.vendors)) {
        return { vendors: [] };
      }

      // Ensure consistent formatting and default values
      const vendors = parsed.vendors.map(v => ({
        ...v,
        name: v.name?.toString().trim() || '',
        baseUrl: v.baseUrl?.toString().trim() || '',
        endpoint: v.endpoint?.toString().trim() || '/chat/completions',
        iconUrl: v.iconUrl?.toString().trim(),
        models: Array.isArray(v.models) ? v.models.map(m => m.toString().trim()) : []
      }));

      return { vendors };
    } catch (error) {
      console.error('[Vendors] YAML Parse Error:', error);
      throw new Error(`Failed to parse vendor YAML: ${error}`);
    }
  }

  /**
   * Get all vendors from database with models
   */
  async getAll(): Promise<any[]> {
    const rows = queryAll<any>(`
      SELECT
        v.id,
        v.name,
        v.display_name as displayName,
        v.base_url as baseUrl,
        v.endpoint,
        v.icon_url as iconUrl,
        v.status,
        v.created_at as createdAt
      FROM vendor_templates v
      ORDER BY v.name
    `);

    // Fetch models for each vendor
    const vendors = [];
    for (const row of rows) {
      const modelRows = queryAll<any>(`
        SELECT
          id,
          model_id as modelId,
          display_name as displayName,
          description,
          status
        FROM vendor_models
        WHERE vendor_id = ?
        ORDER BY display_name
      `, [row.id]);

      vendors.push({
        ...row,
        models: modelRows,
      });
    }

    return vendors;
  }

  /**
   * Get vendor by ID with models
   */
  async getById(id: string): Promise<any | null> {
    const vendorRow = queryFirst<any>(`
      SELECT
        id,
        name,
        display_name as displayName,
        base_url as baseUrl,
        endpoint,
        icon_url as iconUrl,
        status,
        created_at as createdAt
      FROM vendor_templates
      WHERE id = ?
    `, [id]);

    if (!vendorRow) return null;

    const modelRows = queryAll<any>(`
      SELECT
        id,
        model_id as modelId,
        display_name as displayName,
        description,
        status
      FROM vendor_models
      WHERE vendor_id = ?
      ORDER BY display_name
    `, [id]);

    return {
      ...vendorRow,
      models: modelRows,
    };
  }

  /**
   * Sync vendor configuration from simplified YAML to database
   * Returns summary of changes
   */
  async syncFromYaml(): Promise<{ created: number; updated: number; deleted: number; models: number }> {
    const config = await this.loadFromYaml();
    const now = Date.now();

    let createdVendors = 0;
    let updatedVendors = 0;
    let deletedVendors = 0;
    let totalModels = 0;

    for (const vendorConfig of config.vendors) {
      // Generate id from name (lowercase, replace spaces with hyphens)
      const id = vendorConfig.name.toLowerCase().replace(/\s+/g, '-');

      // Check if vendor exists
      const existing = queryFirst<any>(`
        SELECT id FROM vendor_templates WHERE id = ?
      `, [id]);

      if (existing) {
        // Update existing vendor
        queryRun(`
          UPDATE vendor_templates
          SET name = ?, display_name = ?, base_url = ?, endpoint = ?, icon_url = ?, status = ?
          WHERE id = ?
        `, [
          vendorConfig.name,
          vendorConfig.name, // displayName = name
          vendorConfig.baseUrl,
          vendorConfig.endpoint || '/chat/completions',
          vendorConfig.iconUrl || null,
          'active', // Default status
          id,
        ]);
        updatedVendors++;
      } else {
        // Create new vendor
        queryRun(`
          INSERT INTO vendor_templates (id, name, display_name, base_url, endpoint, icon_url, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          vendorConfig.name,
          vendorConfig.name, // displayName = name
          vendorConfig.baseUrl,
          vendorConfig.endpoint || '/chat/completions',
          vendorConfig.iconUrl || null,
          'active', // Default status
          now,
        ]);
        createdVendors++;
      }

      // Sync models for this vendor
      // First, delete all existing models for this vendor
      queryRun(`
        DELETE FROM vendor_models WHERE vendor_id = ?
      `, [id]);

      // Then insert all models from config
      for (const modelId of vendorConfig.models) {
        const modelUuid = randomUUID();
        queryRun(`
          INSERT INTO vendor_models (id, vendor_id, model_id, display_name, description, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          modelUuid,
          id,
          modelId, // modelId
          modelId, // displayName = modelId
          null, // No description in simplified format
          'active', // Default status
          now,
        ]);
        totalModels++;
      }
    }

    return {
      created: createdVendors,
      updated: updatedVendors,
      deleted: deletedVendors,
      models: totalModels,
    };
  }

  /**
   * Get models for a specific vendor
   */
  async getVendorModels(vendorId: string): Promise<any[]> {
    const rows = queryAll<any>(`
      SELECT
        id,
        model_id as modelId,
        display_name as displayName,
        description,
        status
      FROM vendor_models
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY display_name
    `, [vendorId]);

    return rows;
  }
}

// Export singleton instance
export const vendorsService = new VendorsService();
