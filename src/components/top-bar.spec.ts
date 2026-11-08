import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { dateSwitchPaths, showsDateSwitch } from '@/config/nav';
import { useDateStore } from '@/stores/date';
import { addDays, logicalToday } from '@/utils/date';
import TopBar from './TopBar.vue';

const Stub = defineComponent({ template: '<div />' });

/** 与 router/index.ts 一致的 11 条路由（书详情用 :id 占位）。 */
const routes = [
  { path: '/', redirect: '/home' },
  { path: '/home', component: Stub },
  { path: '/plan', component: Stub },
  { path: '/study/books', component: Stub },
  { path: '/study/books/:id', component: Stub },
  { path: '/study/subjects', component: Stub },
  { path: '/study/timer', component: Stub },
  { path: '/life/diet', component: Stub },
  { path: '/life/workout', component: Stub },
  { path: '/life/play', component: Stub },
  { path: '/review', component: Stub },
  { path: '/settings', component: Stub },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
];

/** 与 App.vue 相同的运行环境：全局 Esc 由 useEscToCloseModal 一次性监听。 */
const Host = defineComponent({
  components: { TopBar },
  setup() {
    useEscToCloseModal();
  },
  template: '<TopBar />',
});

const DATE_PAGES = ['/plan', '/life/diet', '/life/workout', '/life/play'];
const NON_DATE_PAGES = [
  '/review',
  '/home',
  '/study/books',
  '/study/books/book-1',
  '/study/subjects',
  '/study/timer',
  '/settings',
];

let pinia: Pinia;
let wrapper: VueWrapper | null = null;

beforeEach(() => {
  window.localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

async function mountAt(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  wrapper?.unmount();
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  wrapper = mount(Host, {
    global: { plugins: [pinia, router], stubs: { Teleport: true } },
  });
  await flushPromises();
  return { wrapper, router };
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('顶栏常驻「＋ 记一笔」', () => {
  it('任何页面都在，点了带 ?new=1 跳到日程页', async () => {
    const mounted = await mountAt('/home');
    const button = mounted.wrapper.find('[data-test="quick-add"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    await flushPromises();
    expect(mounted.router.currentRoute.value.path).toBe('/plan');
    expect(mounted.router.currentRoute.value.query['new']).toBe('1');
  });
});

describe('顶栏日期控件的显示范围（AC-59）', () => {
  it('所有页面顶栏均无日期和主题切换，设置入口可直达设置页', async () => {
    for (const path of [...DATE_PAGES, ...NON_DATE_PAGES]) {
      const mounted = await mountAt(path);
      expect(mounted.wrapper.find('[data-test="date-switch"]').exists()).toBe(false);
      expect(mounted.wrapper.findComponent({ name: 'ThemeToggle' }).exists()).toBe(false);
      await mounted.wrapper.get('[data-test="settings-link"]').trigger('click');
      await flushPromises();
      expect(mounted.router.currentRoute.value.path).toBe('/settings');
    }
  });

  it('6 个非日期页面完全不显示日期控件', async () => {
    for (const path of NON_DATE_PAGES) {
      const mounted = await mountAt(path);
      expect(mounted.wrapper.find('[data-test="date-switch"]').exists(), path).toBe(false);
      expect(mounted.wrapper.find('[data-test="prev-day"]').exists(), path).toBe(false);
      expect(mounted.wrapper.find('[data-test="date-label"]').exists(), path).toBe(false);
      expect(mounted.wrapper.find('[data-test="next-day"]').exists(), path).toBe(false);
      expect(mounted.wrapper.find('[data-test="go-today"]').exists(), path).toBe(false);
    }
  });

  it('唯一来源 config/nav.ts：日期页共 5 条，错题本独立于日期', () => {
    expect(dateSwitchPaths).toEqual([
      '/plan',
      '/life/diet',
      '/life/workout',
      '/life/play',
    ]);
    for (const path of dateSwitchPaths) expect(showsDateSwitch(path), path).toBe(true);
    for (const path of NON_DATE_PAGES) expect(showsDateSwitch(path), path).toBe(false);
    expect(showsDateSwitch('/mistakes')).toBe(false);
  });

  it('非日期页面快捷键仍全局生效：← / → 切换日期，T / Home 回今天', async () => {
    const today = logicalToday();
    const mounted = await mountAt('/home');
    const dateStore = useDateStore();
    expect(dateStore.selectedDate).toBe(today);

    press('ArrowLeft');
    expect(dateStore.selectedDate).toBe(addDays(today, -1));
    press('ArrowRight');
    expect(dateStore.selectedDate).toBe(today);
    press('ArrowRight');
    expect(dateStore.selectedDate).toBe(addDays(today, 1));
    press('t');
    expect(dateStore.selectedDate).toBe(today);

    await mounted.router.push('/settings');
    await flushPromises();
    expect(mounted.wrapper.find('[data-test="date-switch"]').exists()).toBe(false);
    press('ArrowLeft');
    expect(dateStore.selectedDate).toBe(addDays(today, -1));
    press('Home');
    expect(dateStore.selectedDate).toBe(today);
  });

});
