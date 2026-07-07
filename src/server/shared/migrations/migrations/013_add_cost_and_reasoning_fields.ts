/**
 * Migration 013: 添加费用和推理 token 统计字段
 *
 * reasonint_tokens: 推理/思考 token 数
 * input_cost / output_cost / cache_read_cost / cache_write_cost / total_cost: 费用明细
 * cache_hit_rate: 缓存命中率（0-100）
 */
import type { Migration } from '../types';

const migration: Migration = {
  name: '013_add_cost_and_reasoning_fields',
  sql: `
    ALTER TABLE request_logs ADD COLUMN reasoning_tokens INTEGER DEFAULT 0;
    ALTER TABLE request_logs ADD COLUMN input_cost REAL DEFAULT 0;
    ALTER TABLE request_logs ADD COLUMN output_cost REAL DEFAULT 0;
    ALTER TABLE request_logs ADD COLUMN cache_read_cost REAL DEFAULT 0;
    ALTER TABLE request_logs ADD COLUMN cache_write_cost REAL DEFAULT 0;
    ALTER TABLE request_logs ADD COLUMN total_cost REAL DEFAULT 0;
    ALTER TABLE request_logs ADD COLUMN cache_hit_rate REAL DEFAULT 0;
  `,
};

export default migration;
