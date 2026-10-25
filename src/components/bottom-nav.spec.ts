import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import BottomNav from './BottomNav.vue';

const Stub = defineComponent({ template: '<div class="stub-page" />' });
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/home', component: Stub },
  { path: '/plan', component: Stub },
  { path: '/study/books', component: Stub },
  { path: '/study/books/:id', component: Stub },
  { path: '/study/subjects', component: Stub },
  { path: '/study/timer', component: Stub },
  { path: '/mistakes', component: Stub },
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

async function mountNav() {
  const wrapper = mount(BottomNav, { global: { plugins: [router] } });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

describe('手机底部导航', () => {
  it('渲染 5 个一级入口，3 个直接跳转 + 2 个分组面板', async () => {
    const wrapper = await mountNav();
    expect(wrapper.find('.mobile-nav').exists()).toBe(true);
    expect(wrapper.find('nav.bottom-nav').attributes('aria-label')).toBe('底部导航');

    const tabs = wrapper.findAll('.bottom-tab');
    expect(tabs).toHaveLength(5);
    expect(tabs.map((t) => t.text())).toEqual(['今天', '日程', '学习', '生活', '复盘']);
    expect(wrapper.findAll('a.bottom-tab')).toHaveLength(3);
    expect(wrapper.findAll('[data-test="bottom-tab-group"]')).toHaveLength(2);
    // 无障碍标签 + 图标都是内联 SVG
    for (const tab of tabs) {
      expect(tab.attributes('aria-label')).toBeTruthy();
      expect(tab.find('svg.nav-icon path').attributes('d')).toBeTruthy();
    }
    expect(wrapper.findAll('img')).toHaveLength(0);
  });

  it('当前页高亮：直页高亮自己，学习/生活组内页高亮分组入口', async () => {
    const wrapper = await mountNav();

    await router.push('/home');
    await flushPromises();
    expect(wrapper.findAll('.bottom-tab.active').map((t) => t.text())).toEqual(['今天']);
    expect(wrapper.find('a.bottom-tab.active').attributes('aria-current')).toBe('page');

    await router.push('/study/timer');
    await flushPromises();
    expect(wrapper.findAll('.bottom-tab.active').map((t) => t.text())).toEqual(['学习']);

    await router.push('/life/play');
    await flushPromises();
    expect(wrapper.findAll('.bottom-tab.active').map((t) => t.text())).toEqual(['生活']);
  });

  it('点开分组入口在底部弹出面板列出子页面，不跳转', async () => {
    const wrapper = await mountNav();
    await router.push('/home');
    await flushPromises();
    expect(wrapper.find('[data-test="bottom-sheet"]').exists()).toBe(false);

    const studyTab = wrapper.findAll('[data-test="bottom-tab-group"]')[0]!;
    await studyTab.trigger('click');
    const sheet = wrapper.find('[data-test="bottom-sheet"]');
    expect(sheet.exists()).toBe(true);
    expect(sheet.attributes('role')).toBe('dialog');
    expect(sheet.findAll('a.bottom-sheet-link').map((l) => l.text())).toEqual([
      '读书',
      '科目',
      '计时器',
      '错题本',
    ]);
    expect(wrapper.find('[data-test="bottom-sheet-backdrop"]').exists()).toBe(true);
    // 展开面板不改变路由
    expect(router.currentRoute.value.path).toBe('/home');

    // 再点一次收起
    await studyTab.trigger('click');
    expect(wrapper.find('[data-test="bottom-sheet"]').exists()).toBe(false);

    // 生活组的面板列出生活子页面
    const lifeTab = wrapper.findAll('[data-test="bottom-tab-group"]')[1]!;
    await lifeTab.trigger('click');
    expect(wrapper.findAll('a.bottom-sheet-link').map((l) => l.text())).toEqual(['饮食', '健身', '娱乐']);
  });

  it('选中子页面后跳转并关闭面板；面板内的当前页高亮', async () => {
    const wrapper = await mountNav();
    await router.push('/study/books');
    await flushPromises();

    const studyTab = wrapper.findAll('[data-test="bottom-tab-group"]')[0]!;
    await studyTab.trigger('click');
    expect(wrapper.find('a.bottom-sheet-link.active').text()).toBe('读书');
    expect(studyTab.attributes('aria-expanded')).toBe('true');

    const subjects = wrapper.findAll('a.bottom-sheet-link')[1]!;
    await subjects.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/subjects');
    expect(wrapper.find('[data-test="bottom-sheet"]').exists()).toBe(false);

    // 点击遮罩也能关闭
    await studyTab.trigger('click');
    await wrapper.find('[data-test="bottom-sheet-backdrop"]').trigger('click');
    expect(wrapper.find('[data-test="bottom-sheet"]').exists()).toBe(false);
  });
});
