import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import { styleJumpPlugin } from './plugins/style-jump/index';
import { reactComponentJumpPlugin } from './plugins/react-component-jump/index';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        strictPort: false, // 端口被占用时自动尝试下一个端口
      },
      plugins: [
        // React 组件跳转插件 - 必须在 react() 之前运行
        // 因为需要在 JSX 被转换前注入 data-component-name 属性
        reactComponentJumpPlugin({
          enabled: true,
        }),
        react(),
        // 样式跳转插件 - 只在开发模式启用
        styleJumpPlugin({
          enabled: true, // 或者用 process.env.NODE_ENV === 'development'
        }),
        devServer({
          // Hono server entry point
          entry: 'src/server/index.ts',
          // Exclude these paths from Hono (serve with Vite)
          exclude: [
            /^\/$/,                                    // Frontend: index.html
            /^\/@.+$/,                                 // Vite special paths (@vite, @react, etc.)
            /^\/node_modules\/.*/,                     // npm packages
            /^\/index\.tsx(\?.*)?$/,                   // Client entry point (with optional query params)
            /^\/src\/.*/,                              // Source files
            // /^\/api\/.*/,                          // ❌ 移除：让 Hono 处理所有 /api/* 请求
            /\.html?$/,                                // HTML files
            /\.(js|jsx|ts|tsx|css|json|svg|png|jpg)$/,  // Static assets
          ],
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify(''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          '@client': path.resolve(__dirname, './src/client'),
          '@server': path.resolve(__dirname, './src/server'),
          '@shared': path.resolve(__dirname, './src/shared'),
        }
      },
      optimizeDeps: {
        include: [
          '@codemirror/autocomplete',
          '@codemirror/commands',
          '@codemirror/lang-javascript',
          '@codemirror/lang-yaml',
          '@codemirror/search',
          '@codemirror/state',
          '@codemirror/theme-one-dark',
          '@codemirror/view',
        ]
      }
    };
});
