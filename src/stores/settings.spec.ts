import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { getSettings, resetDbForTests, updateSettings, type ThemeMode } from '@/db';
import {
  DARK_SCHEME_QUERY,
  applyTheme,
  normalizeTheme,
  resolveTheme,
  startSystemThemeWatch,
  stopSystemThemeWatch,
  useSettingsStore,
} from '@/stores/settings';

/**
 * 主题（第二轮 UI 改造·第 2 步）：resolveTheme / applyTheme / 系统监听 / 未知值兜底。
 * 注意：jsdom 26 **没有** window.matchMedia，所以这里自己造一个可控的 MediaQueryList，
 * 并把它挂到 window 上（afterEach 还原），用来驱动「深色 / 浅色」两套系统偏好。
 */

const originalMatchMedia = window.matchMedia;

interface FakeMql {
  media: string;
  matches: boolean;
  onchange: null;
  listeners: (() => void)[];
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
  addListener: (cb: () => void) => void;
  removeListener: (cb: () => void) => void;
  dispatchEvent: () => boolean;
}

/** 装一个假的 matchMedia，返回可控的 MediaQueryList（含已注册监听器清单）。 */
function mockMatchMedia(initialDark: boolean): FakeMql {
  const mql: FakeMql = {
    media: DARK_SCHEME_QUERY,
    matches: initialDark,
    onchange: null,
    listeners: [],
    addEventListener: (_type: string, cb: () => void) => {
      mql.listeners.push(cb);
    },
    removeEventListener: (_type: string, cb: () => void) => {
      const index = mql.listeners.indexOf(cb);
      if (index >= 0) mql.listeners.splice(index, 1);
    },
    addListener: (cb: () => void) => {
      mql.listeners.push(cb);
    },
    removeListener: (cb: () => void) => {
      const index = mql.listeners.indexOf(cb);
      if (index >= 0) mql.listeners.splice(index, 1);
    },
    dispatchEvent: () => true,
  };
  window.matchMedia = vi.fn(() => mql as unknown as MediaQueryList) as unknown as typeof window.matchMedia;
  return mql;
}

/** 模拟「系统主题变了」：改 matches 并触发所有监听器。 */
function fireSystemChange(mql: FakeMql, dark: boolean): void {
  mql.matches = dark;
  for (const cb of [...mql.listeners]) cb();
}

function themeOfDocument(): string | undefined {
  return document.documentElement.dataset['theme'];
}

let pinia: Pinia;

beforeEach(async () => {
  pinia = createPinia();
  setActivePinia(pinia);
  await resetDbForTests();
  delete document.documentElement.dataset['theme'];
});

afterEach(() => {
  stopSystemThemeWatch();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  delete document.documentElement.dataset['theme'];
});

describe('resolveTheme（纯函数三分支）', () => {
  it('light → light（无论系统偏好）', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('dark → dark（无论系统偏好）', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('system → 跟随 prefersDark', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });
});

describe('normalizeTheme（未知值兜底）', () => {
  it('已知值原样返回，未知值一律兜底 light', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
    // 旧备份/手工改过的备份可能带任意值：不允许漏到 data-theme 上
    expect(normalizeTheme('sepia')).toBe('light');
    expect(normalizeTheme('')).toBe('light');
    expect(normalizeTheme(undefined)).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
    expect(normalizeTheme(1)).toBe('light');
  });
});

describe('applyTheme', () => {
  it("applyTheme('system') 在系统深色下写入 data-theme='dark'", () => {
    const mql = mockMatchMedia(true);
    expect(mql.matches).toBe(true);
    const resolved = applyTheme('system');
    expect(resolved).toBe('dark');
    expect(themeOfDocument()).toBe('dark');
  });

  it("applyTheme('system') 在系统浅色下写入 data-theme='light'", () => {
    mockMatchMedia(false);
    const resolved = applyTheme('system');
    expect(resolved).toBe('light');
    expect(themeOfDocument()).toBe('light');
  });

  it("显式 light/dark 不受系统偏好影响", () => {
    mockMatchMedia(true);
    expect(applyTheme('light')).toBe('light');
    expect(themeOfDocument()).toBe('light');
  });

  it('data-theme 的取值永远只有 light/dark：未知模式写入 light', () => {
    mockMatchMedia(true);
    applyTheme('sepia' as unknown as ThemeMode);
    expect(themeOfDocument()).toBe('light');
  });

  it('没有 matchMedia 的环境（jsdom 原生）不报错，system 按浅色处理', () => {
    window.matchMedia = originalMatchMedia; // jsdom 26 没有该方法
    expect(applyTheme('system')).toBe('light');
    expect(themeOfDocument()).toBe('light');
  });
});

