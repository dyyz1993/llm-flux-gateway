/**
 * Transpile Result - Core Result Types
 *
 * This module defines result types used throughout the transpiler
 * for reporting success, errors, warnings, and metadata.
 */

import type { VendorType } from '../interfaces/vendor-types';

/**
 * Transpile result - the standard return type for all transpilation operations
 *
 * This result type provides comprehensive information about the operation:
 * - Success/failure status
 * - Converted data (if successful)
 * - Errors and warnings
 * - Performance metadata
 */
export interface TranspileResult<T> {
  /** Whether the transpilation was successful */
  success: boolean;

  /** Converted data (if successful) */
  data?: T;

  /** Errors encountered during transpilation */
  errors?: TranspileError[];

  /** Warnings encountered during transpilation */
  warnings?: TranspileError[];

  /** Metadata about the transpilation process */
  metadata?: TranspileMetadata;
}

/**
 * Transpile error with detailed context
 *
 * Errors include full context for debugging:
 * - Path to the error location
 * - Human-readable message
 * - Error code for categorization
 * - Original value that caused the error
 */
export interface TranspileError {
  /** JSON path to the error location (e.g., 'messages.0.content') */
  path: string;

  /** Human-readable error message */
  message: string;

  /** Error code for categorization */
  code: TranspileErrorCode;

  /** Original value that caused the error */
  value?: unknown;

  /** Stack trace (for debugging) */
  stack?: string;

  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Standard error codes for transpilation failures
 *
 * These codes help categorize and handle different types of errors.
 */
export type TranspileErrorCode =
  // Field errors
  | 'MISSING_REQUIRED_FIELD'
  | 'UNKNOWN_FIELD'
  | 'INVALID_FIELD'

  // Type errors
  | 'INVALID_TYPE'
  | 'TYPE_MISMATCH'
  | 'UNEXPECTED_NULL'

  // Value errors
  | 'INVALID_VALUE'
  | 'VALUE_OUT_OF_RANGE'
  | 'INVALID_ENUM_VALUE'

  // Structure errors
  | 'INVALID_STRUCTURE'
  | 'MALFORMED_DATA'
  | 'EMPTY_ARRAY'

  // Feature errors
  | 'UNSUPPORTED_FEATURE'
  | 'FEATURE_NOT_AVAILABLE'
  | 'VENDOR_MISMATCH'

  // Tool/Function errors
  | 'INVALID_TOOL_DEFINITION'
  | 'INVALID_TOOL_CALL'
  | 'TOOL_PARAMETERS_ERROR'

  // Message errors
  | 'INVALID_MESSAGE'
  | 'INVALID_MESSAGE_ROLE'
  | 'INVALID_CONTENT_BLOCK'

  // Parse errors
  | 'PARSE_ERROR'
  | 'JSON_PARSE_ERROR'
  | 'INVALID_JSON'

  // Validation errors
  | 'VALIDATION_FAILED'
  | 'SCHEMA_VALIDATION_FAILED'

  // General errors
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR'
  | 'CONVERSION_ERROR';

/**
 * Transpile metadata - information about the transpilation process
 *
 * This metadata helps with:
 * - Debugging conversion issues
 * - Performance monitoring
 * - Analytics and logging
 */
export interface TranspileMetadata {
  /** Source vendor format */
  fromVendor: VendorType;

  /** Target vendor format */
  toVendor: VendorType;

  /** Timestamp when transpilation was performed */
  convertedAt: number;

  /** Time taken for transpilation (milliseconds) */
  conversionTimeMs: number;

  /** Number of fields that were successfully converted */
  fieldsConverted: number;

  /** Number of fields that were ignored (not supported) */
  fieldsIgnored: number;

  /** Number of fields that triggered warnings */
  fieldsWarned: number;

  /** Fields that were transformed or mapped */
  transformedFields?: string[];

  /** Fields that were ignored (not supported) */
  ignoredFields?: string[];

  /** Original data size (bytes, if available) */
  originalDataSize?: number;

  /** Converted data size (bytes, if available) */
  convertedDataSize?: number;

