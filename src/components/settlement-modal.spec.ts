import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  createRecord,
  getActiveTimer,
  getRecord,
  listAlive,
  resetDbForTests,
  type ActiveTimer,
  type Book,
  type Plan,
} from '@/db';
import { useModalStore } from '@/stores/modal';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import SettlementModal from './SettlementModal.vue';

const NOW = Date.now();

let pinia: Pinia;
let timer: ReturnType<typeof useTimerStore>;

function baseTimer(overrides: Partial<ActiveTimer>): ActiveTimer {
  return {
    key: 'global',
    id: 't-1',
    created_at: NOW - 10 * 60_000,
    updated_at: NOW - 10 * 60_000,
    deleted_at: null,
    type: 'book',
    target_id: null,
    target_title: 'SICP',
    plan_id: null,
    mode: 'stopwatch',
    countdown_sec: 1500,
    started_at: NOW - 10 * 60_000,
    paused_total_ms: 0,
    paused: false,
    pause_started_at: null,
    ended_at: NOW,
    ...overrides,
  };
}

async function makeBook(currentPage = 40): Promise<Book> {
  return createRecord('books', {
    title: 'SICP',
    author: null,
    total_pages: 300,
    current_page: currentPage,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function makePlan(book: Book): Promise<Plan> {
  return createRecord('plans', {
    title: '读 SICP',
    date: '2026-06-01',
    start_min: null,
    end_min: null,
    category_key: 'study',
    category_name: '学习',
    target_type: 'book',
    target_id: book.id,
    target_title: book.title,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
  });
}

async function mountModal() {
  const wrapper = mount(SettlementModal, { global: { plugins: [pinia], stubs: { Teleport: true } } });
  await flushPromises();
  return wrapper;
}

/** 状态机写库走 Dexie 多轮事件循环，flushPromises 不够，用轮询等到条件成立。 */
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
  timer = useTimerStore();
});

afterEach(() => {
  timer.dispose();
});

describe('全局结算弹窗', () => {
  it('Esc 与点击遮罩都不能关闭（未注册进 modal store）', async () => {
    const book = await makeBook(40);
    timer.$patch({ timer: baseTimer({ target_id: book.id, started_at: NOW - 5 * 60_000, ended_at: NOW }) });
    const wrapper = await mountModal();
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(true);
    expect(useModalStore().stack).toHaveLength(0);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(true);

    await wrapper.find('[data-test="settlement-overlay"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(true);
  });

  it('学习结算保存：生成记录、更新页码、toast“已保存”、弹窗关闭', async () => {
    const book = await makeBook(40);
    timer.$patch({ timer: baseTimer({ target_id: book.id, started_at: NOW - 10 * 60_000, ended_at: NOW }) });
    const wrapper = await mountModal();

    expect(wrapper.find('[data-test="settle-start-page"]').text()).toContain('第 40 页');
    const endPage = wrapper.find('[data-test="settle-end-page"]');
    expect((endPage.element as HTMLInputElement).value).toBe('40');
    await endPage.setValue('55');
    await wrapper.find('[data-test="settle-note"]').setValue('很有收获');
    await wrapper.find('[data-test="settle-save"]').trigger('click');
    await waitUntil(() => timer.timer === null, '等待学习结算完成');
    await flushPromises();

    const records = await listAlive('study_records');
    expect(records).toHaveLength(1);
    expect(records[0]?.duration_sec).toBe(600);
    expect(records[0]?.start_page).toBe(40);
    expect(records[0]?.end_page).toBe(55);
    expect(records[0]?.pages_read).toBe(15);
    expect(records[0]?.note).toBe('很有收获');
    expect((await getRecord('books', book.id))?.current_page).toBe(55);
    expect(timer.timer).toBeNull();
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(false);
    expect(useToastStore().items.some((i) => i.message === '已保存')).toBe(true);
  });

  it('结算丢弃：清空计时不留记录', async () => {
    const book = await makeBook(40);
    timer.$patch({ timer: baseTimer({ target_id: book.id, started_at: NOW - 3 * 60_000, ended_at: NOW }) });
    const wrapper = await mountModal();
    await wrapper.find('[data-test="settle-discard"]').trigger('click');
    await waitUntil(() => timer.timer === null, '等待丢弃完成');
    await flushPromises();
    expect(timer.timer).toBeNull();
    expect(await getActiveTimer()).toBeNull();
    expect(await listAlive('study_records')).toHaveLength(0);
    expect((await getRecord('books', book.id))?.current_page).toBe(40);
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(false);
  });

  it('娱乐结算：折算分钟向上取整预填，可微调后保存', async () => {
    timer.$patch({
      timer: baseTimer({
        type: 'entertainment',
        target_id: '游戏',
        target_title: '游戏',
        started_at: NOW - 130_000,
        ended_at: NOW,
      }),
    });
    const wrapper = await mountModal();
    const minutes = wrapper.find('[data-test="settle-minutes"]');
    expect((minutes.element as HTMLInputElement).value).toBe('3'); // ceil(130/60)
    await minutes.setValue('5');
    await wrapper.find('[data-test="settle-save"]').trigger('click');
    await waitUntil(() => timer.timer === null, '等待娱乐结算完成');
    await flushPromises();
    const records = await listAlive('play_records');
    expect(records).toHaveLength(1);
    expect(records[0]?.minutes).toBe(5);
    expect(records[0]?.content).toBe('游戏');
    expect(records[0]?.source).toBe('timer');
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(false);
  });

  it('不足 1 分钟：先询问“直接丢弃/继续结算保存”，Esc 无效，继续后展示结算表单', async () => {
    const book = await makeBook(40);
    timer.$patch({ timer: baseTimer({ target_id: book.id, started_at: NOW - 30_000, ended_at: NOW }) });
    const wrapper = await mountModal();
    expect(wrapper.find('[data-test="short-confirm-text"]').text()).toContain('计时不足 1 分钟');
    expect(wrapper.find('[data-test="settle-save"]').exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-test="short-confirm-text"]').exists()).toBe(true);

    await wrapper.find('[data-test="short-continue"]').trigger('click');
    await waitUntil(() => wrapper.find('[data-test="settle-end-page"]').exists(), '等待结算表单出现');
    await flushPromises();

    await wrapper.find('[data-test="settle-save"]').trigger('click');
    await waitUntil(() => timer.timer === null, '等待结算保存完成');
    await flushPromises();
    expect(await listAlive('study_records')).toHaveLength(1);
  });

  it('倒计时结束：渲染“再来一轮 / 结束”，结束进入结算弹窗', async () => {
    const book = await makeBook(40);
    timer.$patch({
      timer: baseTimer({
        target_id: book.id,
        mode: 'countdown',
        countdown_sec: 60,
        started_at: NOW - 60_000,
        ended_at: null,
      }),
      countdownFinishedPrompt: true,
    });
    const wrapper = await mountModal();
    expect(wrapper.find('[data-test="countdown-finished-text"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="countdown-next-round"]').text()).toBe('再来一轮');
    expect(wrapper.find('[data-test="countdown-end"]').text()).toBe('结束');

    await wrapper.find('[data-test="countdown-end"]').trigger('click');
    await waitUntil(() => timer.isSettling, '等待进入待结算');
    await flushPromises();
    expect(timer.isSettling).toBe(true);
    expect(wrapper.find('[data-test="settle-end-page"]').exists()).toBe(true);
  });

  it('12 小时恢复：渲染三选项；直接丢弃清空计时', async () => {
    timer.$patch({
      timer: baseTimer({ ended_at: null, started_at: NOW - 13 * 3600_000 }),
      recoveryPending: true,
    });
    const wrapper = await mountModal();
    expect(wrapper.find('[data-test="recovery-continue"]').text()).toBe('继续计时');
    expect(wrapper.find('[data-test="recovery-end-override"]').text()).toBe('结束并手动修改时长');
    await wrapper.find('[data-test="recovery-discard"]').trigger('click');
    await waitUntil(() => timer.timer === null, '等待丢弃完成');
    await flushPromises();
    expect(timer.timer).toBeNull();
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(false);
  });

  it('恢复选“结束并手动修改时长”：结算表单出现时长覆盖输入并生效', async () => {
    const book = await makeBook(40);
    timer.$patch({
      timer: baseTimer({ target_id: book.id, ended_at: null, started_at: NOW - 13 * 3600_000 }),
      recoveryPending: true,
    });
    const wrapper = await mountModal();
    await wrapper.find('[data-test="recovery-end-override"]').trigger('click');
    await waitUntil(() => timer.isSettling, '等待进入待结算');
    await flushPromises();
    expect(timer.isSettling).toBe(true);
    expect(timer.durationOverrideAllowed).toBe(true);
    expect(wrapper.find('[data-test="settle-duration-override"]').exists()).toBe(true);

    await wrapper.find('[data-test="settle-duration-override"]').setValue('7200');
    await wrapper.find('[data-test="settle-save"]').trigger('click');
    await waitUntil(() => timer.timer === null, '等待结算保存完成');
    await flushPromises();
    const records = await listAlive('study_records');
    expect(records).toHaveLength(1);
    expect(records[0]?.duration_sec).toBe(7200);
  });

  it('带 plan_id 保存后：询问是否标记计划完成；确认后 plans.done=true', async () => {
    const book = await makeBook(40);
    const plan = await makePlan(book);
    timer.$patch({
      timer: baseTimer({ target_id: book.id, plan_id: plan.id, started_at: NOW - 5 * 60_000, ended_at: NOW }),
    });
    const wrapper = await mountModal();
    await wrapper.find('[data-test="settle-save"]').trigger('click');
    await waitUntil(() => timer.pendingPlanQuestion !== null, '等待计划联动询问出现');
    await flushPromises();
    expect(timer.pendingPlanQuestion?.planId).toBe(plan.id);
    expect(wrapper.find('[data-test="plan-question-text"]').text()).toContain('读 SICP');

    await wrapper.find('[data-test="plan-question-confirm"]').trigger('click');
    await waitUntil(() => timer.pendingPlanQuestion === null, '等待计划标记完成');
    await flushPromises();
    expect(timer.pendingPlanQuestion).toBeNull();
    expect((await getRecord('plans', plan.id))?.done).toBe(true);
    expect((await getRecord('plans', plan.id))?.done_at).toBeGreaterThan(0);
    expect(wrapper.find('[data-test="settlement-modal"]').exists()).toBe(false);
  });
});
