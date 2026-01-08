/**
 * Component Cache Management
 *
 * 智能缓存系统，用于：
 * - 存储组件分析结果
 * - 检测组件变更
 * - 计算相似度
 * - 管理变更历史
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentInfo } from './types.js';

/**
 * 组件分析结果（大模型分析）
 */
export interface ComponentAnalysis {
  /** 组件功能总结 */
  summary: string;
  /** Props 说明 */
  props: string;
  /** 最后分析时间 */
  lastAnalyzed: string;
}

/**
 * 组件变更历史记录
 */
export interface ComponentChangeHistory {
  /** 组件 hash */
  hash: string;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 变更类型 */
  changeType: 'created' | 'modified' | 'unchanged';
  /** 与上一版本的相似度 (0-1) */
  similarity: number;
}

/**
 * 缓存的组件信息
 */
export interface CachedComponent {
  /** 组件名 */
  name: string;
  /** 组件内容 hash */
  hash: string;
  /** 文件 hash */
  fileHash: string;
  /** 大模型分析结果（可选） */
  analysis?: ComponentAnalysis;
  /** 变更历史 */
  history: ComponentChangeHistory[];
}

/**
 * 组件缓存结构
 */
export interface ComponentCache {
  /** 版本号 */
  version: string;
  /** 所有组件（key: 组件名） */
  components: Record<string, CachedComponent>;
  /** 最后更新时间 */
  lastUpdate: string;
}

/**
 * 缓存管理器
 */
export class ComponentCacheManager {
  private cachePath: string;
  private cache: ComponentCache | null = null;

  constructor(cachePath: string = '.component-cache.json') {
    this.cachePath = resolve(cachePath);
  }

  /**
   * 加载缓存
   */
  async loadCache(): Promise<ComponentCache> {
    if (!existsSync(this.cachePath)) {
      console.log('[component-cache] 📝 缓存文件不存在，创建新缓存');
      this.cache = this.createEmptyCache();
      await this.saveCache(this.cache);
      return this.cache;
    }

    try {
      const content = await readFile(this.cachePath, 'utf-8');
      this.cache = JSON.parse(content) as ComponentCache;
      console.log(`[component-cache] ✅ 已加载缓存 (${Object.keys(this.cache.components).length} 个组件)`);
      return this.cache;
    } catch (error) {
      console.error('[component-cache] ❌ 加载缓存失败:', error);
      this.cache = this.createEmptyCache();
      await this.saveCache(this.cache);
      return this.cache;
    }
  }

  /**
   * 保存缓存
   */
  async saveCache(cache: ComponentCache): Promise<void> {
    try {
      cache.lastUpdate = new Date().toISOString();
      await writeFile(this.cachePath, JSON.stringify(cache, null, 2), 'utf-8');
      console.log(`[component-cache] 💾 已保存缓存 (${Object.keys(cache.components).length} 个组件)`);
    } catch (error) {
      console.error('[component-cache] ❌ 保存缓存失败:', error);
      throw error;
    }
  }

  /**
   * 创建空缓存
   */
  private createEmptyCache(): ComponentCache {
    return {
      version: '1.0.0',
      components: {},
      lastUpdate: new Date().toISOString(),
    };
  }

  /**
   * 判断组件是否需要重新分析
   *
   * @param componentName - 组件名
   * @param newHash - 新的 hash
   * @param threshold - 相似度阈值（默认 0.95）
   * @returns 是否需要重新分析
   */
  shouldReanalyze(
    componentName: string,
    newHash: string,
    threshold: number = 0.95
  ): boolean {
    if (!this.cache) {
      console.warn('[component-cache] ⚠️  缓存未加载，默认需要分析');
      return true;
    }

    const cached = this.cache.components[componentName];

    // 1. 没有缓存 → 需要分析
    if (!cached) {
      console.log(`[component-cache] 🆕 组件 ${componentName} 未缓存，需要分析`);
      return true;
    }

    // 2. hash 相同 → 不需要分析
    if (cached.hash === newHash) {
      console.log(`[component-cache] ✅ 组件 ${componentName} 未变更，不需要分析`);
      return false;
    }

    // 3. hash 不同，计算相似度
    const similarity = this.computeHashSimilarity(cached.hash, newHash);
    console.log(`[component-cache] 📊 组件 ${componentName} 相似度: ${(similarity * 100).toFixed(1)}%`);

    // 4. 相似度 >= 阈值 → 可选（返回 false，表示不需要重新分析）
    if (similarity >= threshold) {
      console.log(`[component-cache] ✅ 组件 ${componentName} 变更较小，不需要重新分析`);
      return false;
    }

    // 5. 相似度 < 阈值 → 需要重新分析
    console.log(`[component-cache] ⚠️  组件 ${componentName} 变更较大，需要重新分析`);
    return true;
  }

