/**
 * Protocol Transpiler - Core Class
 *
 * Provides unified protocol conversion between different LLM vendors.
 * Supports direct conversion: vendorA → vendorB (through InternalFormat)
 */

import type { InternalStreamChunk } from '../interfaces/internal-format';
import type { FormatConverter, VendorType } from '../interfaces';
import type { TranspileResult } from './transpile-result';
import { success, failure, createError } from './transpile-result';

/**
 * Protocol Transpiler - Main transpilation engine
 *
 * Provides unified API for converting between different LLM protocols.
 */
export class ProtocolTranspiler {
  /** Registered converters by vendor type */
  private converters = new Map<VendorType, FormatConverter>();

  /** Custom field mappings */
  private customMappings = new Map<string, Record<string, string>>();

  /**
   * Format aliases - maps vendor format to its canonical converter
   * GLM format uses OpenAI converter with special handling for mixed format
   */
  private static readonly FORMAT_ALIASES: Record<string, string> = {
    'glm': 'openai',
  };

  /**
   * Resolve vendor type to its canonical type (e.g., 'glm' → 'openai')
   */
  private resolveVendorType(vendor: VendorType): VendorType {
    return (ProtocolTranspiler.FORMAT_ALIASES[vendor] || vendor) as VendorType;
  }

  /**
   * Register a format converter
   *
   * @param converter - Format converter instance
   */
  registerConverter(converter: FormatConverter): void {
    this.converters.set(converter.vendorType, converter);
  }

  /**
   * Check if a converter is registered for the given vendor
   *
   * @param vendor - Vendor type to check
   * @returns True if converter exists
   */
  hasConverter(vendor: string): boolean {
    return this.converters.has(vendor as VendorType);
  }

  /**
   * Get list of all registered vendor types
   *
   * @returns Array of vendor type identifiers
   */
  listConverters(): string[] {
    return Array.from(this.converters.keys());
  }

  /**
   * Set custom field mapping
   *
   * @param mappingType - Type of mapping (request/response/streamChunk)
   * @param fromVendor - Source vendor
   * @param toVendor - Target vendor
   * @param customMap - Field mapping (source path → target path)
   */
  setCustomMapping(
    mappingType: 'request' | 'response' | 'streamChunk',
    fromVendor: string,
    toVendor: string,
    customMap: Record<string, string>
  ): void {
    const key = `${mappingType}:${fromVendor}:${toVendor}`;
    this.customMappings.set(key, customMap);
  }

