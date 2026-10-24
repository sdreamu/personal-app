import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getRecord, listAlive, resetDbForTests, type Subject } from '@/db';
import { useDateStore } from '@/stores/date';
import { TIMING_GUARD_MESSAGE, useLibraryStore } from '@/stores/library';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import StudySubjectsView from './StudySubjectsView.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/study/subjects', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/study/subjects' },
    ],
  });
}

let pinia: Pinia;
let router: Router;
let library: ReturnType<typeof useLibraryStore>;

function makeSubject(name: string, weeklyGoalMin = 360, deadline: string | null = null, archived = false): Promise<Subject> {
  return createRecord('subjects', {
    name,
    weekly_goal_min: weeklyGoalMin,
    deadline,
    archived,
  });
}

async function makeRecord(subjectId: string, date: string, durationSec: number, note: string | null = null): Promise<void> {
  await createRecord('study_records', {
    target_type: 'subject',
    target_id: subjectId,
    target_title: '科目快照',
    start_at: Date.now(),
    end_at: Date.now(),
    duration_sec: durationSec,
    note,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date,
  });
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!check()) throw new Error(label);
    },
    { timeout: 3000, interval: 20 },
  );
}

async function mountSubjects(): Promise<VueWrapper> {
  const wrapper = mount(StudySubjectsView, {
    global: { plugins: [pinia, router], stubs: { Teleport: true } },
  });
  await router.isReady();
  await waitFor(() => wrapper.find('[data-test="subjects-view"]').exists(), '科目页未渲染');
  return wrapper;
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  library = useLibraryStore();
  useDateStore().setSelected('2026-06-03'); // 周三
});

afterEach(() => {
  useTimerStore().dispose();
});

