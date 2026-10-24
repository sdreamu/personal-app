import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, resetDbForTests, type Book } from '@/db';
import { usePlayStore } from '@/stores/play';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import { logicalToday } from '@/utils/date';
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

/** 逻辑今天（跟随设置的一天起点），用于准备“当天额度”记录。 */
function todayKey(): string {
  return logicalToday(useSettingsStore().dayStartMin);
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

  it('倒计时：快捷 30 分钟 → mode=countdown、countdown_sec=1800，界面显示剩余时间', async () => {
    await play.loadPlayData(todayKey());
    const wrapper = mountPanel();
    await wrapper.find('[data-test="play-name-input"]').setValue('塞尔达');
    expect(wrapper.find('[data-test="play-countdown-options"]').exists()).toBe(false);

    await wrapper.find('[data-test="play-mode-countdown"]').trigger('click');
    expect(wrapper.find('[data-test="play-mode-countdown"]').classes()).toContain('on');
    expect(wrapper.find('[data-test="play-countdown-options"]').exists()).toBe(true);

    await wrapper.find('[data-test="play-quick-30"]').trigger('click');
    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待倒计时开始');
    await flushPromises();

    expect(timer.timer?.mode).toBe('countdown');
    expect(timer.timer?.countdown_sec).toBe(1800);
    expect(timer.timer?.target_title).toBe('塞尔达');
    expect(wrapper.find('[data-test="clock-face"]').text()).toBe('00:30:00');
    expect(wrapper.find('[data-test="play-timer-mode"]').text()).toBe('倒计时');
  });

  it('倒计时：自定义 25 分钟 → 1500 秒；0 / 小数 / 超上限被拒绝且不开始', async () => {
    await play.loadPlayData(todayKey());
    const toast = useToastStore();
    const wrapper = mountPanel();
    await wrapper.find('[data-test="play-name-input"]').setValue('原神');
    await wrapper.find('[data-test="play-mode-countdown"]').trigger('click');

    const invalid: Array<[string, string]> = [
      ['0', '倒计时分钟数至少 1 分钟'],
      ['1.5', '倒计时分钟数必须为整数'],
      ['1441', '倒计时分钟数不能超过 1440 分钟'],
    ];
    for (const [value, message] of invalid) {
      await wrapper.find('[data-test="play-countdown-minutes"]').setValue(value);
      await wrapper.find('[data-test="start-btn"]').trigger('click');
      await flushPromises();
      expect(timer.timer).toBeNull();
      expect(toast.items.some((i) => i.message === message)).toBe(true);
    }

    await wrapper.find('[data-test="play-countdown-minutes"]').setValue('25');
    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待倒计时开始');
    await flushPromises();
    expect(timer.timer?.mode).toBe('countdown');
    expect(timer.timer?.countdown_sec).toBe(1500);
    expect(wrapper.find('[data-test="clock-face"]').text()).toBe('00:25:00');
  });

  it('倒计时：未填内容名称点开始被拒绝（沿用现有提示）', async () => {
    await play.loadPlayData(todayKey());
    const toast = useToastStore();
    const wrapper = mountPanel();
    await wrapper.find('[data-test="play-mode-countdown"]').trigger('click');
    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await flushPromises();
    expect(timer.timer).toBeNull();
    expect(toast.items.some((i) => i.message === '请输入娱乐内容名称')).toBe(true);
  });

  it('按剩余额度：填入今日额度剩余分钟，开始后按该分钟数倒计时', async () => {
    await seedPlay(todayKey(), '游戏A', 20);
    await play.loadPlayData(todayKey());
    const wrapper = mountPanel();
    await wrapper.find('[data-test="play-name-input"]').setValue('原神');
    await wrapper.find('[data-test="play-mode-countdown"]').trigger('click');

    const quotaBtn = wrapper.find('[data-test="play-quota-btn"]');
    expect(quotaBtn.text()).toContain('40 分钟');
    expect(quotaBtn.attributes('disabled')).toBeUndefined();
    await quotaBtn.trigger('click');
    expect((wrapper.find('[data-test="play-countdown-minutes"]').element as HTMLInputElement).value).toBe('40');

    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待倒计时开始');
    await flushPromises();
    expect(timer.timer?.countdown_sec).toBe(2400);
  });

  it('按剩余额度：额度为 0 时按钮禁用并提示「今日娱乐额度已用完」', async () => {
    await seedPlay(todayKey(), '游戏A', 70);
    await play.loadPlayData(todayKey());
    const wrapper = mountPanel();
    await wrapper.find('[data-test="play-mode-countdown"]').trigger('click');
    const quotaBtn = wrapper.find('[data-test="play-quota-btn"]');
    expect(quotaBtn.attributes('disabled')).toBeDefined();
    expect(quotaBtn.text()).toContain('0 分钟');
    expect(wrapper.find('[data-test="play-quota-empty-hint"]').text()).toBe('今日娱乐额度已用完');
  });

  it('再来一轮预填：名称/倒计时/30 分钟就位但计时未启动，再点开始才计时', async () => {
    await play.loadPlayData(todayKey());
    const wrapper = mountPanel();
    await wrapper.setProps({ prefill: { content: '塞尔达', minutes: 30 } });
    await flushPromises();

    expect((wrapper.find('[data-test="play-name-input"]').element as HTMLInputElement).value).toBe('塞尔达');
    expect(wrapper.find('[data-test="play-mode-countdown"]').classes()).toContain('on');
    expect((wrapper.find('[data-test="play-countdown-minutes"]').element as HTMLInputElement).value).toBe('30');
    expect(timer.timer).toBeNull();
    expect(wrapper.find('[data-test="pause-btn"]').exists()).toBe(false);
    expect(wrapper.emitted('prefill-applied')).toBeTruthy();

    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待倒计时开始');
    await flushPromises();
    expect(timer.timer?.mode).toBe('countdown');
    expect(timer.timer?.countdown_sec).toBe(1800);
  });

  it('已有学习计时时显示不可用且无开始按钮', async () => {
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });

    const wrapper = mountPanel();
    expect(wrapper.find('[data-test="other-timer-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="start-btn"]').exists()).toBe(false);
  });
});
