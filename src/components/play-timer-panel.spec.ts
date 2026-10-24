import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, resetDbForTests, type Book } from '@/db';
import { usePlayStore } from '@/stores/play';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import PlayTimerPanel from './PlayTimerPanel.vue';

const BASE = new Date('2026-06-01T10:00:00').getTime();

let pinia: Pinia;
let timer: ReturnType<typeof useTimerStore>;
let play: ReturnType<typeof usePlayStore>;

async function makeBook(): Promise<Book> {
  return createRecord('books', {
    title: 'SICP',
    author: null,
    total_pages: 300,
    current_page: 40,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function seedPlay(date: string, content: string, minutes: number) {
  return createRecord('play_records', { date, content, minutes, source: 'manual' });
}

function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

/** 状态机写库走 Dexie 多轮事件循环，用 throw 语义等到条件成立。 */
async function waitUntil(check: () => boolean, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!check()) throw new Error(label);
    },
    { timeout: 3000, interval: 20 },
  );
}

function mountPanel() {
  return mount(PlayTimerPanel, { global: { plugins: [pinia], stubs: { Teleport: true } } });
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  timer = useTimerStore();
  play = usePlayStore();
  await useSettingsStore().load();
});

afterEach(() => {
  timer.dispose();
  vi.useRealTimers();
});

describe('娱乐计时面板 PlayTimerPanel', () => {
  it('历史标签按最近使用排序去重，点击带入输入框并开始计时', async () => {
    useFakeDate();
    await seedPlay('2026-06-01', '原神', 20);
    vi.setSystemTime(BASE + 1000);
    await seedPlay('2026-06-02', '塞尔达', 30);
    vi.setSystemTime(BASE + 2000);
    await seedPlay('2026-06-02', '原神', 10);
    await play.loadPlayData('2026-06-03');

    const wrapper = mountPanel();
    const tags = wrapper.findAll('[data-test="recent-tag"]');
    expect(tags.map((t) => t.text())).toEqual(['原神', '塞尔达']);

    await tags[0]!.trigger('click');
    expect((wrapper.find('[data-test="play-name-input"]').element as HTMLInputElement).value).toBe('原神');

    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待娱乐计时开始');
    await flushPromises();
    expect(timer.timer?.type).toBe('entertainment');
    expect(timer.timer?.target_title).toBe('原神');
    expect(wrapper.find('[data-test="clock-face"]').exists()).toBe(true);
  });

  it('输入名称开始→显示进行中与已用时间→暂停/继续→结束进入待结算', async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-test="play-name-input"]').setValue('塞尔达');
    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待娱乐计时开始');
    await flushPromises();

    expect(wrapper.find('[data-test="timer-target"]').text()).toContain('塞尔达');
    expect(wrapper.find('[data-test="clock-face"]').text()).toMatch(/^[0-9]{2}:[0-9]{2}:[0-9]{2}$/);
    expect(wrapper.find('[data-test="pause-btn"]').exists()).toBe(true);

    await wrapper.find('[data-test="pause-btn"]').trigger('click');
    await waitUntil(() => timer.isPaused, '等待暂停');
    await flushPromises();
    expect(wrapper.find('[data-test="resume-btn"]').exists()).toBe(true);

    await wrapper.find('[data-test="resume-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning && !timer.isPaused, '等待继续');
    await flushPromises();

    await wrapper.find('[data-test="end-btn"]').trigger('click');
    await waitUntil(() => timer.isSettling, '等待进入待结算');
    await flushPromises();
    expect(wrapper.find('[data-test="settling-hint"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="end-btn"]').exists()).toBe(false);
  });

  it('已有学习计时时显示不可用且无开始按钮', async () => {
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });

    const wrapper = mountPanel();
    expect(wrapper.find('[data-test="other-timer-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="start-btn"]').exists()).toBe(false);
  });
});
