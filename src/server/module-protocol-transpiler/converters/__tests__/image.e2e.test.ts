/**
 * E2E Tests for Image Support
 *
 * 测试目标: 验证图片功能在完整请求流程中的正确性
 *
 * 运行方式:
 * - ENABLE_E2E_TESTS=true npm test -- src/server/module-protocol-transpiler/converters/__tests__/image.e2e.test.ts
 */

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';
import { GeminiConverter } from '../gemini.converter';
import { OpenAIConverter } from '../openai.converter';
import type { InternalRequest, InternalContentBlock, ImageUrlContentBlock, InternalMessage } from '../../interfaces/internal-format';

// 测试数据
const TEST_IMAGE_URL = 'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg';
const TEST_BASE64_DATA = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TEST_BASE64_PNG = `data:image/png;base64,${TEST_BASE64_DATA}`;

// 检查是否启用 E2E 测试
const ENABLE_E2E = process.env.ENABLE_E2E_TESTS === 'true';

// 辅助函数: 获取消息内容数组
function getContentBlocks(message: InternalMessage | undefined): InternalContentBlock[] {
  if (!message) return [];
  if (typeof message.content === 'string') {
    return [{ type: 'text', text: message.content }];
  }
  return message.content;
}

// 辅助函数: 获取 Anthropic 格式的内容数组
function getAnthropicContent(data: Record<string, unknown> | undefined): Array<{ type: string; text?: string; source?: { type: string; url?: string; media_type?: string; data?: string } }> {
  if (!data) return [];
  const messages = data.messages;
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const content = messages[0]?.content;
  if (Array.isArray(content)) {
    return content;
  }
  return [];
}

// 辅助函数: 获取 Gemini 格式的 parts 数组
function getGeminiParts(data: Record<string, unknown> | undefined): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
  if (!data) return [];
  const contents = data.contents;
  if (!Array.isArray(contents) || contents.length === 0) return [];
  const parts = contents[0]?.parts;
  if (Array.isArray(parts)) {
    return parts;
  }
  return [];
}

