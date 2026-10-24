import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, listAlive, resetDbForTests } from '@/db';
import { useDateStore } from '@/stores/date';
import { usePlayStore } from '@/stores/play';
import { useSettingsStore } from '@/stores/settings';
import PlayRecordList from './PlayRecordList.vue';

let pinia: Pinia;
let play: ReturnType<typeof usePlayStore>;
let dateStore: ReturnType<typeof useDateStore>;

async function seedPlay(date: string, content: string, minutes: number, source: 'timer' | 'manual' = 'manual') {
  return createRecord('play_records', { date, content, minutes, source });
}

/** 写库走 Dexie 多轮事件循环，用 throw 语义等到条件成立。 */
async function waitUntil(check: () => boolean, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!check()) throw new Error(label);
    },
    { timeout: 3000, interval: 20 },
  );
}

function mountList() {
  return mount(PlayRecordList, { global: { plugins: [pinia], stubs: { Teleport: true } } });
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  dateStore = useDateStore();
  dateStore.setSelected('2026-06-03');
  await useSettingsStore().load();
  play = usePlayStore();
  await play.loadPlayData('2026-06-03');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('娱乐记录区 PlayRecordList', () => {
  it('手动补记：日期默认选中日期，保存生成 source=manual 记录并显示', async () => {
    const wrapper = mountList();
    await flushPromises();

    await wrapper.find('[data-test="open-form-btn"]').trigger('click');
    expect((wrapper.find('[data-test="form-date"]').element as HTMLInputElement).value).toBe('2026-06-03');

    await wrapper.find('[data-test="form-content"]').setValue('塞尔达');
    await wrapper.find('[data-test="form-minutes"]').setValue('45');
    await wrapper.find('[data-test="form-save"]').trigger('click');

    await waitUntil(() => play.records.some((r) => r.content === '塞尔达'), '等待补记写入并刷新');
    await flushPromises();
    const rows = wrapper.findAll('[data-test="play-record"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain('塞尔达');
    expect(rows[0]!.text()).toContain('45 分钟');
    expect(rows[0]!.text()).toContain('补记');

    const all = await listAlive('play_records');
    expect(all).toHaveLength(1);
    expect(all[0]?.source).toBe('manual');
  });

  it('额度超过 daily_play_min 时进度条变红并提示用完', async () => {
    await seedPlay('2026-06-03', '游戏A', 40);
    await seedPlay('2026-06-03', '游戏B', 30, 'timer');
    await play.loadPlayData('2026-06-03');

    const wrapper = mountList();
    expect(wrapper.find('[data-test="quota-text"]').text()).toContain('已用 70');
    expect(wrapper.find('[data-test="quota-text"]').text()).toContain('剩余 0');
    const bar = wrapper.find('[data-test="progress-bar"]');
    expect(bar.classes()).toContain('over');
    expect((bar.element as HTMLElement).style.width).toBe('100%');
    expect(wrapper.find('[data-test="quota-over-hint"]').text()).toBe('今日娱乐额度已用完');
  });

  it('「再来一轮」抛出行内容名称 + 30 分钟预填，不自动开始计时', async () => {
    await seedPlay('2026-06-03', '塞尔达', 30, 'timer');
    await play.loadPlayData('2026-06-03');

    const wrapper = mountList();
    await flushPromises();
    await wrapper.find('[data-test="play-again-btn"]').trigger('click');

    expect(wrapper.emitted('play-again')).toEqual([[{ content: '塞尔达', minutes: 30 }]]);
  });

  it('额度未超时进度条不红，显示剩余分钟与本周累计', async () => {
    await seedPlay('2026-06-03', '游戏A', 20);
    await play.loadPlayData('2026-06-03');

    const wrapper = mountList();
    expect(wrapper.find('[data-test="quota-text"]').text()).toContain('剩余 40');
    expect(wrapper.find('[data-test="progress-bar"]').classes()).not.toContain('over');
    expect(wrapper.find('[data-test="quota-over-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="week-total"]').text()).toContain('20 分钟');
  });
});
