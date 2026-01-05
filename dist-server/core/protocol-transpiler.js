"use strict";
/**
 * Protocol Transpiler - Core Class
 *
 * Provides unified protocol conversion between different LLM vendors.
 * Supports direct conversion: vendorA → vendorB (through InternalFormat)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.protocolTranspiler = exports.ProtocolTranspiler = void 0;
exports.createProtocolTranspiler = createProtocolTranspiler;
var transpile_result_1 = require("./transpile-result");
/**
 * Protocol Transpiler - Main transpilation engine
 *
 * Provides unified API for converting between different LLM protocols.
 */
var ProtocolTranspiler = /** @class */ (function () {
    function ProtocolTranspiler() {
        /** Registered converters by vendor type */
        this.converters = new Map();
        /** Custom field mappings */
        this.customMappings = new Map();
    }
    /**
     * Register a format converter
     *
     * @param converter - Format converter instance
     */
    ProtocolTranspiler.prototype.registerConverter = function (converter) {
        this.converters.set(converter.vendor, converter);
    };
    /**
     * Check if a converter is registered for the given vendor
     *
     * @param vendor - Vendor type to check
     * @returns True if converter exists
     */
    ProtocolTranspiler.prototype.hasConverter = function (vendor) {
        return this.converters.has(vendor);
    };
    /**
     * Get list of all registered vendor types
     *
     * @returns Array of vendor type identifiers
     */
    ProtocolTranspiler.prototype.listConverters = function () {
        return Array.from(this.converters.keys());
    };
    /**
     * Set custom field mapping
     *
     * @param mappingType - Type of mapping (request/response/streamChunk)
     * @param fromVendor - Source vendor
     * @param toVendor - Target vendor
     * @param customMap - Field mapping (source path → target path)
     */
    ProtocolTranspiler.prototype.setCustomMapping = function (mappingType, fromVendor, toVendor, customMap) {
        var key = "".concat(mappingType, ":").concat(fromVendor, ":").concat(toVendor);
        this.customMappings.set(key, customMap);
    };
    /**
     * Transpile request/response data between vendors
     *
     * @param sourceData - Source data (request or response)
     * @param fromVendor - Source vendor type
     * @param toVendor - Target vendor type
     * @returns Transpile result
     */
    ProtocolTranspiler.prototype.transpile = function (sourceData, fromVendor, toVendor) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var startTime = Date.now();
        // Fast path: same vendor
        if (fromVendor === toVendor) {
            return (0, transpile_result_1.success)(sourceData, {
                fromVendor: fromVendor,
                toVendor: toVendor,
                convertedAt: startTime,
                conversionTimeMs: 0,
                fieldsConverted: 0,
                fieldsIgnored: 0,
            });
        }
        // Get source converter
        var sourceConverter = this.converters.get(fromVendor);
        if (!sourceConverter) {
            return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', "No converter registered for source vendor: ".concat(fromVendor), 'UNSUPPORTED_FEATURE')]);
        }
        // Get target converter
        var targetConverter = this.converters.get(toVendor);
        if (!targetConverter) {
            return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', "No converter registered for target vendor: ".concat(toVendor), 'UNSUPPORTED_FEATURE')]);
        }
        try {
            // Detect if request or response
            var isRequest = this.isRequestData(sourceData);
            var isResponse = this.isResponseData(sourceData);
            var fieldsConverted = 0;
            var fieldsIgnored = 0;
            if (isRequest) {
                // Request conversion: source → Internal → target
                var internalResult = sourceConverter.convertRequestToInternal(sourceData);
                if (!internalResult.success) {
                    return internalResult;
                }
                var targetResult = targetConverter.convertRequestFromInternal(internalResult.data);
                if (!targetResult.success) {
                    return targetResult;
                }
                fieldsConverted = ((_a = internalResult.metadata) === null || _a === void 0 ? void 0 : _a.fieldsConverted) || 0 +
                    ((_b = targetResult.metadata) === null || _b === void 0 ? void 0 : _b.fieldsConverted) || 0;
                fieldsIgnored = ((_c = internalResult.metadata) === null || _c === void 0 ? void 0 : _c.fieldsIgnored) || 0 +
                    ((_d = targetResult.metadata) === null || _d === void 0 ? void 0 : _d.fieldsIgnored) || 0;
                return (0, transpile_result_1.success)(targetResult.data, {
                    fromVendor: fromVendor,
                    toVendor: toVendor,
                    convertedAt: startTime,
                    conversionTimeMs: Date.now() - startTime,
                    fieldsConverted: fieldsConverted,
                    fieldsIgnored: fieldsIgnored,
                });
            }
            else if (isResponse) {
                // Response conversion: source → Internal → target
                var internalResult = sourceConverter.convertResponseToInternal(sourceData);
                if (!internalResult.success) {
                    return internalResult;
                }
                var targetResult = targetConverter.convertResponseFromInternal(internalResult.data);
                if (!targetResult.success) {
                    return targetResult;
                }
                fieldsConverted = ((_e = internalResult.metadata) === null || _e === void 0 ? void 0 : _e.fieldsConverted) || 0 +
                    ((_f = targetResult.metadata) === null || _f === void 0 ? void 0 : _f.fieldsConverted) || 0;
                fieldsIgnored = ((_g = internalResult.metadata) === null || _g === void 0 ? void 0 : _g.fieldsIgnored) || 0 +
                    ((_h = targetResult.metadata) === null || _h === void 0 ? void 0 : _h.fieldsIgnored) || 0;
                return (0, transpile_result_1.success)(targetResult.data, {
                    fromVendor: fromVendor,
                    toVendor: toVendor,
                    convertedAt: startTime,
                    conversionTimeMs: Date.now() - startTime,
                    fieldsConverted: fieldsConverted,
                    fieldsIgnored: fieldsIgnored,
                });
            }
            else {
                // Unknown data type
                return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', 'Cannot determine if data is request or response', 'INVALID_STRUCTURE', sourceData)]);
            }
        }
        catch (error) {
            return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', error instanceof Error ? error.message : 'Unknown error during conversion', 'INTERNAL_ERROR', error)]);
        }
    };
    /**
     * Transpile stream chunk
     *
     * @param sourceChunk - Source SSE chunk
     * @param fromVendor - Source vendor type
     * @param toVendor - Target vendor type
     * @returns Transpile result
     */
    ProtocolTranspiler.prototype.transpileStreamChunk = function (sourceChunk, fromVendor, toVendor) {
        var startTime = Date.now();
        // Fast path: same vendor (parse and return)
        if (fromVendor === toVendor) {
            if (typeof sourceChunk === 'string') {
                try {
                    return (0, transpile_result_1.success)(JSON.parse(sourceChunk), {
                        fromVendor: fromVendor,
                        toVendor: toVendor,
                        convertedAt: startTime,
                        conversionTimeMs: 0,
                        fieldsConverted: 0,
                        fieldsIgnored: 0,
                    });
                }
                catch (_a) {
                    return (0, transpile_result_1.success)({}, {
                        fromVendor: fromVendor,
                        toVendor: toVendor,
                        convertedAt: startTime,
                        conversionTimeMs: 0,
                        fieldsConverted: 0,
                        fieldsIgnored: 0,
                    });
                }
            }
            return (0, transpile_result_1.success)(sourceChunk, {
                fromVendor: fromVendor,
                toVendor: toVendor,
                convertedAt: startTime,
                conversionTimeMs: 0,
                fieldsConverted: 0,
                fieldsIgnored: 0,
            });
        }
        // Get source converter
        var sourceConverter = this.converters.get(fromVendor);
        if (!sourceConverter || !sourceConverter.convertStreamChunkToInternal) {
            return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', "Source vendor ".concat(fromVendor, " does not support streaming"), 'UNSUPPORTED_FEATURE')]);
        }
        // Get target converter
        var targetConverter = this.converters.get(toVendor);
        if (!targetConverter || !targetConverter.convertStreamChunkFromInternal) {
            return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', "Target vendor ".concat(toVendor, " does not support streaming"), 'UNSUPPORTED_FEATURE')]);
        }
        try {
            // Convert: source → Internal → target
            var internalResult = sourceConverter.convertStreamChunkToInternal(sourceChunk);
            if (!internalResult || !internalResult.success) {
                return (0, transpile_result_1.failure)((internalResult === null || internalResult === void 0 ? void 0 : internalResult.errors) || [(0, transpile_result_1.createError)('root', 'Failed to convert source chunk to internal format', 'CONVERSION_ERROR')]);
            }
            // Skip internal→target if data is empty (some chunks have no content)
            // Empty objects are not valid chunks and should be filtered out
            if (!internalResult.data || Object.keys(internalResult.data).length === 0) {
                // Return a special "empty" result that callers can check
                return (0, transpile_result_1.success)({ __empty: true }, {
                    fromVendor: fromVendor,
                    toVendor: toVendor,
                    convertedAt: startTime,
                    conversionTimeMs: Date.now() - startTime,
                    fieldsConverted: 0,
                    fieldsIgnored: 1,
                });
            }
            // If target is OpenAI (internal format), return the internal format directly
            if (toVendor === 'openai') {
                return (0, transpile_result_1.success)(internalResult.data, {
                    fromVendor: fromVendor,
                    toVendor: toVendor,
                    convertedAt: startTime,
                    conversionTimeMs: Date.now() - startTime,
                    fieldsConverted: 1,
                    fieldsIgnored: 0,
                });
            }
            // If source is already internal format (fromVendor === 'openai'),
            // convert to target vendor's SSE format
            if (fromVendor === 'openai') {
                var targetResult_1 = targetConverter.convertStreamChunkFromInternal(internalResult.data);
                if (!targetResult_1.success) {
                    return (0, transpile_result_1.failure)(targetResult_1.errors || [(0, transpile_result_1.createError)('root', 'Failed to convert internal chunk to target format', 'CONVERSION_ERROR')]);
                }
                // Return SSE string as InternalStreamChunk (type cast for compatibility)
                return (0, transpile_result_1.success)(targetResult_1.data, {
                    fromVendor: fromVendor,
                    toVendor: toVendor,
                    convertedAt: startTime,
                    conversionTimeMs: Date.now() - startTime,
                    fieldsConverted: 2,
                    fieldsIgnored: 0,
                });
            }
            // Otherwise convert to target vendor's SSE format (return as string)
            var targetResult = targetConverter.convertStreamChunkFromInternal(internalResult.data);
            if (!targetResult.success) {
                return (0, transpile_result_1.failure)(targetResult.errors || [(0, transpile_result_1.createError)('root', 'Failed to convert internal chunk to target format', 'CONVERSION_ERROR')]);
            }
            // Return SSE string as-is (type cast to satisfy return type)
            return (0, transpile_result_1.success)(targetResult.data, {
                fromVendor: fromVendor,
                toVendor: toVendor,
                convertedAt: startTime,
                conversionTimeMs: Date.now() - startTime,
                fieldsConverted: 2,
                fieldsIgnored: 0,
            });
        }
        catch (error) {
            return (0, transpile_result_1.failure)([(0, transpile_result_1.createError)('root', error instanceof Error ? error.message : 'Unknown error during stream conversion', 'INTERNAL_ERROR', error)]);
        }
    };
    /**
     * Check if data is request format
     */
    ProtocolTranspiler.prototype.isRequestData = function (data) {
        if (!data || typeof data !== 'object')
            return false;
        var obj = data;
        // Check for response indicators first (these take precedence)
        if ('choices' in obj && Array.isArray(obj.choices))
            return false;
        if ('candidates' in obj && Array.isArray(obj.candidates))
            return false;
        if ('id' in obj && 'object' in obj && 'created' in obj)
            return false;
        if ('usage' in obj)
            return false;
        // Common request indicators
        if ('messages' in obj && Array.isArray(obj.messages))
            return true;
        if ('contents' in obj && Array.isArray(obj.contents))
            return true;
        if ('model' in obj)
            return true;
        if ('prompt' in obj)
            return true;
        return false;
    };
    /**
     * Check if data is response format
     */
    ProtocolTranspiler.prototype.isResponseData = function (data) {
        if (!data || typeof data !== 'object')
            return false;
        var obj = data;
        // Common response indicators
        if ('choices' in obj && Array.isArray(obj.choices))
            return true;
        if ('content' in obj && 'role' in obj)
            return true;
        if ('candidates' in obj && Array.isArray(obj.candidates))
            return true;
        if ('text' in obj)
            return true;
        return false;
    };
    return ProtocolTranspiler;
}());
exports.ProtocolTranspiler = ProtocolTranspiler;
/**
 * Create a new ProtocolTranspiler instance
 */
function createProtocolTranspiler() {
    return new ProtocolTranspiler();
}
/**
 * Default singleton instance
 */
exports.protocolTranspiler = new ProtocolTranspiler();
