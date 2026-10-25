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
  bg: '#f1f1e8',
  panel: '#fafaf3',
  text: '#141a15',
  muted: '#565d51',
  border: '#c9cdbc',
  accent: '#12352a',
  'accent-soft': '#dfe2d3',
  good: '#1b6b54',
  warn: '#8a5a12',
  'hero-bg': '#12352a',
};

const DARK_COLORS: Record<string, string> = {
  bg: '#141712',
  panel: '#1c2018',
  text: '#edefe6',
  muted: '#9aa394',
  border: '#333a2f',
  accent: '#7fc0a3',
  'accent-soft': '#25372e',
  good: '#5fbf9b',
  warn: '#d9a24f',
  'hero-bg': '#0e2a21',
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
    expect(norm(resolveLight('success'))).toBe('#1b6b54');
    expect(norm(resolveLight('warning'))).toBe('#8a5a12');
    expect(norm(resolveLight('warning-soft'))).toBe('#f2e4c8');
    expect(norm(resolveLight('on-accent'))).toBe('#f4f2e6');
    expect(norm(resolveLight('hero-ink'))).toBe('#f4f2e6');
    expect(norm(resolveLight('hero-sub'))).toBe('#9db3a6');
    expect(norm(resolveLight('danger'))).toBe('#c0392b');
    expect(norm(resolveLight('border-ink'))).toBe('#141a15');
    expect(norm(resolveLight('slab'))).toBe('#c9cdbc');
  });

  it('深色表完整：既有变量名改为 UI_GUIDE 深色取值（其余关键色）', () => {
    expect(norm(resolveDark('success'))).toBe('#5fbf9b');
    expect(norm(resolveDark('warning'))).toBe('#d9a24f');
    expect(norm(resolveDark('warning-soft'))).toBe('#3a2d14');
    expect(norm(resolveDark('on-accent'))).toBe('#12160f');
    expect(norm(resolveDark('hero-ink'))).toBe('#edefe6');
    expect(norm(resolveDark('hero-sub'))).toBe('#8fa89a');
    expect(norm(resolveDark('border-ink'))).toBe('#edefe6');
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
    expect(norm(resolveDark('surface'))).toBe('#1c2018');
    expect(norm(resolveDark('ink'))).toBe('#edefe6');
    expect(norm(resolveDark('good'))).toBe('#5fbf9b');
    expect(norm(resolveDark('warn'))).toBe('#d9a24f');
  });

  it('首页问候大块令牌 hero-bg / hero-ink / hero-sub 在深浅两套都齐备', () => {
    for (const token of ['hero-bg', 'hero-ink', 'hero-sub']) {
      expect(rootTokens.has(token), ':root 缺失 --' + token).toBe(true);
      expect(darkTokens.has(token), "[data-theme='dark'] 缺失 --" + token).toBe(true);
    }
  });

  it('形状令牌：全站直角 2px（粗野主义），结构线 2px', () => {
    expect(norm(resolveLight('radius'))).toBe('2px');
    expect(norm(resolveLight('radius-card'))).toBe('2px');
    expect(norm(resolveLight('radius-pill'))).toBe('2px');
    expect(norm(resolveLight('line-w'))).toBe('2px');
  });

  it('材质层令牌齐备：荧光笔 / 手写 / 松绿场两层平面', () => {
    expect(norm(rootTokens.get('mark'))).toContain('rgba(223, 232, 74');
    expect(norm(resolveLight('font-hand'))).toContain('kaiti');
    expect(norm(resolveLight('font-mono'))).toContain('ui-monospace');
    for (const token of ['field', 'field-2', 'field-ink', 'field-sub', 'field-tick']) {
      expect(rootTokens.has(token), ':root 缺失 --' + token).toBe(true);
      // 深色表允许走别名（如 --field → var(--hero-bg)），只要解析得到值即可
      expect(norm(resolveDark(token)), "[data-theme='dark'] 解析不到 --" + token).toBeTruthy();
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

describe('圆角只用令牌（直角语言）', () => {
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
