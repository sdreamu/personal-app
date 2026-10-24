import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 守护启动配置的部署前提，这些坑不会在应用逻辑测试里暴露：
 * - .bat 若用 LF 行尾，cmd.exe 会把 `set "DSH_NODE=...` 解析成 `H_NODE=...`，
 *   导致启动脚本直接走到“找不到运行时”分支。
 * - 运行时路径一旦写死成 DSH 内部目录，DSH 升级/重装后启动即失效。
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

  it('start-app.bat 保留 DSH 内置运行时的回退路径', () => {
    const bat = read('start-app.bat');
    expect(bat).toContain('dsh-runtimes');
    expect(bat).toContain('DSH_NODE');
    expect(bat).toContain('DSH_PNPM');
  });

  it('playwright.config.ts 不得写死 DSH 运行时路径', () => {
    const cfg = read('playwright.config.ts');
    expect(cfg).not.toContain('dsh-runtimes');
    expect(cfg).toContain('process.execPath');
  });
});
