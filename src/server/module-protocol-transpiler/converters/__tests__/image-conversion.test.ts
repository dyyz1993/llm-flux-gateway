/**
 * Image Conversion Tests
 *
 * 测试目标: 验证图片内容块在不同供应商格式之间的正确转换
 */

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';
import { GeminiConverter } from '../gemini.converter';
import type { InternalRequest, InternalContentBlock, ImageUrlContentBlock, InternalMessage } from '../../interfaces/internal-format';

describe('Image Conversion Tests', () => {
  const anthropicConverter = new AnthropicConverter();
  const geminiConverter = new GeminiConverter();

  // 测试数据
  const testImageUrl = 'https://example.com/test-image.png';
  const testBase64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const testBase64Jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
  const testBase64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const testJpegBase64Data = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

  // 辅助函数: 获取消息内容数组
  function getContentBlocks(message: InternalMessage | undefined): InternalContentBlock[] {
    if (!message) return [];
    if (typeof message.content === 'string') {
      return [{ type: 'text', text: message.content }];
    }
    return message.content;
  }

  // 辅助函数: 获取 Anthropic 格式的内容数组
  function getAnthropicContent(message: Record<string, unknown> | undefined): Array<{ type: string; text?: string; source?: { type: string; url?: string; media_type?: string; data?: string } }> {
    if (!message) return [];
    const content = message.content;
    if (Array.isArray(content)) {
      return content;
    }
    return [];
  }

  // 辅助函数: 获取 Gemini 格式的 parts 数组
  function getGeminiParts(content: Record<string, unknown> | undefined): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
    if (!content) return [];
    const parts = content.parts;
    if (Array.isArray(parts)) {
      return parts;
    }
    return [];
  }

  describe('OpenAI → Anthropic Image Conversion', () => {
    it('should convert OpenAI image_url (URL format) to Anthropic image format', () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'What is in this image?' },
              { type: 'image_url' as const, image_url: { url: testImageUrl, detail: 'high' as const } },
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = result.data?.messages as Array<Record<string, unknown>>;
      expect(messages).toBeDefined();
      expect(messages).toHaveLength(1);

      const userMessage = messages[0];
      expect(userMessage).toBeDefined();
      expect(userMessage?.role).toBe('user');

      const content = getAnthropicContent(userMessage);
      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      expect(content[0]?.text).toBe('What is in this image?');
      expect(content[1]?.type).toBe('image');
      expect(content[1]?.source?.type).toBe('url');
      expect(content[1]?.source?.url).toBe(testImageUrl);
    });

    it('should convert OpenAI image_url (Base64 PNG) to Anthropic image format', () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: [{ type: 'image_url' as const, image_url: { url: testBase64Png } }] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = result.data?.messages as Array<Record<string, unknown>>;
      const content = getAnthropicContent(messages[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image');
      expect(content[0]?.source?.type).toBe('base64');
      expect(content[0]?.source?.media_type).toBe('image/png');
      expect(content[0]?.source?.data).toBe(testBase64Data);
    });

    it('should convert OpenAI image_url (Base64 JPEG) to Anthropic image format', () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: [{ type: 'image_url' as const, image_url: { url: testBase64Jpeg } }] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = result.data?.messages as Array<Record<string, unknown>>;
      const content = getAnthropicContent(messages[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image');
      expect(content[0]?.source?.type).toBe('base64');
      expect(content[0]?.source?.media_type).toBe('image/jpeg');
      expect(content[0]?.source?.data).toBe(testJpegBase64Data);
    });
  });

  describe('Anthropic → OpenAI Image Conversion', () => {
    it('should convert Anthropic image (URL source) to OpenAI image_url format', () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'Describe this image' },
              { type: 'image' as const, source: { type: 'url' as const, url: testImageUrl } },
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestToInternal(anthropicRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const internalRequest = result.data!;
      expect(internalRequest.messages).toHaveLength(1);

      const userMessage = internalRequest.messages[0];
      expect(userMessage).toBeDefined();
      expect(userMessage?.role).toBe('user');

      const content = getContentBlocks(userMessage);
      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image_url');
      expect((content[1] as ImageUrlContentBlock)?.image_url?.url).toBe(testImageUrl);
    });

    it('should convert Anthropic image (Base64 source) to OpenAI image_url format', () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png', data: testBase64Data } },
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestToInternal(anthropicRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const content = getContentBlocks(result.data!.messages[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image_url');
      expect((content[0] as ImageUrlContentBlock)?.image_url?.url).toBe(`data:image/png;base64,${testBase64Data}`);
    });
  });

  describe('OpenAI → Gemini Image Conversion', () => {
    it('should convert OpenAI image_url (Base64) to Gemini inlineData format', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this image' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: testBase64Png } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const result = geminiConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const contents = result.data?.contents as Array<Record<string, unknown>>;
      expect(contents).toBeDefined();
      expect(contents).toHaveLength(1);

      const userContent = contents[0];
      expect(userContent).toBeDefined();
      expect(userContent?.role).toBe('user');

      const parts = getGeminiParts(userContent);
      expect(parts).toHaveLength(2);
      expect(parts[0]?.text).toBe('Analyze this image');
      expect(parts[1]?.inlineData).toBeDefined();
      expect(parts[1]?.inlineData?.mimeType).toBe('image/png');
      expect(parts[1]?.inlineData?.data).toBe(testBase64Data);
    });

    it('should convert OpenAI image_url (JPEG Base64) to Gemini inlineData format', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: testBase64Jpeg } } as ImageUrlContentBlock] },
        ],
      };

      const result = geminiConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const contents = result.data?.contents as Array<Record<string, unknown>>;
      const parts = getGeminiParts(contents[0]);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts[0]?.inlineData?.mimeType).toBe('image/jpeg');
      expect(parts[0]?.inlineData?.data).toBe(testJpegBase64Data);
    });

    it('should handle URL images for Gemini', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: testImageUrl } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const result = geminiConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data?.contents).toBeDefined();
    });
  });

  describe('Gemini → OpenAI Image Conversion', () => {
    it('should convert Gemini inlineData to OpenAI image_url format', () => {
      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Describe this' },
              { inlineData: { mimeType: 'image/png', data: testBase64Data } },
            ],
          },
        ],
      };

      const result = geminiConverter.convertRequestToInternal(geminiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const internalRequest = result.data!;
      expect(internalRequest.messages).toHaveLength(1);

      const userMessage = internalRequest.messages[0];
      expect(userMessage).toBeDefined();
      expect(userMessage?.role).toBe('user');

      const content = getContentBlocks(userMessage);
      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image_url');
      expect((content[1] as ImageUrlContentBlock)?.image_url?.url).toBe(`data:image/png;base64,${testBase64Data}`);
    });
  });

  describe('Round-Trip Conversion', () => {
    it('should preserve image through OpenAI → Anthropic → OpenAI round-trip', () => {
      const originalRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: testImageUrl, detail: 'high' } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const toAnthropicResult = anthropicConverter.convertRequestFromInternal(originalRequest);
      expect(toAnthropicResult.success).toBe(true);

      const toOpenAIResult = anthropicConverter.convertRequestToInternal(toAnthropicResult.data!);
      expect(toOpenAIResult.success).toBe(true);

      const restoredRequest = toOpenAIResult.data!;
      expect(restoredRequest.messages).toHaveLength(1);

      const content = getContentBlocks(restoredRequest.messages[0]);
      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image_url');
      expect((content[1] as ImageUrlContentBlock)?.image_url?.url).toBe(testImageUrl);
    });

    it('should preserve base64 image through OpenAI → Gemini → OpenAI round-trip', () => {
      const originalRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: testBase64Png } } as ImageUrlContentBlock] },
        ],
      };

      const toGeminiResult = geminiConverter.convertRequestFromInternal(originalRequest);
      expect(toGeminiResult.success).toBe(true);

      const toOpenAIResult = geminiConverter.convertRequestToInternal(toGeminiResult.data!);
      expect(toOpenAIResult.success).toBe(true);

      const content = getContentBlocks(toOpenAIResult.data!.messages[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image_url');
      expect((content[0] as ImageUrlContentBlock)?.image_url?.url).toBe(testBase64Png);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple images in one message', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Compare these images' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: testImageUrl } } as ImageUrlContentBlock,
              { type: 'image_url', image_url: { url: testBase64Png } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = result.data?.messages as Array<Record<string, unknown>>;
      const content = getAnthropicContent(messages[0]);
      expect(content).toHaveLength(3);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image');
      expect(content[2]?.type).toBe('image');
    });

    it('should handle image with detail parameter', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: testImageUrl, detail: 'low' } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);
      expect(result.success).toBe(true);
    });

    it('should handle empty image URL gracefully', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: '' } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);
      expect(result.success).toBe(true);
    });

    it('should handle invalid base64 format gracefully', () => {
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,invalid!!!base64' } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('Special Formats', () => {
    it('should handle WebP image format', () => {
      const webpBase64 = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: webpBase64 } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = result.data?.messages as Array<Record<string, unknown>>;
      const content = getAnthropicContent(messages[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.source?.media_type).toBe('image/webp');
    });

    it('should handle GIF image format', () => {
      const gifBase64 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const openaiRequest: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: gifBase64 } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(openaiRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = result.data?.messages as Array<Record<string, unknown>>;
      const content = getAnthropicContent(messages[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.source?.media_type).toBe('image/gif');
    });
  });
});
