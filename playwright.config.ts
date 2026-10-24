import { defineConfig, devices } from '@playwright/test';

/**
 * Evan的专属APP 端到端验收（AC-01~AC-53，逐条映射）。
 * 浏览器：优先系统已安装的 Chrome（channel:'chrome'），未下载 chromium/webkit/firefox。
 * 串行执行（fullyParallel:false, workers:1）保证 IndexedDB 隔离与计时状态互不干扰。
 */
const NODE = 'C:/Users/admin/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe';
const PNPM = 'C:/Users/admin/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs';

export default defineConfig({
  testDir: 'e2e',
  timeout: 150_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    channel: 'chrome',
    headless: true,
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: '"' + NODE + '" "' + PNPM + '" run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
