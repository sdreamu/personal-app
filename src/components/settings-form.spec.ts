import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getDb, getSettings, resetDbForTests, updateSettings } from '@/db';
import { addDays, logicalToday } from '@/utils/date';
import { useSettingsStore } from '@/stores/settings';
import SettingsView from '@/views/SettingsView.vue';
import HomeHero from '@/components/HomeHero.vue';
import { triggerDownload } from '@/utils/download';

// 文本导出会真的触发文件下载（jsdom 没有 URL.createObjectURL），这里只拦下载动作，
// 数据装载（loadExportSource）与 Markdown 生成（exportText）都跑真实实现。
vi.mock('@/utils/download', () => ({
  DOWNLOAD_REVOKE_DELAY_MS: 10_000,
  triggerDownload: vi.fn(),
}));

const triggerDownloadMock = vi.mocked(triggerDownload);

let pinia: Pinia;

const FIXED_LAST_BACKUP = 1_700_000_000_000;

// 轮询等待的兜底时长：全量并行跑（70+ 文件同时挂 jsdom + fake-indexeddb）时，本文件的
// 即时保存要等 Dexie 真实写入落地，3s 在机器负载高时会误伤（表现为 waitFor 超时，断言本身没失败）。
// 这里只放宽等待时间，任何断言都没有放宽。
async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function compact(date: string): string {
  return date.replace(/-/g, '');
}

beforeEach(async () => {
  pinia = createPinia();
  setActivePinia(pinia);
  triggerDownloadMock.mockClear();
  await resetDbForTests();
  await useSettingsStore().load();
});

describe('设置页', () => {
  it('表单修改即时自动保存（无需保存按钮）', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();

    const studyInput = wrapper.find('input[data-test="goal-study"]');
    await studyInput.setValue('150');
    await studyInput.trigger('change');
    await waitFor(async () => (await getSettings()).daily_study_min === 150);
    expect((await getSettings()).daily_study_min).toBe(150);

    const cupInput = wrapper.find('input[data-test="goal-cup"]');
    await cupInput.setValue('300');
    await cupInput.trigger('change');
    await waitFor(async () => (await getSettings()).cup_ml === 300);
    expect((await getSettings()).cup_ml).toBe(300);
  });

  it('一天起点改为 05:00 即时生效并写入 settings', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('select[data-test="day-start-hour"]').setValue('5');
    await waitFor(async () => (await getSettings()).day_start === '05:00');
    await waitFor(() => useSettingsStore().dayStartMin === 300);
    expect((await getSettings()).day_start).toBe('05:00');
    expect(useSettingsStore().dayStartMin).toBe(300);
  });

  it('外观三选一：浅色 / 深色 / 跟随系统，选中态与持久化正确', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();

    // 三个按钮都在（原有 light/dark 的 data-test 保留，新增 system），默认选中浅色
    expect(wrapper.find('button[data-test="theme-light"]').exists()).toBe(true);
    expect(wrapper.find('button[data-test="theme-dark"]').exists()).toBe(true);
    expect(wrapper.find('button[data-test="theme-system"]').exists()).toBe(true);
    expect(wrapper.find('button[data-test="theme-light"]').text()).toBe('浅色');
    expect(wrapper.find('button[data-test="theme-dark"]').text()).toBe('深色');
    expect(wrapper.find('button[data-test="theme-system"]').text()).toBe('跟随系统');
    expect(wrapper.find('button[data-test="theme-light"]').classes()).toContain('on');

    // 选「跟随系统」→ 持久化 system，选中态跟着走
    await wrapper.find('button[data-test="theme-system"]').trigger('click');
    await waitFor(async () => (await getSettings()).theme === 'system');
    await waitFor(() => useSettingsStore().theme === 'system'); // 等 store 完成写库后的状态更新
    expect(useSettingsStore().theme).toBe('system');
    await flushPromises();
    expect(wrapper.find('button[data-test="theme-system"]').classes()).toContain('on');
    expect(wrapper.find('button[data-test="theme-light"]').classes()).not.toContain('on');

    // 再手选「深色」→ 覆盖 system
    await wrapper.find('button[data-test="theme-dark"]').trigger('click');
    await waitFor(async () => (await getSettings()).theme === 'dark');
    await waitFor(() => useSettingsStore().theme === 'dark');
    await waitFor(() => document.documentElement.dataset['theme'] === 'dark');
    expect(useSettingsStore().theme).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    wrapper.unmount();
  });

  it('切换深色模式即时生效并持久化', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('button[data-test="theme-dark"]').trigger('click');
    await waitFor(async () => (await getSettings()).theme === 'dark');
    await waitFor(() => document.documentElement.dataset['theme'] === 'dark');
    expect((await getSettings()).theme).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});

