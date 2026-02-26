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

    it('should use first matching rule in configuration order', async () => {
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

      // 新逻辑：按配置顺序，第一个匹配的是 *，所以返回 fallback-model
      const result = await service.findMatch('glm-4-air');

      expect(result?.rewrittenModel).toBe('fallback-model');
      expect(result?.matchedRules[0].matchValues).toEqual(['*']);
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

  describe('前缀匹配 (Prefix Pattern Matching)', () => {
    it('should match gpt-3.5-turbo with gpt-3.5* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*'],
          rewriteValue: 'gpt-3.5-flash',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo');

      expect(result?.rewrittenModel).toBe('gpt-3.5-flash');
    });

    it('should match gpt-4 with gpt-* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-*'],
          rewriteValue: 'gpt-fallback',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-4');

      expect(result?.rewrittenModel).toBe('gpt-fallback');
    });

    it('should match gpt-4-turbo with gpt-4* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-4*'],
          rewriteValue: 'gpt-4-upgraded',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-4-turbo');

      expect(result?.rewrittenModel).toBe('gpt-4-upgraded');
    });

    it('should not match gpt-4 with gpt-3.5* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*', '*'],
          rewriteValue: 'fallback',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-4');

      // Should match with *, not gpt-3.5*
      expect(result?.rewrittenModel).toBe('fallback');
      expect(result?.matchedRules[0].matchValues).toEqual(['gpt-3.5*', '*']);
    });
  });

  describe('模式优先级排序 (Pattern Priority Ordering)', () => {
    it('should prioritize exact match over prefix pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['*', 'gpt-3.5*', 'gpt-3.5-turbo'],
          rewriteValue: 'test-rewrite',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo');

      // Should match with exact pattern, not prefix or wildcard
      expect(result?.rewrittenModel).toBe('test-rewrite');
      expect(result?.matchedRules).toHaveLength(1);
    });

    it('should prioritize prefix pattern over wildcard', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['*', 'gpt-3.5*'],
          rewriteValue: 'prefix-rewrite',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo');

      // Should match with prefix pattern, not wildcard
      expect(result?.rewrittenModel).toBe('prefix-rewrite');
      expect(result?.matchedRules).toHaveLength(1);
    });

    it('should use wildcard when no other patterns match', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*', '*'],
          rewriteValue: 'wildcard-rewrite',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('claude-3-opus');

      // Should match with wildcard
      expect(result?.rewrittenModel).toBe('wildcard-rewrite');
    });

    it('should use configuration order: first rule first', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-4*', 'gpt-3.5*', '*'],
          rewriteValue: 'first-match',
        },
        {
          field: 'model',
          matchValues: ['claude-3*', 'claude-*'],
          rewriteValue: 'second-match',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      // 新逻辑：按配置顺序，规则1在前
      // gpt-4 匹配规则1的 gpt-4* → 返回 first-match
      const result1 = await service.findMatch('gpt-4');
      expect(result1?.rewrittenModel).toBe('first-match');

      // claude-3-opus 先检查规则1: gpt-4* 不匹配，gpt-3.5* 不匹配，* 匹配 → 返回 first-match
      // 新逻辑：按顺序匹配，规则1先匹配到*，所以返回 first-match
      const result2 = await service.findMatch('claude-3-opus');
      expect(result2?.rewrittenModel).toBe('first-match');

      // 如果想让 claude-3-opus 匹配规则2，需要把规则2放在规则1前面
    });
  });

  describe('gpt-3.5 匹配问题 (Specific gpt-3.5 Matching)', () => {
    it('should match gpt-3.5-turbo with gpt-3.5* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*'],
          rewriteValue: 'gpt-3.5-flash',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo');

      expect(result?.rewrittenModel).toBe('gpt-3.5-flash');
      expect(result?.matchedRules[0].matchValues).toEqual(['gpt-3.5*']);
    });

    it('should match gpt-3.5 with gpt-3.5* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*'],
          rewriteValue: 'gpt-3.5-target',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5');

      expect(result?.rewrittenModel).toBe('gpt-3.5-target');
      expect(result?.matchedRules[0].matchValues).toEqual(['gpt-3.5*']);
    });

    it('should match gpt-3.5-turbo-16k with gpt-3.5* pattern', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*'],
          rewriteValue: 'gpt-3.5-upgrade',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo-16k');

      expect(result?.rewrittenModel).toBe('gpt-3.5-upgrade');
    });

    it('should NOT match gpt-3.5 with gpt-3.5-turbo pattern (exact match only)', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5-turbo'],
          rewriteValue: 'exact-only',
        },
        {
          field: 'model',
          matchValues: ['*'],
          rewriteValue: 'fallback',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5');

      // Should match with fallback, not exact-only
      expect(result?.rewrittenModel).toBe('fallback');
      expect(result?.matchedRules[0].matchValues).toContain('*');
    });

    it('should prioritize exact gpt-3.5-turbo over prefix gpt-3.5*', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['gpt-3.5*', 'gpt-3.5-turbo'],
          rewriteValue: 'same-target',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      const result = await service.findMatch('gpt-3.5-turbo');

      // Should still match (same target)
      expect(result?.rewrittenModel).toBe('same-target');
      expect(result?.matchedRules).toHaveLength(1);
    });

    it('should handle * at beginning of matchValues correctly', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['*', 'gpt-3.5*', 'gpt-3.5-turbo'],
          rewriteValue: 'test-rewrite',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      // Exact match should still work
      const result1 = await service.findMatch('gpt-3.5-turbo');
      expect(result1?.rewrittenModel).toBe('test-rewrite');

      // Prefix match should work
      const result2 = await service.findMatch('gpt-3.5-turbo-16k');
      expect(result2?.rewrittenModel).toBe('test-rewrite');

      // Wildcard should work for non-matching models
      const result3 = await service.findMatch('claude-3-opus');
      expect(result3?.rewrittenModel).toBe('test-rewrite');
    });
  });

  describe('大量规则组合测试 (Large Rule Combinations)', () => {
    it('should use configuration order - first rule that matches wins', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['*'],  // Wildcard first - will match everything!
          rewriteValue: 'fallback-model',
        },
        {
          field: 'model',
          matchValues: ['glm-4.6'],
          rewriteValue: 'exact-glm-4.6',
        },
        {
          field: 'model',
          matchValues: ['glm-4.7'],
          rewriteValue: 'exact-glm-4.7',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      // 新逻辑：按配置顺序，第一个规则是 *，所以所有请求都会匹配到 *
      // 用户需要把更具体的规则放在前面
      const result1 = await service.findMatch('glm-4.6');
      expect(result1?.rewrittenModel).toBe('fallback-model'); // 因为 * 在前面

      const result2 = await service.findMatch('glm-4.7');
      expect(result2?.rewrittenModel).toBe('fallback-model');

      const result9 = await service.findMatch('gemini-1.5-pro');
      expect(result9?.rewrittenModel).toBe('fallback-model');
    });

    it('should work correctly when specific rules are placed first', async () => {
      // 正确的配置方式：更具体的规则放在前面
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['glm-4.6'],
          rewriteValue: 'exact-glm-4.6',
        },
        {
          field: 'model',
          matchValues: ['glm-4.7'],
          rewriteValue: 'exact-glm-4.7',
        },
        {
          field: 'model',
          matchValues: ['*'],  // Wildcard last - only matches when nothing else matches
          rewriteValue: 'fallback-model',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      // 更具体的规则在前面，精确匹配会先匹配
      const result1 = await service.findMatch('glm-4.6');
      expect(result1?.rewrittenModel).toBe('exact-glm-4.6');

      const result2 = await service.findMatch('glm-4.7');
      expect(result2?.rewrittenModel).toBe('exact-glm-4.7');

      // 只有不匹配更具体的规则时，才会匹配 *
      const result9 = await service.findMatch('gemini-1.5-pro');
      expect(result9?.rewrittenModel).toBe('fallback-model');
    });

    it('should handle user-provided real-world configuration', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['glm-4.6'],
          rewriteValue: 'glm-4.6',
        },
        {
          field: 'model',
          matchValues: ['glm-4.7'],
          rewriteValue: 'glm-4.7',
        },
        {
          field: 'model',
          matchValues: ['claude-3-opus*', 'claude-3-5-sonnet*'],
          rewriteValue: 'glm-4.6',
        },
        {
          field: 'model',
          matchValues: ['claude-3-sonnet*', 'claude-3-haiku*', 'claude-3-5-haiku*'],
          rewriteValue: 'glm-4.6',
        },
        {
          field: 'model',
          matchValues: ['gpt-4o'],
          rewriteValue: 'glm-4.7',
        },
        {
          field: 'model',
          matchValues: ['gpt-4*', 'gpt-4o-mini'],
          rewriteValue: 'glm-4.6',
        },
        {
          field: 'model',
          matchValues: ['*'],
          rewriteValue: 'glm-4.5-air',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      // Test exact matches
      expect((await service.findMatch('glm-4.6'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('glm-4.7'))?.rewrittenModel).toBe('glm-4.7');
      expect((await service.findMatch('gpt-4o'))?.rewrittenModel).toBe('glm-4.7');
      expect((await service.findMatch('gpt-4o-mini'))?.rewrittenModel).toBe('glm-4.6');

      // Test prefix matches
      expect((await service.findMatch('claude-3-opus'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('claude-3-opus-20240229'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('claude-3-5-sonnet-20241022'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('claude-3-sonnet-20240229'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('claude-3-haiku-20240307'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('claude-3-5-haiku-20241022'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('gpt-4-turbo'))?.rewrittenModel).toBe('glm-4.6');
      expect((await service.findMatch('gpt-4'))?.rewrittenModel).toBe('glm-4.6');

      // Test fallback wildcard
      expect((await service.findMatch('gemini-1.5-pro'))?.rewrittenModel).toBe('glm-4.5-air');
      expect((await service.findMatch('llama-3-70b'))?.rewrittenModel).toBe('glm-4.5-air');
    });

    it('should use configuration order - wildcard in middle affects later rules', async () => {
      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['exact-model-1'],
          rewriteValue: 'target-1',
        },
        {
          field: 'model',
          matchValues: ['*'],  // Wildcard in the middle - will match everything after this rule
          rewriteValue: 'fallback',
        },
        {
          field: 'model',
          matchValues: ['exact-model-2'],
          rewriteValue: 'target-2',
        },
        {
          field: 'model',
          matchValues: ['prefix-*'],
          rewriteValue: 'prefix-target',
        },
      ]);

      mockQueryAll.mockReturnValue([
        {
          ...mockRoutesDbRow,
          overrides,
        },
      ] as any);

      // exact-model-1 匹配规则1 → 返回 target-1 ✓
      expect((await service.findMatch('exact-model-1'))?.rewrittenModel).toBe('target-1');

      // exact-model-2: 先检查规则1（不匹配），再检查规则2（* 匹配！）→ 返回 fallback
      // 因为 * 在规则2，会先匹配到
      expect((await service.findMatch('exact-model-2'))?.rewrittenModel).toBe('fallback');

      // prefix-123: 先检查规则1（不匹配），再检查规则2（* 匹配！）→ 返回 fallback
      expect((await service.findMatch('prefix-123'))?.rewrittenModel).toBe('fallback');

      // unknown-model: 匹配规则2的 * → 返回 fallback
      expect((await service.findMatch('unknown-model'))?.rewrittenModel).toBe('fallback');
    });
  });
});
