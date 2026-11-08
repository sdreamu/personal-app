/**
 * Windows 桌面版（Electron 壳）的打包契约。
 *
 * 这些断言不测业务逻辑，只守"打包出来的东西还能开、还安全"这件事：
 * 入口指向、主进程安全基线、自定义协议、electron-builder 配置、图标产物。
 * 改打包方式时先看这里 —— 任何一条红了，说明安装包要么打不出来，要么开出来是白屏。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest 的 root 就是仓库根（vite.config.ts 所在目录），相对路径都从这里算
const ROOT = process.cwd();

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

const packageJson = JSON.parse(readText('package.json')) as {
  main?: string;
  license: string;
  repository: { type: string; url: string };
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};
const mainSource = readText('electron/main.cjs');
const builderYml = readText('electron-builder.yml');

describe('Windows 桌面版：入口与脚本', () => {
  it('开源发布元数据与 README 指向实际 GitHub 仓库，附带 MIT 许可证', () => {
    expect(packageJson.repository.type).toBe('git');
    expect(packageJson.repository.url).toBe('https://github.com/sdreamu/personal-app.git');
    expect(readText('README.md')).toContain(packageJson.repository.url.replace(/\.git$/, ''));
    expect(packageJson.license).toBe('MIT');
    expect(readText('LICENSE')).toContain('MIT License');
  });

  it('package.json 的 main 指向 Electron 主进程', () => {
    expect(packageJson.main).toBe('electron/main.cjs');
    expect(existsSync(resolve(ROOT, 'electron/main.cjs'))).toBe(true);
  });

  it('桌面构建用相对 base，安装包脚本走 electron-builder', () => {
    // app://local/ 下相对路径和绝对路径都能用，但相对 base 挪目录也不会坏
    expect(packageJson.scripts['build:electron']).toContain('--base=./');
    expect(packageJson.scripts['dist:win']).toContain('electron-builder');
    expect(packageJson.devDependencies.electron).toBeTruthy();
    expect(packageJson.devDependencies['electron-builder']).toBeTruthy();
  });

  it('产物目录必须能改（本机 NSIS 只能在工作区外生成卸载器）', () => {
    // electron-builder 会执行"第一遍"安装包来取卸载器；在工作区目录里执行会失败，
    // 安装包退化成 175KB 的中间产物。所以要有一条把产物输出到仓库外的脚本。
    const outScript = packageJson.scripts['dist:win:out'];
    expect(outScript).toContain('electron-builder');
    expect(outScript).toContain('-c.directories.output=');
  });

  it('冒烟脚本会先清残留实例（残留进程占着单实例锁，新窗口开不出来）', () => {
    const smoke = readText('scripts/smoke-electron.mjs');
    expect(smoke).toContain('taskkill');
    expect(smoke).toContain('ELECTRON_RUN_AS_NODE');
  });
});

describe('Windows 桌面版：主进程安全基线', () => {
  it('渲染进程拿不到 Node（contextIsolation / nodeIntegration / sandbox）', () => {
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).not.toMatch(/nodeIntegration:\s*true/);
    expect(mainSource).not.toMatch(/contextIsolation:\s*false/);
  });

  it('不开新窗口、不许跳出应用自己的 origin', () => {
    expect(mainSource).toContain('setWindowOpenHandler');
    expect(mainSource).toContain("action: 'deny'");
    expect(mainSource).toContain("'will-navigate'");
  });

  it('用 app:// 自定义协议加载页面，而不是 file://', () => {
    // file:// 下 Vite 的 module 脚本会被 CORS 拦掉，而且存储 origin 是 "null"（数据易丢）
    expect(mainSource).toContain('registerSchemesAsPrivileged');
    expect(mainSource).toContain("protocol.handle('app'");
    expect(mainSource).toMatch(/APP_ORIGIN = 'app:\/\/local'/);
    expect(mainSource).toContain('win.loadURL(ENTRY_URL)');
    expect(mainSource).not.toMatch(/\.loadFile\(/);
  });

  it('只跑一个实例', () => {
    expect(mainSource).toContain('requestSingleInstanceLock');
    expect(mainSource).toContain("'second-instance'");
  });
});

describe('Windows 桌面版：electron-builder 配置', () => {
  it('有 appId / 产品名 / 安装目录', () => {
    expect(builderYml).toMatch(/appId:\s*com\.evan\.personalapp/);
    expect(builderYml).toContain('productName: 个人生活助手');
    expect(builderYml).toMatch(/output:\s*release/);
  });

  it('只出 NSIS 安装包：便携版在本机验不过，不发布没验过的产物', () => {
    expect(builderYml).toContain('target: nsis');
    expect(builderYml).not.toMatch(/^\s*- target: portable/m);
    expect(builderYml).toMatch(/allowToChangeInstallationDirectory:\s*true/);
    expect(builderYml).toMatch(/createDesktopShortcut:\s*true/);
  });

  it('不把 node_modules 打进安装包（页面依赖已经由 Vite 打进 dist）', () => {
    expect(builderYml).toContain('dist/**/*');
    expect(builderYml).toContain('electron/**/*');
    expect(builderYml).toContain("'!node_modules/**/*'");
    expect(builderYml).toMatch(/npmRebuild:\s*false/);
  });
});

describe('Windows 桌面版：图标产物', () => {
  const iconPng = readFileSync(resolve(ROOT, 'build/icon.png'));
  const iconIco = readFileSync(resolve(ROOT, 'build/icon.ico'));

  it('icon.png 是 512×512 的 RGBA PNG', () => {
    expect([...iconPng.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(iconPng.readUInt32BE(16)).toBe(512); // IHDR width
    expect(iconPng.readUInt32BE(20)).toBe(512); // IHDR height
    expect(iconPng[25]).toBe(6); // color type: RGBA
  });

  it('icon.ico 内嵌 16/24/32/48/64/128/256 七个尺寸', () => {
    expect(iconIco.readUInt16LE(0)).toBe(0); // reserved
    expect(iconIco.readUInt16LE(2)).toBe(1); // type: icon
    const count = iconIco.readUInt16LE(4);
    expect(count).toBe(7);
    const sizes = Array.from({ length: count }, (_, index) => {
      const width = iconIco[6 + index * 16];
      return width === 0 ? 256 : width; // 目录里的 0 代表 256
    });
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});
