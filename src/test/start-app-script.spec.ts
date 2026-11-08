import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEBUG_DEV_PORT, RELEASE_DEV_PORT, resolveDevPort } from '@/config/devPort';

/**
 * 守护启动配置的部署前提，这些坑不会在应用逻辑测试里暴露：
 * - .bat 若用 LF 行尾，cmd.exe 会把 `set "X=...` 解析成 `H_NODE=...` 之类的残句，
 *   导致启动脚本直接走到“找不到运行时”分支。
 * - 运行时路径一旦写死成某台机器上的绝对目录，换机器/重装后启动即失效，
 *   公开仓库里还会泄露本机用户名。
 */
const root = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('启动配置', () => {
  it('start-app.bat 必须是 CRLF 行尾', () => {
    const bat = read('start-app.bat');
    expect(bat.length).toBeGreaterThan(0);
    expect(/[^\r]\n/.test(bat)).toBe(false);
  });

  it('start-app.bat 只依赖 PATH 上的 node/pnpm，缺了就给人话提示，且不写死本机路径', () => {
    const bat = read('start-app.bat');
    // 有运行时探测 + 分支 + 可执行的补救提示（原意图：换个环境也不能静默失败）
    expect(bat).toContain('where node');
    expect(bat).toContain('where pnpm');
    expect(bat).toContain(':noruntime');
    expect(bat).toContain('nodejs.org');
    // 不许出现盘符绝对路径或某台机器上的运行时目录（公开仓库不能带本机信息）
    expect(bat).not.toMatch(/[A-Za-z]:\\\\/);
    expect(bat).not.toContain('dsh-runtimes');
    expect(bat).not.toContain('C:\\Users');
  });

  it('vite.config.ts 的监听器忽略 pnpm 临时目录与产物目录（否则 Windows 上 EBUSY 会搞死 dev server）', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toContain('watch:');
    expect(cfg).toContain('ignored');
    // pnpm 的 .package.json.<pid>.xxxx.tmpdir 与 test-results 都不该触发 HMR
    expect(cfg).toMatch(/tmpdir/);
    expect(cfg).toContain('test-results');
  });

  it('playwright.config.ts 不得写死 DSH 运行时路径', () => {
    const cfg = read('playwright.config.ts');
    expect(cfg).not.toContain('dsh-runtimes');
    expect(cfg).toContain('process.execPath');
  });
});

describe('开发端口隔离（正式 5173 / 调试 5180）', () => {
  it('DEV_PORT 缺省回落 5173，显式 5180 生效，非法值直接报错', () => {
    expect(RELEASE_DEV_PORT).toBe(5173);
    expect(DEBUG_DEV_PORT).toBe(5180);
    expect(resolveDevPort(undefined)).toBe(5173);
    expect(resolveDevPort('')).toBe(5173);
    expect(resolveDevPort('   ')).toBe(5173);
    expect(resolveDevPort('5180')).toBe(5180);
    expect(resolveDevPort(' 5173 ')).toBe(5173);
    expect(() => resolveDevPort('abc')).toThrow('DEV_PORT');
    expect(() => resolveDevPort('0')).toThrow('DEV_PORT');
    expect(() => resolveDevPort('65536')).toThrow('DEV_PORT');
  });

  it('vite.config.ts 由 DEV_PORT 决定端口且 strictPort 恒为 true（不写死 5180）', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toContain('resolveDevPort(env.DEV_PORT)');
    expect(cfg).toContain('strictPort: true');
    expect(cfg).not.toContain('port: 5180');
  });

  it('dev:5180 脚本读 .env.dev5180，正式 dev 脚本仍留在 5173', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['dev:5180']).toContain('--mode dev5180');
    expect(read('.env.dev5180')).toContain('DEV_PORT=5180');
  });
});
