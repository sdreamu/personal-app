import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolveDevPort } from './src/config/devPort';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * 环境隔离（MOD_PLAN 阶段 A2）：端口只由 DEV_PORT 决定，缺省 5173（正式使用）。
 * - pnpm run dev        → 5173（start-app.bat / Playwright 用的就是这个）
 * - pnpm run dev:5180   → mode=dev5180，读 .env.dev5180 里的 DEV_PORT=5180（开发调试）
 * - 临时改端口：DEV_PORT=5190 pnpm run dev
 * strictPort 永远为 true：端口被占时立刻失败，避免“以为在 5180 其实跑到别的口”。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: resolveDevPort(env.DEV_PORT),
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.spec.ts'],
    },
  };
});
