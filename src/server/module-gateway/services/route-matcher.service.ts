import { queryAll } from '@server/shared/database';
import { inferFormatFromVendorTemplate, type VendorTemplateForInference } from '../utils/format-inferer';
import { ApiFormat } from '../../module-protocol-transpiler';
import { parseWildcardPattern, matchesWildcardPattern, type WildcardPattern } from '@client/utils/wildcardUtils';

/**
 * Pattern priority levels (higher number = higher priority)
 */
enum PatternPriority {
  WILDCARD_ALL = 0,    // * - lowest priority
  WILDCARD_PREFIX = 1, // gpt-*
  EXACT = 2,           // gpt-3.5-turbo - highest priority
}

/**
 * Get priority level for a wildcard pattern
 */
function getPatternPriority(pattern: WildcardPattern): PatternPriority {
  switch (pattern.type) {
    case 'wildcard-all':
      return PatternPriority.WILDCARD_ALL;
    case 'wildcard-prefix':
      return PatternPriority.WILDCARD_PREFIX;
    case 'exact':
      return PatternPriority.EXACT;
  }
}

/**
 * Sort matchValues by pattern priority (highest first)
 * Within same priority level, preserves original order
 */
function sortMatchValuesByPriority(matchValues: string[]): string[] {
  const indexedPatterns = matchValues.map((value, index) => ({
    value,
    originalIndex: index,
    parsed: parseWildcardPattern(value),
    priority: getPatternPriority(parseWildcardPattern(value)),
  }));

  // Sort by priority DESC (highest first), then original index ASC
  indexedPatterns.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return a.originalIndex - b.originalIndex; // Preserve order within same level
  });

  return indexedPatterns.map(p => p.value);
}

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

      // Find model override rules
      const modelOverrideRules = overrides.filter((o: any) => o.field === 'model');

      if (modelOverrideRules.length > 0) {
        // Collect all potential matches across all rules, then pick highest priority
        interface MatchCandidate {
          rule: any;
          pattern: string;
          priority: PatternPriority;
        }

        const candidates: MatchCandidate[] = [];

        for (const rule of modelOverrideRules) {
          // Sort matchValues by priority within this rule
          const sortedMatchValues = sortMatchValuesByPriority(rule.matchValues);

          for (const pattern of sortedMatchValues) {
            const parsed = parseWildcardPattern(pattern);
            if (matchesWildcardPattern(requestedModel, parsed)) {
              candidates.push({
                rule,
                pattern,
                priority: getPatternPriority(parsed),
              });
              // Only add the highest priority match from each rule
              break;
            }
          }
        }

        if (candidates.length > 0) {
          // Sort candidates by priority (highest first), then by original rule order
          candidates.sort((a, b) => {
            if (a.priority !== b.priority) {
              return b.priority - a.priority; // Higher priority first
            }
            // If same priority, preserve original rule order
            return modelOverrideRules.indexOf(a.rule) - modelOverrideRules.indexOf(b.rule);
          });

          // Use the highest priority match
          const bestMatch = candidates[0];
          if (!bestMatch) {
            // Should never happen since candidates.length > 0
            return null;
          }
          return {
            route: {
              id: route.id,
              name: route.name,
              baseUrl: route.base_url,
              endpoint: route.endpoint || '/chat/completions',
              upstreamModel: bestMatch.rule.rewriteValue,
              upstreamApiKey: route.upstream_api_key,
              isActive: route.is_active === 1,
              overrides: overrides,
              priority: route.priority,
              requestFormat: inferredFormat,
              responseFormat: inferredFormat,
            },
            matchedRules: [bestMatch.rule],
            rewrittenModel: bestMatch.rule.rewriteValue,
          };
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
}

// Export singleton instance
export const routeMatcherService = new RouteMatcherService();
