import { randomUUID } from 'node:crypto';
import { queryAll, queryFirst, queryRun } from '../../shared/database';
import { inferFormatFromVendorTemplate } from '../../module-gateway/utils/format-inferer';
import { ApiFormat } from '../../module-protocol-transpiler';

export interface ModelValidationStatus {
  success: boolean;
  response?: string;
  error?: string;
  latencyMs?: number;
  validatedAt: number;
}

export interface Asset {
  id: string;
  name: string;
  vendorId: string;
  apiKey: string;
  status: 'active' | 'suspended';
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAssetInput {
  name: string;
  vendorId: string;
  apiKey: string;
  validFrom?: Date;
  validUntil?: Date;
}

export interface UpdateAssetInput {
  name?: string;
  apiKey?: string;
  status?: 'active' | 'suspended';
  validFrom?: Date;
  validUntil?: Date;
}

export interface ModelInfo {
  id: string;
  modelId: string;
  displayName: string;
  description?: string;
  validation?: ModelValidationStatus;
}

export interface AssetWithVendor extends Omit<Asset, 'vendorId' | 'status' | 'validFrom' | 'validUntil' | 'createdAt' | 'updatedAt'> {
  vendorId: string;
  status: 'active' | 'suspended';
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  vendorName: string;
  vendorDisplayName: string;
  vendorBaseUrl: string;
  vendorEndpoint: string;
  models?: ModelInfo[];
}

export class AssetsService {
  /**
   * Get all assets with vendor information
   */
  async getAll(): Promise<AssetWithVendor[]> {
    const rows = queryAll<any>(`
      SELECT
        a.id,
        a.name,
        a.vendor_id as vendorId,
        a.api_key as apiKey,
        a.status,
        a.valid_from as validFrom,
        a.valid_until as validUntil,
        a.created_at as createdAt,
        a.updated_at as updatedAt,
        v.name as vendorName,
        v.display_name as vendorDisplayName,
        v.base_url as vendorBaseUrl,
        v.endpoint as vendorEndpoint
      FROM assets a
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      ORDER BY a.created_at DESC
    `);

    const assets = rows.map((row) => this.mapRowToAssetWithVendor(row));

    // Fetch models for each asset
    for (const asset of assets) {
      asset.models = await this.getAssetModels(asset.id);
    }

    return assets;
  }

  /**
   * Get asset by ID with vendor information
   */
  async getById(id: string): Promise<AssetWithVendor | null> {
    const row = queryFirst<any>(`
      SELECT
        a.id,
        a.name,
        a.vendor_id as vendorId,
        a.api_key as apiKey,
        a.status,
        a.valid_from as validFrom,
        a.valid_until as validUntil,
        a.created_at as createdAt,
        a.updated_at as updatedAt,
        v.name as vendorName,
        v.display_name as vendorDisplayName,
        v.base_url as vendorBaseUrl,
        v.endpoint as vendorEndpoint
      FROM assets a
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE a.id = ?
    `, [id]);

    if (!row) return null;

    const asset = this.mapRowToAssetWithVendor(row);
    asset.models = await this.getAssetModels(id);

    return asset as any;
  }

  /**
   * Get active assets
   */
  async getActive(): Promise<AssetWithVendor[]> {
    const rows = queryAll<any>(`
      SELECT
        a.id,
        a.name,
        a.vendor_id as vendorId,
        a.api_key as apiKey,
        a.status,
        a.valid_from as validFrom,
        a.valid_until as validUntil,
        a.created_at as createdAt,
        a.updated_at as updatedAt,
        v.name as vendorName,
        v.display_name as vendorDisplayName,
        v.base_url as vendorBaseUrl,
        v.endpoint as vendorEndpoint
      FROM assets a
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE a.status = 'active'
      ORDER BY a.created_at DESC
    `);

    const assets = rows.map((row) => this.mapRowToAssetWithVendor(row));

    // Fetch models for each asset
    for (const asset of assets) {
      asset.models = await this.getAssetModels(asset.id);
    }

    return assets;
  }

