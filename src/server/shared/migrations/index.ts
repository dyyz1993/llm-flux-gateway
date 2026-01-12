/**
 * Database Migrations
 *
 * 迁移文件命名格式: XXX_description.ts
 * XXX = 三位版本号，确保执行顺序
 */

import type { Migration } from './types';
import { migration_001_add_is_favorited } from './migrations/001_add_is_favorited_to_request_logs';
import { migration_002_add_endpoint } from './migrations/002_add_endpoint_to_vendor_templates';
import { migration_003_routes_schema } from './migrations/003_fix_routes_table_schema';
import { migration_004_validation_columns } from './migrations/004_add_validation_columns';
import { migration_005_response_tracking } from './migrations/005_add_response_tracking_columns';
import { migration_006_remove_duplicates } from './migrations/006_remove_duplicate_vendor_models';
import { migration_007_system_config } from './migrations/007_add_system_config_fields';
import { migration_008_stream_column } from './migrations/008_add_stream_to_request_logs';
import { migration_009_temperature_params } from './migrations/009_migrate_temperature_to_request_params';
import { migration_010_original_request_columns } from './migrations/010_add_original_request_columns';

/**
 * 所有迁移列表
 *
 * 添加新迁移时:
 * 1. 在 migrations/ 目录创建新文件
 * 2. 在此数组中导入并添加
 * 3. 使用唯一的版本号（递增）
 */
export const ALL_MIGRATIONS: Migration[] = [
  migration_001_add_is_favorited,
  migration_002_add_endpoint,
  migration_003_routes_schema,
  migration_004_validation_columns,
  migration_005_response_tracking,
  migration_006_remove_duplicates,
  migration_007_system_config,
  migration_008_stream_column,
  migration_009_temperature_params,
  migration_010_original_request_columns,
];

/**
 * 导出迁移运行器
 */
export { runMigrations } from './runner';
export type { Migration, MigrationResult, ExecutedMigration } from './types';
export { MigrationRisk } from './types';
