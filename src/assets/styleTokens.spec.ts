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


const LIGHT_COLORS: Record<string,string> = { bg:'#edf2f9', panel:'#ffffffb8', text:'#1c1c1e', muted:'#62626b', accent:'#0065d1', 'accent-fill':'#0070e0', danger:'#b42328', success:'#287d50', warning:'#795311' };
const DARK_COLORS: Record<string,string> = { bg:'#060c16', panel:'#1d2a3bba', text:'#f5f5f7', muted:'#a5a5b0', accent:'#69afff', 'accent-fill':'#409cff', danger:'#ff9b9d', success:'#70ce9a', warning:'#efc06b' };
function luminance(hex: string): number {
  const v = hex.slice(1).match(/../g)!.map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return v[0]*.2126 + v[1]*.7152 + v[2]*.0722;
}
function contrast(a: string, b: string): number {
  const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
describe('通透 UI 令牌与已确认规范一致', () => {
  it('浅深主题使用苹果蓝及语义颜色', () => {
    for(const [colors,resolver] of [[LIGHT_COLORS,resolveLight],[DARK_COLORS,resolveDark]] as const) {
      for(const [name,want] of Object.entries(colors)) expect(norm(resolver(name)),name).toBe(want);
    }
  });
  it('正文、辅助文字和主按钮在两套主题中符合普通文本 4.5:1', () => {
    for(const r of [resolveLight,resolveDark]) {
      for(const token of ['text','muted','accent','danger','success','warning']) expect(contrast(r(token)!,r('bg')!),token).toBeGreaterThanOrEqual(4.5);
      expect(contrast(r('on-accent')!,r('accent-fill')!)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('卡片、输入和胶囊使用统一圆角，细分隔线不再使用硬墨线', () => {
    expect(resolveLight('radius')).toBe('14px');
    expect(resolveLight('radius-card')).toBe('24px');
    expect(resolveLight('radius-pill')).toBe('999px');
    expect(resolveLight('line-w')).toBe('1px');
    for(const r of [resolveLight,resolveDark]) expect(r('border-ink')).toBe(r('border'));
  });
  it('旧变量保持语义别名，两套主题均有透明表面和不透明弹窗底', () => {
    for(const r of [resolveLight,resolveDark]) {
      for(const [a,b] of [['surface','panel'],['ink','text'],['good','success'],['hero-ink','text'],['hero-sub','muted']]) expect(r(a)).toBe(r(b));
      expect(r('panel')).toMatch(/^#[a-f0-9]{8}$/i);
      expect(r('modal-bg')).toMatch(/^#[a-f0-9]{6}$/i);
    }
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

describe('圆角只用令牌（通透圆角语言）', () => {
  function walk(dir: string, out: string[]): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.isFile() && entry.name.endsWith('.vue')) out.push(full);
    }
    return out;
  }

  /** 允许的写法：0 / var(--radius*) / 50%（水杯、日历点这种真圆）。 */
  const allowed = /^(0|50%|var\(\s*--radius[A-Za-z0-9-]*\s*\))$/;

  /** 逐行扫 border-radius，允许用 /* keep: … *\/ 显式豁免（目前只有手划痕那一处）。 */
  function offendersIn(file: string): string[] {
    const found: string[] = [];
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
      if (line.includes('keep:')) continue;
      const re = /border-radius:\s*([^;]+);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const parts = m[1].trim().split(/\s+/);
        if (!parts.every((part) => allowed.test(part))) {
          found.push(file.replace(root, '') + ': border-radius: ' + m[1].trim());
        }
      }
    }
    return found;
  }

  it('.vue 里不得写死 px 圆角', () => {
    const offenders = walk(resolve(root, 'src'), []).flatMap(offendersIn);
    expect(offenders).toEqual([]);
  });

  it('main.css 里同样只能用令牌（手划痕那处已用 keep: 豁免）', () => {
    expect(offendersIn(cssPath)).toEqual([]);
  });
});
