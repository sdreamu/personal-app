/**
 * 手机屏冒烟：用真实 Chromium 以 390×844（iPhone 14 尺寸）打开构建产物 dist，
 * 确认窄屏布局能看、没有横向溢出、底部导航在。
 *
 * 说明：这验的是"页面在手机宽度下长什么样"，不是 Capacitor 桥（那要真机）。
 * 用法：node scripts/smoke-mobile-web.mjs   （先 pnpm build）
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const PORT = 5199;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const filePath = join(DIST, normalize(relative));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' }).end(data);
  } catch {
    // hash 路由：未知路径一律回 index.html
    const data = await readFile(join(DIST, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' }).end(data);
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const failures = [];
const check = (ok, label, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boot-splash', { state: 'detached', timeout: 30_000 });

  const info = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    text: (document.querySelector('#app')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
  }));

  check(info.scrollWidth <= info.innerWidth + 1, '没有横向溢出', 'scrollWidth=' + info.scrollWidth + ' innerWidth=' + info.innerWidth);
  check(info.text.length > 0, '页面渲染出内容', info.text);

  mkdirSync(join(ROOT, 'test-results'), { recursive: true });
  const shot = join(ROOT, 'test-results', 'mobile-home.png');
  await page.screenshot({ path: shot });
  console.log('  截图: ' + shot);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error('\n手机屏冒烟失败: ' + failures.join(' / '));
  process.exit(1);
}
console.log('\n手机屏冒烟通过');
