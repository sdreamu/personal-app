import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 样式令牌守护测试（第二轮 UI 改造 · 第 1 步）。
 *
 * 目的：把「颜色 / 圆角令牌必须与 docs/UI_GUIDE.md 一致」以及「.vue 里不得出现
 * 硬编码颜色」做成可失败的回归测试，防止令牌再次腐烂。
 *
 * 读取方式：Node fs 直接读 src/assets/main.css 文本（vitest 默认 jsdom 环境也支持 fs）。
 */
const root = resolve(process.cwd());
const cssPath = resolve(root, 'src/assets/main.css');
const css = readFileSync(cssPath, 'utf8');

/** 取出某个选择器块（如 :root / [data-theme='dark']）内的声明文本。声明里无嵌套花括号。 */
function blockBody(cssText: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([\\s\\S]*?)\\}');
  const m = re.exec(cssText);
  if (m === null) throw new Error('找不到样式块：' + selector);
  return m[1];
}

/** 解析块内的 --token: value; 声明为 Map。 */
function parseTokens(body: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /--([A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

const rootTokens = parseTokens(blockBody(css, ':root'));
const darkTokens = parseTokens(blockBody(css, "[data-theme='dark']"));

/** 合并主题上下文：深色表覆盖浅色表；别名（var(--x)）在同一上下文里递归解析。 */
function makeResolver(base: Map<string, string>, overrides: Map<string, string>) {
  const ctx = new Map<string, string>(base);
  for (const [k, v] of overrides) ctx.set(k, v);
  return function resolveToken(name: string): string | undefined {
    let value = ctx.get(name);
    const seen = new Set<string>();
    while (value !== undefined) {
      const alias = /^var\(\s*--([A-Za-z0-9-]+)\s*\)$/.exec(value);
      if (alias === null) return value;
      if (seen.has(name)) return undefined; // 循环别名保护
      seen.add(name);
      name = alias[1];
      value = ctx.get(name);
    }
    return undefined;
  };
}

const resolveLight = makeResolver(rootTokens, new Map());
const resolveDark = makeResolver(rootTokens, darkTokens);

function norm(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim().toLowerCase();
}

// UI_GUIDE §2 关键颜色（浅色 / 深色）。good==success、warn==warning，通过别名解析比对。
const LIGHT_COLORS: Record<string, string> = {
  bg: '#eef2f4',
  panel: '#ffffff',
  text: '#12222b',
  muted: '#5d717c',
  border: '#dae3e8',
  accent: '#2a4bd7',
  'accent-soft': '#e3e9fd',
  good: '#1e8e5a',
  warn: '#c77a0a',
  'hero-bg': '#2a4bd7',
};

const DARK_COLORS: Record<string, string> = {
  bg: '#0c1317',
  panel: '#151e24',
  text: '#e6eef2',
  muted: '#8da2ad',
  border: '#26343c',
  accent: '#8ea4ff',
  'accent-soft': '#222c55',
  good: '#52c48c',
  warn: '#e9a23b',
  'hero-bg': '#23346f',
};

describe('样式令牌与 UI_GUIDE 一致', () => {
  it(':root 关键颜色取值为 UI_GUIDE 浅色表', () => {
    for (const [name, want] of Object.entries(LIGHT_COLORS)) {
      expect(norm(resolveLight(name)), '--' + name).toBe(want);
    }
  });

  it("[data-theme='dark'] 关键颜色取值为 UI_GUIDE 深色表", () => {
    for (const [name, want] of Object.entries(DARK_COLORS)) {
      expect(norm(resolveDark(name)), '--' + name).toBe(want);
    }
  });

  it('浅色表完整：既有变量名改为 UI_GUIDE 取值（其余关键色）', () => {
    expect(norm(resolveLight('success'))).toBe('#1e8e5a');
    expect(norm(resolveLight('warning'))).toBe('#c77a0a');
    expect(norm(resolveLight('warning-soft'))).toBe('#fbefd9');
    expect(norm(resolveLight('on-accent'))).toBe('#ffffff');
    expect(norm(resolveLight('hero-ink'))).toBe('#ffffff');
    expect(norm(resolveLight('hero-sub'))).toBe('rgba(255, 255, 255, 0.74)');
  });

  it('深色表完整：既有变量名改为 UI_GUIDE 深色取值（其余关键色）', () => {
    expect(norm(resolveDark('success'))).toBe('#52c48c');
    expect(norm(resolveDark('warning'))).toBe('#e9a23b');
    expect(norm(resolveDark('warning-soft'))).toBe('#3a2d14');
    expect(norm(resolveDark('on-accent'))).toBe('#0c1317');
    expect(norm(resolveDark('hero-ink'))).toBe('#f2f5ff');
    expect(norm(resolveDark('hero-sub'))).toBe('rgba(242, 245, 255, 0.72)');
  });

  it('新增的 UI_GUIDE 命名令牌存在且作为既有变量的别名', () => {
    expect(norm(resolveLight('surface'))).toBe(norm(resolveLight('panel')));
    expect(norm(resolveLight('surface-2'))).toBe(norm(resolveLight('panel-2')));
    expect(norm(resolveLight('ink'))).toBe(norm(resolveLight('text')));
    expect(norm(resolveLight('line'))).toBe(norm(resolveLight('border')));
    expect(norm(resolveLight('accent-ink'))).toBe(norm(resolveLight('on-accent')));
    expect(norm(resolveLight('good'))).toBe(norm(resolveLight('success')));
    expect(norm(resolveLight('warn'))).toBe(norm(resolveLight('warning')));
    expect(norm(resolveLight('warn-soft'))).toBe(norm(resolveLight('warning-soft')));
    // 深色上下文同一别名解析到深色取值
    expect(norm(resolveDark('surface'))).toBe('#151e24');
    expect(norm(resolveDark('ink'))).toBe('#e6eef2');
    expect(norm(resolveDark('good'))).toBe('#52c48c');
    expect(norm(resolveDark('warn'))).toBe('#e9a23b');
  });

  it('首页问候大块令牌 hero-bg / hero-ink / hero-sub 在深浅两套都齐备', () => {
    for (const token of ['hero-bg', 'hero-ink', 'hero-sub']) {
      expect(rootTokens.has(token), ':root 缺失 --' + token).toBe(true);
      expect(darkTokens.has(token), "[data-theme='dark'] 缺失 --" + token).toBe(true);
    }
  });

  it('圆角三档：--radius 10px / --radius-card 16px / --radius-pill 999px', () => {
    expect(norm(resolveLight('radius'))).toBe('10px');
    expect(norm(resolveLight('radius-card'))).toBe('16px');
    expect(norm(resolveLight('radius-pill'))).toBe('999px');
  });
});

describe('.vue 不得含硬编码颜色', () => {
  function walk(dir: string, out: string[]): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.isFile() && entry.name.endsWith('.vue')) out.push(full);
    }
    return out;
  }

  const vueFiles = walk(resolve(root, 'src'), []);
  // #hex（3/4/6/8 位）、rgb(、hsl( —— 只认这些字面量，rgba( 由 rgb( 前缀单独覆盖为独立规则
  const patterns = [/#[0-9a-fA-F]{3,8}\b/, /\brgb\(/, /\bhsl\(/];

  it('src 下存在 .vue 文件（扫描非空）', () => {
    expect(vueFiles.length).toBeGreaterThan(0);
  });

  it('任何 .vue 的模板/样式里都不出现 #hex / rgb( / hsl(', () => {
    const violations: string[] = [];
    for (const file of vueFiles) {
      const text = readFileSync(file, 'utf8');
      const rel = file.slice(root.length + 1);
      text.split(/\r?\n/).forEach((line, i) => {
        for (const re of patterns) {
          if (re.test(line)) {
            violations.push(rel + ':' + (i + 1) + ': ' + line.trim());
          }
        }
      });
    }
    expect(violations, '发现硬编码颜色：\n' + violations.join('\n')).toEqual([]);
  });
});
