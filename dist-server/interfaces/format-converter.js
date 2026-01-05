"use strict";
/**
 * Format Converter Interface
 *
 * Defines the contract for converting between different LLM API formats.
 * All converters use OpenAI format as the internal representation.
 *
 * Architecture:
 *   Vendor Format → Internal Format (OpenAI-based) → Another Vendor Format
 */
Object.defineProperty(exports, "__esModule", { value: true });
