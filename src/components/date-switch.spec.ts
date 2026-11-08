import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { addDays, formatDateCNWeekday, logicalToday } from '@/utils/date';
import { useDateStore } from '@/stores/date';
import TopBar from './TopBar.vue';
import PageDateControls from './PageDateControls.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/plan' },
      { path: '/home', component: Stub },
      { path: '/plan', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/life/play', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/plan' },
    ],
  });
}

/** 与 App.vue 相同的运行环境：全局 Esc 由 useEscToCloseModal 一次性监听。 */
const Host = defineComponent({
  components: { TopBar, PageDateControls },
  setup() {
    useEscToCloseModal();
  },
  template: '<div><TopBar /><PageDateControls /></div>',
});

let pinia: Pinia;
let unmount: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

/** 默认挂在计划页：日期控件只在日期相关页面显示（见 config/nav.ts）。 */
async function mountTopBar(path = '/plan') {
  const router = makeRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(Host, {
    global: { plugins: [pinia, router], stubs: { Teleport: true } },
  });
  unmount = () => wrapper.unmount();
  return wrapper;
}

function press(key: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('顶栏日期切换', () => {
  it('前一天/后一天/回到今天的切换逻辑', async () => {
    const wrapper = await mountTopBar();
    const dateStore = useDateStore();
    const today = logicalToday();
    const start = dateStore.selectedDate;
    expect(start).toBe(today);

    await wrapper.find('[data-test="prev-day"]').trigger('click');
    expect(dateStore.selectedDate).toBe(addDays(start, -1));
    expect(dateStore.isToday).toBe(false);
    expect(wrapper.find('[data-test="go-today"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="date-label"]').text()).toContain('月');

    await wrapper.find('[data-test="next-day"]').trigger('click');
    await wrapper.find('[data-test="next-day"]').trigger('click');
    expect(dateStore.selectedDate).toBe(addDays(start, 1));

    await wrapper.find('[data-test="go-today"]').trigger('click');
    expect(dateStore.selectedDate).toBe(today);
    expect(dateStore.isToday).toBe(true);
    expect(wrapper.find('[data-test="go-today"]').exists()).toBe(false);
  });

  it('选中日期持久化：重新创建 store 后仍保留（刷新不丢）', () => {
    const dateStore = useDateStore();
    const target = addDays(dateStore.selectedDate, -3);
    dateStore.setSelected(target);
    setActivePinia(createPinia());
    const fresh = useDateStore();
    expect(fresh.selectedDate).toBe(target);
  });

  it('日期标签是可点击按钮，点击打开日期跳转弹窗', async () => {
    const wrapper = await mountTopBar();
    const label = wrapper.find('[data-test="date-label"]');
    expect(label.element.tagName).toBe('BUTTON');
    expect(label.attributes('aria-haspopup')).toBe('dialog');
    expect(label.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(false);

    await label.trigger('click');
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="date-input"]').attributes('type')).toBe('date');
    expect(wrapper.find('[data-test="date-label"]').attributes('aria-expanded')).toBe('true');
  });

  it('弹窗里选日期后顶栏显示与 store 同步（并写入 localStorage）', async () => {
    const wrapper = await mountTopBar();
    const dateStore = useDateStore();
    const target = addDays(logicalToday(), -12);

    await wrapper.find('[data-test="date-label"]').trigger('click');
    await wrapper.find('[data-test="date-input"]').setValue(target);
    await flushPromises();

    expect(dateStore.selectedDate).toBe(target);
    expect(wrapper.find('[data-test="date-label"]').text()).toBe(formatDateCNWeekday(target));
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(false);
    expect(window.localStorage.getItem('evan-app:selected-date')).toBe(target);
  });

  it('「昨天」快捷跳到昨天并同步顶栏', async () => {
    const wrapper = await mountTopBar();
    const dateStore = useDateStore();
    const today = logicalToday();
    dateStore.setSelected(addDays(today, -20));

    await wrapper.find('[data-test="date-label"]').trigger('click');
    await wrapper.find('[data-test="quick-yesterday"]').trigger('click');

    expect(dateStore.selectedDate).toBe(addDays(today, -1));
    await flushPromises();
    expect(wrapper.find('[data-test="date-label"]').text()).toBe(formatDateCNWeekday(addDays(today, -1)));
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(false);
  });

  it('Esc 关闭弹窗且不改动选中日期', async () => {
    const wrapper = await mountTopBar();
    const dateStore = useDateStore();
    const before = dateStore.selectedDate;

    await wrapper.find('[data-test="date-label"]').trigger('click');
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();

    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(false);
    expect(dateStore.selectedDate).toBe(before);
  });

  it('键盘 ← / → 切换前后一天，T 与 Home 回到今天', async () => {
    await mountTopBar();
    const dateStore = useDateStore();
    const today = logicalToday();

    press('ArrowLeft');
    expect(dateStore.selectedDate).toBe(addDays(today, -1));
    press('ArrowLeft');
    expect(dateStore.selectedDate).toBe(addDays(today, -2));
    press('ArrowRight');
    expect(dateStore.selectedDate).toBe(addDays(today, -1));
    press('ArrowRight');
    expect(dateStore.selectedDate).toBe(today);

    press('ArrowLeft');
    expect(dateStore.selectedDate).toBe(addDays(today, -1));
    press('t');
    expect(dateStore.selectedDate).toBe(today);

    press('ArrowRight');
    expect(dateStore.selectedDate).toBe(addDays(today, 1));
    press('Home');
    expect(dateStore.selectedDate).toBe(today);
  });

  it('焦点在 input / textarea / contenteditable 里时 ← / → 不劫持', async () => {
    await mountTopBar();
    const dateStore = useDateStore();
    const today = logicalToday();

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, textarea, editable);
    try {
      press('ArrowLeft', input);
      press('ArrowLeft', textarea);
      press('ArrowLeft', editable);
      press('t', input);
      expect(dateStore.selectedDate).toBe(today);
    } finally {
      input.remove();
      textarea.remove();
      editable.remove();
    }
  });

  it('弹窗打开时 ← / → 不切换日期（不穿透到背景）', async () => {
    const wrapper = await mountTopBar();
    const dateStore = useDateStore();
    const before = dateStore.selectedDate;

    await wrapper.find('[data-test="date-label"]').trigger('click');
    press('ArrowLeft');
    press('ArrowRight');
    expect(dateStore.selectedDate).toBe(before);
  });
});