  /**
   * Get models available for an asset
   */
  async getAssetModels(assetId: string): Promise<ModelInfo[]> {
    const rows = queryAll<any>(`
      SELECT
        vm.id,
        vm.model_id as modelId,
        vm.display_name as displayName,
        vm.description
      FROM asset_models am
      INNER JOIN assets a ON am.asset_id = a.id
      INNER JOIN vendor_models vm ON am.model_id = vm.model_id AND a.vendor_id = vm.vendor_id
      WHERE am.asset_id = ?
    `, [assetId]);

    const models = rows.map((row) => ({
      id: row.id,
      modelId: row.modelId,
      displayName: row.displayName,
      description: row.description,
    }));

    // Load validation status for each model
    const validations = await this.getModelValidations(assetId);

    return models.map((model) => ({
      ...model,
      validation: validations[model.modelId],
    }));
  }

  /**
   * Get validation results for all models of an asset
   */
  async getModelValidations(assetId: string): Promise<Record<string, ModelValidationStatus>> {
    const rows = queryAll<any>(`
      SELECT
        model_id,
        success,
        response,
        error,
        latency_ms as latencyMs,
        validated_at as validatedAt
      FROM asset_model_validations
      WHERE asset_id = ?
    `, [assetId]);

    const validations: Record<string, ModelValidationStatus> = {};
    for (const row of rows) {
      validations[row.model_id] = {
        success: row.success === 1,
        response: row.response,
        error: row.error,
        latencyMs: row.latencyMs,
        validatedAt: row.validatedAt,
      };
    }

    return validations;
  }