describe('科目页 #/study/subjects', () => {
  it('列表卡片：名称、本周已学/周目标、截止倒计时、周一~周日 7 根柱', async () => {
    const subject = await makeSubject('数学', 360, '2026-07-03'); // 距 2026-06-03 还剩 30 天
    await makeRecord(subject.id, '2026-06-01', 3600); // 周一
    await makeRecord(subject.id, '2026-06-03', 1800); // 周三
    await makeRecord(subject.id, '2026-05-31', 9999); // 上周日：不计入
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 1, '科目卡片未出现');

    const card = wrapper.find('[data-test="subject-card"]');
    expect(card.find('[data-test="subject-name"]').text()).toBe('数学');
    expect(card.find('[data-test="subject-deadline"]').text()).toBe('还剩 30 天');
    await waitFor(
      () => card.find('[data-test="subject-week"]').text().includes('1小时30分'),
      '本周已学统计未加载',
    );
    expect(card.find('[data-test="subject-week"]').text()).toContain('6h'); // 目标 360 分钟
    expect(card.findAll('[data-test^="subject-bar-"]')).toHaveLength(7);
    expect(card.find('[data-test="subject-bar-0"]').attributes('style')).toContain('height: 100%');
    expect(card.find('[data-test="subject-bar-2"]').attributes('style')).toContain('height: 50%');
    expect(card.find('[data-test="subject-bar-1"]').attributes('style')).toContain('height: 0%');
  });

  it('截止日期已过期显示“已过期”，无截止日期显示“无截止日期”', async () => {
    await makeSubject('过期科目', 120, '2026-05-01');
    await makeSubject('无期限科目', 120, null);
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 2, '卡片未出现');
    const texts = wrapper.findAll('[data-test="subject-deadline"]').map((node) => node.text());
    expect(texts).toContain('已过期');
    expect(texts).toContain('无截止日期');
  });

  it('新增与编辑科目弹窗：名称必填、周目标正整数、截止日期可选', async () => {
    const wrapper = await mountSubjects();
    await wrapper.find('[data-test="add-subject-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="subject-form"]').exists()).toBe(true);

    await wrapper.find('[data-test="subject-form-name"]').setValue('  ');
    await wrapper.find('[data-test="subject-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-test="subject-form"]').exists()).toBe(true);
    expect(await library.loadSubjects()).toHaveLength(0);

    await wrapper.find('[data-test="subject-form-name"]').setValue('英语');
    await wrapper.find('[data-test="subject-form-goal"]').setValue('180');
    await wrapper.find('[data-test="subject-form-deadline"]').setValue('2026-08-01');
    await wrapper.find('[data-test="subject-form"]').trigger('submit');
    await waitFor(() => wrapper.find('[data-test="subject-form"]').exists() === false, '弹窗未关闭');
    await waitFor(
      () => wrapper.find('[data-test="active-list"]').text().includes('英语'),
      '新科目未出现',
    );
    const saved = (await library.loadSubjects()).find((subject) => subject.name === '英语');
    expect(saved?.weekly_goal_min).toBe(180);
    expect(saved?.deadline).toBe('2026-08-01');
  });

  it('归档/取消归档：卡片在归档区与学习中区之间移动', async () => {
    const subject = await makeSubject('要归档的科目');
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 1, '卡片未出现');
    expect(wrapper.find('[data-test="active-list"]').text()).toContain('要归档的科目');

    await wrapper.find('[data-test="subject-archive"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-test="archived-list"]').text().includes('要归档的科目'),
      '未移到归档区',
    );
    expect((await getRecord('subjects', subject.id))?.archived).toBe(true);
    expect(wrapper.find('[data-test="active-list"]').exists()).toBe(false);

    await wrapper.find('[data-test="subject-restore"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-test="active-list"]').text().includes('要归档的科目'),
      '未移回学习中区',
    );
    expect((await getRecord('subjects', subject.id))?.archived).toBe(false);
  });

  it('计时中/待结算：归档与删除都被阻止并提示', async () => {
    const subject = await makeSubject('计时中的科目');
    const timerStore = useTimerStore();
    await timerStore.startTimer({ type: 'subject', targetId: subject.id, targetTitle: subject.name, mode: 'stopwatch' });
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 1, '卡片未出现');

    await wrapper.find('[data-test="subject-archive"]').trigger('click');
    await wrapper.find('[data-test="subject-delete"]').trigger('click');
    await flushPromises();

    expect(useToastStore().items.filter((item) => item.message === TIMING_GUARD_MESSAGE).length).toBe(2);
    expect((await getRecord('subjects', subject.id))?.archived).toBe(false);
    expect((await getRecord('subjects', subject.id))?.deleted_at).toBeNull();

    await timerStore.endTimer();
    await wrapper.find('[data-test="subject-delete"]').trigger('click');
    await flushPromises();
    expect((await getRecord('subjects', subject.id))?.deleted_at).toBeNull(); // 待结算仍被阻止
    await timerStore.discardTimer();
  });

  it('手动补记：source=manual，本周已学与柱状图随之更新', async () => {
    const subject = await makeSubject('数学', 360);
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 1, '卡片未出现');

    await wrapper.find('[data-test="subject-manual"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="subject-manual-form-date"]').setValue('2026-06-03');
    await wrapper.find('[data-test="subject-manual-form-minutes"]').setValue('60');
    await wrapper.find('[data-test="subject-manual-form-note"]').setValue('刷题');
    await wrapper.find('[data-test="subject-manual-form"]').trigger('submit');
    await waitFor(
      () => wrapper.find('[data-test="subject-manual-form"]').exists() === false,
      '补记弹窗未关闭',
    );

    const record = (await listAlive('study_records'))[0];
    expect(record?.source).toBe('manual');
    expect(record?.duration_sec).toBe(3600);
    expect(record?.note).toBe('刷题');
    await waitFor(
      () => wrapper.find('[data-test="subject-week"]').text().includes('1h'),
      '本周已学未更新',
    );
    expect(wrapper.find('[data-test="subject-bar-2"]').attributes('style')).toContain('height: 100%');
  });

  it('历史记录弹窗：显示该科全部有效记录（日期/时长/来源/收获）', async () => {
    const subject = await makeSubject('数学');
    await makeRecord(subject.id, '2026-06-01', 1800, '周一学习');
    await makeRecord(subject.id, '2026-06-03', 3600, null);
    await makeRecord('another-subject', '2026-06-03', 9999, '其他科目不应出现');
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 1, '卡片未出现');

    await wrapper.find('[data-test="subject-history"]').trigger('click');
    await waitFor(() => wrapper.findAll('[data-test="history-row"]').length === 2, '历史记录未加载');
    const rows = wrapper.findAll('[data-test="history-row"]');
    expect(rows[0]?.text()).toContain('2026-06-03');
    expect(rows[0]?.text()).toContain('1 小时');
    expect(rows[1]?.text()).toContain('2026-06-01');
    expect(rows[1]?.text()).toContain('周一学习');
    expect(wrapper.find('[data-test="history-list"]').text()).not.toContain('其他科目不应出现');
  });

  it('开始计时：跳转 #/study/timer 并带 type=subject&id 预选参数', async () => {
    const subject = await makeSubject('数学');
    const wrapper = await mountSubjects();
    await waitFor(() => wrapper.findAll('[data-test="subject-card"]').length === 1, '卡片未出现');
    await wrapper.find('[data-test="subject-timer"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/timer');
    expect(router.currentRoute.value.query).toMatchObject({ type: 'subject', id: subject.id });
  });
});
