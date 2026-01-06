import { describe, it, expect } from 'vitest';
import { inferFormatFromVendorTemplate, getFormatName, parseFormatName } from '../format-inferer';
import { ApiFormat } from '../../../module-protocol-transpiler';

describe('format-inferer', () => {
  describe('inferFormatFromVendorTemplate', () => {
    it('should infer Anthropic format from /messages endpoint', () => {
      const vendor = {
        baseUrl: 'https://api.anthropic.com',
        endpoint: '/messages',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.ANTHROPIC);
    });

    it('should infer Anthropic format from baseUrl containing anthropic', () => {
      const vendor = {
        baseUrl: 'https://api.anthropic.com/v1',
        endpoint: '/chat/completions',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.ANTHROPIC);
    });

    it('should infer Gemini format from generateContent endpoint', () => {
      const vendor = {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        endpoint: '/models/gemini-pro:generateContent',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.GEMINI);
    });

    it('should infer Gemini format from baseUrl containing generativelanguage', () => {
      const vendor = {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        endpoint: '/chat/completions',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.GEMINI);
    });

    it('should infer Gemini format from baseUrl containing googleapis', () => {
      const vendor = {
        baseUrl: 'https://googleapis.com/v1',
        endpoint: '/chat',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.GEMINI);
    });

    it('should default to OpenAI format for /chat/completions', () => {
      const vendor = {
        baseUrl: 'https://api.openai.com/v1',
        endpoint: '/chat/completions',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.OPENAI);
    });

    it('should default to OpenAI format for unknown vendors', () => {
      const vendor = {
        baseUrl: 'https://api.unknown.com/v1',
        endpoint: '/v1/chat',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.OPENAI);
    });

    it('should handle Zhipu AI with anthropic endpoint', () => {
      const vendor = {
        baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1',
        endpoint: '/messages',
      };
      expect(inferFormatFromVendorTemplate(vendor)).toBe(ApiFormat.ANTHROPIC);
    });

    it('should handle Zhipu AI with OpenAI endpoint', () => {
      const vendor = {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        endpoint: '/chat/completions',
      };
      // GLM/Zhipu is now detected as a separate format (not OpenAI)
      // because it returns mixed format responses that need special handling
      expect(inferFormatFromVendorTemplate(vendor)).toBe('glm');
    });
  });

  describe('getFormatName', () => {
    it('should return correct format names', () => {
      expect(getFormatName(ApiFormat.OPENAI)).toBe('openai');
      expect(getFormatName(ApiFormat.OPENAI_RESPONSES)).toBe('openai-responses');
      expect(getFormatName(ApiFormat.ANTHROPIC)).toBe('anthropic');
      expect(getFormatName(ApiFormat.GEMINI)).toBe('gemini');
    });
  });

  describe('parseFormatName', () => {
    it('should parse format names correctly', () => {
      expect(parseFormatName('openai')).toBe(ApiFormat.OPENAI);
      expect(parseFormatName('openai-responses')).toBe(ApiFormat.OPENAI_RESPONSES);
      expect(parseFormatName('anthropic')).toBe(ApiFormat.ANTHROPIC);
      expect(parseFormatName('gemini')).toBe(ApiFormat.GEMINI);
    });

    it('should default to OpenAI for unknown format names', () => {
      expect(parseFormatName('unknown')).toBe(ApiFormat.OPENAI);
    });
  });
});