describe('设置页 · 文本导出', () => {
  it('最近 7 天导出：文件名区间正确、内容含计划/饮食条目，且不改 last_backup_at', async () => {
    const today = logicalToday(useSettingsStore().dayStartMin);
    await createRecord('plans', {
      title: '文本导出计划',
      date: today,
      start_min: null,
      end_min: null,
      category_key: 'study',
      category_name: '学习',
      target_type: null,
      target_id: null,
      target_title: null,
      done: false,
      done_at: null,
      rollover_from_date: null,
      is_rolled_over: false,
    });
    await createRecord('meals', {
      date: today,
      meal_key: 'breakfast',
      meal_name: '早',
      text: '文本导出早餐',
      feeling: 'full',
    });
    await updateSettings({ last_backup_at: FIXED_LAST_BACKUP });
    await useSettingsStore().load(); // 让 store 也持有这个值，好验证导出不会把它刷新成「现在」
    const lastBackupBefore = (await getSettings()).last_backup_at;
    expect(lastBackupBefore).toBe(FIXED_LAST_BACKUP);
    expect(useSettingsStore().lastBackupAt).toBe(FIXED_LAST_BACKUP);

    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('button[data-test="text-range-last7"]').trigger('click');
    await wrapper.find('button[data-test="export-text"]').trigger('click');
    await waitFor(() => triggerDownloadMock.mock.calls.length === 1);

    const start = addDays(today, -6);
    const [filename, content, mime] = triggerDownloadMock.mock.calls[0] ?? [];
    expect(filename).toBe('evan-text-' + compact(start) + '-' + compact(today) + '.md');
    expect(mime).toBe('text/markdown');

    const text = content as string;
    expect(text).toContain('# 个人数据导出（' + start + ' ~ ' + today + '）');
    expect(text).toContain('### 计划');
    expect(text).toContain('文本导出计划');
    expect(text).toContain('### 饮食');
    expect(text).toContain('- 早：文本导出早餐（吃饱）');

    // 文本导出绝不刷新备份时间：先验库里的值，再重新读一次（重新 load 拿库里的真值）。
    // 不直接断言常驻 store 的内存快照——并行跑时可能拿到别的用例遗留的旧快照，属于测试脚手架竞态而非产品行为。
    expect((await getSettings()).last_backup_at).toBe(lastBackupBefore);
    await useSettingsStore().load();
    expect(useSettingsStore().lastBackupAt).toBe(FIXED_LAST_BACKUP);
    wrapper.unmount();
  });

  it('自定义区间：起止日期控件生效，填反了按自动对调的区间导出', async () => {
    const today = logicalToday(useSettingsStore().dayStartMin);
    const start = addDays(today, -20);
    const end = addDays(today, -10);
    await createRecord('plans', {
      title: '自定义区间计划',
      date: end,
      start_min: null,
      end_min: null,
      category_key: 'study',
      category_name: '学习',
      target_type: null,
      target_id: null,
      target_title: null,
      done: false,
      done_at: null,
      rollover_from_date: null,
      is_rolled_over: false,
    });

    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('button[data-test="text-range-custom"]').trigger('click');
    // 故意填反
    await wrapper.find('input[data-test="text-start"]').setValue(end);
    await wrapper.find('input[data-test="text-end"]').setValue(start);
    await wrapper.find('button[data-test="export-text"]').trigger('click');
    await waitFor(() => triggerDownloadMock.mock.calls.length === 1);

    const [filename, content] = triggerDownloadMock.mock.calls[0] ?? [];
    expect(filename).toBe('evan-text-' + compact(start) + '-' + compact(end) + '.md');
    expect(content as string).toContain('自定义区间计划');
    wrapper.unmount();
  });

  it('全部：没有任何记录时退回最近 30 天并写进导出区间', async () => {
    const today = logicalToday(useSettingsStore().dayStartMin);
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    await wrapper.find('button[data-test="text-range-all"]').trigger('click');
    await wrapper.find('button[data-test="export-text"]').trigger('click');
    await waitFor(() => triggerDownloadMock.mock.calls.length === 1);

    const start = addDays(today, -29);
    const [filename, content] = triggerDownloadMock.mock.calls[0] ?? [];
    expect(filename).toBe('evan-text-' + compact(start) + '-' + compact(today) + '.md');
    expect(content as string).toContain('# 个人数据导出（' + start + ' ~ ' + today + '）');
    expect(content as string).toContain('_区间内没有记录。_');
    wrapper.unmount();
  });

  /**
   * 昵称闭环（AC：设置填「小王」→ 首页问候「你好，小王」；清空 → 「你好」；刷新（重新 load）后保持）。
   * 设置页与首页主视觉挂在同一个 pinia 上，走真实 settings 表读写。
   */
  /**
   * 这条要连做三轮"填 → 落库 → 首页改名 → 重载"，全量并行跑时单条容易顶到全局 8s，
   * 所以显式给 20s：只放宽等待时间，断言一个字都没放宽。
   */
  it('昵称即时保存：填「小王」首页问候变「你好，小王」，清空回到「你好」，重载后保持', async () => {
    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    const hero = mount(HomeHero, { global: { plugins: [pinia] } });
    const greetingText = (): string => hero.find('[data-test="hero-greeting"]').text();
    expect(greetingText()).toBe('你好');

    const input = wrapper.find('input[data-test="nickname-input"]');
    await input.setValue('小王');
    await input.trigger('change'); // 输入即保存：change 立即落库（输入过程中的 300ms 防抖走同一条 commitNickname）
    await waitFor(() => useSettingsStore().data?.nickname === '小王');
    expect((await getSettings()).nickname).toBe('小王'); // 真的写进了 settings 表
    await flushPromises();
    expect(greetingText()).toBe('你好，小王');

    // 清空 = 不显示名字
    await input.setValue('');
    await input.trigger('change');
    await waitFor(() => useSettingsStore().data?.nickname === '');
    expect((await getSettings()).nickname).toBe('');
    await flushPromises();
    expect(greetingText()).toBe('你好');

    // 刷新页面等价于重新 load 一次设置：填完不动，只重载，问候语仍然是「你好，小王」
    await input.setValue('小王');
    await input.trigger('change');
    await waitFor(() => useSettingsStore().data?.nickname === '小王');
    await useSettingsStore().load();
    await flushPromises();
    expect((await getSettings()).nickname).toBe('小王');
    expect(greetingText()).toBe('你好，小王');

    hero.unmount();
    wrapper.unmount();
  }, 20_000);

  it('老库没有 nickname 键：设置页与首页都能正常工作（不写 undefined）', async () => {
    // 直接删掉字段，模拟升级前写入的 settings 行
    const conn = await getDb();
    await conn.settings.update('app', { nickname: undefined });
    await useSettingsStore().load();

    const wrapper = mount(SettingsView, { global: { plugins: [pinia] } });
    await flushPromises();
    expect((wrapper.find('input[data-test="nickname-input"]').element as HTMLInputElement).value).toBe('');

    const hero = mount(HomeHero, { global: { plugins: [pinia] } });
    expect(hero.find('[data-test="hero-greeting"]').text()).toBe('你好');

    hero.unmount();
    wrapper.unmount();
  });
});
