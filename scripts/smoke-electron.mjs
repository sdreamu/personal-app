/**
 * 桌面版冒烟验证：用 Playwright 真的把 Electron 开起来看一眼。
 *
 * 校验的是"打包出去的东西能不能用"，不是配置对不对：
 *   1. 窗口能开、标题正确
 *   2. 页面真的渲染出应用（启动占位被替换 = 不是白屏）
 *   3. 页面 origin 是 app://local（自定义协议生效，IndexedDB 有稳定存储域）
 *   4. IndexedDB 里能查到业务库（数据层在这个 origin 下正常工作）
 * 最后截一张图到 test-results/electron-smoke.png，人工也能复核。
 *
 * 用法：
 *   node scripts/smoke-electron.mjs                                  # 跑仓库里的 Electron（源码模式）
 *   node scripts/smoke-electron.mjs release/win-unpacked/个人生活助手.exe  # 跑打包出来的真实 exe
 * （源码模式需要先 pnpm build:electron）
 */
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = process.cwd();
const SHOT_DIR = join(ROOT, 'test-results');
mkdirSync(SHOT_DIR, { recursive: true });

const failures = [];
const check = (ok, label, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
  if (!ok) failures.push(label);
};

// 有些终端环境会带着 ELECTRON_RUN_AS_NODE=1（Electron 会退化成纯 Node，开不出窗口），
// 显式去掉，保证这里验证的就是"双击 exe 时的行为"
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// 传了 exe 路径就验打包产物，否则验源码模式
const exePath = process.argv[2];

// 残留实例会占着单实例锁 / Chromium singleton，新进程启动即退出，
// 表现成"打包后一启动就崩"，所以先清干净再验。
function killLeftovers() {
  if (process.platform !== 'win32') return;
  const names = new Set(['electron.exe']);
  if (exePath) names.add(basename(exePath));
  for (const name of names) {
    try {
      execFileSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore' });
      console.log('已结束残留进程：' + name);
    } catch {
      // 没有同名进程时 taskkill 返回非 0，属正常情况
    }
  }
}
killLeftovers();
const launchOptions = exePath
  ? { executablePath: resolve(ROOT, exePath), args: [], env }
  : { args: ['.'], cwd: ROOT, env };

console.log('启动 Electron… ' + (exePath ?? '(源码模式)'));
const app = await electron.launch(launchOptions);
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // 启动占位被 Vue 整块替换掉 = 应用真的挂载了
  await win.waitForSelector('.boot-splash', { state: 'detached', timeout: 30_000 });

  const info = await win.evaluate(async () => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    return {
      origin: location.origin,
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      textSample: (document.querySelector('#app')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      databases: databases.map((db) => db.name),
    };
  });

  console.log('页面信息: ' + JSON.stringify(info));
  check(info.title === '个人生活助手', '窗口标题是应用名', info.title);
  check(info.origin === 'app://local', '页面 origin 是 app://local（自定义协议）', info.origin);
  check(info.textSample.length > 0, '页面渲染出内容（不是白屏）', info.textSample);
  check(
    info.databases.includes('evan_personal_app_db'),
    'IndexedDB 业务库在这个 origin 下正常打开',
    JSON.stringify(info.databases),
  );

  const shotPath = join(SHOT_DIR, 'electron-smoke.png');
  await win.screenshot({ path: shotPath });
  console.log('  截图: ' + shotPath);
} finally {
  await app.close();
}

if (failures.length > 0) {
  console.error('\n冒烟失败 ' + failures.length + ' 项: ' + failures.join(' / '));
  process.exit(1);
}
console.log('\n桌面版冒烟通过');