import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getActiveTimer, resetDbForTests, type Book, type Subject } from '@/db';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import StudyTimerView from './StudyTimerView.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/study/timer', component: Stub },
      { path: '/study/books', component: Stub },
      { path: '/study/subjects', component: Stub },
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

async function makeSubject(): Promise<Subject> {
  return createRecord('subjects', {
    name: '数学',
    weekly_goal_min: 360,
    deadline: null,
    archived: false,
  });
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

async function mountPage() {
  const wrapper = mount(StudyTimerView, { global: { plugins: [pinia, router], stubs: { Teleport: true } } });
  await router.isReady();
  // 对象列表是挂载后异步加载的（Dexie 多轮微任务），等 loading 状态结束再继续；
  // 已有计时时选择卡片整体隐藏，无需等待列表。
  if (useTimerStore().timer === null) {
    await vi.waitFor(() => {
      if (wrapper.find('[data-test="targets-loading"]').exists()) {
        throw new Error('对象列表尚未加载完成');
      }
    });
  }
  await flushPromises();
  return wrapper;
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  timer = useTimerStore();
});

afterEach(() => {
  timer.dispose();
});

describe('计时器页 #/study/timer', () => {
  it('未选对象点开始：无法开始并 toast 提示“请先选择对象”', async () => {
    await makeBook();
    await makeSubject();
    const wrapper = await mountPage();
    expect(wrapper.find('[data-test="start-btn"]').exists()).toBe(true);

    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await flushPromises();

    expect(timer.isRunning).toBe(false);
    expect(await getActiveTimer()).toBeNull();
    expect(useToastStore().items.some((i) => i.message === '请先选择对象')).toBe(true);
  });

  it('选择在读书籍后开始：时钟显示、显示暂停/结束按钮、选择控件隐藏', async () => {
    const book = await makeBook();
    await makeSubject();
    const wrapper = await mountPage();
    const radios = wrapper.findAll('input[data-test="target-option"]');
    expect(radios.length).toBe(1); // 默认书籍列表 = 在读书籍
    await radios[0]?.setValue(true);

    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待计时开始');
    await flushPromises();

    expect(timer.isRunning).toBe(true);
    expect(timer.timer?.target_title).toBe('SICP');
    expect(wrapper.find('[data-test="clock-face"]').text()).toBe('00:00:00');
    expect(wrapper.find('[data-test="timer-target"]').text()).toContain('SICP');
    expect(wrapper.find('[data-test="pause-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="end-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="start-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="target-list"]').exists()).toBe(false);
  });

  it('Space 快捷键：开始→暂停→继续', async () => {
    const book = await makeBook();
    const wrapper = await mountPage();
    const radios = wrapper.findAll('input[data-test="target-option"]');
    await radios[0]?.setValue(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await waitUntil(() => timer.isRunning, '等待 Space 开始计时');
    await flushPromises();
    expect(timer.isPaused).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await waitUntil(() => timer.isPaused, '等待 Space 暂停');
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await waitUntil(() => timer.isRunning && !timer.isPaused, '等待 Space 继续');
    await flushPromises();
    expect(timer.timer?.target_id).toBe(book.id);
  });

  it('倒计时模式：设置 1 分钟后开始，时钟显示剩余 00:01:00（AC-39 配置）', async () => {
    await makeSubject();
    const wrapper = await mountPage();
    await wrapper.find('[data-test="type-subject"]').trigger('click');
    const radios = wrapper.findAll('input[data-test="target-option"]');
    expect(radios.length).toBe(1);
    await radios[0]?.setValue(true);

    await wrapper.find('[data-test="mode-countdown"]').trigger('click');
    await wrapper.find('[data-test="countdown-minutes"]').setValue('1');
    await wrapper.find('[data-test="start-btn"]').trigger('click');
    await waitUntil(() => timer.isRunning, '等待倒计时开始');
    await flushPromises();

    expect(timer.timer?.mode).toBe('countdown');
    expect(timer.timer?.countdown_sec).toBe(60);
    expect(wrapper.find('[data-test="clock-face"]').text()).toBe('00:01:00');
  });

  it('结算弹窗等全局弹层打开时 Space 不响应', async () => {
    const book = await makeBook();
    const wrapper = await mountPage();
    const radios = wrapper.findAll('input[data-test="target-option"]');
    await radios[0]?.setValue(true);

    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    await timer.endTimer();
    expect(timer.isSettling).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await flushPromises();
    expect(timer.isSettling).toBe(true);
    expect(timer.isRunning).toBe(false);
  });

  it('娱乐计时进行中：显示提示且不渲染学习控制按钮', async () => {
    await timer.startTimer({ type: 'entertainment', targetId: '游戏', targetTitle: '游戏', mode: 'stopwatch' });
    const wrapper = await mountPage();
    expect(wrapper.find('[data-test="entertainment-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="start-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="pause-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="end-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="timer-target"]').text()).toContain('游戏');
  });
  it('空状态有主按钮：默认（书籍）跳到书架', async () => {
    const wrapper = await mountPage();
    expect(wrapper.find('[data-test="target-empty"]').exists()).toBe(true);
    const button = wrapper.find('[data-test="empty-add-target"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('去添加书籍');
    await button.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/books');
  });

  it('空状态主按钮跟随对象类型：切到科目就跳科目页', async () => {
    const wrapper = await mountPage();
    await wrapper.find('[data-test="type-subject"]').trigger('click');
    await flushPromises();
    const button = wrapper.find('[data-test="empty-add-target"]');
    expect(button.text()).toContain('去添加科目');
    await button.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/subjects');
  });
});
