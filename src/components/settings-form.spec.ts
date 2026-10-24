import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { getSettings, resetDbForTests } from '@/db';
import { useSettingsStore } from '@/stores/settings';
import SettingsView from '@/views/SettingsView.vue';

let pinia: Pinia;

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(async () => {
  pinia = createPinia();
  setActivePinia(pinia);
  await resetDbForTests();
  await useSettingsStore().load();
});

describe('设置页', () => {
  it('表单修改即时自动保存（无需保存按钮）', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();

    const studyInput = wrapper.find('input[data-test="goal-study"]');
    await studyInput.setValue('150');
    await studyInput.trigger('change');
    await waitFor(async () => (await getSettings()).daily_study_min === 150);
    expect((await getSettings()).daily_study_min).toBe(150);

    const cupInput = wrapper.find('input[data-test="goal-cup"]');
    await cupInput.setValue('300');
    await cupInput.trigger('change');
    await waitFor(async () => (await getSettings()).cup_ml === 300);
    expect((await getSettings()).cup_ml).toBe(300);
  });

  it('一天起点改为 05:00 即时生效并写入 settings', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('select[data-test="day-start-hour"]').setValue('5');
    await waitFor(async () => (await getSettings()).day_start === '05:00');
    await waitFor(() => useSettingsStore().dayStartMin === 300);
    expect((await getSettings()).day_start).toBe('05:00');
    expect(useSettingsStore().dayStartMin).toBe(300);
  });

  it('切换深色模式即时生效并持久化', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('button[data-test="theme-dark"]').trigger('click');
    await waitFor(async () => (await getSettings()).theme === 'dark');
    await waitFor(() => document.documentElement.dataset['theme'] === 'dark');
    expect((await getSettings()).theme).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
