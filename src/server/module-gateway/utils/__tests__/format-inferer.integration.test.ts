import { describe, it, expect } from 'vitest';
import { inferFormatFromVendorTemplate } from '../format-inferer';
import { ApiFormat } from '../../../module-protocol-transpiler';

describe('format-inferer integration', () => {
  describe('Real-world vendor configurations', () => {
    it('should correctly infer OpenAI format', () => {
      const openai = {
        baseUrl: 'https://api.openai.com/v1',
        endpoint: '/chat/completions',
      };
      expect(inferFormatFromVendorTemplate(openai)).toBe(ApiFormat.OPENAI);
    });

    it('should correctly infer Anthropic format', () => {
      const anthropic = {
        baseUrl: 'https://api.anthropic.com/v1',
        endpoint: '/messages',
      };
      expect(inferFormatFromVendorTemplate(anthropic)).toBe(ApiFormat.ANTHROPIC);
    });

    it('should correctly infer Gemini format', () => {
      const gemini = {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        endpoint: '/models/gemini-pro:generateContent',
      };
      expect(inferFormatFromVendorTemplate(gemini)).toBe(ApiFormat.GEMINI);
    });

    it('should correctly infer Zhipu AI OpenAI-compatible format', () => {
      const zhipu = {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        endpoint: '/chat/completions',
      };
      // GLM/Zhipu returns mixed format that needs special handling
      expect(inferFormatFromVendorTemplate(zhipu)).toBe('glm');
    });

    it('should correctly infer Zhipu AI Anthropic-compatible format', () => {
      const zhipuAnthropic = {
        baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1',
        endpoint: '/messages',
      };
      expect(inferFormatFromVendorTemplate(zhipuAnthropic)).toBe(ApiFormat.ANTHROPIC);
    });

    it('should correctly infer Azure OpenAI format', () => {
      const azure = {
        baseUrl: 'https://{your-resource}.openai.azure.com/openai/deployments/{your-deployment}',
        endpoint: '/chat/completions?api-version=2023-05-15',
      };
      expect(inferFormatFromVendorTemplate(azure)).toBe(ApiFormat.OPENAI);
    });

    it('should correctly infer Mistral format', () => {
      const mistral = {
        baseUrl: 'https://api.mistral.ai/v1',
        endpoint: '/chat/completions',
      };
      expect(inferFormatFromVendorTemplate(mistral)).toBe(ApiFormat.OPENAI);
    });

    it('should correctly infer Perplexity format', () => {
      const perplexity = {
        baseUrl: 'https://api.perplexity.ai/v1',
        endpoint: '/chat/completions',
      };
      expect(inferFormatFromVendorTemplate(perplexity)).toBe(ApiFormat.OPENAI);
    });

    it('should correctly infer Cohere format (defaults to OpenAI)', () => {
      const cohere = {
        baseUrl: 'https://api.cohere.ai/v1',
        endpoint: '/v1/chat',
      };
      expect(inferFormatFromVendorTemplate(cohere)).toBe(ApiFormat.OPENAI);
    });
  });
});
