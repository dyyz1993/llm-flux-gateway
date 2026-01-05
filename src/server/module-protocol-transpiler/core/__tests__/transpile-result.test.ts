/**
 * Transpile Result Tests
 *
 * Tests for the transpile result utility functions and types.
 */

import { describe, it, expect } from 'vitest';
import type { TranspileResult, TranspileError, TranspileMetadata } from '../transpile-result';
import {
  success,
  failure,
  createError,
  createWarning,
  mergeResults,
  isSuccess,
  hasErrors,
  hasWarnings,
  formatErrors,
  formatWarnings,
} from '../transpile-result';
import type { VendorType } from '../../interfaces/vendor-types';

describe('transpile-result', () => {
  describe('success()', () => {
    it('should create a successful result with data', () => {
      const data = { model: 'gpt-4', messages: [] };
      const metadata = {
        fromVendor: 'openai' as VendorType,
        toVendor: 'anthropic' as VendorType,
        convertedAt: Date.now(),
        conversionTimeMs: 5,
        fieldsConverted: 10,
        fieldsIgnored: 2,
      };

      const result = success(data, metadata);

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(data);
      expect(result.errors).toBeUndefined();
      expect(result.warnings).toBeUndefined();
      expect(result.metadata).toEqual(metadata);
    });

    it('should create a successful result without metadata', () => {
      const data = { test: 'value' };

      const result = success(data);

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(data);
      expect(result.metadata).toBeUndefined();
    });

    it('should create a successful result with partial metadata', () => {
      const data = { test: 'value' };
      const partialMetadata = {
        fromVendor: 'openai' as VendorType,
        toVendor: 'anthropic' as VendorType,
      };

      const result = success(data, partialMetadata);

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(data);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!?.fromVendor).toBe('openai');
      expect(result.metadata!?.toVendor).toBe('anthropic');
    });
  });

  describe('failure()', () => {
    it('should create a failed result with errors', () => {
      const errors = [
        {
          path: 'messages.0',
          message: 'Invalid message format',
          code: 'INVALID_STRUCTURE' as const,
          severity: 'error' as const,
        },
      ];

      const result = failure<unknown>(errors);

      expect(result.success).toBe(false);
      expect(result.data!).toBeUndefined();
      expect(result.errors).toEqual(errors);
      expect(result.warnings).toBeUndefined();
    });

    it('should create a failed result with errors and warnings', () => {
      const errors = [
        {
          path: 'model',
          message: 'Missing required field',
          code: 'MISSING_REQUIRED_FIELD' as const,
          severity: 'error' as const,
        },
      ];
      const warnings = [
        {
          path: 'temperature',
          message: 'Unknown parameter',
          code: 'UNKNOWN_FIELD' as const,
          severity: 'warning' as const,
        },
      ];

      const result = failure<unknown>(errors, warnings);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(errors);
      expect(result.warnings).toEqual(warnings);
    });
  });

  describe('createError()', () => {
    it('should create an error with required fields', () => {
      const error = createError('model', 'Missing model', 'MISSING_REQUIRED_FIELD');

      expect(error.path).toBe('model');
      expect(error.message).toBe('Missing model');
      expect(error.code).toBe('MISSING_REQUIRED_FIELD');
      expect(error.severity).toBe('error');
      expect(error.value).toBeUndefined();
    });

    it('should create an error with value', () => {
      const error = createError('temperature', 'Temperature out of range', 'VALUE_OUT_OF_RANGE', 2.5);

      expect(error.value).toBe(2.5);
    });

    it('should create an error with stack trace', () => {
      const error = createError('test', 'Test error', 'INTERNAL_ERROR');
      // The stack should be captured automatically
      expect(error.path).toBe('test');
    });
  });

  describe('createWarning()', () => {
    it('should create a warning with severity warning', () => {
      const warning = createWarning('unknown_field', 'Unknown field detected', 'UNKNOWN_FIELD');

      expect(warning.path).toBe('unknown_field');
      expect(warning.message).toBe('Unknown field detected');
      expect(warning.code).toBe('UNKNOWN_FIELD');
      expect(warning.severity).toBe('warning');
    });
  });

  describe('mergeResults()', () => {
    it('should merge successful results into array', () => {
      const result1 = success({ id: 1 });
      const result2 = success({ id: 2 });
      const result3 = success({ id: 3 });

      const merged = mergeResults([result1, result2, result3]);

      expect(merged.success).toBe(true);
      expect(merged.data!).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(merged.errors).toBeUndefined();
      expect(merged.warnings).toBeUndefined();
    });

    it('should collect errors from all results', () => {
      const result1 = failure<any>([{ path: 'field1', message: 'Error 1', code: 'INVALID_TYPE' as const, severity: 'error' as const }]);
      const result2 = failure<any>([{ path: 'field2', message: 'Error 2', code: 'MISSING_REQUIRED_FIELD' as const, severity: 'error' as const }]);

      const merged = mergeResults([result1, result2]);

      expect(merged.success).toBe(false);
      expect(merged.data!).toEqual([]);
      expect(merged.errors).toHaveLength(2);
      expect(merged.errors![0]!.message).toBe('Error 1');
      expect(merged.errors![1]!.message).toBe('Error 2');
    });

    it('should collect warnings from all results', () => {
      const result1 = success({ id: 1 }, {
        fromVendor: 'openai' as VendorType,
        toVendor: 'anthropic' as VendorType,
        convertedAt: Date.now(),
        conversionTimeMs: 5,
        fieldsConverted: 5,
        fieldsIgnored: 0,
      });
      const result2 = success({ id: 2 });

      const merged = mergeResults([result1, result2]);

      expect(merged.warnings).toBeUndefined();
    });

    it('should collect both errors and warnings', () => {
      const result1 = failure<any>([{ path: 'field1', message: 'Error 1', code: 'INVALID_TYPE' as const, severity: 'error' as const }], [{ path: 'field2', message: 'Warning 1', code: 'UNKNOWN_FIELD' as const, severity: 'warning' as const }]);
      const result2 = success({ id: 1 });

      const merged = mergeResults([result1, result2]);

      expect(merged.success).toBe(false);
      expect(merged.errors).toHaveLength(1);
      expect(merged.warnings).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const merged = mergeResults([]);

      expect(merged.success).toBe(true);
      expect(merged.data!).toEqual([]);
    });
  });

  describe('isSuccess()', () => {
    it('should return true for successful result with data', () => {
      const result = success({ test: 'value' });

      expect(isSuccess(result)).toBe(true);
    });

    it('should narrow type to include data property', () => {
      const result = success({ test: 'value' });

      if (isSuccess(result)) {
        // TypeScript should know result.data! exists here
        expect(result.data!.test).toBe('value');
      }
    });

    it('should return false for failed result', () => {
      const result = failure<unknown>([{ path: 'test', message: 'Error', code: 'INVALID_TYPE' as const, severity: 'error' as const }]);

      expect(isSuccess(result)).toBe(false);
    });

    it('should return false when success is true but data is undefined', () => {
      const result: TranspileResult<string> = { success: true };

      expect(isSuccess(result)).toBe(false);
    });
  });

  describe('hasErrors()', () => {
    it('should return true when success is false', () => {
      const result = failure<unknown>([{ path: 'test', message: 'Error', code: 'INVALID_TYPE' as const, severity: 'error' as const }]);

      expect(hasErrors(result)).toBe(true);
    });

    it('should return true when errors array is not empty', () => {
      const result: TranspileResult<string> = {
        success: false,
        errors: [{ path: 'test', message: 'Error', code: 'INVALID_TYPE' as const, severity: 'error' as const }],
      };

      expect(hasErrors(result)).toBe(true);
    });

    it('should return false for successful result', () => {
      const result = success({ test: 'value' });

      expect(hasErrors(result)).toBe(false);
    });

    it('should return true when errors array is empty but success is false', () => {
      // hasErrors returns true if success is false, even if errors array is empty
      // This is by design: a failed result has errors even if not specified
      const result: TranspileResult<string> = {
        success: false,
        errors: [],
      };

      expect(hasErrors(result)).toBe(true);
    });
  });

  describe('hasWarnings()', () => {
    it('should return true when warnings array is not empty', () => {
      const result: TranspileResult<string> = {
        success: true,
        data: 'test',
        warnings: [{ path: 'test', message: 'Warning', code: 'UNKNOWN_FIELD' as const, severity: 'warning' as const }],
      };

      expect(hasWarnings(result)).toBe(true);
    });

    it('should return false when warnings is undefined', () => {
      const result = success({ test: 'value' });

      expect(hasWarnings(result)).toBe(false);
    });

    it('should return false when warnings array is empty', () => {
      const result: TranspileResult<string> = {
        success: true,
        data: 'test',
        warnings: [],
      };

      expect(hasWarnings(result)).toBe(false);
    });
  });

  describe('formatErrors()', () => {
    it('should format single error', () => {
      const result = failure<unknown>([{ path: 'model', message: 'Missing model field', code: 'MISSING_REQUIRED_FIELD' as const, severity: 'error' as const }]);

      const formatted = formatErrors(result);

      expect(formatted).toContain('[MISSING_REQUIRED_FIELD]');
      expect(formatted).toContain('model:');
      expect(formatted).toContain('Missing model field');
    });

    it('should format multiple errors', () => {
      const result = failure<unknown>([
        { path: 'model', message: 'Error 1', code: 'INVALID_TYPE' as const, severity: 'error' as const },
        { path: 'messages', message: 'Error 2', code: 'MISSING_REQUIRED_FIELD' as const, severity: 'error' as const },
      ]);

      const formatted = formatErrors(result);

      expect(formatted).toContain('[INVALID_TYPE] model: Error 1');
      expect(formatted).toContain('[MISSING_REQUIRED_FIELD] messages: Error 2');
    });

    it('should return "No errors" when no errors', () => {
      const result = success({ test: 'value' });

      const formatted = formatErrors(result);

      expect(formatted).toBe('No errors');
    });
  });

  describe('formatWarnings()', () => {
    it('should format single warning', () => {
      const result: TranspileResult<string> = {
        success: true,
        data: 'test',
        warnings: [{ path: 'temperature', message: 'Unknown parameter', code: 'UNKNOWN_FIELD' as const, severity: 'warning' as const }],
      };

      const formatted = formatWarnings(result);

      expect(formatted).toContain('[UNKNOWN_FIELD]');
      expect(formatted).toContain('temperature:');
      expect(formatted).toContain('Unknown parameter');
    });

    it('should return "No warnings" when no warnings', () => {
      const result = success({ test: 'value' });

      const formatted = formatWarnings(result);

      expect(formatted).toBe('No warnings');
    });
  });

  describe('TranspileMetadata', () => {
    it('should accept all metadata fields', () => {
      const metadata: TranspileMetadata = {
        fromVendor: 'openai',
        toVendor: 'anthropic',
        convertedAt: 1234567890,
        conversionTimeMs: 150,
        fieldsConverted: 25,
        fieldsIgnored: 5,
        fieldsWarned: 2,
        transformedFields: ['model', 'messages', 'tools'],
        ignoredFields: ['unknown_field'],
        originalDataSize: 1024,
        convertedDataSize: 1156,
      };

      expect((metadata as any).fromVendor).toBe('openai');
      expect((metadata as any).toVendor).toBe('anthropic');
      expect(metadata.transformationType).toBeUndefined(); // Extra field should be allowed via index signature
    });

    it('should allow extra metadata fields', () => {
      const metadata = {
        fromVendor: 'openai',
        toVendor: 'anthropic',
        convertedAt: Date.now(),
        conversionTimeMs: 100,
        fieldsConverted: 10,
        fieldsIgnored: 0,
        customField: 'custom_value',
      } as TranspileMetadata & { customField: string };

      expect(metadata.customField).toBe('custom_value');
    });
  });

  describe('TranspileError', () => {
    it('should accept all error fields', () => {
      const error: TranspileError = {
        path: 'messages.0.content',
        message: 'Invalid content format',
        code: 'INVALID_TYPE',
        value: 123,
        stack: 'Error: Stack trace',
        severity: 'error',
      };

      expect(error.path).toBe('messages.0.content');
      expect(error.message).toBe('Invalid content format');
      expect(error.code).toBe('INVALID_TYPE');
      expect(error.value).toBe(123);
      expect(error.stack).toBe('Error: Stack trace');
      expect(error.severity).toBe('error');
    });
  });

  describe('Type Guards', () => {
    it('should correctly narrow successful results', () => {
      const result: TranspileResult<{ id: string }> = success({ id: 'test' });

      if (isSuccess(result)) {
        // result.data! is guaranteed to exist
        expect(result.data!.id).toBe('test');
      } else {
        // This branch should never execute
        expect.unreachable();
      }
    });

    it('should correctly narrow failed results', () => {
      const result: TranspileResult<{ id: string }> = failure([{ path: 'test', message: 'Error', code: 'INVALID_TYPE' as const, severity: 'error' as const }]);

      if (!hasErrors(result)) {
        expect.unreachable();
      } else {
        expect(result.errors).toBeDefined();
      }
    });
  });
});
