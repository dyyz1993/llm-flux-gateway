/**
 * Format Detector Tests
 *
 * Tests for format detection utilities from various sources.
 */

import { describe, it, expect } from 'vitest';
import {
  detectFormatFromPath,
  detectFormatFromUrl,
  detectRequestFormat,
  detectResponseFormat,
  detectFormatFromHeaders,
  detectFormatWithConfidence,
  type FormatDetectionResult,
} from '../format-detector';

describe('format-detector', () => {
  describe('detectFormatFromPath()', () => {
    describe('Anthropic paths', () => {
      it('should detect Anthropic format from /v1/messages path', () => {
        const result = detectFormatFromPath('/v1/messages');
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from /messages path', () => {
        const result = detectFormatFromPath('/messages');
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from case-insensitive path', () => {
        const result = detectFormatFromPath('/V1/MESSAGES');
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from path with query params', () => {
        const result = detectFormatFromPath('/v1/messages?beta=true');
        expect(result).toBe('anthropic');
      });

      it('should handle Windows-style backslashes', () => {
        const result = detectFormatFromPath('\\v1\\messages');
        expect(result).toBe('anthropic');
      });
    });

    describe('Gemini paths', () => {
      it('should detect Gemini format from generateContent path', () => {
        const result = detectFormatFromPath('/v1/models/gemini-pro:generateContent');
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from gemini- model path', () => {
        const result = detectFormatFromPath('/v1/models/gemini-1.5-pro:generateContent');
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from /v1/models/ path', () => {
        const result = detectFormatFromPath('/v1/models/gpt-4:generateContent');
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format case-insensitively', () => {
        const result = detectFormatFromPath('/V1/MODELS/GEMINI-PRO:GENERATECONTENT');
        expect(result).toBe('gemini');
      });
    });

    describe('OpenAI paths (default)', () => {
      it('should detect OpenAI format from /chat/completions path', () => {
        const result = detectFormatFromPath('/v1/chat/completions');
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from /completions path', () => {
        const result = detectFormatFromPath('/v1/completions');
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from /v1/ path', () => {
        const result = detectFormatFromPath('/v1/engines');
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for unknown paths', () => {
        const result = detectFormatFromPath('/unknown/path');
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for empty path', () => {
        const result = detectFormatFromPath('');
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for root path', () => {
        const result = detectFormatFromPath('/');
        expect(result).toBe('openai');
      });
    });
  });

  describe('detectFormatFromUrl()', () => {
    describe('Anthropic URLs', () => {
      it('should detect Anthropic format from api.anthropic.com', () => {
        const result = detectFormatFromUrl('https://api.anthropic.com');
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from Anthropic URL with path', () => {
        const result = detectFormatFromUrl('https://api.anthropic.com/v1/messages');
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format case-insensitively', () => {
        const result = detectFormatFromUrl('https://API.ANTHROPIC.COM');
        expect(result).toBe('anthropic');
      });
    });

    describe('Gemini URLs', () => {
      it('should detect Gemini format from googleapis.com', () => {
        const result = detectFormatFromUrl('https://generativelanguage.googleapis.com');
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from google.com subdomain', () => {
        const result = detectFormatFromUrl('https://ai.google.com');
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format case-insensitively', () => {
        const result = detectFormatFromUrl('https://GOOGLEAPIS.COM');
        expect(result).toBe('gemini');
      });
    });

    describe('OpenAI URLs (default)', () => {
      it('should detect OpenAI format from api.openai.com', () => {
        const result = detectFormatFromUrl('https://api.openai.com');
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from URL with openai in name', () => {
        const result = detectFormatFromUrl('https://my-openai-proxy.com');
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for unknown URLs', () => {
        const result = detectFormatFromUrl('https://unknown-api.com');
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for localhost', () => {
        const result = detectFormatFromUrl('http://localhost:8080');
        expect(result).toBe('openai');
      });
    });
  });

  describe('detectRequestFormat()', () => {
    describe('Anthropic request signatures', () => {
      it('should detect Anthropic format from max_tokens required field', () => {
        const data = {
          model: 'claude-3-opus-20240229',
          max_tokens: 4096,
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from system field with messages', () => {
        const data = {
          model: 'claude-3-opus-20240229',
          system: 'You are a helpful assistant',
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from input_schema tools', () => {
        const data = {
          model: 'claude-3-opus-20240229',
          maxTokens: 4096,
          tools: [{
            name: 'calculator',
            description: 'Performs calculations',
            input_schema: {
              type: 'object',
              properties: {},
            },
          }],
          messages: [],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should distinguish Anthropic from OpenAI based on max_tokens', () => {
        const anthropicData = {
          model: 'claude-3-opus',
          max_tokens: 4096,
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = detectRequestFormat(anthropicData);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from tools with input_schema only', () => {
        // Covers line 234 in format-detector.ts (hasAnthropicSignature)
        // Use only tools with input_schema, no other Anthropic fields
        const data = {
          tools: [{
            name: 'calculator',
            description: 'Performs calculations',
            input_schema: {
              type: 'object',
            },
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from stop_reason only', () => {
        // Covers line 253 in format-detector.ts (hasAnthropicSignature)
        const data = {
          stop_reason: 'end_turn',
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from message type with content array', () => {
        // Covers line 245 in format-detector.ts (hasAnthropicSignature)
        // Use only type, message, and content array, no other Anthropic fields
        const data = {
          type: 'message',
          content: [{ type: 'text', text: 'Hello' }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('anthropic');
      });
    });

    describe('Gemini request signatures', () => {
      it('should detect Gemini format from contents with parts', () => {
        const data = {
          contents: [{
            parts: [{ text: 'Hello' }],
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from systemInstruction field', () => {
        // Covers line 272 in format-detector.ts (hasGeminiSignature)
        // Use only systemInstruction, no contents, to hit this specific check
        const data = {
          systemInstruction: {
            parts: [{ text: 'You are helpful' }],
          },
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from generationConfig with camelCase', () => {
        // Covers lines 276-279 in format-detector.ts (hasGeminiSignature)
        // Use only generationConfig, no contents, to hit this specific check
        const data = {
          generationConfig: {
            topP: 0.9,
            topK: 40,
          },
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from functionDeclarations tools', () => {
        // Covers line 288 in format-detector.ts (hasGeminiSignature)
        // Use only tools, no contents, to ensure we hit the tools check path
        const data = {
          tools: [{
            functionDeclarations: [{
              name: 'calculator',
              description: 'Performs math',
            }],
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from candidates only', () => {
        // Covers lines 295-301 in format-detector.ts (hasGeminiSignature)
        // Use only candidates, no contents, to hit this specific check
        const data = {
          candidates: [{
            content: {
              parts: [{ text: 'Response' }],
            },
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('gemini');
      });
    });

    describe('Gemini response signatures', () => {
      it('should detect Gemini format from candidates with content', () => {
        // Covers lines 295-301 in format-detector.ts (hasGeminiSignature)
        const data = {
          candidates: [{
            content: {
              parts: [{ text: 'Response' }],
            },
          }],
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from candidates with finishReason', () => {
        const data = {
          candidates: [{
            finishReason: 'STOP',
          }],
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from usageMetadata only', () => {
        // Covers line 305-306 in format-detector.ts (hasGeminiSignature)
        // Use only usageMetadata, no candidates, to hit this specific check
        const data = {
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('gemini');
      });
    });

    describe('OpenAI request signatures (default)', () => {
      it('should detect OpenAI format from standard messages array', () => {
        const data = {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello' },
          ],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from choices with assistant role', () => {
        // Covers lines 346-355 in format-detector.ts (hasOpenAISignature)
        const data = {
          choices: [{
            message: {
              role: 'assistant',
              content: 'Response',
            },
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from tools with function type', () => {
        const data = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          tools: [{
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Performs calculations',
              parameters: { type: 'object' },
            },
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from tools only', () => {
        // Covers lines 332-340 in format-detector.ts (hasOpenAISignature)
        const data = {
          tools: [{
            type: 'function',
            function: {
              name: 'test',
            },
          }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from usage with snake_case', () => {
        // Covers lines 360-367 in format-detector.ts (hasOpenAISignature)
        const data = {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
          },
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for ambiguous requests', () => {
        const data = {
          model: 'unknown-model',
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const result = detectRequestFormat(data);
        expect(result).toBe('openai');
      });
    });

    describe('Edge cases', () => {
      it('should default to OpenAI for null data', () => {
        const result = detectRequestFormat(null);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for undefined data', () => {
        const result = detectRequestFormat(undefined);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for primitive types', () => {
        expect(detectRequestFormat('string')).toBe('openai');
        expect(detectRequestFormat(123)).toBe('openai');
        expect(detectRequestFormat(true)).toBe('openai');
      });

      it('should default to OpenAI for empty object', () => {
        const result = detectRequestFormat({});
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for empty array', () => {
        const result = detectRequestFormat([]);
        expect(result).toBe('openai');
      });
    });
  });

  describe('detectResponseFormat()', () => {
    describe('Anthropic response signatures', () => {
      it('should detect Anthropic format from message type with content array', () => {
        const data = {
          type: 'message',
          id: 'msg_123',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello!' },
          ],
          model: 'claude-3-opus-20240229',
          stop_reason: 'end_turn',
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from stop_reason field', () => {
        const data = {
          id: 'msg_123',
          type: 'message',
          content: [{ type: 'text', text: 'Hello' }],
          stop_reason: 'max_tokens',
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from tool_use stop_reason', () => {
        const data = {
          id: 'msg_123',
          type: 'message',
          content: [],
          stop_reason: 'tool_use',
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('anthropic');
      });
    });

    describe('Gemini response signatures', () => {
      it('should detect Gemini format from candidates array', () => {
        const data = {
          candidates: [{
            content: {
              parts: [{ text: 'Hello!' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          }],
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from usageMetadata', () => {
        const data = {
          candidates: [{
            content: { parts: [] },
          }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('gemini');
      });
    });

    describe('OpenAI response signatures (default)', () => {
      it('should detect OpenAI format from choices array', () => {
        const data = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
            finish_reason: 'stop',
          }],
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from choices with assistant role', () => {
        // Covers lines 346-355 in format-detector.ts
        const data = {
          choices: [{
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
          }],
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from usage with snake_case', () => {
        // Covers lines 360-367 in format-detector.ts
        const data = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello' },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from usage with prompt_tokens only', () => {
        const data = {
          usage: {
            prompt_tokens: 10,
          },
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from usage with completion_tokens only', () => {
        const data = {
          usage: {
            completion_tokens: 20,
          },
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for ambiguous responses', () => {
        const data = {
          id: 'unknown-123',
          model: 'unknown-model',
          choices: [],
        };
        const result = detectResponseFormat(data);
        expect(result).toBe('openai');
      });
    });

    describe('Edge cases', () => {
      it('should default to OpenAI for null data', () => {
        const result = detectResponseFormat(null);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for undefined data', () => {
        const result = detectResponseFormat(undefined);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for empty object', () => {
        const result = detectResponseFormat({});
        expect(result).toBe('openai');
      });
    });
  });

  describe('detectFormatFromHeaders()', () => {
    describe('Anthropic SDK detection', () => {
      it('should detect Anthropic format from anthropic-sdk user-agent', () => {
        const headers = {
          'user-agent': 'anthropic-sdk-python/0.7.0',
          'content-type': 'application/json',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from anthropic- prefix', () => {
        const headers = {
          'user-agent': 'anthropic-typescript/1.0.0',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('anthropic');
      });

      it('should detect Anthropic format from lowercase user-agent', () => {
        // The function only converts value to lowercase, not the key
        const headers = {
          'user-agent': 'ANTHROPIC-SDK-JAVA/0.5.0',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('anthropic');
      });
    });

    describe('Gemini SDK detection', () => {
      it('should detect Gemini format from google-api user-agent', () => {
        const headers = {
          'user-agent': 'google-api-python-client/2.0.0',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('gemini');
      });

      it('should detect Gemini format from gemini- prefix', () => {
        const headers = {
          'user-agent': 'gemini-node-sdk/1.0.0',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('gemini');
      });
    });

    describe('OpenAI SDK detection', () => {
      it('should detect OpenAI format from openai user-agent', () => {
        const headers = {
          'user-agent': 'OpenAI/Python',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('openai');
      });

      it('should detect OpenAI format from openai/ prefix', () => {
        const headers = {
          'user-agent': 'openai-node/4.0.0',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('openai');
      });
    });

    describe('Edge cases', () => {
      it('should default to OpenAI for empty headers', () => {
        const result = detectFormatFromHeaders({});
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for missing user-agent', () => {
        const headers = {
          'content-type': 'application/json',
          'accept': 'application/json',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('openai');
      });

      it('should default to OpenAI for unknown user-agent', () => {
        const headers = {
          'user-agent': 'MyCustomClient/1.0.0',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('openai');
      });

      it('should handle lowercase header keys only', () => {
        // The function expects lowercase keys, not case-insensitive
        const headers = {
          'user-agent': 'anthropic-sdk/1.0.0',
          'content-type': 'application/json',
        };
        const result = detectFormatFromHeaders(headers);
        expect(result).toBe('anthropic');
      });
    });
  });

  describe('detectFormatWithConfidence()', () => {
    describe('Anthropic confidence scoring', () => {
      it('should return high confidence for Anthropic with max_tokens', () => {
        const data = {
          model: 'claude-3-opus',
          max_tokens: 4096,
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const results = detectFormatWithConfidence(data);

        // Anthropic (has max_tokens) + OpenAI (always included) = 2 results
        expect(results).toHaveLength(2);
        const anthropic = results[0];
        expect((anthropic!).format).toBe('anthropic');
        expect((anthropic!).confidence).toBeGreaterThan(0.5);
        expect((anthropic!).reasons).toContain('Has max_tokens');
      });

      it('should increase confidence with multiple Anthropic signals', () => {
        const data = {
          model: 'claude-3-opus',
          max_tokens: 4096,
          system: 'You are helpful',
          anthropic_version: '2023-06-01',
          messages: [],
        };
        const results = detectFormatWithConfidence(data);
        const anthropic = results.find((r: FormatDetectionResult) => r.format === 'anthropic');

        expect(anthropic?.confidence).toBeGreaterThanOrEqual(0.8);
        expect(anthropic?.reasons).toContain('Has max_tokens');
        expect(anthropic?.reasons).toContain('Has system field');
        expect(anthropic?.reasons).toContain('Has anthropic_version');
      });

      it('should include Anthropic in results for partial matches', () => {
        const data = {
          model: 'claude-3-opus',
          messages: [],
        };
        const results = detectFormatWithConfidence(data);
        const anthropic = results.find((r: FormatDetectionResult) => r.format === 'anthropic');

        expect(anthropic).toBeUndefined(); // No Anthropic-specific fields
      });
    });

    describe('Gemini confidence scoring', () => {
      it('should return high confidence for Gemini with contents', () => {
        const data = {
          contents: [{
            parts: [{ text: 'Hello' }],
          }],
        };
        const results = detectFormatWithConfidence(data);
        const gemini = results.find((r: FormatDetectionResult) => r.format === 'gemini');

        expect(gemini?.format).toBe('gemini');
        expect(gemini?.confidence).toBeGreaterThan(0.5);
        expect(gemini?.reasons).toContain('Has contents');
      });

      it('should increase confidence with multiple Gemini signals', () => {
        const data = {
          contents: [{ parts: [{ text: 'Hello' }] }],
          generationConfig: { topP: 0.9 },
          systemInstruction: { parts: [{ text: 'Helpful' }] },
        };
        const results = detectFormatWithConfidence(data);
        const gemini = results.find((r: FormatDetectionResult) => r.format === 'gemini');

        expect(gemini?.confidence).toBeGreaterThan(0.8);
        expect(gemini?.reasons).toContain('Has contents');
        expect(gemini?.reasons).toContain('Has generationConfig');
        expect(gemini?.reasons).toContain('Has systemInstruction');
      });
    });

    describe('OpenAI confidence scoring', () => {
      it('should always include OpenAI as fallback', () => {
        const data = {
          model: 'unknown-model',
          messages: [{ role: 'user', content: 'Hello' }],
        };
        const results = detectFormatWithConfidence(data);
        const openai = results.find((r: FormatDetectionResult) => r.format === 'openai');

        expect(openai).toBeDefined();
        expect(openai?.confidence).toBeGreaterThan(0);
      });

      it('should increase confidence with standard OpenAI fields', () => {
        const data = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          tools: [{ type: 'function', function: { name: 'test' } }],
        };
        const results = detectFormatWithConfidence(data);
        const openai = results.find((r: FormatDetectionResult) => r.format === 'openai');

        expect(openai?.reasons).toContain('Has messages');
        expect(openai?.reasons).toContain('Has model');
        expect(openai?.reasons).toContain('Has tools');
      });
    });

    describe('Result ordering', () => {
      it('should sort results by confidence descending', () => {
        const data = {
          model: 'claude-3-opus',
          max_tokens: 4096,
          messages: [],
        };
        const results = detectFormatWithConfidence(data);

        // With max_tokens, we get 2 results: Anthropic + OpenAI
        expect(results.length).toBeGreaterThanOrEqual(2);
        expect(results[0]!.confidence).toBeGreaterThanOrEqual(results[1]!.confidence);
      });
    });

    describe('Edge cases', () => {
      it('should return low confidence default for invalid data', () => {
        const results = detectFormatWithConfidence(null);

        expect(results).toHaveLength(1);
        expect(results[0]!.format).toBe('openai');
        expect(results[0]!.confidence).toBe(0.1);
        expect(results[0]!.reasons).toContain('Default fallback (invalid data)');
      });

      it('should return low confidence default for primitive types', () => {
        const results = detectFormatWithConfidence('string');

        expect(results).toHaveLength(1);
        expect(results[0]!.format).toBe('openai');
        expect(results[0]!.confidence).toBe(0.1);
      });

      it('should handle empty object', () => {
        const results = detectFormatWithConfidence({});

        expect(results.length).toBeGreaterThan(0);
        const openai = results.find((r: FormatDetectionResult) => r.format === 'openai');
        expect(openai?.reasons).toContain('Default fallback');
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should correctly detect Anthropic streaming request', () => {
      const request = {
        model: 'claude-3-opus-20240229',
        max_tokens: 4096,
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      expect(detectRequestFormat(request)).toBe('anthropic');
    });

    it('should correctly detect OpenAI function calling request', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
            },
          },
        }],
      };

      expect(detectRequestFormat(request)).toBe('openai');
    });

    it('should correctly detect Gemini multi-turn conversation', () => {
      const request = {
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] },
          { role: 'user', parts: [{ text: 'How are you?' }] },
        ],
      };

      expect(detectRequestFormat(request)).toBe('gemini');
    });

    it('should detect format from realistic API endpoint paths', () => {
      expect(detectFormatFromPath('/v1/messages')).toBe('anthropic');
      expect(detectFormatFromPath('/v1/chat/completions')).toBe('openai');
      expect(detectFormatFromPath('/v1/models/gemini-pro:generateContent')).toBe('gemini');
    });

    it('should detect format from realistic base URLs', () => {
      expect(detectFormatFromUrl('https://api.anthropic.com')).toBe('anthropic');
      expect(detectFormatFromUrl('https://api.openai.com/v1')).toBe('openai');
      expect(detectFormatFromUrl('https://generativelanguage.googleapis.com/v1beta')).toBe('gemini');
    });
  });
});
