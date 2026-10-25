import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { bottomTabs, navItems } from '@/config/nav';
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
  it('渲染全部 10 个页面入口、2 个分组，且每个入口都带内联图标', async () => {
    const wrapper = mount(SideNav, { global: { plugins: [router, createPinia()] } });
    await router.isReady();

    const links = wrapper.findAll('a.nav-link');
    expect(links).toHaveLength(10);
    expect(links.map((l) => l.text())).toEqual([
      '今天',
      '日程',
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
    // 图标是内联 SVG path（无图标字体、无外链）
    for (const link of links) {
      expect(link.find('svg.nav-icon path').attributes('d')).toBeTruthy();
    }
    expect(wrapper.findAll('img')).toHaveLength(0);
  });

  it('分组子页面链接存在且都指向真实路由', async () => {
    const wrapper = mount(SideNav, { global: { plugins: [router, createPinia()] } });
    await router.isReady();

    const groupPaths = navItems.flatMap((item) =>
      item.kind === 'group' ? item.children.map((child) => child.to) : [],
    );
    expect(groupPaths).toEqual([
      '/study/books',
      '/study/subjects',
      '/study/timer',
      '/life/diet',
      '/life/workout',
      '/life/play',
    ]);
    for (const to of groupPaths) {
      expect(router.resolve(to).matched.length, `${to} 应有对应路由`).toBeGreaterThan(0);
    }
    // 分组内的 6 个子页面在侧边栏里各有 1 个链接
    expect(wrapper.findAll('a.nav-link-child')).toHaveLength(6);
  });

  it('当前页高亮；书详情子路由归属“读书”', async () => {
    const wrapper = mount(SideNav, { global: { plugins: [router, createPinia()] } });
    await router.isReady();

    await router.push('/plan');
    await flushPromises();
    let active = wrapper.find('a.nav-link.active');
    expect(active.exists()).toBe(true);
    expect(active.text()).toBe('日程');
    expect(active.attributes('aria-current')).toBe('page');
    expect(wrapper.findAll('a.nav-link.active')).toHaveLength(1);

    await router.push('/study/books/abc');
    await flushPromises();
    active = wrapper.find('a.nav-link.active');
    expect(active.text()).toBe('读书');

    await router.push('/life/play');
    await flushPromises();
    active = wrapper.find('a.nav-link.active');
    expect(active.text()).toBe('娱乐');
  });

  it('分组可折叠；切到组内页面时该组自动展开', async () => {
    const wrapper = mount(SideNav, { global: { plugins: [router, createPinia()] } });
    await router.isReady();
    expect(wrapper.findAll('a.nav-link')).toHaveLength(10);

    const studyToggle = wrapper.findAll('[data-test="nav-group"]')[0]!;
    expect(studyToggle.attributes('aria-expanded')).toBe('true');
    await studyToggle.trigger('click');
    expect(studyToggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('a.nav-link')).toHaveLength(7);

    await router.push('/study/timer');
    await flushPromises();
    expect(wrapper.findAll('a.nav-link')).toHaveLength(10);
    expect(wrapper.find('a.nav-link.active').text()).toBe('计时器');
  });
});

describe('底部导航配置（5 个一级入口）', () => {
  it('一级入口为 今天/日程/学习/生活/复盘', () => {
    expect(bottomTabs).toHaveLength(5);
    expect(bottomTabs.map((tab) => tab.label)).toEqual(['今天', '日程', '学习', '生活', '复盘']);
    // 设置不进底部导航，太窄的屏幕留给侧边栏/首页入口
    expect(bottomTabs.some((tab) => tab.key === 'settings')).toBe(false);
  });

  it('底部导航的分组入口与侧边栏分组共用同一份子页面', () => {
    const sidebarGroups = navItems.filter((item) => item.kind === 'group');
    const bottomGroups = bottomTabs.filter((item) => item.kind === 'group');
    expect(bottomGroups.map((g) => g.key)).toEqual(['study', 'life']);
    expect(bottomGroups).toEqual(sidebarGroups);
  });
});
