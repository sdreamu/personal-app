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
      // Windows 上 pnpm 会在项目根目录留下一批临时目录（.package.json.<pid>.xxxx.tmpdir）。
      // 文件监听器一旦盯上里面的被锁文件就抛 EBUSY，chokidar 的 error 事件没人接，
      // 整个 dev server 直接退出（实测 code 3）。这些目录本来也不该触发 HMR。
      watch: {
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/dist/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/*.tmpdir/**',
          '**/.package.json.*/**',
          '**/*.tmp-*',
        ],
      },
      // 首屏慢的真正原因：冷启动时 Vite 要"现发现现打包"依赖 + 现转译整棵模块图，
      // 第一个请求会一直挂着（实测冷启动 / 请求 19s，浏览器就是白屏）。
      // warmup 在服务端起来时就把这些文件转译好，浏览器第一个请求直接命中缓存。
      warmup: {
        // 只预热"首屏真正要加载的东西"：入口 + 路由表 + 所有页面组件。
        // 别写 './src/stores/*.ts' './src/db/*.ts' —— 这两个 glob 会把同目录的 *.spec.ts
        // 也一起转译（vitest/fake-indexeddb 那一整套），预热反而把服务器压住几十秒。
        clientFiles: [
          './src/main.ts',
          './src/App.vue',
          './src/router/index.ts',
          './src/views/*.vue',
          './src/components/*.vue',
        ],
      },
    },
    // 依赖预打包一次性做完，避免运行时"发现新依赖 → 重新优化 → 整页刷新"的连环等待
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'dexie'],
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
