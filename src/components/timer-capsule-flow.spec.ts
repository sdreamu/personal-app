import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, resetDbForTests, type Book } from '@/db';
import { useTimerStore } from '@/stores/timer';
import TopBar from './TopBar.vue';

/**
 * 胶囊与全局计时状态机的联动（第 1 阶段胶囊只测了静态 getter，
 * 这里验证真实开始/结束/结算动作驱动胶囊出现、切换与消失）。
 */
const Stub = defineComponent({ template: '<div />' });

function makeRouter(): Router {
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
let router: Router;
let timer: ReturnType<typeof useTimerStore>;

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

async function mountTopBar() {
  const wrapper = mount(TopBar, { global: { plugins: [pinia, router] } });
  await router.isReady();
  return wrapper;
}

beforeEach(async () => {
  window.localStorage.clear();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  timer = useTimerStore();
});

afterEach(() => {
  timer.dispose();
});

describe('顶栏胶囊与计时状态机联动', () => {
  it('开始计时后胶囊出现；结束时变待结算高亮；结算后胶囊消失', async () => {
    const book = await makeBook();
    const wrapper = await mountTopBar();
    expect(wrapper.find('[data-test="timer-capsule"]').exists()).toBe(false);

    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    await flushPromises();
    expect(wrapper.find('[data-test="timer-capsule"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="timer-capsule"]').text()).toContain('SICP');
    expect(wrapper.find('[data-test="timer-capsule"]').text()).toContain('00:00:00');
    expect(wrapper.find('[data-test="timer-capsule"]').classes()).not.toContain('settling');

    await timer.endTimer();
    await flushPromises();
    expect(wrapper.find('[data-test="timer-capsule"]').text()).toContain('⏱ 待结算（点击处理）');
    expect(wrapper.find('[data-test="timer-capsule"]').classes()).toContain('settling');

    await timer.settleStudy({});
    await flushPromises();
    expect(wrapper.find('[data-test="timer-capsule"]').exists()).toBe(false);
  });

  it('待结算时点击胶囊跳回 #/study/timer', async () => {
    const book = await makeBook();
    const wrapper = await mountTopBar();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    await timer.endTimer();
    await flushPromises();
    await wrapper.find('[data-test="timer-capsule"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/timer');
  });
});
