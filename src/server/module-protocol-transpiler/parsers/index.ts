/**
 * Protocol Transpiler Parsers
 *
 * Exports all SSE parsers for converting vendor streaming formats to InternalStreamChunk.
 *
 * Supported parsers:
 * - OpenAISSEParser: OpenAI-compatible SSE format
 * - AnthropicSSEParser: Anthropic Claude SSE format
 * - GeminiSSEParser: Google Gemini SSE format
 */

// Base classes and types
export { BaseSSEParser } from './base-sse-parser';
export type { ISSEParser, SSEEvent } from './base-sse-parser';
export { VendorFormat } from './base-sse-parser';

// Vendor-specific parsers
export { OpenAISSEParser } from './openai-sse-parser';
export { AnthropicSSEParser } from './anthropic-sse-parser';
export { GeminiSSEParser } from './gemini-sse-parser';
