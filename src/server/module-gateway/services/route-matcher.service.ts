import { queryAll } from '@server/shared/database';
import { inferFormatFromVendorTemplate, type VendorTemplateForInference } from '../utils/format-inferer';
import { ApiFormat } from '../../module-protocol-transpiler';
import { parseWildcardPattern, matchesWildcardPattern } from '@client/utils/wildcardUtils';
import type { LoadBalancerMember, HealthStatus } from './load-balancer.service';

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

export interface RouteMatchWithLBInfo extends RouteMatch {
  lbMemberId?: string;
  lbWeight?: number;
  lbHealthStatus?: HealthStatus;
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

      // Find model override rules
      const modelOverrideRules = overrides.filter((o: any) => o.field === 'model');

      // 按配置顺序直接匹配：第一个匹配成功的就使用
      for (const rule of modelOverrideRules) {
        // 按原始顺序遍历 matchValues，不排序
        for (const pattern of rule.matchValues) {
          const parsed = parseWildcardPattern(pattern);
          if (matchesWildcardPattern(requestedModel, parsed)) {
            // 找到第一个匹配的就直接返回
            return {
              route: {
                id: route.id,
                name: route.name,
                baseUrl: route.base_url,
                endpoint: route.endpoint || '/chat/completions',
                upstreamModel: rule.rewriteValue,
                upstreamApiKey: route.upstream_api_key,
                isActive: route.is_active === 1,
                overrides: overrides,
                priority: route.priority,
                requestFormat: inferredFormat,
                responseFormat: inferredFormat,
              },
              matchedRules: [rule],
              rewrittenModel: rule.rewriteValue,
            };
          }
        }
      }

      // No override rules matched - pass through the original model
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

  /**
   * Find all matching routes for a given model (for load balancing)
   * Returns all routes that match the model, along with LB metadata
   * @param requestedModel - The model requested by the client
   * @param apiKeyId - API key ID for route isolation
   */
  async findAllMatches(requestedModel: string, apiKeyId?: string): Promise<RouteMatchWithLBInfo[]> {
    let sql = `
      SELECT
        r.id,
        r.name,
        v.base_url,
        v.endpoint,
        a.api_key as upstream_api_key,
        r.is_active,
        r.overrides,
        r.priority,
        akr.id as lb_member_id,
        akr.weight as lb_weight,
        akr.health_status as lb_health_status
      FROM routes r
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
    `;

    const params: any[] = [];

    if (apiKeyId) {
      sql += `
        INNER JOIN api_key_routes akr ON r.id = akr.route_id
        WHERE r.is_active = 1 AND akr.api_key_id = ?
      `;
      params.push(apiKeyId);
    } else {
      sql += `WHERE r.is_active = 1`;
    }

    sql += ` ORDER BY r.priority DESC`;

    const routes = queryAll<any>(sql, params);
    const matches: RouteMatchWithLBInfo[] = [];

    for (const route of routes) {
      const overrides = JSON.parse(route.overrides || '[]');

      const vendorTemplate: VendorTemplateForInference = {
        baseUrl: route.base_url,
        endpoint: route.endpoint || '/chat/completions',
      };
      const inferredFormat = inferFormatFromVendorTemplate(vendorTemplate);

      const modelOverrideRules = overrides.filter((o: any) => o.field === 'model');

      let matched = false;
      for (const rule of modelOverrideRules) {
        for (const pattern of rule.matchValues) {
          const parsed = parseWildcardPattern(pattern);
          if (matchesWildcardPattern(requestedModel, parsed)) {
            matches.push({
              route: {
                id: route.id,
                name: route.name,
                baseUrl: route.base_url,
                endpoint: route.endpoint || '/chat/completions',
                upstreamModel: rule.rewriteValue,
                upstreamApiKey: route.upstream_api_key,
                isActive: route.is_active === 1,
                overrides: overrides,
                priority: route.priority,
                requestFormat: inferredFormat,
                responseFormat: inferredFormat,
              },
              matchedRules: [rule],
              rewrittenModel: rule.rewriteValue,
              lbMemberId: route.lb_member_id,
              lbWeight: route.lb_weight ?? 100,
              lbHealthStatus: (route.lb_health_status as HealthStatus) ?? 'healthy',
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      if (!matched) {
        matches.push({
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
          lbMemberId: route.lb_member_id,
          lbWeight: route.lb_weight ?? 100,
          lbHealthStatus: (route.lb_health_status as HealthStatus) ?? 'healthy',
        });
      }
    }

    return matches;
  }

  /**
   * Get load balancer members for a given API key
   * @param apiKeyId - API key ID
   */
  async getLBMembers(apiKeyId: string): Promise<LoadBalancerMember[]> {
    const rows = queryAll<any>(
      `
      SELECT
        akr.id,
        akr.api_key_id,
        akr.route_id,
        akr.priority,
        akr.weight,
        akr.health_status,
        akr.fail_count,
        akr.success_count,
        akr.last_check_at,
        akr.last_success_at,
        akr.last_fail_at,
        akr.avg_latency_ms,
        r.name as route_name,
        r.overrides,
        r.is_active,
        v.base_url,
        v.endpoint,
        a.api_key as upstream_api_key
      FROM api_key_routes akr
      INNER JOIN routes r ON akr.route_id = r.id
      INNER JOIN assets a ON r.asset_id = a.id
      INNER JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE akr.api_key_id = ?
      ORDER BY akr.priority ASC
      `,
      [apiKeyId]
    );

    return rows.map((row) => {
      const vendorTemplate: VendorTemplateForInference = {
        baseUrl: row.base_url,
        endpoint: row.endpoint || '/chat/completions',
      };
      const inferredFormat = inferFormatFromVendorTemplate(vendorTemplate);
      const overrides = JSON.parse(row.overrides || '[]');

      return {
        id: row.id,
        apiKeyId: row.api_key_id,
        routeId: row.route_id,
        priority: row.priority,
        weight: row.weight ?? 100,
        healthStatus: (row.health_status as HealthStatus) ?? 'healthy',
        failCount: row.fail_count ?? 0,
        successCount: row.success_count ?? 0,
        lastCheckAt: row.last_check_at,
        lastSuccessAt: row.last_success_at,
        lastFailAt: row.last_fail_at,
        avgLatencyMs: row.avg_latency_ms,
        route: {
          id: row.route_id,
          name: row.route_name,
          baseUrl: row.base_url,
          endpoint: row.endpoint || '/chat/completions',
          upstreamModel: '',
          upstreamApiKey: row.upstream_api_key,
          isActive: row.is_active === 1,
          overrides: overrides,
          priority: row.priority,
          requestFormat: inferredFormat,
          responseFormat: inferredFormat,
        },
      };
    });
  }
}

// Export singleton instance
export const routeMatcherService = new RouteMatcherService();