  /**
   * 计算 hash 相似度
   *
   * 注意：MD5 hash 有 avalanche property，所以不能直接比较 hash 字符串。
   * 这里我们简化处理：如果 hash 完全相同，相似度为 1；否则为 0。
   *
   * 真实的相似度计算应该基于实际内容，使用 Jaccard 或 Levenshtein 距离。
   *
   * @param oldHash - 旧的 hash
   * @param newHash - 新的 hash
   * @returns 相似度 (0-1)
   */
  computeHashSimilarity(oldHash: string, newHash: string): number {
    // 简单版本：hash 相同为 1，否则为 0
    // 这是保守的做法，确保任何变更都会触发重新分析
    return oldHash === newHash ? 1 : 0;
  }

  /**
   * 计算字符串相似度（Jaccard 相似度）
   *
   * @param str1 - 字符串 1
   * @param str2 - 字符串 2
   * @returns 相似度 (0-1)
   */
  computeStringSimilarity(str1: string, str2: string): number {
    // 将字符串转换为字符集合
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));

    // 计算交集和并集
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    // Jaccard 相似度 = |A ∩ B| / |A ∪ B|
    // 如果并集为空（两个字符串都为空），返回 0
    if (union.size === 0) {
      return 0;
    }
    return intersection.size / union.size;
  }

  /**
   * 更新组件缓存
   *
   * @param componentName - 组件名
   * @param componentInfo - 组件信息
   * @param analysis - 分析结果（可选）
   */
  async updateComponent(
    componentName: string,
    componentInfo: Pick<ComponentInfo, 'hash' | 'fileHash'>,
    analysis?: ComponentAnalysis
  ): Promise<void> {
    if (!this.cache) {
      await this.loadCache();
    }

    if (!this.cache) {
      throw new Error('无法加载缓存');
    }

    const cached = this.cache.components[componentName];
    const now = new Date().toISOString();

    if (cached) {
      // 已存在：更新历史记录
      const historyEntry: ComponentChangeHistory = {
        hash: componentInfo.hash,
        timestamp: now,
        changeType: cached.hash === componentInfo.hash ? 'unchanged' : 'modified',
        similarity: this.computeHashSimilarity(cached.hash, componentInfo.hash),
      };

      // 保留最近 10 条历史记录
      cached.history = [historyEntry, ...cached.history].slice(0, 10);
      cached.hash = componentInfo.hash;
      cached.fileHash = componentInfo.fileHash;

      if (analysis) {
        cached.analysis = analysis;
      }

      console.log(`[component-cache] 🔄 已更新组件 ${componentName}`);
    } else {
      // 新组件：创建缓存条目
      this.cache.components[componentName] = {
        name: componentName,
        hash: componentInfo.hash,
        fileHash: componentInfo.fileHash,
        analysis,
        history: [
          {
            hash: componentInfo.hash,
            timestamp: now,
            changeType: 'created',
            similarity: 1,
          },
        ],
      };

      console.log(`[component-cache] ➕ 已添加组件 ${componentName}`);
    }

    await this.saveCache(this.cache);
  }

  /**
   * 批量更新组件缓存
   *
   * @param components - 组件信息映射
   */
  async updateComponents(components: Record<string, ComponentInfo>): Promise<void> {
    if (!this.cache) {
      await this.loadCache();
    }

    if (!this.cache) {
      throw new Error('无法加载缓存');
    }

    for (const [name, info] of Object.entries(components)) {
      await this.updateComponent(name, info);
    }
  }

  /**
   * 获取组件缓存
   *
   * @param componentName - 组件名
   * @returns 缓存的组件信息，如果不存在则返回 undefined
   */
  getCachedComponent(componentName: string): CachedComponent | undefined {
    if (!this.cache) {
      console.warn('[component-cache] ⚠️  缓存未加载');
      return undefined;
    }

    return this.cache.components[componentName];
  }

  /**
   * 获取所有缓存组件
   *
   * @returns 所有缓存的组件
   */
  getAllCachedComponents(): Record<string, CachedComponent> {
    if (!this.cache) {
      console.warn('[component-cache] ⚠️  缓存未加载');
      return {};
    }

    return this.cache.components;
  }

  /**
   * 清除缓存
   */
  async clearCache(): Promise<void> {
    this.cache = this.createEmptyCache();
    await this.saveCache(this.cache);
    console.log('[component-cache] 🗑️  已清除缓存');
  }

  /**
   * 获取缓存统计信息
   *
   * @returns 统计信息
   */
  getCacheStats(): {
    totalComponents: number;
    componentsWithAnalysis: number;
    avgHistoryLength: number;
  } {
    if (!this.cache) {
      return {
        totalComponents: 0,
        componentsWithAnalysis: 0,
        avgHistoryLength: 0,
      };
    }

    const components = Object.values(this.cache.components);
    const componentsWithAnalysis = components.filter(c => c.analysis).length;
    const totalHistoryLength = components.reduce((sum, c) => sum + c.history.length, 0);
    const avgHistoryLength = components.length > 0 ? totalHistoryLength / components.length : 0;

    return {
      totalComponents: components.length,
      componentsWithAnalysis,
      avgHistoryLength: Math.round(avgHistoryLength * 10) / 10,
    };
  }
}

/**
 * 创建默认的缓存管理器实例
 */
export function createCacheManager(
  cachePath: string = '.component-cache.json'
): ComponentCacheManager {
  return new ComponentCacheManager(cachePath);
}
