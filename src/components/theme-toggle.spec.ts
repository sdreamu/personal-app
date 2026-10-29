import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { resetDbForTests } from '@/db';
import { systemPrefersDark, useSettingsStore } from '@/stores/settings';
import ThemeToggle from './ThemeToggle.vue';

let pinia: Pinia;
let settings: ReturnType<typeof useSettingsStore>;

function mountToggle() {
  return mount(ThemeToggle, { global: { plugins: [pinia] } });
}

function htmlTheme(): string | undefined {
  return document.documentElement.dataset['theme'];
}

/** 主题落库走 IndexedDB，是宏任务：等它真的写完再断言，不靠固定 sleep。 */
async function expectTheme(mode: 'light' | 'dark'): Promise<void> {
  await vi.waitFor(() => {
    expect(settings.theme).toBe(mode);
    expect(htmlTheme()).toBe(mode);
  }, { timeout: 3000, interval: 20 });
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  settings = useSettingsStore();
  systemPrefersDark.value = false;
  await settings.load();
});

describe('AC-82 顶栏白天/夜间切换', () => {
  it('默认浅色：按钮提示切到夜间；点一下变深色并落到 data-theme 与设置表', async () => {
    const wrapper = mountToggle();
    const button = wrapper.get('[data-test="theme-toggle"]');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(button.attributes('aria-label')).toBe('切换到夜间模式');
    expect(htmlTheme()).toBe('light');

    await button.trigger('click');
    await expectTheme('dark');

    expect(settings.data?.theme).toBe('dark');
    expect(wrapper.get('[data-test="theme-toggle"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-test="theme-toggle"]').attributes('aria-label')).toBe('切换到白天模式');
  });

  it('再点一下回到白天', async () => {
    settings.data = { ...(settings.data as NonNullable<typeof settings.data>), theme: 'dark' };
    const wrapper = mountToggle();
    expect(wrapper.get('[data-test="theme-toggle"]').attributes('aria-pressed')).toBe('true');

    await wrapper.get('[data-test="theme-toggle"]').trigger('click');
    await expectTheme('light');

    expect(settings.data?.theme).toBe('light');
  });

  it('跟随系统时按系统解析出的明暗显示，点一下变成显式的 light', async () => {
    settings.data = { ...(settings.data as NonNullable<typeof settings.data>), theme: 'system' };
    systemPrefersDark.value = true;

    const wrapper = mountToggle();
    expect(wrapper.get('[data-test="theme-toggle"]').attributes('aria-pressed')).toBe('true');

    await wrapper.get('[data-test="theme-toggle"]').trigger('click');
    await expectTheme('light');

    expect(settings.data?.theme).toBe('light');
  });
});
