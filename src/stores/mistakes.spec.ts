import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  exportBackup,
  getRecord,
  importBackupFromJson,
  listAliveByDate,
  resetDbForTests,
  type Mistake,
} from '@/db';
import { exportText } from '@/db/exportText';
import { useToastStore } from './toast';
import { useLibraryStore } from './library';
import { MISTAKE_IMAGE_LIMIT, MISTAKE_REASONS, clampDifficulty, useMistakesStore, type MistakeInput } from './mistakes';

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

  it('汇总全部日期，按科目和知识点筛选', async () => {
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

    // 日期参数兼容旧调用，但不会隐藏其它日期的记录。
    await store.load(TOMORROW);
    const english = await store.create(input({ date: TOMORROW, subjectName: '英语', knowledgePoint: '定语从句', questionText: '完形填空' }));
    expect(store.total).toBe(3);
    store.subjectFilter = '英语';
    store.knowledgeFilter = '定语从句';
    expect(store.visible.map(row => row.id)).toEqual([english!.id]);
    store.knowledgeFilter = '时态';
    expect(store.visible).toHaveLength(0);
    await store.save(english!.id, input({ date: TOMORROW, subjectName: '英语', knowledgePoint: '时态' }));
    await store.load();
    expect(store.visible[0]?.knowledge_point).toBe('时态');
    expect(store.total).toBe(3);
  });

  it('分类无需学习目标，知识点去重并随备份恢复', async () => {
    const library = useLibraryStore();
    const subject = await library.createMistakeSubject(' 数学 ');
    expect(subject!.weekly_goal_min).toBe(0);
    expect((await library.createMistakeSubject('数学'))!.id).toBe(subject!.id);
    await library.addKnowledgePoint(subject!.id, ' 三角函数 ');
    await library.addKnowledgePoint(subject!.id, '三角函数');
    const store = useMistakesStore();
    const mistake = await store.create(input({ knowledgePoint: '三角函数' }));
    const backup = await exportBackup();
    expect(backup.tables.subjects[0]?.knowledge_points).toEqual(['三角函数']);
    expect((await importBackupFromJson(JSON.stringify(backup))).ok).toBe(true);
    expect((await getRecord('subjects', subject!.id))?.knowledge_points).toEqual(['三角函数']);
    expect((await getRecord('mistakes', mistake!.id))?.knowledge_point).toBe('三角函数');
  });

  it('预设错误原因就是 4 个（Q5 拍板）', () => {
    expect([...MISTAKE_REASONS]).toEqual(['概念不清', '计算失误', '审题错误', '时间不够']);
  });
});

describe('错题照片（P2）', () => {
  const IMG_A = 'data:image/jpeg;base64,AAAA';
  const IMG_B = 'data:image/jpeg;base64,BBBB';

  it('题目或订正仅有照片也能保存，刷新后仍存在', async () => {
    const store = useMistakesStore();
    await store.create(input({ questionText: '', correctionText: '', questionImages: [IMG_A] }));
    await store.create(input({ questionText: '', correctionText: '', correctionImages: [IMG_B] }));
    await store.load();
    expect(store.items).toHaveLength(2);
    expect(store.items.some(row => row.question_images[0] === IMG_A)).toBe(true);
    expect(store.items.some(row => row.correction_images[0] === IMG_B)).toBe(true);
  });

  it('题目/订正照片落库；单组超过 4 张只留前 4 张', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input({
      questionImages: [IMG_A, IMG_B, IMG_A, IMG_B, IMG_A, IMG_B],
      correctionImages: [IMG_B],
    }));

    const row = (await getRecord('mistakes', created!.id)) as Mistake;
    expect(row.question_images).toHaveLength(MISTAKE_IMAGE_LIMIT);
    expect(row.question_images[0]).toBe(IMG_A);
    expect(row.correction_images).toEqual([IMG_B]);
  });

  it('编辑时删图：数组少一张并落库', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    const created = await store.create(input({ questionImages: [IMG_A, IMG_B] }));

    await store.save(created!.id, input({ questionImages: [IMG_B] }));
    const row = (await getRecord('mistakes', created!.id)) as Mistake;
    expect(row.question_images).toEqual([IMG_B]);
  });

  it('文本导出只写图片张数，不把 base64 塞进 Markdown', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    await store.create(input({ questionImages: [IMG_A, IMG_B], correctionImages: [IMG_A] }));

    const text = exportText({
      start: TODAY,
      end: TODAY,
      plans: [],
      study_records: [],
      books: [],
      excerpts: [],
      meals: [],
      water: [],
      workout_records: [],
      play_records: [],
      reviews: [],
      mistakes: store.items,
    });
    expect(text).toContain('题目 2 张');
    expect(text).toContain('订正 1 张');
    expect(text).not.toContain('data:image');
  });

  it('备份导出 → 导入：图片字节原样带回（Q6：图片进备份）', async () => {
    const store = useMistakesStore();
    await store.load(TODAY);
    await store.create(input({ questionImages: [IMG_A], correctionImages: [IMG_B] }));

    const backup = await exportBackup();
    await importBackupFromJson(JSON.stringify(backup));

    const rows = await listAliveByDate('mistakes', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.question_images).toEqual([IMG_A]);
    expect(rows[0]?.correction_images).toEqual([IMG_B]);
  });
});
