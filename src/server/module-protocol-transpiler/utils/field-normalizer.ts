/**
 * Field Normalizer
 *
 * Normalizes field names between different naming conventions:
 * - camelCase: toolCalls, finishReason, maxTokens
 * - snake_case: tool_calls, finish_reason, max_tokens
 *
 * This ensures consistent field naming across the protocol transpiler.
 */

/**
 * Field mapping configuration for each vendor format
 */
interface FieldMapping {
  /** camelCase field name */
  camelCase: string;
  /** snake_case field name */
  snakeCase: string;
  /** Whether this field is nested in a specific path */
  nestedPath?: string;
}

/**
 * Comprehensive field mappings for all common LLM API fields
 * Reserved for future use - currently using dynamic normalization
 */
// @ts-expect-error - Reserved for future use
const _FIELD_MAPPINGS: Record<string, FieldMapping> = {
  // Tool call fields
  toolCalls: {
    camelCase: 'toolCalls',
    snakeCase: 'tool_calls',
  },
  toolCallId: {
    camelCase: 'toolCallId',
    snakeCase: 'tool_call_id',
  },
  // Finish reason
  finishReason: {
    camelCase: 'finishReason',
    snakeCase: 'finish_reason',
  },
  // Token fields
  maxTokens: {
    camelCase: 'maxTokens',
    snakeCase: 'max_tokens',
  },
  maxCompletionTokens: {
    camelCase: 'maxCompletionTokens',
    snakeCase: 'max_completion_tokens',
  },
  promptTokens: {
    camelCase: 'promptTokens',
    snakeCase: 'prompt_tokens',
  },
  completionTokens: {
    camelCase: 'completionTokens',
    snakeCase: 'completion_tokens',
  },
  totalTokens: {
    camelCase: 'totalTokens',
    snakeCase: 'total_tokens',
  },
  // Reasoning tokens
  reasoningTokens: {
    camelCase: 'reasoningTokens',
    snakeCase: 'reasoning_tokens',
  },
  // Cache tokens
  cachedTokens: {
    camelCase: 'cachedTokens',
    snakeCase: 'cached_tokens',
  },
  cacheReadTokens: {
    camelCase: 'cacheReadTokens',
    snakeCase: 'cache_read_tokens',
  },
  cacheWriteTokens: {
    camelCase: 'cacheWriteTokens',
    snakeCase: 'cache_write_tokens',
  },
  // System fingerprint
  systemFingerprint: {
    camelCase: 'systemFingerprint',
    snakeCase: 'system_fingerprint',
  },
  // Frequency penalty
  frequencyPenalty: {
    camelCase: 'frequencyPenalty',
    snakeCase: 'frequency_penalty',
  },
  // Presence penalty
  presencePenalty: {
    camelCase: 'presencePenalty',
    snakeCase: 'presence_penalty',
  },
  // Top P
  topP: {
    camelCase: 'topP',
    snakeCase: 'top_p',
  },
  // Top K
  topK: {
    camelCase: 'topK',
    snakeCase: 'top_k',
  },
  // Tool choice
  toolChoice: {
    camelCase: 'toolChoice',
    snakeCase: 'tool_choice',
  },
  // Extended thinking
  thinkingTokens: {
    camelCase: 'thinkingTokens',
    snakeCase: 'thinking_tokens',
  },
  cachedContentTokenCount: {
    camelCase: 'cachedContentTokenCount',
    snakeCase: 'cached_content_token_count',
  },
  thoughtsTokenCount: {
    camelCase: 'thoughtsTokenCount',
    snakeCase: 'thoughts_token_count',
  },
  // Cache control fields
  cacheControl: {
    camelCase: 'cacheControl',
    snakeCase: 'cache_control',
  },
  // Tool schema special fields (should NOT be normalized in tool schemas)
  // These are intentionally excluded from FIELD_MAPPINGS to preserve them in tool definitions
};

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Check if a string is camelCase
 */
export function isCamelCase(str: string): boolean {
  return /[A-Z]/.test(str) && !/_/.test(str);
}

/**
 * Check if a string is snake_case
 */
