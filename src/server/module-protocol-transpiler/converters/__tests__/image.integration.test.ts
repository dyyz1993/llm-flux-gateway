/**
 * Image Integration Tests - Real API Calls
 *
 * 测试目标: 验证图片功能通过真实 API 调用的正确性
 *
 * 运行方式:
 * 1. 确保 .env 中配置了有效的 API Key
 * 2. ENABLE_INTEGRATION_TESTS=true npm test -- src/server/module-protocol-transpiler/converters/__tests__/image.integration.test.ts --run
 *
 * 注意: 此测试会消耗真实的 API 配额
 */

import { describe, it, expect, beforeAll } from 'vitest';

// 检查是否启用集成测试
const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_INTEGRATION_TESTS === 'true';

// 测试配置
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || '';

// 测试数据
const TEST_IMAGE_URL = 'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg';
// 使用真实的图片 URL 进行测试，而不是 1x1 像素的 base64
const TEST_IMAGE_URL_2 = 'https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/0033279361/p405458.png';

describe.skipIf(!ENABLE_INTEGRATION_TESTS)('Image Integration Tests - Real API', () => {
  beforeAll(() => {
    if (!GATEWAY_API_KEY) {
      console.warn('Warning: GATEWAY_API_KEY not set, tests may fail');
    }
  });

  describe('OpenAI-compatible Vision Models', () => {
    it('should send image URL and receive response from Qwen', async () => {
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen3.5-plus',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: TEST_IMAGE_URL,
                  },
                },
                {
                  type: 'text',
                  text: '请用一句话描述这张图片',
                },
              ],
            },
          ],
          max_tokens: 100,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      console.log('Response:', JSON.stringify(data, null, 2));

      expect(data.choices).toBeDefined();
      expect(data.choices.length).toBeGreaterThan(0);
      expect(data.choices[0].message.content).toBeDefined();
      expect(data.choices[0].message.content.length).toBeGreaterThan(0);

      // 验证响应内容包含图片相关描述
      const content = data.choices[0].message.content;
      expect(
        content.includes('海滩') || 
        content.includes('狗') || 
        content.includes('人') ||
        content.includes('beach') ||
        content.includes('dog')
      ).toBe(true);
    }, 30000);

    it('should send second image URL and receive response from Qwen', async () => {
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen3.5-plus',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: TEST_IMAGE_URL_2,
                  },
                },
                {
                  type: 'text',
                  text: '请用一句话描述这张图片',
                },
              ],
            },
          ],
          max_tokens: 50,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      console.log('Response:', JSON.stringify(data, null, 2));

      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBeDefined();
    }, 30000);

    it('should handle multiple images in one request', async () => {
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen3.5-plus',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: TEST_IMAGE_URL },
                },
                {
                  type: 'image_url',
                  image_url: { url: TEST_IMAGE_URL_2 },
                },
                {
                  type: 'text',
                  text: '这两张图片有什么不同?',
                },
              ],
            },
          ],
          max_tokens: 200,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      console.log('Response:', JSON.stringify(data, null, 2));

      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should return error for invalid image URL', async () => {
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen3.5-plus',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: 'https://invalid-url-that-does-not-exist.com/image.png',
                  },
                },
                {
                  type: 'text',
                  text: '描述这张图片',
                },
              ],
            },
          ],
          max_tokens: 50,
        }),
      });

      // 可能返回错误或成功（取决于上游 API 如何处理无效 URL）
      console.log('Status:', response.status);
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2));
    }, 30000);

    it('should return error for non-vision model with image', async () => {
      // 使用不支持视觉的模型
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'text-only-model',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: TEST_IMAGE_URL },
                },
                {
                  type: 'text',
                  text: '描述这张图片',
                },
              ],
            },
          ],
          max_tokens: 50,
        }),
      });

      // 应该返回错误（模型不支持视觉）
      console.log('Status:', response.status);
    }, 30000);
  });

  describe('Streaming with Images', () => {
    it('should stream response with image input', async () => {
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen3.5-plus',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: TEST_IMAGE_URL },
                },
                {
                  type: 'text',
                  text: '描述这张图片',
                },
              ],
            },
          ],
          max_tokens: 100,
          stream: true,
        }),
      });

      expect(response.ok).toBe(true);
      // Note: content-type may vary depending on the upstream API
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      let fullContent = '';
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      console.log('Streamed content:', fullContent);
      expect(fullContent.length).toBeGreaterThan(0);
    }, 60000);
  });
});