describe.skipIf(!ENABLE_E2E)('Image E2E Tests', () => {
  const anthropicConverter = new AnthropicConverter();
  const geminiConverter = new GeminiConverter();
  const openaiConverter = new OpenAIConverter();

  describe('OpenAI Format Image Requests', () => {
    it('should correctly convert URL image to OpenAI API format', () => {
      const request: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: TEST_IMAGE_URL } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const result = openaiConverter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const converted = result.data!;

      // Verify structure
      expect(converted.model).toBe('gpt-4o');
      expect(converted.messages).toBeDefined();

      const messages = converted.messages as Array<{ role: string; content: unknown }>;
      expect(messages).toHaveLength(1);

      const content = messages[0]?.content as InternalContentBlock[];
      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image_url');
      expect((content[1] as ImageUrlContentBlock)?.image_url?.url).toBe(TEST_IMAGE_URL);
    });

    it('should correctly convert base64 image to OpenAI API format', () => {
      const request: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: TEST_BASE64_PNG } } as ImageUrlContentBlock] },
        ],
      };

      const result = openaiConverter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const messages = result.data?.messages as Array<{ role: string; content: unknown }>;
      const content = messages?.[0]?.content as InternalContentBlock[];
      expect(content?.[0]?.type).toBe('image_url');
      expect((content?.[0] as ImageUrlContentBlock)?.image_url?.url).toBe(TEST_BASE64_PNG);
    });
  });

  describe('Anthropic Format Image Requests', () => {
    it('should convert OpenAI image_url to Anthropic image format (URL)', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: TEST_IMAGE_URL } } as ImageUrlContentBlock,
              { type: 'text', text: 'What is in this image?' } as InternalContentBlock,
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);

      const content = getAnthropicContent(result.data);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image');
      expect(content[0]?.source?.type).toBe('url');
      expect(content[0]?.source?.url).toBe(TEST_IMAGE_URL);
      expect(content[1]?.type).toBe('text');
    });

    it('should convert OpenAI image_url to Anthropic image format (Base64)', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: TEST_BASE64_PNG } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const content = getAnthropicContent(result.data);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image');
      expect(content[0]?.source?.type).toBe('base64');
      expect(content[0]?.source?.media_type).toBe('image/png');
      expect(content[0]?.source?.data).toBe(TEST_BASE64_DATA);
    });

    it('should convert Anthropic image to OpenAI image_url format', () => {
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'image' as const, source: { type: 'url' as const, url: TEST_IMAGE_URL } },
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestToInternal(anthropicRequest);

      expect(result.success).toBe(true);
      const content = getContentBlocks(result.data?.messages?.[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image_url');
      expect((content[0] as ImageUrlContentBlock)?.image_url?.url).toBe(TEST_IMAGE_URL);
    });
  });

  describe('Gemini Format Image Requests', () => {
    it('should convert OpenAI image_url to Gemini inlineData format', () => {
      const request: InternalRequest = {
        model: 'gemini-pro-vision',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: TEST_BASE64_PNG } } as ImageUrlContentBlock,
              { type: 'text', text: 'Describe this' } as InternalContentBlock,
            ],
          },
        ],
      };

      const result = geminiConverter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const parts = getGeminiParts(result.data);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts[0]?.inlineData).toBeDefined();
      expect(parts[0]?.inlineData?.mimeType).toBe('image/png');
      expect(parts[0]?.inlineData?.data).toBe(TEST_BASE64_DATA);
      expect(parts[1]?.text).toBe('Describe this');
    });

    it('should convert Gemini inlineData to OpenAI image_url format', () => {
      const geminiRequest = {
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: 'image/png', data: TEST_BASE64_DATA } }],
          },
        ],
      };

      const result = geminiConverter.convertRequestToInternal(geminiRequest);

      expect(result.success).toBe(true);
      const content = getContentBlocks(result.data?.messages?.[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image_url');
      expect((content[0] as ImageUrlContentBlock)?.image_url?.url).toBe(`data:image/png;base64,${TEST_BASE64_DATA}`);
    });
  });

  describe('Round-Trip Conversion', () => {
    it('should preserve image through OpenAI → Anthropic → OpenAI', () => {
      const original: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: TEST_IMAGE_URL, detail: 'high' } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const toAnthropic = anthropicConverter.convertRequestFromInternal(original);
      expect(toAnthropic.success).toBe(true);

      const backToOpenAI = anthropicConverter.convertRequestToInternal(toAnthropic.data!);
      expect(backToOpenAI.success).toBe(true);

      const restored = backToOpenAI.data!;
      expect(restored.messages).toHaveLength(1);
      const content = getContentBlocks(restored.messages[0]);
      expect(content).toHaveLength(2);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image_url');
      expect((content[1] as ImageUrlContentBlock)?.image_url?.url).toBe(TEST_IMAGE_URL);
    });

    it('should preserve image through OpenAI → Gemini → OpenAI', () => {
      const original: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: TEST_BASE64_PNG } } as ImageUrlContentBlock] },
        ],
      };

      const toGemini = geminiConverter.convertRequestFromInternal(original);
      expect(toGemini.success).toBe(true);

      const backToOpenAI = geminiConverter.convertRequestToInternal(toGemini.data!);
      expect(backToOpenAI.success).toBe(true);

      const content = getContentBlocks(backToOpenAI.data?.messages?.[0]);
      expect(content.length).toBeGreaterThan(0);
      expect(content[0]?.type).toBe('image_url');
      expect((content[0] as ImageUrlContentBlock)?.image_url?.url).toBe(TEST_BASE64_PNG);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty image URL gracefully', () => {
      const request: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: '' } } as ImageUrlContentBlock] },
        ],
      };

      const result = openaiConverter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
    });

    it('should handle invalid base64 format gracefully', () => {
      const request: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,invalid!!!' } } as ImageUrlContentBlock] },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
    });

    it('should handle multiple images in one message', () => {
      const request: InternalRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Compare these' } as InternalContentBlock,
              { type: 'image_url', image_url: { url: TEST_IMAGE_URL } } as ImageUrlContentBlock,
              { type: 'image_url', image_url: { url: TEST_BASE64_PNG } } as ImageUrlContentBlock,
            ],
          },
        ],
      };

      const result = anthropicConverter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const content = getAnthropicContent(result.data);
      expect(content).toHaveLength(3);
      expect(content[0]?.type).toBe('text');
      expect(content[1]?.type).toBe('image');
      expect(content[2]?.type).toBe('image');
    });
  });
});

// 单元测试（不需要 E2E 环境变量）
describe('Image Unit Tests', () => {
  it('should correctly identify image content blocks', () => {
    const imageBlock: ImageUrlContentBlock = {
      type: 'image_url',
      image_url: { url: TEST_IMAGE_URL },
    };

    expect(imageBlock.type).toBe('image_url');
    expect(imageBlock.image_url.url).toBe(TEST_IMAGE_URL);
  });

  it('should parse base64 data URL correctly', () => {
    const url = TEST_BASE64_PNG;
    const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('image/png');
    expect(match?.[2]).toBe(TEST_BASE64_DATA);
  });
});
