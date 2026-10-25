import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, applyBootTheme, readBootTheme, writeBootTheme } from './themeBoot';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('首屏主题引导', () => {
  it('写入后能读回来，且只认 light / dark', () => {
    const storage = fakeStorage();
    writeBootTheme('dark', storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readBootTheme(storage)).toBe('dark');

    storage.setItem(THEME_STORAGE_KEY, 'system');
    expect(readBootTheme(storage)).toBeNull();
    storage.setItem(THEME_STORAGE_KEY, '乱七八糟');
    expect(readBootTheme(storage)).toBeNull();
  });

  it('没有记录时返回 null，不动 html 上的 data-theme', () => {
    const storage = fakeStorage();
    expect(readBootTheme(storage)).toBeNull();
    expect(applyBootTheme()).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('启动时把上次的主题落到 html 上（避免先亮后暗）', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(applyBootTheme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    window.localStorage.clear();
  });

  it('localStorage 被禁用时不抛错（隐私模式）', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(readBootTheme(broken)).toBeNull();
    expect(() => writeBootTheme('dark', broken)).not.toThrow();
  });
});
