"use strict";
/**
 * Protocol Transpiler - Public API
 *
 * This module exports all public types and interfaces for the protocol transpiler.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatWarnings = exports.formatErrors = exports.hasWarnings = exports.hasErrors = exports.isSuccess = exports.mergeResults = exports.createWarning = exports.createError = exports.failure = exports.success = void 0;
// Utility functions
var transpile_result_1 = require("../core/transpile-result");
Object.defineProperty(exports, "success", { enumerable: true, get: function () { return transpile_result_1.success; } });
Object.defineProperty(exports, "failure", { enumerable: true, get: function () { return transpile_result_1.failure; } });
Object.defineProperty(exports, "createError", { enumerable: true, get: function () { return transpile_result_1.createError; } });
Object.defineProperty(exports, "createWarning", { enumerable: true, get: function () { return transpile_result_1.createWarning; } });
Object.defineProperty(exports, "mergeResults", { enumerable: true, get: function () { return transpile_result_1.mergeResults; } });
Object.defineProperty(exports, "isSuccess", { enumerable: true, get: function () { return transpile_result_1.isSuccess; } });
Object.defineProperty(exports, "hasErrors", { enumerable: true, get: function () { return transpile_result_1.hasErrors; } });
Object.defineProperty(exports, "hasWarnings", { enumerable: true, get: function () { return transpile_result_1.hasWarnings; } });
Object.defineProperty(exports, "formatErrors", { enumerable: true, get: function () { return transpile_result_1.formatErrors; } });
Object.defineProperty(exports, "formatWarnings", { enumerable: true, get: function () { return transpile_result_1.formatWarnings; } });
