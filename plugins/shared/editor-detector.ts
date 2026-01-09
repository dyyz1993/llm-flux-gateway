/**
 * 编辑器检测工具
 *
 * 支持多种方式检测和识别当前使用的编辑器：
 * 1. 环境变量配置（优先级最高）
 * 2. 进程检测（自动识别正在运行的编辑器）
 * 3. 命令可用性检测（降级方案）
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

// ES module 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type EditorType = 'trae' | 'code' | 'cursor' | 'jetbrains';

export interface EditorInfo {
  type: EditorType;
  name: string;
  cmd: string;
  gotoArgs: (file: string, line: number, column: number) => string[];
  uriScheme?: (file: string, line: number, column: number) => string;
}

// 支持的编辑器配置
const EDITORS: Record<EditorType, EditorInfo> = {
  trae: {
    type: 'trae',
    name: 'Trae',
    cmd: 'trae',
    gotoArgs: (file, line, column) => ['--goto', `${file}:${line}:${column}`],
    uriScheme: (file, line, column) => `trae://file${file}:${line}:${column}`,
  },
  code: {
    type: 'code',
    name: 'VSCode',
    cmd: 'code',
    gotoArgs: (file, line, column) => ['--goto', `${file}:${line}:${column}`],
    uriScheme: (file, line, column) => `vscode://file${file}:${line}:${column}`,
  },
  cursor: {
    type: 'cursor',
    name: 'Cursor',
    cmd: 'cursor',
    gotoArgs: (file, line, column) => ['--goto', `${file}:${line}:${column}`],
  },
  jetbrains: {
    type: 'jetbrains',
    name: 'JetBrains IDE',
    cmd: 'idea', // 或 webstorm, phpstorm 等
    gotoArgs: (file, line, _column) => ['--line', String(line), `${file}`],
  },
};

// 缓存检测结果
let detectedEditor: EditorInfo | null = null;

/**
 * 获取项目根目录
 */
function getProjectRoot(): string {
  // 从当前文件位置向上查找项目根目录（包含 node_modules 或 package.json）
  const currentDir = __dirname;
  let dir = currentDir;

  while (dir !== '/') {
    try {
      const { existsSync } = require('node:fs');
      if (existsSync(path.join(dir, 'package.json')) ||
          existsSync(path.join(dir, 'node_modules'))) {
        return dir;
      }
    } catch {
      // ignore
    }
    dir = path.dirname(dir);
  }

  return process.cwd();
}

const projectRoot = getProjectRoot();

/**
 * 从环境变量获取编辑器配置
 */
function getEditorFromEnv(): EditorInfo | null {
  // 优先级 1: 专用的 STYLE_JUMP_EDITOR 环境变量
  const envEditor = process.env.STYLE_JUMP_EDITOR || process.env.EDITOR;
  if (!envEditor) return null;

  const editorKey = envEditor.toLowerCase() as EditorType;
  if (EDITORS[editorKey]) {
    console.log(`[editor-detector] 📋 使用环境变量配置的编辑器: ${envEditor}`);
    return EDITORS[editorKey];
  }

  console.warn(`[editor-detector] ⚠️  未知的环境变量编辑器: ${envEditor}`);
  return null;
}

/**
 * 通过进程检测识别当前运行的编辑器
 */
async function detectEditorByProcess(): Promise<EditorInfo | null> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS: 使用 pgrep 检测进程

      // 检测 Trae
      try {
        const { stdout } = await execAsync('pgrep -fl "Trae" 2>/dev/null || true');
        if (stdout.includes('Trae') && !stdout.includes('trae://')) {
          console.log('[editor-detector] 🔍 检测到 Trae 进程');
          return EDITORS.trae;
        }
      } catch {
        // pgrep 失败，继续
      }

      // 检测 VSCode
      try {
        const { stdout } = await execAsync('pgrep -fl "Visual Studio Code" 2>/dev/null || true');
        if (stdout.includes('Code')) {
          console.log('[editor-detector] 🔍 检测到 VSCode 进程');
          return EDITORS.code;
        }
      } catch {
        // pgrep 失败，继续
      }

      // 检测 Cursor
      try {
        const { stdout } = await execAsync('pgrep -fl "Cursor" 2>/dev/null || true');
        if (stdout.includes('Cursor')) {
          console.log('[editor-detector] 🔍 检测到 Cursor 进程');
          return EDITORS.cursor;
        }
      } catch {
        // pgrep 失败，继续
      }

    } else if (platform === 'linux') {
      // Linux: 使用 ps 或 pgrep
      try {
        const { stdout } = await execAsync('ps aux | grep -i "code\\|trae\\|cursor" | grep -v grep | head -1');
        const process = stdout.toLowerCase();

        if (process.includes('trae')) return EDITORS.trae;
        if (process.includes('cursor')) return EDITORS.cursor;
        if (process.includes('code')) return EDITORS.code;
      } catch {
        // ps 失败，继续
      }

    } else if (platform === 'win32') {
      // Windows: 使用 tasklist
      try {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Code.exe" 2>NUL');
        if (stdout.includes('Code.exe')) {
          console.log('[editor-detector] 🔍 检测到 VSCode 进程');
          return EDITORS.code;
        }
      } catch {
        // tasklist 失败，继续
      }
    }
  } catch (error) {
    console.log('[editor-detector] ⚠️  进程检测失败:', (error as Error).message);
  }

  return null;
}

