/**
 * Component Cache Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ComponentCacheManager } from '../../src/server/module-component-registry/cache.js';
import type { ComponentInfo } from '../../src/server/module-component-registry/types.js';

const TEST_CACHE_PATH = resolve('.test-component-cache.json');

describe('ComponentCacheManager', () => {
  let manager: ComponentCacheManager;

  beforeEach(async () => {
    // 清理测试缓存文件
    if (existsSync(TEST_CACHE_PATH)) {
      await unlink(TEST_CACHE_PATH);
    }
    manager = new ComponentCacheManager(TEST_CACHE_PATH);
  });

  afterEach(async () => {
    // 清理测试缓存文件
    if (existsSync(TEST_CACHE_PATH)) {
      await unlink(TEST_CACHE_PATH);
    }
  });

  describe('loadCache', () => {
    it('应该在缓存文件不存在时创建新缓存', async () => {
      const cache = await manager.loadCache();

      expect(cache).toBeDefined();
      expect(cache.version).toBe('1.0.0');
      expect(cache.components).toEqual({});
      expect(cache.lastUpdate).toBeDefined();
    });

    it('应该加载已存在的缓存', async () => {
      // 先创建并保存一个缓存
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      // 创建新的 manager 实例来测试加载
      const newManager = new ComponentCacheManager(TEST_CACHE_PATH);
      const cache = await newManager.loadCache();

      expect(cache.components['TestComponent']).toBeDefined();
      expect(cache.components['TestComponent'].hash).toBe('abc123');
    });
  });

  describe('shouldReanalyze', () => {
    it('应该在组件未缓存时返回 true', async () => {
      await manager.loadCache();
      const result = manager.shouldReanalyze('NewComponent', 'xyz789');

      expect(result).toBe(true);
    });

    it('应该在 hash 相同时返回 false', async () => {
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      const result = manager.shouldReanalyze('TestComponent', 'abc123');

      expect(result).toBe(false);
    });

    it('应该在 hash 不同时返回 true（保守策略）', async () => {
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      const result = manager.shouldReanalyze('TestComponent', 'xyz789');

      expect(result).toBe(true);
    });

    it('应该正确处理自定义阈值', async () => {
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      // hash 相同，无论阈值多少都应该返回 false
      const result1 = manager.shouldReanalyze('TestComponent', 'abc123', 0.5);
      expect(result1).toBe(false);

      const result2 = manager.shouldReanalyze('TestComponent', 'abc123', 1.0);
      expect(result2).toBe(false);
    });
  });

  describe('computeHashSimilarity', () => {
    it('应该在 hash 相同时返回 1', () => {
      const similarity = manager.computeHashSimilarity('abc123', 'abc123');
      expect(similarity).toBe(1);
    });

    it('应该在 hash 不同时返回 0', () => {
      const similarity = manager.computeHashSimilarity('abc123', 'def456');
      expect(similarity).toBe(0);
    });
  });

  describe('computeStringSimilarity', () => {
    it('应该正确计算 Jaccard 相似度', () => {
      const sim1 = manager.computeStringSimilarity('hello', 'hello');
      expect(sim1).toBe(1);

      const sim2 = manager.computeStringSimilarity('hello', 'world');
      expect(sim2).toBeGreaterThan(0);
      expect(sim2).toBeLessThan(1);

      const sim3 = manager.computeStringSimilarity('abc', 'def');
      expect(sim3).toBe(0);
    });

    it('应该处理空字符串', () => {
      const sim1 = manager.computeStringSimilarity('', '');
      expect(sim1).toBe(0); // 空集合，并集为 0

      const sim2 = manager.computeStringSimilarity('abc', '');
      expect(sim2).toBe(0);
    });
  });

  describe('updateComponent', () => {
    it('应该添加新组件', async () => {
      await manager.updateComponent('NewComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      const cached = manager.getCachedComponent('NewComponent');
      expect(cached).toBeDefined();
      expect(cached?.name).toBe('NewComponent');
      expect(cached?.hash).toBe('abc123');
      expect(cached?.fileHash).toBe('def456');
      expect(cached?.history).toHaveLength(1);
      expect(cached?.history[0].changeType).toBe('created');
    });

    it('应该更新已存在的组件', async () => {
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      await manager.updateComponent('TestComponent', {
        hash: 'xyz789',
        fileHash: 'uvw012',
      });

      const cached = manager.getCachedComponent('TestComponent');
      expect(cached?.hash).toBe('xyz789');
      expect(cached?.fileHash).toBe('uvw012');
      expect(cached?.history).toHaveLength(2);
      expect(cached?.history[0].changeType).toBe('modified');
      expect(cached?.history[1].changeType).toBe('created');
    });

    it('应该保存分析结果', async () => {
      const analysis = {
        summary: 'Test summary',
        props: 'Test props',
        lastAnalyzed: new Date().toISOString(),
      };

      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      }, analysis);

      const cached = manager.getCachedComponent('TestComponent');
      expect(cached?.analysis).toEqual(analysis);
    });

    it('应该保留最近 10 条历史记录', async () => {
      // 添加 11 次更新
      for (let i = 0; i < 11; i++) {
        await manager.updateComponent('TestComponent', {
          hash: `hash${i}`,
          fileHash: `fileHash${i}`,
        });
      }

      const cached = manager.getCachedComponent('TestComponent');
      expect(cached?.history).toHaveLength(10);
      expect(cached?.history[0].hash).toBe('hash10');
      expect(cached?.history[9].hash).toBe('hash1');
    });
  });

  describe('updateComponents', () => {
    it('应该批量更新多个组件', async () => {
      const components: Record<string, ComponentInfo> = {
        Component1: { hash: 'hash1', fileHash: 'file1', dependencies: [], dependents: [], file: '', line: 0, column: 0, startIndex: 0 } as ComponentInfo,
        Component2: { hash: 'hash2', fileHash: 'file2', dependencies: [], dependents: [], file: '', line: 0, column: 0, startIndex: 0 } as ComponentInfo,
        Component3: { hash: 'hash3', fileHash: 'file3', dependencies: [], dependents: [], file: '', line: 0, column: 0, startIndex: 0 } as ComponentInfo,
      };

      await manager.updateComponents(components);

      expect(manager.getCachedComponent('Component1')).toBeDefined();
      expect(manager.getCachedComponent('Component2')).toBeDefined();
      expect(manager.getCachedComponent('Component3')).toBeDefined();
    });
  });

  describe('getCachedComponent', () => {
    it('应该返回缓存的组件', async () => {
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      const cached = manager.getCachedComponent('TestComponent');
      expect(cached).toBeDefined();
      expect(cached?.name).toBe('TestComponent');
    });

    it('应该在组件不存在时返回 undefined', () => {
      const cached = manager.getCachedComponent('NonExistent');
      expect(cached).toBeUndefined();
    });

    it('应该在缓存未加载时返回 undefined', () => {
      const newManager = new ComponentCacheManager(TEST_CACHE_PATH);
      const cached = newManager.getCachedComponent('TestComponent');
      expect(cached).toBeUndefined();
    });
  });

  describe('getAllCachedComponents', () => {
    it('应该返回所有缓存的组件', async () => {
      await manager.updateComponent('Component1', {
        hash: 'hash1',
        fileHash: 'file1',
      });
      await manager.updateComponent('Component2', {
        hash: 'hash2',
        fileHash: 'file2',
      });

      const all = manager.getAllCachedComponents();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all['Component1']).toBeDefined();
      expect(all['Component2']).toBeDefined();
    });

    it('应该在缓存未加载时返回空对象', () => {
      const newManager = new ComponentCacheManager(TEST_CACHE_PATH);
      const all = newManager.getAllCachedComponents();
      expect(all).toEqual({});
    });
  });

  describe('clearCache', () => {
    it('应该清除所有缓存', async () => {
      await manager.updateComponent('TestComponent', {
        hash: 'abc123',
        fileHash: 'def456',
      });

      await manager.clearCache();

      const all = manager.getAllCachedComponents();
      expect(Object.keys(all)).toHaveLength(0);
    });
  });

  describe('getCacheStats', () => {
    it('应该返回正确的统计信息', async () => {
      const analysis = {
        summary: 'Test',
        props: 'Test',
        lastAnalyzed: new Date().toISOString(),
      };

      await manager.updateComponent('Component1', {
        hash: 'hash1',
        fileHash: 'file1',
      }, analysis);

      await manager.updateComponent('Component1', {
        hash: 'hash2',
        fileHash: 'file2',
      });

      await manager.updateComponent('Component2', {
        hash: 'hash3',
        fileHash: 'file3',
      });

      const stats = manager.getCacheStats();

      expect(stats.totalComponents).toBe(2);
      expect(stats.componentsWithAnalysis).toBe(1);
      expect(stats.avgHistoryLength).toBe(1.5);
    });

    it('应该在缓存未加载时返回零值', () => {
      const newManager = new ComponentCacheManager(TEST_CACHE_PATH);
      const stats = newManager.getCacheStats();

      expect(stats.totalComponents).toBe(0);
      expect(stats.componentsWithAnalysis).toBe(0);
      expect(stats.avgHistoryLength).toBe(0);
    });
  });
});
