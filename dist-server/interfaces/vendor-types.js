"use strict";
/**
 * Vendor Types - Protocol Transpiler Vendor Configuration
 *
 * This module defines types for configuring and identifying different LLM API vendors.
 * Each vendor has a unique format, endpoint structure, and special features.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiFormat = void 0;
/**
 * API Format enumeration for Gateway routing
 *
 * Maps HTTP endpoint paths to protocol formats.
 */
var ApiFormat;
(function (ApiFormat) {
    /** OpenAI Chat Completions API - /v1/chat/completions */
    ApiFormat["OPENAI"] = "openai";
    /** OpenAI Responses API - /v1/responses */
    ApiFormat["OPENAI_RESPONSES"] = "openai-responses";
    /** Anthropic Messages API - /v1/messages */
    ApiFormat["ANTHROPIC"] = "anthropic";
    /** Google Gemini API - /v1/models/:model:generateContent */
    ApiFormat["GEMINI"] = "gemini";
})(ApiFormat || (exports.ApiFormat = ApiFormat = {}));