  /** Additional vendor-specific metadata */
  [key: string]: unknown;
}

/**
 * Create a successful transpile result
 *
 * @param data - The converted data
 * @param metadata - Optional metadata
 * @returns Success result
 */
export function success<T>(
  data: T,
  metadata?: Partial<TranspileMetadata>
): TranspileResult<T> {
  return {
    success: true,
    data,
    metadata: metadata as TranspileMetadata,
  };
}

/**
 * Create a failed transpile result
 *
 * @param errors - Array of errors
 * @param warnings - Optional array of warnings
 * @returns Failure result
 */
export function failure<T>(
  errors: TranspileError[],
  warnings?: TranspileError[]
): TranspileResult<T> {
  return {
    success: false,
    errors,
    warnings,
  };
}

/**
 * Create a transpile error
 *
 * @param path - JSON path to error location
 * @param message - Error message
 * @param code - Error code
 * @param value - Original value (optional)
 * @returns Transpile error object
 */
export function createError(
  path: string,
  message: string,
  code: TranspileErrorCode,
  value?: unknown
): TranspileError {
  return {
    path,
    message,
    code,
    value,
    severity: 'error',
  };
}

/**
 * Create a transpile warning
 *
 * @param path - JSON path to warning location
 * @param message - Warning message
 * @param code - Warning code
 * @param value - Original value (optional)
 * @returns Transpile error object with warning severity
 */
export function createWarning(
  path: string,
  message: string,
  code: TranspileErrorCode,
  value?: unknown
): TranspileError {
  return {
    path,
    message,
    code,
    value,
    severity: 'warning',
  };
}

/**
 * Merge multiple transpile results into one
 *
 * @param results - Array of transpile results
 * @returns Combined result
 */
export function mergeResults<T>(
  results: TranspileResult<T>[]
): TranspileResult<T[]> {
  const allErrors: TranspileError[] = [];
  const allWarnings: TranspileError[] = [];
  const successfulData: T[] = [];

  for (const result of results) {
    if (result.errors) {
      allErrors.push(...result.errors);
    }
    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
    if (result.success && result.data !== undefined) {
      successfulData.push(result.data!);
    }
  }

  return {
    success: allErrors.length === 0,
    data: successfulData,
    errors: allErrors.length > 0 ? allErrors : undefined,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

/**
 * Check if a transpile result is successful
 *
 * @param result - Transpile result to check
 * @returns True if successful
 */
export function isSuccess<T>(result: TranspileResult<T>): result is TranspileResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Check if a transpile result has errors
 *
 * @param result - Transpile result to check
 * @returns True if has errors
 */
export function hasErrors<T>(result: TranspileResult<T>): boolean {
  return !result.success || (result.errors !== undefined && result.errors.length > 0);
}

/**
 * Check if a transpile result has warnings
 *
 * @param result - Transpile result to check
 * @returns True if has warnings
 */
export function hasWarnings<T>(result: TranspileResult<T>): boolean {
  return result.warnings !== undefined && result.warnings.length > 0;
}

/**
 * Format errors for display
 *
 * @param result - Transpile result
 * @returns Formatted error string
 */
export function formatErrors<T>(result: TranspileResult<T>): string {
  if (!hasErrors(result)) {
    return 'No errors';
  }

  return result.errors!
    .map(err => `[${err.code}] ${err.path}: ${err.message}`)
    .join('\n');
}

/**
 * Format warnings for display
 *
 * @param result - Transpile result
 * @returns Formatted warning string
 */
export function formatWarnings<T>(result: TranspileResult<T>): string {
  if (!hasWarnings(result)) {
    return 'No warnings';
  }

  return result.warnings!
    .map(warn => `[${warn.code}] ${warn.path}: ${warn.message}`)
    .join('\n');
}

/**
 * Conversion options for transpilation operations
 */
export interface ConversionOptions {
  /** Whether to enable strict mode (fail on warnings) */
  strict?: boolean;

  /** Whether to preserve vendor-specific fields */
  preserveVendorFields?: boolean;

  /** Custom field mappings */
  fieldMappings?: Record<string, string>;

  /** Maximum depth for nested object conversion */
  maxDepth?: number;
}
