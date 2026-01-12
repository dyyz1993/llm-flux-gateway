import type { DatabaseSync } from 'node:sqlite';

/**
 * 迁移危险等级
 */
export enum MigrationRisk {
  /** 🟢 安全 - 只添加列或索引，不影响现有数据 */
  SAFE = 'safe',
  /** 🟡 中等 - 修改数据结构，可能需要数据迁移 */
  MODERATE = 'moderate',
  /** 🔴 危险 - 删除数据、重建表或不可逆操作 */
  DANGEROUS = 'dangerous',
}

/**
 * 迁移接口
 */
export interface Migration {
  /** 版本号 (例如: "001", "002") */
  version: string;
  /** 迁移名称 */
  name: string;
  /** 危险等级 */
  risk: MigrationRisk;
  /** 描述 */
  description: string;
  /** 创建日期 (YYYY-MM-DD) */
  createdAt: string;
  /** 执行迁移 */
  up: (db: DatabaseSync) => Promise<void> | void;
  /** 回滚迁移（可选） */
  down?: (db: DatabaseSync) => Promise<void> | void;
}

/**
 * 迁移执行结果
 */
export interface MigrationResult {
  version: string;
  name: string;
  success: boolean;
  error?: string;
  executedAt?: number;
}

/**
 * 已执行的迁移记录
 */
export interface ExecutedMigration {
  version: string;
  name: string;
  executed_at: number;
}
