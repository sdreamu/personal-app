import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { SettingsRecord } from '@/db';
import { useSettingsStore } from '@/stores/settings';
import HomeHero from './HomeHero.vue';

// 本地时区 2026-02-14 09:05:03 —— 2026年2月14日为周六。
const NOW = new Date(2026, 1, 14, 9, 5, 3);

function settingsRecord(): SettingsRecord {
  return {
    key: 'app',
    id: 'settings-1',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    daily_study_min: 120,
    daily_water_ml: 2000,
    cup_ml: 250,
    daily_play_min: 60,
    day_start: '04:00',
    theme: 'light',
    last_backup_at: null,
  };
}

let pinia: Pinia;

function mountHero() {
  return mount(HomeHero, { global: { plugins: [pinia] } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  pinia = createPinia();
  setActivePinia(pinia);
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('首页主视觉', () => {
  it('渲染问候语、中文日期与 HH:mm:ss 实时时间', () => {
    const wrapper = mountHero();
    expect(wrapper.find('[data-test="hero-greeting"]').text()).toBe('你好，Evan');
    expect(wrapper.find('[data-test="hero-date"]').text()).toBe('2026年2月14日 周六');
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05:03');
    wrapper.unmount();
  });

  it('每秒刷新时间：推进一秒后时间文本随之变化', async () => {
    const wrapper = mountHero();
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05:03');

    vi.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05:04');

    vi.advanceTimersByTime(2000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05:06');
    wrapper.unmount();
  });

  it('卸载后清掉定时器，不再继续刷新', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const wrapper = mountHero();
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('日期按一天起点算逻辑日期：凌晨 02:00 仍显示前一天', () => {
    vi.setSystemTime(new Date(2026, 1, 15, 2, 0, 0));
    const wrapper = mountHero();
    expect(wrapper.find('[data-test="hero-date"]').text()).toBe('2026年2月14日 周六');
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('02:00:00');
    wrapper.unmount();
  });
});