  /**
   * Save validation results for an asset's models
   */
  async saveModelValidations(
    assetId: string,
    results: Array<{
      modelId: string;
      displayName: string;
      success: boolean;
      response?: string;
      error?: string;
      latencyMs?: number;
    }>
  ): Promise<void> {
    const now = Date.now();

    for (const result of results) {
      // Check if validation already exists
      const existing = queryFirst<any>(`
        SELECT id FROM asset_model_validations
        WHERE asset_id = ? AND model_id = ?
      `, [assetId, result.modelId]);

      if (existing) {
        // Update existing validation
        queryRun(`
          UPDATE asset_model_validations
          SET success = ?, response = ?, error = ?, latency_ms = ?, validated_at = ?
          WHERE asset_id = ? AND model_id = ?
        `, [
          result.success ? 1 : 0,
          result.response || null,
          result.error || null,
          result.latencyMs || null,
          now,
          assetId,
          result.modelId,
        ]);
      } else {
        // Insert new validation
        queryRun(`
          INSERT INTO asset_model_validations (id, asset_id, model_id, success, response, error, latency_ms, validated_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          randomUUID(),
          assetId,
          result.modelId,
          result.success ? 1 : 0,
          result.response || null,
          result.error || null,
          result.latencyMs || null,
          now,
          now,
        ]);
      }
    }

    console.log(`[Assets] Saved ${results.length} validation results for asset ${assetId}`);
  }

  /**
   * Create a new asset
   */
  async create(input: CreateAssetInput, modelIds: string[] = []): Promise<Asset> {
    const id = randomUUID();
    const now = Date.now();

    queryRun(`
      INSERT INTO assets (id, name, vendor_id, api_key, status, valid_from, valid_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `, [
      id,
      input.name,
      input.vendorId,
      input.apiKey,
      input.validFrom ? input.validFrom.getTime() : null,
      input.validUntil ? input.validUntil.getTime() : null,
      now,
      now,
    ]);

    // Link models to asset
    if (modelIds.length > 0) {
      for (const modelId of modelIds) {
        queryRun(`
          INSERT INTO asset_models (id, asset_id, model_id, created_at)
          VALUES (?, ?, ?, ?)
        `, [randomUUID(), id, modelId, now]);
      }
    }

    return (await this.getById(id))!;
  }

  /**
   * Update an existing asset
   */
  async update(id: string, input: UpdateAssetInput, modelIds?: string[]): Promise<AssetWithVendor | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.apiKey !== undefined) {
      updates.push('api_key = ?');
      values.push(input.apiKey);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }
    if (input.validFrom !== undefined) {
      updates.push('valid_from = ?');
      values.push(input.validFrom.getTime());
    }
    if (input.validUntil !== undefined) {
      updates.push('valid_until = ?');
      values.push(input.validUntil.getTime());
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);

      queryRun(`
        UPDATE assets
        SET ${updates.join(', ')}
        WHERE id = ?
      `, values);
    }

    // Update linked models if provided
    if (modelIds !== undefined) {
      // Delete existing model links
      queryRun(`DELETE FROM asset_models WHERE asset_id = ?`, [id]);

      // Add new model links
      const now = Date.now();
      for (const modelId of modelIds) {
        queryRun(`
          INSERT INTO asset_models (id, asset_id, model_id, created_at)
          VALUES (?, ?, ?, ?)
        `, [randomUUID(), id, modelId, now]);
      }
    }

    return await this.getById(id);
  }

  /**
   * Delete an asset
   */
  async delete(id: string): Promise<boolean> {
    const result = queryRun(`DELETE FROM assets WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  /**
   * Duplicate an asset (create a copy)
   */
  async duplicate(id: string): Promise<AssetWithVendor | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const modelIds = await this.getAssetModels(id);

    const newAsset = await this.create({
      name: `${existing.name} (copy)`,
      vendorId: existing.vendorId,
      apiKey: '', // Clear API key for security
      validFrom: existing.validFrom,
      validUntil: existing.validUntil,
    } as any, modelIds as any);

    return this.getById(newAsset.id);
  }

  /**
   * Update asset status
   */
  async updateStatus(id: string, status: 'active' | 'suspended'): Promise<AssetWithVendor | null> {
    return await this.update(id, { status });
  }

  /**
   * Validate asset API key by making a test request to the vendor
   */
  async validate(id: string): Promise<{ valid: boolean; error?: string; modelCount?: number }> {
    const asset = await this.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const baseUrl = asset.vendorBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    const apiKey = asset.apiKey;

    try {
      // Try to fetch models from the vendor (OpenAI-compatible API)
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 401) {
          throw new Error('Invalid API key');
        } else if (response.status === 403) {
          throw new Error('Forbidden - check API key permissions');
        } else if (response.status >= 500) {
          throw new Error('Vendor server error - try again later');
        } else {
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      }

      const data = await response.json();
      const modelCount = data.data?.length || data.object === 'list' ? data.data?.length : 0;

      return { valid: true, modelCount };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        throw new Error('Request timeout - check network connection');
      }
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        throw new Error('Network error - check base URL');
      }
      throw e;
    }
  }

  /**
   * Build a vendor-specific request for Quick Test
   * Returns the request body and headers for the detected format
   */
  private buildVendorRequest(
    asset: AssetWithVendor,
    modelId: string
  ): { body: Record<string, unknown>; headers: Record<string, string>; endpoint: string } {
    // Detect the format from vendor template
    const format = inferFormatFromVendorTemplate({
      baseUrl: asset.vendorBaseUrl,
      endpoint: asset.vendorEndpoint,
    });

    const baseUrl = asset.vendorBaseUrl.replace(/\/$/, '');
    const endpoint = asset.vendorEndpoint;

    // Common headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Build request body based on format
    let body: Record<string, unknown>;

    switch (format) {
      case ApiFormat.ANTHROPIC:
        // Anthropic format
        // https://docs.anthropic.com/claude/reference/messages_post
        body = {
          model: modelId,
          max_tokens: 10,
          messages: [
            { role: 'user', content: 'hi' }
          ],
        };
        // Anthropic uses different auth header
        headers['x-api-key'] = asset.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;

      case ApiFormat.GEMINI:
        // Gemini format
        // https://ai.google.dev/gemini-api/docs
        body = {
          contents: [
            { parts: [{ text: 'hi' }] }
          ],
          generationConfig: {
            maxOutputTokens: 10,
            temperature: 0.7,
          },
        };
        // Gemini uses API key as query parameter
        headers['Authorization'] = `Bearer ${asset.apiKey}`;
        break;

      case ApiFormat.OPENAI:
      default:
        // OpenAI format (default)
        body = {
          model: modelId,
          messages: [
            { role: 'user', content: 'hi' }
          ],
          max_tokens: 10,
        };
        headers['Authorization'] = `Bearer ${asset.apiKey}`;
        break;
    }

    return { body, headers, endpoint: `${baseUrl}${endpoint}` };
  }

  /**
   * Parse vendor response to extract content
   * Handles different response formats from different vendors
   */
  private parseVendorResponse(data: unknown, format: ApiFormat): string {
    if (!data || typeof data !== 'object') {
      return '(empty response)';
    }

    const response = data as Record<string, unknown>;

    switch (format) {
      case ApiFormat.ANTHROPIC:
        // Anthropic format: content is an array of blocks
        if (response.content && Array.isArray(response.content)) {
          let text = '';
          for (const block of response.content) {
            if (block && typeof block === 'object' && block.type === 'text') {
              text += block.text || '';
            }
          }
          return text || '(empty response)';
        }
        return '(empty response)';

      case ApiFormat.GEMINI:
        // Gemini format: candidates[0].content.parts[0].text
        if (response.candidates && Array.isArray(response.candidates) && response.candidates[0]) {
          const candidate = response.candidates[0] as Record<string, unknown>;
          if (candidate.content && typeof candidate.content === 'object') {
            const content = candidate.content as Record<string, unknown>;
            if (content.parts && Array.isArray(content.parts) && content.parts[0]) {
              const part = content.parts[0] as Record<string, unknown>;
              return (part.text as string) || '(empty response)';
            }
          }
        }
        return '(empty response)';

      case ApiFormat.OPENAI:
      default:
        // OpenAI format: choices[0].message.content
        if (response.choices && Array.isArray(response.choices) && response.choices[0]) {
          const choice = response.choices[0] as Record<string, unknown>;
          if (choice.message && typeof choice.message === 'object') {
            const message = choice.message as Record<string, unknown>;
            return (message.content as string) || '(empty response)';
          }
        }
        return '(empty response)';
    }
  }

  /**
   * Validate each model associated with an asset by sending a test chat completion
   */
  async validateModels(id: string): Promise<{
    results: Array<{
      modelId: string;
      displayName: string;
      success: boolean;
      response?: string;
      error?: string;
      latencyMs?: number;
    }>;
  }> {
    const asset = await this.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    if (!asset.vendorBaseUrl || !asset.vendorEndpoint) {
      throw new Error('Vendor base URL or endpoint not configured. Please check vendor configuration.');
    }

    const models = await this.getAssetModels(id);
    if (models.length === 0) {
      return { results: [] };
    }

    // Detect the format once for all models (same vendor)
    const format = inferFormatFromVendorTemplate({
      baseUrl: asset.vendorBaseUrl,
      endpoint: asset.vendorEndpoint,
    });

    console.log(`[Assets] Validating models for asset ${id}, format: ${format}, endpoint: ${asset.vendorEndpoint}`);

    const results = await Promise.all(
      models.map(async (model) => {
        const startTime = Date.now();

        try {
          // Build vendor-specific request
          const { body, headers, endpoint } = this.buildVendorRequest(asset, model.modelId);

          console.log(`[Assets] Testing model ${model.modelId} with format ${format}`);

          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000), // 30 second timeout per model
          });

          const latencyMs = Date.now() - startTime;

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            return {
              modelId: model.modelId,
              displayName: model.displayName,
              success: false,
              error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
              latencyMs,
            };
          }

          const data = await response.json();
          const responseText = this.parseVendorResponse(data, format);

          return {
            modelId: model.modelId,
            displayName: model.displayName,
            success: true,
            response: responseText,
            latencyMs,
          };
        } catch (e: any) {
          const latencyMs = Date.now() - startTime;
          let errorMessage = 'Unknown error';

          if (e.name === 'AbortError') {
            errorMessage = 'Request timeout (30s)';
          } else if (e.message) {
            errorMessage = e.message.substring(0, 100);
          }

          return {
            modelId: model.modelId,
            displayName: model.displayName,
            success: false,
            error: errorMessage,
            latencyMs,
          };
        }
      })
    );

    // Save validation results to database
    await this.saveModelValidations(id, results);

    return { results };
  }

  private mapRowToAssetWithVendor(row: any): AssetWithVendor {
    return {
      id: row.id,
      name: row.name,
      vendorId: row.vendorId,
      apiKey: row.apiKey,
      status: row.status,
      validFrom: row.validFrom ? new Date(row.validFrom) : undefined,
      validUntil: row.validUntil ? new Date(row.validUntil) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      vendorName: row.vendorName,
      vendorDisplayName: row.vendorDisplayName,
      vendorBaseUrl: row.vendorBaseUrl,
      vendorEndpoint: row.vendorEndpoint,
    };
  }
}

export const assetsService = new AssetsService();
