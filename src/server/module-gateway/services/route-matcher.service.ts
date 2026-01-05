import { queryAll } from '@server/shared/database';
import { inferFormatFromVendorTemplate, type VendorTemplateForInference } from '../utils/format-inferer';
import { ApiFormat } from '../../module-protocol-transpiler';

export interface RouteMatch {
  route: {
    id: string;
    name: string;
    baseUrl: string;
    endpoint: string;
    upstreamModel: string;
    upstreamApiKey: string;
    isActive: boolean;
    overrides: any[];
    priority: number;
    requestFormat: ApiFormat;
    responseFormat: ApiFormat;
  };
  matchedRules: any[];
  rewrittenModel: string;
}

/**
 * Route Matcher Service
 *
 * Matches incoming model requests to configured routes
 */
export class RouteMatcherService {
  /**
   * Find the best matching route for a given model
   * @param requestedModel - The model requested by the client
   * @param apiKeyId - Optional API key ID for route isolation
   */
  async findMatch(requestedModel: string, apiKeyId?: string): Promise<RouteMatch | null> {
    // Build SQL query dynamically based on whether apiKeyId is provided
    let sql = `
      SELECT
        r.id,
        r.name,
        v.base_url,
        v.endpoint,
        a.api_key as upstream_api_key,
        r.is_active,
        r.overrides,
        r.priority
      FROM routes r
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
    `;

    const params: any[] = [];

    if (apiKeyId) {
      // API key isolation: only return routes assigned to this API key
      sql += `
        INNER JOIN api_key_routes akr ON r.id = akr.route_id
        WHERE r.is_active = 1 AND akr.api_key_id = ?
      `;
      params.push(apiKeyId);
    } else {
      // No API key filter: return all active routes (backward compatibility)
      sql += `WHERE r.is_active = 1`;
    }

    sql += ` ORDER BY r.priority DESC`;

    // Get all active routes with JOIN to assets and vendors
    const routes = queryAll<any>(sql, params);

    // Find first route with a matching override rule for the model
    for (const route of routes) {
      const overrides = JSON.parse(route.overrides || '[]');

      // Infer format from vendor template
      const vendorTemplate: VendorTemplateForInference = {
        baseUrl: route.base_url,
        endpoint: route.endpoint || '/chat/completions',
      };
      const inferredFormat = inferFormatFromVendorTemplate(vendorTemplate);

      // Find model override rules (prioritize exact match over wildcard)
      const exactMatchRules = overrides.filter(
        (o: any) => o.field === 'model' && o.matchValues.includes(requestedModel)
      );
      const wildcardMatchRules = overrides.filter(
        (o: any) => o.field === 'model' && o.matchValues.includes('*')
      );
      const modelRules = exactMatchRules.length > 0 ? exactMatchRules : wildcardMatchRules;

      // If there are matching override rules, use them
      // Otherwise, pass through the original model (透传)
      if (modelRules.length > 0) {
        return {
          route: {
            id: route.id,
            name: route.name,
            baseUrl: route.base_url,
            endpoint: route.endpoint || '/chat/completions',
            upstreamModel: modelRules[0].rewriteValue,
            upstreamApiKey: route.upstream_api_key,
            isActive: route.is_active === 1,
            overrides: overrides,
            priority: route.priority,
            requestFormat: inferredFormat,
            responseFormat: inferredFormat,
          },
          matchedRules: modelRules,
          rewrittenModel: modelRules[0].rewriteValue,
        };
      } else {
        // No override rules found - pass through the original model
        return {
          route: {
            id: route.id,
            name: route.name,
            baseUrl: route.base_url,
            endpoint: route.endpoint || '/chat/completions',
            upstreamModel: requestedModel,
            upstreamApiKey: route.upstream_api_key,
            isActive: route.is_active === 1,
            overrides: overrides,
            priority: route.priority,
            requestFormat: inferredFormat,
            responseFormat: inferredFormat,
          },
          matchedRules: [],
          rewrittenModel: requestedModel,
        };
      }
    }

    // No active route found
    return null;
  }

  /**
   * Get all active routes (for model list endpoint)
   */
  async getActiveRoutes() {
    const routes = queryAll<any>(`
      SELECT
        r.id,
        r.name,
        v.base_url,
        v.endpoint,
        a.api_key as upstream_api_key,
        r.is_active,
        r.overrides,
        r.config_type,
        r.priority
      FROM routes r
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE r.is_active = 1
      ORDER BY r.priority DESC
    `);

    return routes.map((r: any) => {
      // Infer format from vendor template
      const vendorTemplate: VendorTemplateForInference = {
        baseUrl: r.base_url,
        endpoint: r.endpoint || '/chat/completions',
      };
      const inferredFormat = inferFormatFromVendorTemplate(vendorTemplate);

      return {
        id: r.id,
        name: r.name,
        baseUrl: r.base_url,
        endpoint: r.endpoint || '/chat/completions',
        upstreamModel: null, // Will be determined by override rules
        upstreamApiKey: r.upstream_api_key,
        isActive: r.is_active === 1,
        overrides: JSON.parse(r.overrides || '[]'),
        configType: r.config_type,
        priority: r.priority,
        requestFormat: inferredFormat,
        responseFormat: inferredFormat,
      };
    });
  }
}

// Export singleton instance
export const routeMatcherService = new RouteMatcherService();
