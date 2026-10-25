import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * N4 动效纪律的机械守卫（AC-74）：
 * 1) 单次过渡/动画时长不得超过 300ms，且不允许无限循环的装饰动效；
 * 2) 必须尊重 prefers-reduced-motion: reduce（整块归零）；
 * 3) 主按钮/卡片要有按下手感（:active 位移 + 阴影消失）；
 * 4) 路由层要有 page-fade 过渡。
 */
const ROOT = process.cwd();
const MAIN_CSS = readFileSync(join(ROOT, 'src/assets/main.css'), 'utf8');

function walkingCss(dir: string): { file: string; css: string }[] {
  const out: { file: string; css: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkingCss(full));
    else if (entry.name.endsWith('.vue') || entry.name.endsWith('.css')) {
      const source = readFileSync(full, 'utf8');
      const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
      out.push({ file: relative(ROOT, full), css: entry.name.endsWith('.css') ? source : styles.join('\n') });
    }
  }
  return out;
}

/** 把一段 CSS 里 transition / animation 声明抽出来（跳过 reduced-motion 归零块）。 */
function motionDeclarations(css: string): { line: string; kind: string }[] {
  const withoutReduced = css.replace(/@media\s*\(prefers-reduced-motion:[^)]*\)\s*\{[\s\S]*?\n\}/g, '');
  const found: { line: string; kind: string }[] = [];
  for (const raw of withoutReduced.split('\n')) {
    const line = raw.trim();
    if (/^(transition|animation)(-[a-z-]+)?\s*:/.test(line) && !line.includes('none')) {
      found.push({ line, kind: line.startsWith('transition') ? 'transition' : 'animation' });
    }
  }
  return found;
}

/** '1.2s' / '180ms' / '0.2s' → 毫秒。 */
function toMs(token: string): number {
  const match = /^([0-9.]+)(ms|s)$/.exec(token);
  if (!match) return 0;
  const value = Number(match[1]);
  return match[2] === 's' ? value * 1000 : value;
}

describe('N4 动效纪律（AC-74）', () => {
  it('全站单次过渡/动画时长不超过 300ms，且没有无限循环的装饰动效', () => {
    const offenders: string[] = [];
    for (const { file, css } of walkingCss(join(ROOT, 'src'))) {
      for (const { line } of motionDeclarations(css)) {
        const durations = [...line.matchAll(/([0-9.]+(?:ms|s))\b/g)].map((m) => m[1] as string);
        for (const token of durations) {
          if (toMs(token) > 300) offenders.push(`${file}: ${line}`);
        }
        if (/\binfinite\b/.test(line)) offenders.push(`${file}: 无限循环动画 → ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('尊重「减少动态效果」：reduced-motion 块把过渡与动画都归零', () => {
    expect(MAIN_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    const block = MAIN_CSS.slice(MAIN_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('transition-duration: 0ms !important');
    expect(block).toContain('animation-duration: 0ms !important');
    expect(block).toContain('animation-iteration-count: 1 !important');
  });

  it('按下手感：主按钮/卡片有 :active 位移 2px 且阴影消失', () => {
    for (const selector of [
      '.primary-btn:active',
      '.ghost-btn:active',
      '.danger-btn:active',
      '.home-card:active',
      '.book-card:active',
    ]) {
      expect(MAIN_CSS).toContain(selector);
    }
    const activeBlock = MAIN_CSS.slice(
      MAIN_CSS.indexOf('.primary-btn:active'),
      MAIN_CSS.indexOf('/* 完成反馈'),
    );
    expect(activeBlock).toContain('transform: translate(2px, 2px)');
    expect(activeBlock).toContain('box-shadow: none');
  });

  it('按下过渡 90ms（远低于 300ms 上限）', () => {
    expect(MAIN_CSS).toMatch(/transition:\s*transform 90ms/);
  });

  it('完成反馈：done-flash 是一次性 180ms 的 mark 闪烁', () => {
    expect(MAIN_CSS).toContain('@keyframes done-flash');
    expect(MAIN_CSS).toMatch(/\.done-flash\s*\{\s*animation: done-flash 180ms/);
    const crossCheck = motionDeclarations(MAIN_CSS).filter((item) => item.line.includes('done-flash'));
    expect(crossCheck.length).toBeGreaterThan(0);
  });

  it('路由层有 page-fade 过渡（140ms 淡入 + 4px 位移）', () => {
    const app = readFileSync(join(ROOT, 'src/App.vue'), 'utf8');
    expect(app).toContain('<Transition name="page-fade"');
    expect(app).toContain(':key="route.path"');
    expect(MAIN_CSS).toContain('.page-fade-enter-active');
    expect(MAIN_CSS).toMatch(/\.page-fade-enter-active[\s\S]{0,120}transition: opacity 140ms/);
    expect(MAIN_CSS).toMatch(/\.page-fade-enter-from[\s\S]{0,120}translateY\(4px\)/);
  });
});
