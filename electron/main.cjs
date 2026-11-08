/**
 * Electron 主进程 —— Windows 桌面版的"壳"。
 *
 * 设计交代（为什么不是 loadFile(index.html)）：
 * Chromium 会拦掉 file:// 下的 ES module 脚本（origin 为 null，CORS 直接拒），
 * Vite 产出的正是 module 脚本；而且 file:// 的存储 origin 是 "null"，
 * 换版本、换安装方式都可能把 IndexedDB 弄丢。所以这里注册一个标准协议
 * app://local/ 指向 dist/，页面从这个 origin 加载：
 *   - ES module 正常解析
 *   - IndexedDB 有稳定的 origin（app://local），升级 / 重装都不丢数据
 *
 * 安全基线：这是一个零网络、纯本地的应用，所以
 *   - contextIsolation=true + nodeIntegration=false + sandbox=true，页面拿不到 Node
 *   - 不开 preload（页面不需要任何宿主能力）
 *   - 任何 window.open / 跳出 app:// 的导航一律拒绝
 *   - 隐藏默认菜单（界面自带顶栏），保留 F12 / Ctrl+Shift+I 用于排查
 */
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { app, BrowserWindow, Menu, protocol } = require('electron');

/** 与 electron-builder.yml 的 appId 保持一致：Windows 通知 / 任务栏分组靠它认应用。 */
const APP_USER_MODEL_ID = 'com.evan.personalapp';
/** 应用自身的 origin。改这里等于换存储域，老数据会看不到，不要随便动。 */
const APP_ORIGIN = 'app://local';
const ENTRY_URL = APP_ORIGIN + '/index.html';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const APP_TITLE = '个人生活助手';

/** 静态资源 MIME：只覆盖 dist/ 里真实会出现的类型。 */
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// 必须在 app ready 之前声明协议特权，否则 registerHandler 之后页面拿不到 fetch / 存储能力
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

/** 把 app://local/<相对路径> 映射成 dist/ 下的文件；越界（../）一律 403。 */
async function serveFromDist(request) {
  let relativePath;
  try {
    relativePath = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
  } catch {
    return new Response('bad request', { status: 400 });
  }
  const filePath = path.join(DIST_DIR, relativePath === '' ? 'index.html' : relativePath);
  if (path.relative(DIST_DIR, filePath).startsWith('..')) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    const data = await readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: { 'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    title: APP_TITLE,
    // 与 index.html 里启动占位的底色一致：窗口出现时不会先闪一下白
    backgroundColor: '#EAF0E7',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // 纯本地应用：不许开新窗口，也不许导航到 app:// 以外的地方
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) event.preventDefault();
  });

  // 菜单已隐藏，留一个排查出口
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const openTools = key === 'f12' || (input.control && input.shift && key === 'i');
    if (openTools) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.loadURL(ENTRY_URL);
  return win;
}

// 单实例：再点一次桌面图标只把窗口拉到前台，避免两个进程抢同一个 IndexedDB
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_USER_MODEL_ID);
    Menu.setApplicationMenu(null);
    protocol.handle('app', serveFromDist);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
