import { Hono } from 'hono';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface StyleLocation {
  file: string;
  line: number;
  column: number;
  selector: string;
  type: string;
}

const app = new Hono();

/**
 * 跳转到编辑器
 */
app.post('/jump-to-editor', async (c) => {
  try {
    const location = await c.req.json<StyleLocation>();

    console.log('[style-jump] 🎯 收到跳转请求:', location);

    // 优先尝试 Trae，其次 VSCode
    const editors = [
      { name: 'Trae', cmd: 'trae', test: 'which trae' },
      { name: 'VSCode', cmd: 'code', test: 'which code' }
    ];

    let success = false;
    for (const editor of editors) {
      try {
        await execAsync(editor.test);

        // 转换为绝对路径
        const absolutePath = location.file.startsWith('/')
          ? location.file
          : `/Users/xuyingzhou/Downloads/llm-flux-gateway/${location.file}`;

        const cmd = `${editor.cmd} --goto "${absolutePath}:${location.line}:${location.column}"`;
        console.log(`[style-jump] 📂 执行命令: ${cmd}`);

        await execAsync(cmd);
        console.log(`[style-jump] ✅ 已在 ${editor.name} 中打开`);
        success = true;
        break;
      } catch (e) {
        console.log(`[style-jump] ⚠️  ${editor.name} 未安装或失败`);
      }
    }

    return c.json({
      success,
      message: success ? '已跳转到编辑器' : '没有找到可用的编辑器'
    });
  } catch (error) {
    console.error('[style-jump] ❌ 跳转错误:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export default app;