export function isSnakeCase(str: string): boolean {
  return /_/.test(str) && !/[A-Z]/.test(str);
}


/**
 * Normalize an object to internal format (camelCase)
 *
 * @param obj - Object to normalize
 * @param format - Source format ('openai', 'anthropic', 'gemini', 'glm')
 * @returns Object normalized to internal format
 */
export function normalizeToInternal(obj: any, _format: string): any {
  // All vendors use snake_case in their APIs
  // Internal format uses camelCase
  return normalizeToCamelCase(obj, true);
}

/**
 * Normalize an object from internal format (camelCase) to vendor format
 *
 * @param obj - Object in internal format
 * @param format - Target format ('openai', 'anthropic', 'gemini', 'glm')
 * @returns Object normalized to vendor format
 */
export function normalizeFromInternal(obj: any, _format: string): any {
  // All vendors expect snake_case in their APIs
  return normalizeToSnakeCase(obj, true);
}

/**
 * Get the snake_case version of a field name
 *
 * @param camelCaseField - Field name in camelCase
 * @returns Field name in snake_case
 */
export function getSnakeCaseName(camelCaseField: string): string {
  return camelToSnake(camelCaseField);
}

/**
 * Get the camelCase version of a field name
 *
 * @param snakeCaseField - Field name in snake_case
 * @returns Field name in camelCase
 */
export function getCamelCaseName(snakeCaseField: string): string {
  return snakeToCamel(snakeCaseField);
}

/**
 * Check if a path points to a tool schema properties object
 * Tool schema properties should NOT be normalized
 */
