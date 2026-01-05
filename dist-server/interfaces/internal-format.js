"use strict";
/**
 * Internal Format - Protocol Transpiler Intermediate Representation
 *
 * This module defines the internal format used as an intermediate representation
 * when converting between different LLM API protocols. The internal format is
 * based on OpenAI's API format as it serves as the de facto standard.
 *
 * Architecture:
 *   Vendor Format → Internal Format → Another Vendor Format
 *
 * Design Principles:
 * 1. Based on OpenAI format (most widely adopted)
 * 2. Extensible via index signatures
 * 3. Vendor-agnostic representation
 * 4. Supports all common LLM features
 */
Object.defineProperty(exports, "__esModule", { value: true });
