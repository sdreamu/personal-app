/**
 * Android（Capacitor 壳）的打包契约。
 *
 * 与 desktopPackaging.spec.ts 同一思路：不测业务逻辑，只守"装得上、装得上之后还能用"。
 * 这里守三件事：包名不能漂（它就是 Android 的应用身份与数据归属）、webDir 必须指向
 * Vite 的真实产物目录、原生导出依赖不能少（少一个导出就静默失败）。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const readText = (relativePath: string): string => readFileSync(resolve(ROOT, relativePath), 'utf8');

const capacitorConfig = readText('capacitor.config.ts');
const packageJson = JSON.parse(readText('package.json')) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('Android：Capacitor 配置', () => {
  it('本次验收包版本递增，保留原应用身份供覆盖安装', () => {
    const gradle = readText('android/app/build.gradle');
    expect(gradle).toMatch(/applicationId\s+"com\.evan\.personalapp"/);
    expect(gradle).toMatch(/versionCode\s+4\b/);
    expect(gradle).toMatch(/versionName\s+"1\.0\.3"/);
  });

  it('包名（appId）固定为 com.evan.personalapp —— 改它等于换应用身份，老数据全丢', () => {
    expect(capacitorConfig).toContain("appId: 'com.evan.personalapp'");
  });

  it('应用名与 webDir 指向 Vite 产物 dist', () => {
    expect(capacitorConfig).toContain("appName: '个人生活助手'");
    expect(capacitorConfig).toMatch(/webDir:\s*'dist'/);
    expect(existsSync(resolve(ROOT, 'dist'))).toBe(true);
  });

  it('android 平台工程已生成，原生依赖齐全', () => {
    expect(existsSync(resolve(ROOT, 'android/app/build.gradle'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'android/gradlew.bat'))).toBe(true);
    // 导出在 WebView 里必须走原生：<a download> 不落盘
    expect(packageJson.dependencies['@capacitor/core']).toBeTruthy();
    expect(packageJson.dependencies['@capacitor/android']).toBeTruthy();
    expect(packageJson.dependencies['@capacitor/filesystem']).toBeTruthy();
    expect(packageJson.dependencies['@capacitor/share']).toBeTruthy();
  });

  it('出包脚本：先 Vite 构建再 cap sync，最后 assembleDebug', () => {
    expect(packageJson.scripts['build:android']).toContain('cap sync android');
    expect(packageJson.scripts['apk:debug']).toContain('assembleDebug');
    expect(packageJson.devDependencies['@capacitor/cli']).toBeTruthy();
  });
});