function isToolSchemaPath(path: string[]): boolean {
  if (path.length < 2) return false;

  // Check for paths like:
  // - tools[].function.parameters.properties
  // - tools[].input_schema.properties
  // - function.parameters.properties
  // - input_schema.properties
  const lastTwo = path.slice(-2);
  const lastThree = path.slice(-3);
  const lastFour = path.slice(-4);

  // Direct property check
  if (lastTwo[1] === 'properties') {
    // Check parent is parameters or input_schema
    if (lastTwo[0] === 'parameters' || lastTwo[0] === 'input_schema') {
      return true;
    }
  }

  // Nested in tools array
  if (lastThree[2] === 'properties') {
    if (lastThree[1] === 'parameters' || lastThree[1] === 'input_schema') {
      if (lastThree[0]?.startsWith('tools[')) {
        return true;
      }
    }
  }

  if (lastFour[3] === 'properties') {
    if (lastFour[2] === 'parameters' || lastFour[2] === 'input_schema') {
      if (lastFour[1] === 'function' && lastFour[0]?.startsWith('tools[')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a key is a JSON Schema standard field that should not be normalized
 * These fields should remain as-is in tool schemas
 */
function isJsonSchemaStandardField(key: string): boolean {
  const standardFields = [
    'additionalProperties',
    'additionalProperties',  // Already camelCase, but listing for clarity
    '$schema',
    '$id',
    '$ref',
    'definitions',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'enum',
    'const',
    'type',
    'format',
    'pattern',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'items',
    'required',
    'properties',
    'patternProperties',
    'additionalProperties',
    'dependencies',
    'propertyNames',
    'contains',
    'minContains',
    'maxContains',
    'if',
    'then',
    'else',
    'title',
    'description',
    'default',
    'examples',
    'readOnly',
    'writeOnly',
  ];
  return standardFields.includes(key);
}

/**
 * Check if the current path is inside a tool schema (parameters or input_schema)
 * Tool schemas and all their standard fields should not be normalized
 */
function isInToolSchema(path: string[], key: string): boolean {
  if (path.length < 1) return false;

  const last = path[path.length - 1];

  // Check if we're directly in parameters or input_schema
  if (last === 'parameters' || last === 'input_schema') {
    // If this key is a JSON Schema standard field, don't normalize
    if (isJsonSchemaStandardField(key)) {
      return true;
    }
  }

  // Check for nested paths like tools[].function.parameters or tools[].input_schema
  if (path.length >= 2) {
    const parent = path[path.length - 2];
    if (
      (last === 'parameters' || last === 'input_schema') &&
      (parent === 'function' || parent?.startsWith('tools[') || parent?.startsWith('[0]') || parent?.startsWith('[1]'))
    ) {
      // If this key is a JSON Schema standard field, don't normalize
      if (isJsonSchemaStandardField(key)) {
        return true;
      }
    }
  }

  // Check three levels deep: tools[].function.parameters
  if (path.length >= 3) {
    const grandParent = path[path.length - 2];
    const greatGrandParent = path[path.length - 3];
    if (
      (last === 'parameters' || last === 'input_schema') &&
      grandParent === 'function' &&
      (greatGrandParent?.startsWith('tools[') || greatGrandParent?.startsWith('[0]') || greatGrandParent?.startsWith('[1]'))
    ) {
      // If this key is a JSON Schema standard field, don't normalize
      if (isJsonSchemaStandardField(key)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Normalize field names in an object from snake_case to camelCase
 * with special handling for tool schemas
 *
 * @param obj - Object to normalize
 * @param deep - Whether to recursively normalize nested objects
 * @param path - Current path in the object (for detecting tool schemas)
 * @returns Object with camelCase field names
 */
export function normalizeToCamelCase(obj: any, deep: boolean = true, path: string[] = []): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (!deep) return obj;
    return obj.map((item, index) => normalizeToCamelCase(item, deep, [...path, `[${index}]`]));
  }

  // Handle primitive types
  if (typeof obj !== 'object') {
    return obj;
  }

  // Check if we're in a tool schema properties object
  const inToolSchema = isToolSchemaPath(path);

  const normalized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Don't normalize keys in tool schema properties or JSON Schema standard fields
    const inToolSchemaObject = isInToolSchema(path, key);
    const shouldSkipNormalization = inToolSchema || inToolSchemaObject;
    const normalizedKey = shouldSkipNormalization ? key : (isSnakeCase(key) ? snakeToCamel(key) : key);

    // Recursively normalize nested objects if deep is true
    if (deep && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      normalized[normalizedKey] = normalizeToCamelCase(value, deep, [...path, normalizedKey]);
    } else if (deep && Array.isArray(value)) {
      normalized[normalizedKey] = value.map((item: any, index: number) =>
        typeof item === 'object' && item !== null
          ? normalizeToCamelCase(item, deep, [...path, normalizedKey, `[${index}]`])
          : item
      );
    } else {
      normalized[normalizedKey] = value;
    }
  }

  return normalized;
}

/**
 * Normalize field names in an object from camelCase to snake_case
 * with special handling for tool schemas
 *
 * @param obj - Object to normalize
 * @param deep - Whether to recursively normalize nested objects
 * @param path - Current path in the object (for detecting tool schemas)
 * @returns Object with snake_case field names
 */
export function normalizeToSnakeCase(obj: any, deep: boolean = true, path: string[] = []): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (!deep) return obj;
    return obj.map((item, index) => normalizeToSnakeCase(item, deep, [...path, `[${index}]`]));
  }

  // Handle primitive types
  if (typeof obj !== 'object') {
    return obj;
  }

  // Check if we're in a tool schema properties object
  const inToolSchema = isToolSchemaPath(path);

  const normalized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Don't normalize keys in tool schema properties or JSON Schema standard fields
    const inToolSchemaObject = isInToolSchema(path, key);
    const shouldSkipNormalization = inToolSchema || inToolSchemaObject;
    const normalizedKey = shouldSkipNormalization ? key : (isCamelCase(key) ? camelToSnake(key) : key);

    // Recursively normalize nested objects if deep is true
    if (deep && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      normalized[normalizedKey] = normalizeToSnakeCase(value, deep, [...path, normalizedKey]);
    } else if (deep && Array.isArray(value)) {
      normalized[normalizedKey] = value.map((item: any, index: number) =>
        typeof item === 'object' && item !== null
          ? normalizeToSnakeCase(item, deep, [...path, normalizedKey, `[${index}]`])
          : item
      );
    } else {
      normalized[normalizedKey] = value;
    }
  }

  return normalized;
}
