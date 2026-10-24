import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { addDays, logicalToday } from '@/utils/date';
import { useDateStore } from '@/stores/date';
import TopBar from './TopBar.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/home' },
      { path: '/home', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/life/play', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/home' },
    ],
  });
}

let pinia: Pinia;

beforeEach(() => {
  window.localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('顶栏日期切换', () => {
  it('前一天/后一天/回到今天的切换逻辑', async () => {
    const router = makeRouter();
    const wrapper = mount(TopBar, { global: { plugins: [pinia, router] } });
    await router.isReady();
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
});
