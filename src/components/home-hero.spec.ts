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
  it('渲染问候语、中文日期（含星期）与 HH:mm 时间', () => {
    const wrapper = mountHero();
    expect(wrapper.find('[data-test="hero-greeting"]').text()).toBe('你好，Evan');
    expect(wrapper.find('[data-test="hero-date"]').text()).toBe('2026年2月14日');
    expect(wrapper.text()).toContain('周六');
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05');
    wrapper.unmount();
  });

  it('时间只到分钟：跳秒不刷屏，满一分钟后才变', async () => {
    const wrapper = mountHero();
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05');

    vi.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:05');

    vi.advanceTimersByTime(60_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('09:06');
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
    expect(wrapper.find('[data-test="hero-date"]').text()).toBe('2026年2月14日');
    expect(wrapper.find('[data-test="hero-time"]').text()).toBe('02:00');
    wrapper.unmount();
  });
});
