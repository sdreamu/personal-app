import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { getRecord, listAliveByDate, resetDbForTests, type Mistake } from '@/db';
import { useToastStore } from './toast';
import { MISTAKE_REASONS, clampDifficulty, useMistakesStore, type MistakeInput } from './mistakes';

const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const TOMORROW = '2026-06-02';

let pinia: Pinia;

function input(overrides: Partial<MistakeInput> = {}): MistakeInput {
  return {
    date: TODAY,
    subjectName: '数学',
    questionText: '求 lim(x→0) sin x / x',
    correctionText: '',
    reasons: ['概念不清'],
    note: '',
    difficulty: 3,
    mastered: false,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
});

describe('错题本 store（M9）', () => {
  it('新增：落 mistakes 表 1 行，日期/难度/原因/f mastered 都对，空备注存 null', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input());

    const rows = await listAliveByDate('mistakes', TODAY);
    expect(rows).toHaveLength(1);
    const row = rows[0] as Mistake;
    expect(row.id).toBe(created?.id);
    expect(row.date).toBe(TODAY);
    expect(row.subject_name).toBe('数学');
    expect(row.question_text).toBe('求 lim(x→0) sin x / x');
    expect(row.correction_text).toBeNull();
    expect(row.note).toBeNull();
    expect(row.reasons).toEqual(['概念不清']);
    expect(row.difficulty).toBe(3);
    expect(row.mastered).toBe(false);
    expect(row.question_images).toEqual([]);
    expect(row.correction_images).toEqual([]);
    // store 里也立刻能看到
    expect(store.items).toHaveLength(1);
    expect(store.total).toBe(1);
    expect(store.masteredCount).toBe(0);
  });

  it('题目和订正都空：不写空卡片', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input({ questionText: '   ', correctionText: '' }));
    expect(created).toBeNull();
    expect(await listAliveByDate('mistakes', TODAY)).toHaveLength(0);
  });

  it('编辑：文字/难度/原因/备注落库，难度越界夹到 1~5', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input());
    await store.save(created!.id, input({
      questionText: '改后的题干',
      correctionText: '改后的订正',
      reasons: ['审题错误', '时间不够'],
      note: '下次先列条件',
      difficulty: 9,
    }));

    const row = (await getRecord('mistakes', created!.id)) as Mistake;
    expect(row.question_text).toBe('改后的题干');
    expect(row.correction_text).toBe('改后的订正');
    expect(row.reasons).toEqual(['审题错误', '时间不够']);
    expect(row.note).toBe('下次先列条件');
    expect(row.difficulty).toBe(5);
    // store 里的那一份也同步了
    expect(store.items[0]?.question_text).toBe('改后的题干');
    expect(clampDifficulty(0)).toBe(1);
    expect(clampDifficulty(Number.NaN)).toBe(3);
  });

  it('标记已掌握 / 取消掌握：mastered 与计数同步', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input());

    await store.toggleMastered(created!.id);
    expect(((await getRecord('mistakes', created!.id)) as Mistake).mastered).toBe(true);
    expect(store.masteredCount).toBe(1);

    await store.toggleMastered(created!.id);
    expect(((await getRecord('mistakes', created!.id)) as Mistake).mastered).toBe(false);
    expect(store.masteredCount).toBe(0);
  });

  it('删除：软删除（deleted_at 非空）、列表不再显示，撤销能恢复', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input());

    await store.remove(created!.id);
    const raw = (await getRecord('mistakes', created!.id)) as Mistake;
    expect(raw.deleted_at).not.toBeNull();
    expect(await listAliveByDate('mistakes', TODAY)).toHaveLength(0);
    expect(store.items).toHaveLength(0);

    // 撤销（toast 的 undo 动作）
    const toast = useToastStore();
    const item = toast.items[toast.items.length - 1];
    expect(item?.message).toContain('已删除这道错题');
    await item?.undo?.action();
    expect(((await getRecord('mistakes', created!.id)) as Mistake).deleted_at).toBeNull();
    expect(store.items).toHaveLength(1);
  });

  it('读取只按当前日期：切日期换成另一天，筛选与科目候选跟着变', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    await store.create(input());
    await store.create(input({ subjectName: '物理', questionText: '受力分析', mastered: true }));

    expect(store.total).toBe(2);
    expect(store.usedSubjects).toEqual(['数学', '物理'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));

    // 只看未掌握
    store.onlyUnmastered = true;
    expect(store.visible.map((item) => item.subject_name)).toEqual(['数学']);
    store.onlyUnmastered = false;

    // 科目筛选
    store.subjectFilter = '物理';
    expect(store.visible).toHaveLength(1);

    // 未掌握优先排序：先数学（未掌握）后物理（已掌握）
    store.subjectFilter = null;
    expect(store.visible[0]?.mastered).toBe(false);

    // 换一天：只剩明天那条
    await store.load(TOMORROW);
    await store.create(input({ date: TOMORROW, subjectName: '英语', questionText: '完形填空' }));
    expect(store.total).toBe(1);
    expect(store.items[0]?.subject_name).toBe('英语');
  });

  it('预设错误原因就是 4 个（Q5 拍板）', () => {
    expect([...MISTAKE_REASONS]).toEqual(['概念不清', '计算失误', '审题错误', '时间不够']);
  });
});
