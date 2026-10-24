import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { ActiveTimer } from '@/db';
import { useTimerStore } from '@/stores/timer';
import TimerCapsule from './TimerCapsule.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/study/timer' },
      { path: '/study/timer', component: Stub },
      { path: '/life/play', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/study/timer' },
    ],
  });
}

let pinia: Pinia;
let router: ReturnType<typeof makeRouter>;

function baseTimer(overrides: Partial<ActiveTimer>): ActiveTimer {
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
    ...overrides,
  };
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
});

describe('顶栏计时胶囊', () => {
  it('进行中：显示“名称 + 已用时间 HH:MM:SS”', () => {
    const timerStore = useTimerStore();
    timerStore.$patch({ timer: baseTimer({}) });
    const wrapper = mount(TimerCapsule, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('深入理解计算机系统');
    expect(wrapper.text()).toContain('00:01:05');
    expect(wrapper.classes()).not.toContain('settling');
  });

  it('待结算：高亮“⏱ 待结算（点击处理）”，点击跳 #/study/timer', async () => {
    const timerStore = useTimerStore();
    timerStore.$patch({ timer: baseTimer({ ended_at: Date.now() - 5_000 }) });
    const wrapper = mount(TimerCapsule, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('⏱ 待结算（点击处理）');
    expect(wrapper.classes()).toContain('settling');
    await wrapper.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/timer');
  });

  it('娱乐计时点击跳 #/life/play', async () => {
    const timerStore = useTimerStore();
    timerStore.$patch({
      timer: baseTimer({ type: 'entertainment', target_title: '游戏', target_id: '游戏' }),
    });
    const wrapper = mount(TimerCapsule, { global: { plugins: [pinia, router] } });
    await wrapper.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/life/play');
  });

  it('无计时时不渲染胶囊', () => {
    const wrapper = mount(TimerCapsule, { global: { plugins: [pinia, router] } });
    expect(wrapper.find('[data-test="timer-capsule"]').exists()).toBe(false);
  });
});
