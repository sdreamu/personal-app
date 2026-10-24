import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import SideNav from './SideNav.vue';

const Stub = defineComponent({ template: '<div class="stub-page" />' });
const routes: RouteRecordRaw[] = [
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
];

let router: ReturnType<typeof createRouter>;

beforeEach(() => {
  router = createRouter({ history: createWebHashHistory(), routes });
});

describe('左侧导航', () => {
  it('渲染全部 10 个页面入口与 2 个分组', async () => {
    const wrapper = mount(SideNav, { global: { plugins: [router] } });
    await router.isReady();
    const links = wrapper.findAll('a.nav-link');
    expect(links).toHaveLength(10);
    expect(links.map((l) => l.text())).toEqual([
      '首页',
      '计划',
      '读书',
      '科目',
      '计时器',
      '饮食',
      '健身',
      '娱乐',
      '复盘',
      '设置',
    ]);
    expect(wrapper.findAll('[data-test="nav-group"]')).toHaveLength(2);
  });

  it('当前页高亮；书详情子路由归属“读书”', async () => {
    const wrapper = mount(SideNav, { global: { plugins: [router] } });
    await router.isReady();

    await router.push('/plan');
    await flushPromises();
    let active = wrapper.find('a.nav-link.active');
    expect(active.exists()).toBe(true);
    expect(active.text()).toBe('计划');

    await router.push('/study/books/abc');
    await flushPromises();
    active = wrapper.find('a.nav-link.active');
    expect(active.text()).toBe('读书');

    await router.push('/life/play');
    await flushPromises();
    active = wrapper.find('a.nav-link.active');
    expect(active.text()).toBe('娱乐');
  });
});
