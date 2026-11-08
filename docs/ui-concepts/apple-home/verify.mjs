import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = dirname(fileURLToPath(import.meta.url));
const screenshots = join(root, 'screenshots');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const variants = [
  ['solid-light', 'solid', 'light', '白灰实底 · 浅色'],
  ['solid-dark', 'solid', 'dark', '白灰实底 · 深色'],
  ['glass-light', 'glass', 'light', '轻盈通透 · 浅色'],
  ['glass-dark', 'glass', 'dark', '轻盈通透 · 深色'],
];
const sections = ['hero', 'goals', 'timeline', 'hint', 'mit', 'next', 'week', 'seven', 'modules'];
let canonicalText;
const captures = [];
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const external = [];
page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
try {
  for (const [key, material, theme] of variants) {
    await page.goto(pathToFileURL(join(root, 'index.html')).href + `?material=${material}&theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    assert.equal(await page.locator('html').getAttribute('data-material'), material);
    assert.deepEqual(await page.locator('[data-section]').evaluateAll(elements => elements.map(el => el.dataset.section)), sections);
    const text = await page.locator('main').evaluate(main => {
      const copy=main.cloneNode(true);
      copy.querySelector('.goal:nth-child(3)').remove();
      return copy.textContent;
    });
    canonicalText ??= text;
    assert.equal(text, canonicalText, 'Only the third goal can differ between solid and glass');
    assert.match(await page.locator('.goal:nth-child(3)').innerText(), material==='glass' ? /运动[\s\S]*待训练[\s\S]*上肢力量/ : /喝水[\s\S]*1,250/);
    assert.match(await page.locator('.modules .module').nth(3).innerText(), /喝水[\s\S]*1,250 ml/);
    assert.equal(await page.locator('.goal').count(), 4);
    assert.equal(await page.locator('.next-row').count(), 3);
    assert.equal(await page.locator('.chart-bar').count(), 7);
    assert.equal(await page.locator('.day').count(), 7);
    assert.equal(await page.locator('.module').count(), 6);
    assert.deepEqual(await page.locator('.tab').allTextContents(), ['今天','日程','学习','生活','复盘']);
    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      function color(token, base=[255,255,255]) {
        let hex=style.getPropertyValue(token).trim().replace('#','');
        if(hex.length===3) hex=[...hex].map(c=>c+c).join('');
        const values=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
        const alpha=hex.length===8?parseInt(hex.slice(6),16)/255:1;
        return values.map((v,i)=>v*alpha+base[i]*(1-alpha));
      }
      function luminance(rgb) { return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0); }
      function ratio(a,b) { const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
      const bg=color('--bg'),panel=color('--surface',bg),soft=color('--soft');
      return {
        body:ratio(color('--text'),bg),secondary:ratio(color('--secondary'),panel),
        action:ratio(color('--accent'),soft),filled:ratio(color('--on-accent'),color('--accent-fill')),
      };
    });
    for(const [role,ratio] of Object.entries(contrast)) assert.ok(ratio>=4.5, `${key}: ${role} contrast ${ratio}`);
    for (const width of [320, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${key} ${width}: horizontal overflow`);
      const small = await page.locator('button').evaluateAll(elements => elements.filter(el => el.checkVisibility() && el.getBoundingClientRect().height < 44).map(el => el.textContent));
      assert.deepEqual(small, [], `${key}: undersized touch targets`);
      const artifact = `screenshots/${key}-${width}.png`;
      await page.screenshot({ path: join(root, artifact) });
      captures.push({viewport:`${width}x${width===1440?900:844}`,artifact,observation:`${key}: unchanged content; viewport layout captured for visual inspection.`});
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // Exercise keyboard focus, example feedback, Escape and returning focus.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '设置');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').evaluate(el => el.open), true);
    assert.match(await page.locator('#preview-copy').innerText(), /不会修改你的记录/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
    await page.getByRole('button', { name: '＋ 记一笔', exact: true }).click();
    await page.getByRole('button', { name: '知道了', exact: true }).click();
    assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
    await page.emulateMedia({ reducedMotion:'reduce' });
    assert.equal(await page.locator('.add').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.emulateMedia({ reducedMotion:'no-preference' });
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0,0); });
    await page.screenshot({ path: join(screenshots, `${key}.png`) });
    // A tall viewport captures the complete content and places navigation after it.
    const height = await page.locator('main').evaluate(el => Math.ceil(el.getBoundingClientRect().bottom));
    await page.setViewportSize({ width:390, height });
    await page.screenshot({ path:join(screenshots, `${key}-full.png`) });
  }
  assert.deepEqual(errors, [], 'No browser errors');
  assert.deepEqual(external, [], 'Preview must be entirely offline');

  const comparison = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>首页视觉方向对比</title><style>*{box-sizing:border-box}body{margin:0;padding:40px 40px 34px;background:#e9eaee;color:#202127;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif}header{display:flex;justify-content:space-between;align-items:end;margin:0 0 28px}h1{font-size:26px;letter-spacing:-.8px;margin:0 0 7px}p{font-size:13px;color:#656772;margin:0}.concepts{display:flex;gap:24px}.concept{width:390px;flex:none}h2{margin:0 0 13px;font-size:15px;font-weight:600}.concept img{width:390px;display:block;border-radius:28px;box-shadow:0 15px 40px #17203d0c}footer{font-size:11px;color:#656772;margin-top:20px}</style><header><div><h1>同一个首页，四种视觉表达。</h1><p>内容与顺序保持一致 · 苹果蓝强调色 · 手机优先</p></div><p>个人生活助手 / UI CONCEPT 01</p></header><div class="concepts">${variants.map(([key,,,label],i)=>`<div class="concept"><h2>${String(i+1).padStart(2,'0')} &nbsp; ${label}</h2><img src="screenshots/${key}.png" alt="${label}手机首页首屏"></div>`).join('')}</div><footer>视觉概念预览 · 所有数值均为演示数据 · 完整页面见各版本长图</footer></html>`;
  await writeFile(join(root, 'comparison.html'), comparison);
  await page.setViewportSize({ width:1712, height:1040 });
  await page.goto(pathToFileURL(join(root, 'comparison.html')).href);
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await page.screenshot({path:join(screenshots,'comparison.png'),fullPage:true});
  await writeFile(join(root,'capture-log.json'), JSON.stringify({checks:'pass',variants:4,renderedEvidence:captures},null,2)+'\n');
  console.log('PASS: four variants, identical contents, four viewport widths, 44px touch targets, keyboard focus, dialog feedback, reduced motion, no external requests. Screenshots saved.');
} finally {
  await browser.close();
}
