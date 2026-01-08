#!/usr/bin/env tsx

/**
 * 模拟 Vite 插件解析 CSS 并同步到独立服务
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'postcss';
import { createHash } from 'node:crypto';
import { normalizePath } from 'vite';

interface StyleLocation {
  file: string;
  line: number;
  column: number;
  selector: string;
  type: 'css' | 'scss' | 'less';
}

interface StyleMap {
  [styleId: string]: StyleLocation;
}

function generateStyleId(selector: string, file: string, line: number): string {
  const hash = createHash('md5')
    .update(selector + file + line)
    .digest('hex')
    .slice(0, 8);
  return `style-${hash}`;
}

function parseCssFile(filePath: string): StyleMap {
  const code = readFileSync(filePath, 'utf-8');
  const styleMap: StyleMap = {};
  const root = parse(code);

  root.each((node) => {
    if (node.type === 'rule') {
      const rule = node as any;
      const selector = rule.selector;

      if (!selector || selector.startsWith('@')) return;

      const styleId = generateStyleId(selector, filePath, rule.source?.start?.line || 0);

      styleMap[styleId] = {
        file: normalizePath(filePath),
        line: rule.source?.start?.line || 0,
        column: rule.source?.start?.column || 0,
        selector,
        type: 'css',
      };

      console.log(`✓ ${styleId} ← ${selector} @ ${filePath}:${rule.source?.start?.line}`);
    }
  });

  return styleMap;
}

async function syncToServer(styleMap: StyleMap): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3001/api/style-map', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(styleMap),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`\n✅ 已同步 ${Object.keys(styleMap).length} 个样式到独立服务`);
      console.log(`   服务响应:`, result);
      return true;
    } else {
      console.error(`\n❌ 同步失败: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error(`\n❌ 无法连接到独立服务:`, error);
    return false;
  }
}

async function main() {
  console.log('🧪 模拟 Vite 插件解析 CSS 并同步到独立服务\n');
  console.log('━'.repeat(60));

  const cssFilePath = join(process.cwd(), 'src/client/test-styles.css');
  console.log(`\n📄 解析文件: ${cssFilePath}\n`);

  // 解析 CSS 文件
  const styleMap = parseCssFile(cssFilePath);

  console.log(`\n📊 解析完成，共 ${Object.keys(styleMap).length} 个样式规则`);
  console.log('━'.repeat(60));

  // 同步到独立服务
  await syncToServer(styleMap);

  // 验证数据
  console.log('\n🔍 验证数据已同步...');
  const getResponse = await fetch('http://localhost:3001/api/style-map');
  const data = await getResponse.json();

  console.log(`✅ 独立服务现在有 ${Object.keys(data).length} 个样式规则`);

  console.log('\n📋 样式映射预览:');
  const previewEntries = Object.entries(data).slice(0, 3);
  previewEntries.forEach(([id, loc]: [string, any]) => {
    console.log(`   ${id}: ${loc.selector} @ ${loc.file}:${loc.line}`);
  });

  if (Object.keys(data).length > 3) {
    console.log(`   ... 还有 ${Object.keys(data).length - 3} 个`);
  }

  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
