/**
 * Wildcard Pattern Types
 */

export type WildcardPattern =
  | { type: 'exact'; value: string }           // Exact match: "gpt-3.5-turbo"
  | { type: 'wildcard-all'; value: '*' }      // Match all: "*"
  | { type: 'wildcard-prefix'; value: string; prefix: string };  // Prefix match: "gpt-*"

/**
 * Parse a wildcard pattern string into a structured type
 *
 * Examples:
 *   - "gpt-3.5-turbo"  -> { type: 'exact', value: 'gpt-3.5-turbo' }
 *   - "*"              -> { type: 'wildcard-all', value: '*' }
 *   - "gpt-*"          -> { type: 'wildcard-prefix', value: 'gpt-*', prefix: 'gpt-' }
 *   - "claude-*"       -> { type: 'wildcard-prefix', value: 'claude-*', prefix: 'claude-' }
 */
export function parseWildcardPattern(pattern: string): WildcardPattern {
  // Remove surrounding quotes if present (e.g., "*" -> *)
  let cleaned = pattern.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  if (cleaned === '*') {
    return { type: 'wildcard-all', value: '*' };
  }

  if (cleaned.endsWith('*')) {
    const prefix = cleaned.slice(0, -1);
    return { type: 'wildcard-prefix', value: cleaned, prefix };
  }

  return { type: 'exact', value: cleaned };
}

/**
 * Check if a value matches a wildcard pattern
 */
export function matchesWildcardPattern(value: string, pattern: WildcardPattern): boolean {
  const parsed = typeof pattern === 'string' ? parseWildcardPattern(pattern) : pattern;

  switch (parsed.type) {
    case 'wildcard-all':
      return true;
    case 'wildcard-prefix':
      return value.startsWith(parsed.prefix);
    case 'exact':
      return value === parsed.value;
  }
}

/**
 * Get input constraint based on wildcard pattern
 */
export interface InputConstraint {
  allowAny: boolean;           // Can input any value
  requirePrefix?: string;      // Must start with this prefix
  placeholder?: string;        // Suggested placeholder
  examples?: string[];         // Example values
}

export function getInputConstraint(pattern: WildcardPattern): InputConstraint {
  switch (pattern.type) {
    case 'wildcard-all':
      return {
        allowAny: true,
        placeholder: 'e.g. gpt-4, claude-3-opus, gemini-2.5-flash',
        examples: ['gpt-4', 'claude-3-opus', 'gemini-2.5-flash'],
      };

    case 'wildcard-prefix':
      return {
        allowAny: true,
        requirePrefix: pattern.prefix,
        placeholder: `e.g. ${pattern.prefix}4, ${pattern.prefix}3.5-turbo`,
        examples: [`${pattern.prefix}3.5-turbo`, `${pattern.prefix}4`, `${pattern.prefix}4-turbo`],
      };

    case 'exact':
      return {
        allowAny: false,
        placeholder: pattern.value,
        examples: [pattern.value],
      };
  }
}

/**
 * Filter a list of values by a wildcard pattern
 */
export function filterByWildcardPattern(values: string[], pattern: WildcardPattern): string[] {
  return values.filter(v => matchesWildcardPattern(v, pattern));
}

/**
 * Get all unique wildcard patterns from a list of patterns
 */
export function getUniquePatternTypes(patterns: string[]): WildcardPattern[] {
  const seen = new Set<string>();
  const result: WildcardPattern[] = [];

  for (const pattern of patterns) {
    const parsed = parseWildcardPattern(pattern);
    const key = parsed.type === 'wildcard-prefix' ? `prefix:${parsed.prefix}` : parsed.value;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(parsed);
    }
  }

  return result;
}

/**
 * Validate input against a wildcard pattern constraint
 */
export function validateInput(value: string, pattern: WildcardPattern): { valid: boolean; error?: string } {
  if (!value || !value.trim()) {
    return { valid: false, error: 'Value cannot be empty' };
  }

  const constraint = getInputConstraint(pattern);

  if (!constraint.allowAny) {
    // Must be exact match
    if (value !== pattern.value) {
      return { valid: false, error: `Must be exactly: ${pattern.value}` };
    }
  } else if (constraint.requirePrefix) {
    // Must start with prefix
    if (!value.startsWith(constraint.requirePrefix)) {
      return { valid: false, error: `Must start with: ${constraint.requirePrefix}` };
    }
  }

  return { valid: true };
}

/**
 * Format wildcard pattern for display
 */
export function formatWildcardPattern(pattern: WildcardPattern): string {
  switch (pattern.type) {
    case 'wildcard-all':
      return 'Any model (*)';
    case 'wildcard-prefix':
      return `Models starting with "${pattern.prefix}"`;
    case 'exact':
      return pattern.value;
  }
}
