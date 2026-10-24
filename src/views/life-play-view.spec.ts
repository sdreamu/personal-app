import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, resetDbForTests } from '@/db';
import { useDateStore } from '@/stores/date';
import { usePlayStore } from '@/stores/play';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import LifePlayView from './LifePlayView.vue';

let pinia: Pinia;
let play: ReturnType<typeof usePlayStore>;
let dateStore: ReturnType<typeof useDateStore>;
let timer: ReturnType<typeof useTimerStore>;

async function waitUntil(check: () => boolean, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!check()) throw new Error(label);
    },
    { timeout: 3000, interval: 20 },
  );
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  dateStore = useDateStore();
  dateStore.setSelected('2026-06-03');
  await useSettingsStore().load();
  play = usePlayStore();
  timer = useTimerStore();
});

describe('娱乐页 LifePlayView', () => {
  it('读/写跟随 dateStore.selectedDate', async () => {
    await createRecord('play_records', { date: '2026-06-03', content: '游戏A', minutes: 20, source: 'manual' });
    await createRecord('play_records', { date: '2026-06-04', content: '游戏B', minutes: 30, source: 'timer' });

    const wrapper = mount(LifePlayView, { global: { plugins: [pinia], stubs: { Teleport: true } } });
    await waitUntil(() => play.loadedDate === '2026-06-03', '等待首次加载');
    await flushPromises();
    expect(wrapper.find('[data-test="quota-text"]').text()).toContain('已用 20');

    dateStore.setSelected('2026-06-04');
    await waitUntil(() => play.loadedDate === '2026-06-04', '等待切换日期后重载');
    await flushPromises();
    expect(wrapper.find('[data-test="quota-text"]').text()).toContain('已用 30');
  });

  it('历史「再来一轮」把预填带到计时面板：名称/倒计时/30 分钟，需再点开始才计时', async () => {
    await createRecord('play_records', { date: '2026-06-03', content: '塞尔达', minutes: 30, source: 'timer' });

    const wrapper = mount(LifePlayView, { global: { plugins: [pinia], stubs: { Teleport: true } } });
    await waitUntil(() => play.loadedDate === '2026-06-03', '等待首次加载');
    await flushPromises();

    await wrapper.find('[data-test="play-again-btn"]').trigger('click');
    await flushPromises();

    expect((wrapper.find('[data-test="play-name-input"]').element as HTMLInputElement).value).toBe('塞尔达');
    expect(wrapper.find('[data-test="play-mode-countdown"]').classes()).toContain('on');
    expect((wrapper.find('[data-test="play-countdown-minutes"]').element as HTMLInputElement).value).toBe('30');
    expect(timer.timer).toBeNull();
    expect(wrapper.find('[data-test="pause-btn"]').exists()).toBe(false);

    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待倒计时开始');
    await flushPromises();
    expect(timer.timer?.mode).toBe('countdown');
    expect(timer.timer?.countdown_sec).toBe(1800);
    await timer.discardTimer();
  });
});
