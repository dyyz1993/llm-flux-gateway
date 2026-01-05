import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RouteMatcherService } from '../route-matcher.service';
import * as database from '@server/shared/database';

// Mock database functions
vi.mock('@server/shared/database', () => ({
  queryAll: vi.fn(),
}));

const mockQueryAll = vi.mocked(database.queryAll);

describe('RouteMatcherService', () => {
  let service: RouteMatcherService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RouteMatcherService();
  });

  const mockRoutesDbRow = {
    id: 'route-1',
    name: 'Zhipu Coding Route',
    base_url: 'https://open.bigmodel.cn/api/coding/paas/v4',
    upstream_api_key: 'test-key',
    is_active: 1,
    overrides: '[]',
    priority: 100,
  };

  describe('透传逻辑 (Pass-through)', () => {
    it('should pass through the model when no override rules exist', async () => {
      // Mock database to return a route with empty overrides
      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides: '[]',
        },
      ]);

      const result = await service.findMatch('glm-4-air');

      expect(result).not.toBeNull();
      expect(result?.rewrittenModel).toBe('glm-4-air');
      expect(result?.route.upstreamModel).toBe('glm-4-air');
      expect(result?.matchedRules).toEqual([]);
    });

    it('should pass through any model name when overrides is empty array', async () => {
      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides: '[]',
        },
      ]);

      const testModels = ['glm-4.7', 'glm-4-flash', 'gpt-4o', 'claude-3-opus'];

      for (const model of testModels) {
        const result = await service.findMatch(model);
        expect(result?.rewrittenModel).toBe(model);
        expect(result?.route.upstreamModel).toBe(model);
        expect(result?.matchedRules).toEqual([]);
      }
    });
  });

  describe('覆写逻辑 (Override)', () => {
    it('should use exact match override rule when available', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['glm-4-air'],
          rewriteValue: 'glm-4.7',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('glm-4-air');

      expect(result).not.toBeNull();
      expect(result?.rewrittenModel).toBe('glm-4.7');
      expect(result?.route.upstreamModel).toBe('glm-4.7');
      expect(result?.matchedRules).toHaveLength(1);
      expect(result?.matchedRules[0].rewriteValue).toBe('glm-4.7');
    });

    it('should use wildcard override rule when no exact match', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['*'],
          rewriteValue: 'glm-4-flash',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('any-model');

      expect(result).not.toBeNull();
      expect(result?.rewrittenModel).toBe('glm-4-flash');
      expect(result?.matchedRules[0].matchValues).toEqual(['*']);
    });

    it('should prioritize exact match over wildcard', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['*'],
          rewriteValue: 'fallback-model',
        },
        {
          field: 'model',
          matchValues: ['glm-4-air'],
          rewriteValue: 'exact-match-model',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('glm-4-air');

      expect(result?.rewrittenModel).toBe('exact-match-model');
      expect(result?.matchedRules[0].matchValues).toEqual(['glm-4-air']);
    });
  });

  describe('优先级逻辑 (Priority)', () => {
    it('should return first route by priority when no match', async () => {
      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          id: 'high-priority',
          priority: 200,
          overrides: '[]',
        },
        {
          ...mockRoutesDbRow,
          id: 'low-priority',
          priority: 100,
          overrides: '[]',
        },
      ]);

      const result = await service.findMatch('glm-4-air');

      expect(result?.route.id).toBe('high-priority');
    });
  });

  describe('边界情况 (Edge Cases)', () => {
    it('should return null when no active routes exist', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await service.findMatch('glm-4-air');

      expect(result).toBeNull();
    });

    it('should handle multiple override fields correctly', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['glm-4-air'],
          rewriteValue: 'glm-4.7',
        },
        {
          field: 'temperature',
          matchValues: ['*'],
          rewriteValue: '0.7',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('glm-4-air');

      // Should only match model field rules
      expect(result?.matchedRules).toHaveLength(1);
      expect(result?.matchedRules[0].field).toBe('model');
      expect(result?.rewrittenModel).toBe('glm-4.7');
    });

    it('should handle invalid JSON in overrides gracefully', async () => {
      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides: 'invalid-json',
        },
      ] as any);

      // This should throw an error or handle gracefully
      // Current implementation will throw JSON.parse error
      await expect(service.findMatch('glm-4-air')).rejects.toThrow();
    });
  });

  describe('实际使用场景 (Real-world Scenarios)', () => {
    it('should handle glm-4-air request with empty overrides', async () => {
      // This is the actual scenario from the bug report
      mockQueryAll.mockReturnValue([
        {
          id: '8dc2d8ae-4e3c-4b8e-96b2-11cdbb8710fd',
          name: 'coding',
          base_url: 'https://open.bigmodel.cn/api/coding/paas/v4',
          upstream_api_key: 'test-api-key',
          is_active: 1,
          overrides: '[]',
          priority: 0,
        },
      ]);

      const result = await service.findMatch('glm-4-air');

      expect(result).not.toBeNull();
      expect(result?.rewrittenModel).toBe('glm-4-air');
      expect(result?.route.baseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
      expect(result?.matchedRules).toEqual([]);
    });

    it('should route gpt-3.5-turbo to gemini-1.5-flash with override', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5-turbo', 'gpt-4', '*'],
          rewriteValue: 'gemini-1.5-flash',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          id: 'gemini-route',
          name: 'Gemini Test Route',
          base_url: 'https://generativelanguage.googleapis.com/v1beta',
          upstream_api_key: 'gemini-key',
          is_active: 1,
          overrides,
          priority: 100,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo');

      expect(result?.rewrittenModel).toBe('gemini-1.5-flash');
      expect(result?.route.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    });
  });
});
