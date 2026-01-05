"use strict";
/**
 * Transpile Result - Core Result Types
 *
 * This module defines result types used throughout the transpiler
 * for reporting success, errors, warnings, and metadata.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = success;
exports.failure = failure;
exports.createError = createError;
exports.createWarning = createWarning;
exports.mergeResults = mergeResults;
exports.isSuccess = isSuccess;
exports.hasErrors = hasErrors;
exports.hasWarnings = hasWarnings;
exports.formatErrors = formatErrors;
exports.formatWarnings = formatWarnings;
/**
 * Create a successful transpile result
 *
 * @param data - The converted data
 * @param metadata - Optional metadata
 * @returns Success result
 */
function success(data, metadata) {
    return {
        success: true,
        data: data,
        metadata: metadata,
    };
}
/**
 * Create a failed transpile result
 *
 * @param errors - Array of errors
 * @param warnings - Optional array of warnings
 * @returns Failure result
 */
function failure(errors, warnings) {
    return {
        success: false,
        errors: errors,
        warnings: warnings,
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
function createError(path, message, code, value) {
    return {
        path: path,
        message: message,
        code: code,
        value: value,
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
function createWarning(path, message, code, value) {
    return {
        path: path,
        message: message,
        code: code,
        value: value,
        severity: 'warning',
    };
}
/**
 * Merge multiple transpile results into one
 *
 * @param results - Array of transpile results
 * @returns Combined result
 */
function mergeResults(results) {
    var allErrors = [];
    var allWarnings = [];
    var successfulData = [];
    for (var _i = 0, results_1 = results; _i < results_1.length; _i++) {
        var result = results_1[_i];
        if (result.errors) {
            allErrors.push.apply(allErrors, result.errors);
        }
        if (result.warnings) {
            allWarnings.push.apply(allWarnings, result.warnings);
        }
        if (result.success && result.data !== undefined) {
            successfulData.push(result.data);
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
function isSuccess(result) {
    return result.success && result.data !== undefined;
}
/**
 * Check if a transpile result has errors
 *
 * @param result - Transpile result to check
 * @returns True if has errors
 */
function hasErrors(result) {
    return !result.success || (result.errors !== undefined && result.errors.length > 0);
}
/**
 * Check if a transpile result has warnings
 *
 * @param result - Transpile result to check
 * @returns True if has warnings
 */
function hasWarnings(result) {
    return result.warnings !== undefined && result.warnings.length > 0;
}
/**
 * Format errors for display
 *
 * @param result - Transpile result
 * @returns Formatted error string
 */
function formatErrors(result) {
    if (!hasErrors(result)) {
        return 'No errors';
    }
    return result.errors
        .map(function (err) { return "[".concat(err.code, "] ").concat(err.path, ": ").concat(err.message); })
        .join('\n');
}
/**
 * Format warnings for display
 *
 * @param result - Transpile result
 * @returns Formatted warning string
 */
function formatWarnings(result) {
    if (!hasWarnings(result)) {
        return 'No warnings';
    }
    return result.warnings
        .map(function (warn) { return "[".concat(warn.code, "] ").concat(warn.path, ": ").concat(warn.message); })
        .join('\n');
}
