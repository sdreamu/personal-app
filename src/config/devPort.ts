/**
 * 开发服务器端口的唯一来源（MOD_PLAN 阶段 A2：环境隔离）。
 * - 正式使用：5173（pnpm run dev / 双击 start-app.bat，Playwright 也连这里）。
 * - 开发调试：5180（pnpm run dev:5180，读 .env.dev5180；也可临时 DEV_PORT=5180 pnpm run dev）。
 * 两个实例可以同时跑，互不抢端口；strictPort 保证端口被占时直接报错而不是悄悄换号。
 */
export const RELEASE_DEV_PORT = 5173;
export const DEBUG_DEV_PORT = 5180;

/** 解析 DEV_PORT 环境变量：缺省/空串 → 5173；非法值直接报错（不静默跑到别的端口）。 */
export function resolveDevPort(raw: string | undefined | null): number {
  if (raw === undefined || raw === null || raw.trim() === '') return RELEASE_DEV_PORT;
  const port = Number(raw.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DEV_PORT 必须是 1~65535 之间的整数，当前为：' + raw);
  }
  return port;
}