  /**
   * Transpile request/response data between vendors
   *
   * @param sourceData - Source data (request or response)
   * @param fromVendor - Source vendor type
   * @param toVendor - Target vendor type
   * @returns Transpile result
   */
  transpile<T = unknown>(
    sourceData: unknown,
    fromVendor: VendorType,
    toVendor: VendorType
  ): TranspileResult<T> {
    const startTime = Date.now();

    // Resolve vendor type aliases (e.g., 'glm' → 'openai')
    const resolvedFromVendor = this.resolveVendorType(fromVendor);
    const resolvedToVendor = this.resolveVendorType(toVendor);

    // Fast path: if same vendor, return as-is (no conversion needed)
    // This handles cases where data is already in the correct format
    if (fromVendor === toVendor) {
      return success(sourceData as T, {
        fromVendor,
        toVendor,
        convertedAt: startTime,
        conversionTimeMs: 0,
        fieldsConverted: 0,
        fieldsIgnored: 0,
      });
    }

    // Get source converter
    const sourceConverter = this.converters.get(resolvedFromVendor);
    if (!sourceConverter) {
      return failure([createError(
        'root',
        `No converter registered for source vendor: ${fromVendor}`,
        'UNSUPPORTED_FEATURE'
      )]);
    }

    // Get target converter
    const targetConverter = this.converters.get(resolvedToVendor);
    if (!targetConverter) {
      return failure([createError(
        'root',
        `No converter registered for target vendor: ${toVendor}`,
        'UNSUPPORTED_FEATURE'
      )]);
    }

    try {
      // Detect if request or response
      const isRequest = this.isRequestData(sourceData);
      const isResponse = this.isResponseData(sourceData);

      let fieldsConverted = 0;
      let fieldsIgnored = 0;

      if (isRequest) {
        // Request conversion: source → Internal → target
        const internalResult = sourceConverter.convertRequestToInternal(sourceData);

        if (!internalResult.success) {
          return internalResult as TranspileResult<T>;
        }

        const targetResult = targetConverter.convertRequestFromInternal(internalResult.data!);

        if (!targetResult.success) {
          return targetResult as TranspileResult<T>;
        }

        fieldsConverted = (internalResult.metadata?.fieldsConverted || 0) +
                          (targetResult.metadata?.fieldsConverted || 0);
        fieldsIgnored = (internalResult.metadata?.fieldsIgnored || 0) +
                        (targetResult.metadata?.fieldsIgnored || 0);

        return success(targetResult.data! as T, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted,
          fieldsIgnored,
        });

      } else if (isResponse) {
        // Response conversion: source → Internal → target
        const internalResult = sourceConverter.convertResponseToInternal(sourceData);
        if (!internalResult.success) {
          return internalResult as TranspileResult<T>;
        }

        const targetResult = targetConverter.convertResponseFromInternal(internalResult.data!);
        if (!targetResult.success) {
          return targetResult as TranspileResult<T>;
        }

        fieldsConverted = (internalResult.metadata?.fieldsConverted || 0) +
                          (targetResult.metadata?.fieldsConverted || 0);
        fieldsIgnored = (internalResult.metadata?.fieldsIgnored || 0) +
                        (targetResult.metadata?.fieldsIgnored || 0);

        return success(targetResult.data! as T, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted,
          fieldsIgnored,
        });

      } else {
        // Unknown data type
        return failure([createError(
          'root',
          'Cannot determine if data is request or response',
          'INVALID_STRUCTURE',
          sourceData
        )]);
      }

    } catch (error) {
      return failure([createError(
        'root',
        error instanceof Error ? error.message : 'Unknown error during conversion',
        'INTERNAL_ERROR',
        error
      )]);
    }
  }

  /**
   * Transpile stream chunk
   *
   * @param sourceChunk - Source SSE chunk
   * @param fromVendor - Source vendor type
   * @param toVendor - Target vendor type
   * @returns Transpile result
   */
  transpileStreamChunk(
    sourceChunk: unknown,
    fromVendor: VendorType,
    toVendor: VendorType
  ): TranspileResult<InternalStreamChunk> {
    const startTime = Date.now();

    // Resolve vendor type aliases (e.g., 'glm' → 'openai')
    const resolvedFromVendor = this.resolveVendorType(fromVendor);
    const resolvedToVendor = this.resolveVendorType(toVendor);

    /**
     * Check if an object is a complete InternalStreamChunk with all required properties
     * This is used to detect when we can skip conversion (full internal format object)
     * vs when we need to convert (partial objects that need parsing)
     */
    function isCompleteInternalStreamChunk(obj: unknown): obj is InternalStreamChunk {
      if (typeof obj !== 'object' || obj === null) {
        return false;
      }

      const chunk = obj as Record<string, unknown>;

      // Check all required properties exist and have correct types
      return (
        typeof chunk.id === 'string' &&
        typeof chunk.object === 'string' &&
        typeof chunk.created === 'number' &&
        typeof chunk.model === 'string' &&
        Array.isArray(chunk.choices)
      );
    }

    // CRITICAL FIX: Even when fromVendor === toVendor, we must convert to InternalStreamChunk format!
    // The fast path was returning raw vendor format objects (e.g., Anthropic chunks with type:"message_start")
    // instead of converting to InternalStreamChunk format. This caused the gateway to fail when trying
    // to convert the chunks again, resulting in ALL chunks being skipped and empty responses.
    //
    // Now: Always use the proper conversion path through InternalStreamChunk format.
    // This ensures the gateway always receives properly formatted InternalStreamChunk objects.

    // Special case: if source is already a complete InternalStreamChunk object and target is OpenAI (internal format)
    // This happens when gateway wants to convert InternalStreamChunk back to SSE format
    if (resolvedFromVendor === 'openai' && resolvedToVendor === 'openai' && isCompleteInternalStreamChunk(sourceChunk)) {
      const internalChunk = sourceChunk as InternalStreamChunk;

      // Skip empty chunks
      if (!internalChunk || Object.keys(internalChunk).length === 0 || (internalChunk as any).__empty) {
        return success({ __empty: true } as InternalStreamChunk, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 0,
          fieldsIgnored: 1,
        });
      }

      // Convert internal format to SSE format string
      const targetConverter = this.converters.get(resolvedToVendor);
      if (targetConverter && targetConverter.convertStreamChunkFromInternal) {
        const targetResult = targetConverter.convertStreamChunkFromInternal(internalChunk);
        if (!targetResult.success) {
          return failure(targetResult.errors || [createError(
            'root',
            'Failed to convert internal chunk to SSE format',
            'CONVERSION_ERROR'
          )]);
        }
        // Return SSE string as InternalStreamChunk (type cast for compatibility)
        return success(targetResult.data! as unknown as InternalStreamChunk, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 1,
          fieldsIgnored: 0,
        });
      }

      // Fallback: return the internal chunk as-is
      return success(internalChunk, {
        fromVendor,
        toVendor,
        convertedAt: startTime,
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 0,
        fieldsIgnored: 0,
      });
    }

    // Get source converter
    const sourceConverter = this.converters.get(resolvedFromVendor);
    if (!sourceConverter || !sourceConverter.convertStreamChunkToInternal) {
      return failure([createError(
        'root',
        `Source vendor ${fromVendor} does not support streaming`,
        'UNSUPPORTED_FEATURE'
      )]);
    }

    // Get target converter
    const targetConverter = this.converters.get(resolvedToVendor);
    if (!targetConverter || !targetConverter.convertStreamChunkFromInternal) {
      return failure([createError(
        'root',
        `Target vendor ${toVendor} does not support streaming`,
        'UNSUPPORTED_FEATURE'
      )]);
    }

    try {
      // Special case: if source is OpenAI (internal format) and already a complete InternalStreamChunk object
      // This happens when upstreamService.parseStreamWith returns InternalStreamChunk objects
      // We check for completeness to avoid skipping conversion for partial objects
      if (resolvedFromVendor === 'openai' && isCompleteInternalStreamChunk(sourceChunk)) {
        // Source is already complete InternalStreamChunk - skip conversion
        const internalChunk = sourceChunk as InternalStreamChunk;

        // Skip empty chunks
        if (!internalChunk || Object.keys(internalChunk).length === 0) {
          return success({ __empty: true } as InternalStreamChunk, {
            fromVendor,
            toVendor,
            convertedAt: startTime,
            conversionTimeMs: Date.now() - startTime,
            fieldsConverted: 0,
            fieldsIgnored: 1,
          });
        }

        // Convert internal format to target vendor's SSE format
        // IMPORTANT: Always convert to SSE format (string), even for OpenAI→OpenAI
        // The gateway expects a string in SSE format ("data: {...}\n\n"), not an object
        const targetResult = targetConverter.convertStreamChunkFromInternal!(
          internalChunk
        );
        if (!targetResult.success) {
          return failure(targetResult.errors || [createError(
            'root',
            'Failed to convert internal chunk to target format',
            'CONVERSION_ERROR'
          )]);
        }
        // Return SSE string as InternalStreamChunk (type cast for compatibility)
        return success(targetResult.data! as unknown as InternalStreamChunk, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 1,
          fieldsIgnored: 0,
        });
      }

      // Normal case: source is a string (SSE or JSON)
      // Extract JSON data from SSE format if present
      let jsonData: unknown;
      if (typeof sourceChunk === 'string') {
        // Check if it's SSE format (contains "data:" or "event:" lines)
        const dataMatch = sourceChunk.match(/data:\s*(.+?)(?:\n\n|$)/s);
        if (dataMatch) {
          jsonData = dataMatch[1]!.trim();
        } else {
          // Not SSE format, treat as raw JSON
          jsonData = sourceChunk;
        }
      } else {
        jsonData = sourceChunk;
      }

      // Convert: source → Internal → target
      const internalResult = sourceConverter.convertStreamChunkToInternal(
        jsonData as string
      );
      if (!internalResult || !internalResult.success) {
        return failure(internalResult?.errors || [createError(
          'root',
          'Failed to convert source chunk to internal format',
          'CONVERSION_ERROR'
        )]);
      }

      // Skip internal→target if data is empty (some chunks have no content)
      // Empty objects are not valid chunks and should be filtered out
      if (!internalResult.data! || Object.keys(internalResult.data!).length === 0) {
        // Return a special "empty" result that callers can check
        return success({ __empty: true } as InternalStreamChunk, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 0,
          fieldsIgnored: 1,
        });
      }

      // Check if target is OpenAI (internal format)
      // If so, return the internal format directly without SSE conversion
      if (resolvedToVendor === 'openai') {
        // Return InternalStreamChunk object directly
        return success(internalResult.data!, {
          fromVendor,
          toVendor,
          convertedAt: startTime,
          conversionTimeMs: Date.now() - startTime,
          fieldsConverted: 1,
          fieldsIgnored: 0,
        });
      }

      // Convert to target vendor's SSE format (return as string)
      // The gateway expects SSE format strings for non-OpenAI formats
      const targetResult = targetConverter.convertStreamChunkFromInternal!(
        internalResult.data!
      );
      if (!targetResult.success) {
        return failure(targetResult.errors || [createError(
          'root',
          'Failed to convert internal chunk to target format',
          'CONVERSION_ERROR'
        )]);
      }

      // Return SSE string as InternalStreamChunk (type cast for compatibility)
      const finalResult = success(targetResult.data! as unknown as InternalStreamChunk, {
        fromVendor,
        toVendor,
        convertedAt: startTime,
        conversionTimeMs: Date.now() - startTime,
        fieldsConverted: 2,
        fieldsIgnored: 0,
      });

      return finalResult;

    } catch (error) {
      return failure([createError(
        'root',
        error instanceof Error ? error.message : 'Unknown error during stream conversion',
        'INTERNAL_ERROR',
        error
      )]);
    }
  }

  /**
   * Check if data is request format
   */
  private isRequestData(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;

    const obj = data as Record<string, unknown>;

    // Check for response indicators first (these take precedence)
    if ('choices' in obj && Array.isArray(obj.choices)) return false;
    if ('candidates' in obj && Array.isArray(obj.candidates)) return false;
    if ('id' in obj && 'object' in obj && 'created' in obj) return false;
    if ('usage' in obj) return false;

    // Common request indicators
    if ('messages' in obj && Array.isArray(obj.messages)) return true;
    if ('contents' in obj && Array.isArray(obj.contents)) return true;
    if ('model' in obj) return true;
    if ('prompt' in obj) return true;

    return false;
  }

  /**
   * Check if data is response format
   */
  private isResponseData(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;

    const obj = data as Record<string, unknown>;

    // Common response indicators
    if ('choices' in obj && Array.isArray(obj.choices)) return true;
    if ('content' in obj && 'role' in obj) return true;
    if ('candidates' in obj && Array.isArray(obj.candidates)) return true;
    if ('text' in obj) return true;

    return false;
  }

}

/**
 * Create a new ProtocolTranspiler instance
 */
export function createProtocolTranspiler(): ProtocolTranspiler {
  return new ProtocolTranspiler();
}

/**
 * Default singleton instance
 */
export const protocolTranspiler = new ProtocolTranspiler();
