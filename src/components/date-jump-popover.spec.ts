import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { useModalStore } from '@/stores/modal';
import { addDays, formatDateCNWeekday, logicalToday } from '@/utils/date';
import DateJumpPopover from './DateJumpPopover.vue';

let pinia: Pinia;

beforeEach(() => {
  window.localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountPopover(selectedDate: string) {
  return mount(DateJumpPopover, {
    props: { selectedDate },
    global: { plugins: [pinia], stubs: { Teleport: true } },
  });
}

/** 与 App.vue 相同的运行环境：全局 Esc 由 useEscToCloseModal 一次性监听。 */
const Host = defineComponent({
  components: { DateJumpPopover },
  setup() {
    useEscToCloseModal();
    return { open: ref(true), selectedDate: ref('2026-01-10') };
  },
  template: '<DateJumpPopover v-if="open" :selected-date="selectedDate" @close="open = false" />',
});

describe('日期跳转弹窗', () => {
  it('展示当前选中日期，并提供原生日期输入', () => {
    const wrapper = mountPopover('2026-01-10');
    expect(wrapper.find('[data-test="popover-current"]').text()).toContain(formatDateCNWeekday('2026-01-10'));
    const input = wrapper.find('[data-test="date-input"]');
    expect(input.attributes('type')).toBe('date');
    expect((input.element as HTMLInputElement).value).toBe('2026-01-10');
  });

  it('弹窗顶部出现月历，原生日期输入与四个快捷按钮完整保留在下面', async () => {
    const wrapper = mountPopover('2026-01-10');
    await flushPromises();

    expect(wrapper.find('[data-test="month-calendar"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="calendar-day"]').length).toBeGreaterThanOrEqual(28);
    expect(wrapper.find('[data-test="calendar-month-label"]').text()).toBe('2026年1月');

    const input = wrapper.find('[data-test="date-input"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('type')).toBe('date');
    for (const test of ['popover-today', 'quick-yesterday', 'quick-day-before', 'quick-week-ago']) {
      expect(wrapper.find(`[data-test="${test}"]`).exists(), test).toBe(true);
    }

    // 月历在原生日期输入上方（月历网格 → 当前选中 → 原生输入 → 快捷按钮）
    const calendarEl = wrapper.find('[data-test="month-calendar"]').element;
    const inputEl = input.element;
    expect(calendarEl.compareDocumentPosition(inputEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('点月历里的某一天直接 emit select（弹窗由父组件关闭并跳转）', async () => {
    const wrapper = mountPopover('2026-01-10');
    await flushPromises();

    await wrapper.find('[data-test="calendar-day"][data-date="2026-01-03"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-01-03']);
  });

  it('月历里点「今天」也 emit 今天的日期', async () => {
    const wrapper = mountPopover('2026-01-10');
    await flushPromises();

    await wrapper.find('[data-test="calendar-today"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([logicalToday()]);
  });

  it('快捷按钮相对“今天”计算：今天/昨天/前天/一周前', async () => {
    const today = logicalToday();
    const cases: Array<[string, string]> = [
      ['popover-today', today],
      ['quick-yesterday', addDays(today, -1)],
      ['quick-day-before', addDays(today, -2)],
      ['quick-week-ago', addDays(today, -7)],
    ];
    for (const [test, expected] of cases) {
      const wrapper = mountPopover(addDays(today, -30));
      await wrapper.find(`[data-test="${test}"]`).trigger('click');
      expect(wrapper.emitted('select')?.[0]).toEqual([expected]);
      wrapper.unmount();
    }
  });

  it('日期输入选到合法日期时抛出 select，清空不抛', async () => {
    const wrapper = mountPopover('2026-01-10');
    const input = wrapper.find('[data-test="date-input"]');
    await input.setValue('2024-05-06');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2024-05-06']);
    await input.setValue('');
    expect(wrapper.emitted('select')?.length).toBe(1);
  });

  it('同一个日期连续触发 input 与 change 只抛一次 select，换成另一天才再抛', async () => {
    const wrapper = mountPopover('2026-01-10');
    const input = wrapper.find('[data-test="date-input"]');
    await input.setValue('2024-05-06');
    await input.trigger('change'); // 模拟浏览器原生 input → change 双事件
    expect(wrapper.emitted('select')?.length).toBe(1);
    await input.setValue('2024-05-07');
    expect(wrapper.emitted('select')?.length).toBe(2);
    expect(wrapper.emitted('select')?.[1]).toEqual(['2024-05-07']);
  });

  it('点击遮罩关闭', async () => {
    const wrapper = mountPopover('2026-01-10');
    await wrapper.find('.modal-overlay').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('注册进 modal store，Esc 交给全局 useEscToCloseModal 关闭', async () => {
    const wrapper = mount(Host, { global: { plugins: [pinia], stubs: { Teleport: true } } });
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(true);
    expect(useModalStore().top).toBe('date-jump');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-test="date-jump-popover"]').exists()).toBe(false);
    expect(useModalStore().top).toBe(null);
  });
});
