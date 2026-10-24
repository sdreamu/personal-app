import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { ActiveTimer, Review } from '@/db';
import { useDateStore } from '@/stores/date';
import { useHomeStore } from '@/stores/home';
import { useTimerStore } from '@/stores/timer';
import HomeHintBar from './HomeHintBar.vue';

const Stub = defineComponent({ template: '<div />' });
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/study/timer' },
      { path: '/study/timer', component: Stub },
      { path: '/life/play', component: Stub },
      { path: '/review', component: Stub },
      { path: '/settings', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/study/timer' },
    ],
  });
}

function baseTimer(): ActiveTimer {
  return {
    key: 'global',
    id: 'timer-1',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    type: 'book',
    target_id: null,
    target_title: '深入理解计算机系统',
    plan_id: null,
    mode: 'stopwatch',
    countdown_sec: 1500,
    started_at: Date.now() - 65_000,
    paused_total_ms: 0,
    paused: false,
    pause_started_at: null,
    ended_at: null,
  };
}

function reviewFixture(overrides: Partial<Review> = {}): Review {
  return {
    id: 'review-yesterday',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    date: YESTERDAY,
    rating: null,
    mood: null,
    energy: null,
    good: null,
    improve: null,
    mit: '写代码',
    mit_added_to_plan: false,
    ...overrides,
  };
}

let pinia: Pinia;
let router: Router;

function mountBar() {
  return mount(HomeHintBar, { global: { plugins: [pinia, router] } });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
});

describe('首页顶部提示条', () => {
  it('候选全部命中时最多显示 2 条，按 计时 > 复盘 顺序', () => {
    const timer = useTimerStore();
    timer.$patch({ timer: baseTimer() });
    const home = useHomeStore();
    home.$patch({ today: TODAY, yesterdayReviewed: false, rolloverCount: 3, earliestDataAt: 1 });

    const wrapper = mountBar();
    const items = wrapper.findAll('[data-test="hint-item"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.text()).toContain('计时');
    expect(items[1]?.text()).toContain('复盘');
  });

  it('计时提示点击跳对应计时页', async () => {
    const timer = useTimerStore();
    timer.$patch({ timer: baseTimer() });
    const home = useHomeStore();
    home.$patch({ today: TODAY, yesterdayReviewed: true, rolloverCount: 0, earliestDataAt: null });

    const wrapper = mountBar();
    await wrapper.find('[data-test="hint-item"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/timer');
  });

  it('复盘提示点击跳复盘页并把选中日期设为昨天', async () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, yesterdayReviewed: false, rolloverCount: 0, earliestDataAt: null });

    const wrapper = mountBar();
    await wrapper.find('[data-test="hint-item"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/review');
    expect(useDateStore().selectedDate).toBe(YESTERDAY);
  });

  it('顺延提示点击调用一键顺延动作', async () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, yesterdayReviewed: true, rolloverCount: 2, earliestDataAt: null });
    const rollover = vi.spyOn(home, 'rollover').mockResolvedValue(2);

    const wrapper = mountBar();
    await wrapper.find('[data-test="hint-item"]').trigger('click');
    expect(rollover).toHaveBeenCalledTimes(1);
  });

  it('MIT：未加入时按钮可点并调用 addMit；已加入时显示禁用态', async () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, yesterdayReview: reviewFixture({ mit_added_to_plan: false }) });
    const addMit = vi.spyOn(home, 'addMit').mockResolvedValue(null);

    const wrapper = mountBar();
    expect(wrapper.find('[data-test="mit-text"]').text()).toBe('写代码');
    const btn = wrapper.find('[data-test="mit-add-btn"]');
    expect(btn.text()).toBe('加入今日待办');
    expect(btn.attributes('disabled')).toBeUndefined();
    await btn.trigger('click');
    expect(addMit).toHaveBeenCalledTimes(1);

    home.$patch({ yesterdayReview: reviewFixture({ mit_added_to_plan: true }) });
    await wrapper.vm.$nextTick();
    const disabledBtn = wrapper.find('[data-test="mit-add-btn"]');
    expect(disabledBtn.text()).toContain('已加入今日待办 ✓');
    expect(disabledBtn.attributes('disabled')).toBeDefined();
  });

  it('无命中时不渲染提示条区域', () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, yesterdayReviewed: true, rolloverCount: 0, earliestDataAt: null, yesterdayReview: null });
    const wrapper = mountBar();
    expect(wrapper.find('[data-test="home-hint-area"]').exists()).toBe(false);
  });
});
