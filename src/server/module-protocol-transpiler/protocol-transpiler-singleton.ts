/**
 * Protocol Transpiler Singleton
 *
 * Global singleton instance of the ProtocolTranspiler with all converters registered.
 * This provides a single entry point for protocol conversion across the application.
 */

import { ProtocolTranspiler } from './core/protocol-transpiler';
import {
  OpenAIConverter,
  ResponsesConverter,
  AnthropicConverter,
  GeminiConverter,
} from './converters';

/**
 * Global ProtocolTranspiler instance with all format converters registered.
 *
 * Usage:
 * ```typescript
 * import { protocolTranspiler } from './module-protocol-transpiler/protocol-transpiler-singleton';
 *
 * // Convert OpenAI request to Anthropic format
 * const result = protocolTranspiler.transpile(openaiRequest, 'openai', 'anthropic');
 * if (result.success) {
 *   const anthropicRequest = result.data!;
 * }
 * ```
 */
export const protocolTranspiler = new ProtocolTranspiler();

// Register all available format converters with native implementations
protocolTranspiler.registerConverter(new OpenAIConverter());
protocolTranspiler.registerConverter(new ResponsesConverter() as any);
protocolTranspiler.registerConverter(new AnthropicConverter());
protocolTranspiler.registerConverter(new GeminiConverter());

/**
 * Get list of registered vendor types
 */
export function getRegisteredVendors(): string[] {
  return protocolTranspiler.listConverters();
}

/**
 * Check if a vendor is registered
 */
export function isVendorRegistered(vendor: string): boolean {
  return protocolTranspiler.hasConverter(vendor);
}

// Export the class for testing purposes
export { ProtocolTranspiler } from './core/protocol-transpiler';