describe('系统主题监听', () => {
  it('只注册一次监听：重复 start 不叠加，系统变化只触发一次应用', () => {
    const mql = mockMatchMedia(false);
    let applied = 0;
    const getMode = (): ThemeMode => {
      applied += 1;
      return 'system';
    };
    startSystemThemeWatch(getMode);
    startSystemThemeWatch(getMode); // 重复注册（等价于重复 load）
    startSystemThemeWatch(getMode);
    expect(mql.listeners.length).toBe(1);

    fireSystemChange(mql, true);
    expect(applied).toBe(1); // 只应用一次
    expect(themeOfDocument()).toBe('dark');

    fireSystemChange(mql, false);
    expect(applied).toBe(2);
    expect(themeOfDocument()).toBe('light');
  });

  it('stopSystemThemeWatch 注销后系统变化不再应用', () => {
    const mql = mockMatchMedia(false);
    let applied = 0;
    startSystemThemeWatch(() => {
      applied += 1;
      return 'system';
    });
    expect(mql.listeners.length).toBe(1);

    stopSystemThemeWatch();
    expect(mql.listeners.length).toBe(0);
    fireSystemChange(mql, true);
    expect(applied).toBe(0);
    expect(themeOfDocument()).toBeUndefined();
  });

  it("store.load() 重复调用只注册一次监听，且 'system' 模式下系统切换立即生效", async () => {
    const mql = mockMatchMedia(false);
    const settings = useSettingsStore();
    await settings.load();
    await settings.load(); // 重复 load（刷新/重复进入设置页）
    expect(mql.listeners.length).toBe(1);

    await settings.update({ theme: 'system' });
    expect(settings.theme).toBe('system');
    expect(themeOfDocument()).toBe('light'); // 系统当前浅色

    fireSystemChange(mql, true);
    expect(themeOfDocument()).toBe('dark');
    expect(settings.resolvedTheme).toBe('dark');
    expect(settings.isDark).toBe(true);

    fireSystemChange(mql, false);
    expect(themeOfDocument()).toBe('light');
    expect(settings.resolvedTheme).toBe('light');
    expect(settings.isDark).toBe(false);
  });

  it("非 'system' 模式下系统切换不改变用户手选的主题", async () => {
    const mql = mockMatchMedia(false);
    const settings = useSettingsStore();
    await settings.load();
    await settings.update({ theme: 'light' });
    fireSystemChange(mql, true);
    expect(themeOfDocument()).toBe('light');
    expect(settings.theme).toBe('light');
  });
});

describe('store 主题读取与未知值兜底', () => {
  it("DEFAULT 主题仍是 light，load 后 data-theme='light'", async () => {
    mockMatchMedia(true); // 即使系统深色，默认 light 也不跟随
    const settings = useSettingsStore();
    await settings.load();
    expect((await getSettings()).theme).toBe('light');
    expect(settings.theme).toBe('light');
    expect(themeOfDocument()).toBe('light');
  });

  it("库里是未知主题值（如导入的旧/坏备份）时兜底成 'light'，不写进 data-theme", async () => {
    mockMatchMedia(true);
    await updateSettings({ theme: 'sepia' as unknown as ThemeMode }); // 模拟导入端带进来的未知值
    const settings = useSettingsStore();
    await settings.load();
    expect(settings.theme).toBe('light'); // 读取端兜底
    expect(settings.resolvedTheme).toBe('light');
    expect(settings.isDark).toBe(false);
    expect(themeOfDocument()).toBe('light'); // data-theme 只有 light/dark
  });

  it('setTheme 持久化三选一，theme getter 与 data-theme 同步', async () => {
    const mql = mockMatchMedia(true);
    const settings = useSettingsStore();
    await settings.load();
    await settings.setTheme('system');
    expect((await getSettings()).theme).toBe('system');
    expect(settings.theme).toBe('system');
    expect(themeOfDocument()).toBe('dark'); // 系统深色

    await settings.setTheme('light');
    expect((await getSettings()).theme).toBe('light');
    expect(themeOfDocument()).toBe('light'); // 手选 light 后不再跟随系统

    fireSystemChange(mql, false);
    expect(themeOfDocument()).toBe('light');
  });
});
