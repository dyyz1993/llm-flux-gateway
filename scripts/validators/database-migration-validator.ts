/**
 * Database Migration Validator
 *
 * 在提交前检查是否有数据库相关的改动
 * 如果有，提示用户使用 database-migrations skill
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  hasDatabaseChanges: boolean;
}

/**
 * 检查是否有数据库相关的文件改动
 */
function checkDatabaseChanges(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    hasDatabaseChanges: false,
  };

  try {
    // 获取暂存区文件列表
    const stagedFiles = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
    }).split('\n').filter(Boolean);

    // 获取未暂存但已修改的文件列表
    const unstagedFiles = execSync('git diff --name-only', {
      encoding: 'utf-8',
    }).split('\n').filter(Boolean);

    // 合并所有改动文件
    const changedFiles = [...new Set([...stagedFiles, ...unstagedFiles])];

    // 数据库相关文件
    const databaseFiles = [
      'src/server/shared/database.ts',
      'src/server/shared/schema.ts',
      'src/server/shared/migrations/',
    ];

    // 检查是否有数据库文件改动
    const hasDatabaseChanges = changedFiles.some(file =>
      databaseFiles.some(dbFile => file.includes(dbFile))
    );

    if (!hasDatabaseChanges) {
      return result;
    }

    result.hasDatabaseChanges = true;

    // 检查具体的改动内容
    for (const file of changedFiles) {
      if (file.includes('database.ts')) {
        const content = readFileSync(resolve(file), 'utf-8');

        // 检查是否有直接的迁移逻辑（应该使用迁移文件）
        if (content.includes('ALTER TABLE') && !file.includes('migrations/')) {
          result.warnings.push(
            `⚠️  ${file}: 检测到 ALTER TABLE 语句\n` +
            `   请使用迁移文件 (migrations/migrations/XXX_xxx.ts) 而非直接在 database.ts 中修改`
          );
        }

        // 检查是否有新的 CREATE TABLE（应该在 database.ts 中）
        const newTableMatches = content.match(/CREATE TABLE IF NOT EXISTS \w+/g);
        if (newTableMatches && file !== 'src/server/shared/database.ts') {
          result.errors.push(
            `❌ ${file}: 新表定义只能在 database.ts 中\n` +
            `   请将表定义移至 database.ts 的 initDatabase() 函数中`
          );
          result.valid = false;
        }
      }

      // 检查迁移文件是否正确注册
      if (file.includes('migrations/migrations/') && file.endsWith('.ts')) {
        const migrationMatch = file.match(/(\d+)_.*\.ts/);
        if (migrationMatch) {
          const version = migrationMatch[1];

          // 检查是否在 index.ts 中注册
          try {
            const indexContent = readFileSync('src/server/shared/migrations/index.ts', 'utf-8');
            if (!indexContent.includes(`migration_${version}`) &&
                !indexContent.includes(`from './migrations/${migrationMatch[0]}'`)) {
              result.errors.push(
                `❌ ${file}: 迁移未在 migrations/index.ts 中注册\n` +
                `   请在 index.ts 中导入并添加到 ALL_MIGRATIONS 数组`
              );
              result.valid = false;
            }
          } catch {
            // index.ts 可能不存在或无法读取
          }
        }
      }
    }

    // 检查迁移文件版本号是否连续
    const migrationFiles = changedFiles.filter(f =>
      f.match(/src\/server\/shared\/migrations\/migrations\/\d+_.*\.ts/)
    );

    if (migrationFiles.length > 0) {
      const versions = migrationFiles
        .map(f => parseInt(f.match(/(\d+)_/)?.[1] || '0', 10))
        .sort((a, b) => a - b);

      // 检查是否有重复版本号
      const uniqueVersions = new Set(versions);
      if (uniqueVersions.size !== versions.length) {
        result.errors.push(
          '❌ 检测到重复的迁移版本号\n' +
          '   请确保每个迁移文件有唯一的版本号'
        );
        result.valid = false;
      }

      // 读取现有迁移
      try {
        const indexContent = readFileSync('src/server/shared/migrations/index.ts', 'utf-8');
        const existingMatches = indexContent.matchAll(/migration_(\d+)_/g);
        const existingVersions = new Set<number>();
        for (const match of existingMatches) {
          existingVersions.add(parseInt(match[1], 10));
        }

        // 检查新版本号是否大于现有最大版本号
        const maxExisting = Math.max(...existingVersions, 0);
        const minNew = Math.min(...versions);

        if (minNew <= maxExisting) {
          result.errors.push(
            `❌ 新迁移版本号 (${minNew}) 必须大于现有最大版本号 (${maxExisting})\n` +
            `   请使用版本号 ${maxExisting + 1} 或更大`
          );
          result.valid = false;
        }
      } catch {
        // index.ts 可能不存在
      }
    }

    return result;
  } catch (error) {
    // git 命令失败（可能不是 git 仓库）
    return result;
  }
}

/**
 * 主函数
 */
export function validate(): ValidationResult {
  const result = checkDatabaseChanges();

  if (result.hasDatabaseChanges) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Database Migration Check');
    console.log('='.repeat(60));

    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.log('\n❌ 发现问题:\n');

      for (const error of result.errors) {
        console.log(error);
      }

      for (const warning of result.warnings) {
        console.log(warning);
      }

      console.log('\n📖 请使用 /skill:database-migrations 查看迁移规范');
    } else {
      console.log('\n✅ 数据库改动检查通过');
      console.log('📝 提醒: 请确保已按规范创建迁移文件');
    }

    console.log('='.repeat(60) + '\n');
  }

  return result;
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validate();
  process.exit(result.valid ? 0 : 1);
}
