import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getSettings, resetDbForTests, updateSettings } from '@/db';
import { addDays, logicalToday } from '@/utils/date';
import { useSettingsStore } from '@/stores/settings';
import SettingsView from '@/views/SettingsView.vue';
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

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000): Promise<void> {
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

    // 文本导出绝不刷新备份时间
    expect((await getSettings()).last_backup_at).toBe(lastBackupBefore);
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
});