/**
 * 通过命令可用性检测编辑器（降级方案）
 */
async function detectEditorByCommand(): Promise<EditorInfo | null> {
  // 按优先级检测命令可用性
  const editorOrder: EditorType[] = ['trae', 'code', 'cursor', 'jetbrains'];

  for (const editorType of editorOrder) {
    const editor = EDITORS[editorType];
    try {
      await execAsync(`which ${editor.cmd}`);
      console.log(`[editor-detector] 🔍 检测到可用命令: ${editor.cmd}`);
      return editor;
    } catch {
      // 命令不存在，继续下一个
    }
  }

  return null;
}

/**
 * 检测并返回当前编辑器
 *
 * 检测顺序：
 * 1. 缓存的结果
 * 2. 环境变量配置
 * 3. 进程检测（自动识别正在运行的编辑器）
 * 4. 命令可用性检测（降级方案）
 */
export async function detectEditor(): Promise<EditorInfo> {
  // 返回缓存的结果
  if (detectedEditor) {
    return detectedEditor;
  }

  console.log('[editor-detector] 🔍 开始检测编辑器...');

  // 1. 检查环境变量
  const envEditor = getEditorFromEnv();
  if (envEditor) {
    detectedEditor = envEditor;
    return envEditor;
  }

  // 2. 进程检测
  const processEditor = await detectEditorByProcess();
  if (processEditor) {
    detectedEditor = processEditor;
    return processEditor;
  }

  // 3. 命令可用性检测（降级方案）
  const commandEditor = await detectEditorByCommand();
  if (commandEditor) {
    detectedEditor = commandEditor;
    return commandEditor;
  }

  // 4. 默认使用 VSCode
  console.warn('[editor-detector] ⚠️  未检测到任何编辑器，使用默认的 VSCode');
  detectedEditor = EDITORS.code;
  return detectedEditor;
}

/**
 * 清除编辑器缓存（用于测试或重新检测）
 */
export function clearEditorCache(): void {
  detectedEditor = null;
  console.log('[editor-detector] 🗑️  已清除编辑器缓存');
}

/**
 * 转换相对路径为绝对路径
 */
export function resolveAbsolutePath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }

  // 使用项目根目录解析相对路径
  return path.resolve(projectRoot, relativePath);
}

/**
 * 跳转到编辑器指定位置
 */
export async function jumpToEditor(
  filePath: string,
  line: number,
  column: number
): Promise<boolean> {
  const editor = await detectEditor();

  const absolutePath = resolveAbsolutePath(filePath);
  const args = editor.gotoArgs(absolutePath, line, column);

  const cmd = `${editor.cmd} ${args.join(' ')}`;
  console.log(`[editor-detector] 📂 执行: ${cmd}`);

  try {
    await execAsync(cmd);
    console.log(`[editor-detector] ✅ 已在 ${editor.name} 中打开`);
    return true;
  } catch (error) {
    console.error(`[editor-detector] ❌ 跳转失败:`, (error as Error).message);
    return false;
  }
}

/**
 * 生成编辑器 URI scheme（用于浏览器中打开）
 */
export function generateEditorUri(
  filePath: string,
  line: number,
  column: number
): string | null {
  const editor = detectedEditor || EDITORS.code; // 默认使用 code
  if (!editor.uriScheme) return null;

  const absolutePath = resolveAbsolutePath(filePath);
  return editor.uriScheme(absolutePath, line, column);
}
