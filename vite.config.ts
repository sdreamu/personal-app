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
      // 这些用例走真实 IndexedDB(fake-indexeddb) + 组件挂载，全量并行跑时单测耗时波动很大。
      // 默认 5s 会在机器负载高时误伤（表现为 "Test timed out in 5000ms"，断言本身没失败）。
      // P6-4 基线（2026-06 全量 642 条）：整轮 41s，单条最慢 4.1s（router.spec 连挂 12 个页面），
      // 其次 0.7s；8s = 最慢那条的 2 倍余量，够用又能在真的卡死时早点报错。
      // 超时只是环境兜底，任何断言都不放宽；真超时先查根因，别调大这个数。
      testTimeout: 8000,
      hookTimeout: 8000,
    },
  };
});
