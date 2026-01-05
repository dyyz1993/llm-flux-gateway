import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
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
