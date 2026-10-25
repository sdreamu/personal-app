/**
 * 首屏主题引导：settings 是异步从 IndexedDB 读出来的，等它回来才写 data-theme，
 * 深色用户每次启动都会先闪一帧浅色。
 * 这里把解析后的主题顺带记到 localStorage，页面启动时先按它落一次 data-theme，
 * 库里的设置回来后 applyTheme 再覆盖，两者口径一致（取值域永远只有 light/dark）。
 */
export const THEME_STORAGE_KEY = 'evan-theme';

export type BootTheme = 'light' | 'dark';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 读上次的主题；没有/被改坏/存不了都返回 null（当作没记录，走默认浅色）。 */
export function readBootTheme(storage: Storage | null = safeStorage()): BootTheme | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** 记住解析后的主题；隐私模式等存不了的情况静默跳过（只影响首屏闪一下）。 */
export function writeBootTheme(theme: BootTheme, storage: Storage | null = safeStorage()): void {
  if (storage === null) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存不了就算了，不影响本次主题生效
  }
}

/** 启动时（挂载前）先落一次 data-theme，返回落到 html 上的值。 */
export function applyBootTheme(): BootTheme | null {
  const theme = readBootTheme();
  if (theme !== null) document.documentElement.dataset['theme'] = theme;
  return theme;
}
