export interface OverrideRule {
  field: string;
  matchValues: string[];
  rewriteValue: string;
}

export interface RewriteResult {
  originalRequest: Record<string, any>;
  rewrittenRequest: Record<string, any>;
  overwrittenAttributes: Record<string, { original: any; final: any }>;
}

/**
 * Rewrite Service
 *
 * Applies override rules to transform request attributes
 *
 * Architecture:
 * - Format conversion is handled by FormatConverterService
 * - No vendor-specific special handling needed
 * - All models (OpenAI/GLM/Anthropic/etc.) support standard formats
 */
export class RewriteService {
  /**
   * Apply override rules to a request
   */
  applyRules(
    request: Record<string, any>,
    rules: OverrideRule[]
  ): RewriteResult {
    const result = { ...request };
    const overwrittenAttributes: Record<string, { original: any; final: any }> = {};

    for (const rule of rules) {
      const originalValue = result[rule.field];

      // Check if the value matches any of the match values
      const isMatch = rule.matchValues.some((matchValue) => {
        // Handle wildcard - matches everything
        if (matchValue === '*') {
          return true;
        }

        // Handle different types of matching
        if (typeof matchValue === 'string' && typeof originalValue === 'string') {
          return originalValue === matchValue;
        }
        if (typeof matchValue === 'number' && typeof originalValue === 'number') {
          return originalValue === matchValue;
        }
        return false;
      });

      if (isMatch) {
        // Apply type coercion for the rewrite value
        const coercedValue = this.coerceType(rule.rewriteValue, originalValue);

        // Store the original value before overwriting
        overwrittenAttributes[rule.field] = {
          original: originalValue,
          final: coercedValue,
        };

        // Apply the rewrite
        result[rule.field] = coercedValue;
      }
    }

    return {
      originalRequest: request,
      rewrittenRequest: result,
      overwrittenAttributes,
    };
  }

  /**
   * Coerce the rewrite value to match the type of the reference value
   */
  private coerceType(value: string, reference: any): any {
    if (reference === null || reference === undefined) {
      return value;
    }

    // If reference is a number, convert to number
    if (typeof reference === 'number') {
      const num = parseFloat(value);
      return isNaN(num) ? value : num;
    }

    // If reference is a boolean, convert to boolean
    if (typeof reference === 'boolean') {
      return value === 'true' || value === '1';
    }

    // Default: return as string
    return value;
  }

  /**
   * Build the final request for upstream API
   *
   * Note: Format conversion (OpenAI ↔ Anthropic) is handled by FormatConverterService
   * No vendor-specific special handling needed here
   */
  buildUpstreamRequest(
    rewrittenRequest: Record<string, any>,
    route: {
      baseUrl: string;
      endpoint: string;
      upstreamModel: string;
    }
  ): { url: string; body: Record<string, any> } {
    const body = {
      ...rewrittenRequest,
      // Ensure model is set to the upstream model
      model: route.upstreamModel,
    };

    return {
      url: `${route.baseUrl}${route.endpoint}`,
      body,
    };
  }
}

// Export singleton instance
export const rewriteService = new RewriteService();
