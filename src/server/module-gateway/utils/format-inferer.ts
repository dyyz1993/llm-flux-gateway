import { ApiFormat } from '../../module-protocol-transpiler';

/**
 * Vendor Template interface for format inference
 */
export interface VendorTemplateForInference {
  baseUrl: string;
  endpoint: string;
}

/**
 * Infer API format from vendor template
 *
 * Rules:
 * 1. Anthropic: endpoint is /messages OR baseUrl contains 'anthropic'
 * 2. GLM/Zhipu: baseUrl contains 'bigmodel' or 'zhipu'
 * 3. Gemini: endpoint contains 'generateContent' or baseUrl contains 'generativelanguage'
 * 4. OpenAI: endpoint is /chat/completions (default)
 * 5. Default: OpenAI
 */
export function inferFormatFromVendorTemplate(
  vendor: VendorTemplateForInference
): ApiFormat {
  const { baseUrl, endpoint } = vendor;
  const lowerBaseUrl = baseUrl.toLowerCase();
  const lowerEndpoint = endpoint.toLowerCase();

  // Check for Anthropic format
  // Anthropic uses /messages endpoint
  if (lowerEndpoint === '/messages' || lowerBaseUrl.includes('anthropic')) {
    return ApiFormat.ANTHROPIC;
  }

  // Check for GLM/Zhipu format
  // GLM uses OpenAI-compatible /chat/completions but returns mixed format
  // We need to detect this early to handle special cases
  if (lowerBaseUrl.includes('bigmodel') || lowerBaseUrl.includes('zhipu')) {
    return 'glm' as ApiFormat;  // GLM format (OpenAI-compatible with mixed field names)
  }

  // Check for Gemini format
  // Gemini uses /generateContent or similar endpoints
  if (
    lowerEndpoint.includes('generatecontent') ||
    lowerBaseUrl.includes('generativelanguage') ||
    lowerBaseUrl.includes('googleapis')
  ) {
    return ApiFormat.GEMINI;
  }

  // Default to OpenAI format
  // Most vendors use OpenAI-compatible /chat/completions endpoint
  return ApiFormat.OPENAI;
}

/**
 * Get format name from ApiFormat enum
 */
export function getFormatName(format: ApiFormat | string): string {
  if (typeof format === 'string') {
    if (format === 'glm') return 'glm';
    return format;
  }

  switch (format) {
    case ApiFormat.OPENAI:
      return 'openai';
    case ApiFormat.OPENAI_RESPONSES:
      return 'openai-responses';
    case ApiFormat.ANTHROPIC:
      return 'anthropic';
    case ApiFormat.GEMINI:
      return 'gemini';
    default:
      if ((format as unknown) === 'glm') return 'glm';
      return 'openai';
  }
}

/**
 * Get ApiFormat from string name
 */
export function parseFormatName(formatName: string): ApiFormat | string {
  switch (formatName) {
    case 'openai':
      return ApiFormat.OPENAI;
    case 'openai-responses':
      return ApiFormat.OPENAI_RESPONSES;
    case 'anthropic':
      return ApiFormat.ANTHROPIC;
    case 'gemini':
      return ApiFormat.GEMINI;
    case 'glm':
      return 'glm';  // GLM format
    default:
      return ApiFormat.OPENAI;
  }
}
