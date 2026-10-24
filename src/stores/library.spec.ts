import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  createRecord,
  getRecord,
  listAlive,
  resetDbForTests,
  type Book,
  type StudyRecord,
} from '@/db';
import {
  daysUntil,
  expectedRemainingSeconds,
  TIMING_GUARD_MESSAGE,
  useLibraryStore,
  weeklyBarSeconds,
  weeklyStudySeconds,
} from '@/stores/library';
import { useDateStore } from '@/stores/date';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';

/** 2026-06-01 是周一，周统计口径可精确断言。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();

let pinia: Pinia;
let library: ReturnType<typeof useLibraryStore>;

async function makeBook(
  currentPage = 0,
  totalPages = 300,
  status: 'want' | 'reading' | 'done' = 'reading',
  title = 'SICP',
): Promise<Book> {
  return createRecord('books', {
    title,
    author: null,
    total_pages: totalPages,
    current_page: currentPage,
    status,
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function makeRecord(
  targetType: 'book' | 'subject',
  targetId: string,
  date: string,
  durationSec: number,
  title = '对象快照',
): Promise<StudyRecord> {
  return createRecord('study_records', {
    target_type: targetType,
    target_id: targetId,
    target_title: title,
    start_at: BASE,
    end_at: BASE + durationSec * 1000,
    duration_sec: durationSec,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date,
  });
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  library = useLibraryStore();
  await useSettingsStore().load();
  useDateStore().setSelected('2026-06-01');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('读书/科目业务 store（library）', () => {
  it('新增书校验：书名必填、总页数正整数、随机封底色、在读写入开始日期', async () => {
    expect(await library.createBook({ title: '   ', author: null, totalPages: 300, status: 'want' })).toBeNull();
    expect(await library.createBook({ title: 'x', author: null, totalPages: 0, status: 'want' })).toBeNull();
    expect(await listAlive('books')).toHaveLength(0);

    const book = await library.createBook({
      title: ' 深入理解计算机系统 ',
      author: ' Randal ',
      totalPages: 800,
      status: 'reading',
    });
    expect(book).not.toBeNull();
    expect(book?.title).toBe('深入理解计算机系统');
    expect(book?.author).toBe('Randal');
    expect(book?.current_page).toBe(0);
    expect(book?.start_date).toBe('2026-06-01');
    expect(book?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(book?.status).toBe('reading');
  });

  it('更新页码（新>旧）：自动生成 source=page_update 记录，pages_read=差值，date=逻辑日期，书页码更新', async () => {
    const book = await makeBook(0, 300);
    const result = await library.updateBookPage(book.id, 120);
    expect(result).toEqual({ ok: true, confirmDone: false });

    const records = await listAlive('study_records');
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record?.target_type).toBe('book');
    expect(record?.target_id).toBe(book.id);
    expect(record?.target_title).toBe('SICP');
    expect(record?.duration_sec).toBe(0);
    expect(record?.start_page).toBe(0);
    expect(record?.end_page).toBe(120);
    expect(record?.pages_read).toBe(120);
    expect(record?.source).toBe('page_update');
    expect(record?.date).toBe('2026-06-01');
    expect(record?.start_at).toBe(record?.end_at);
    expect((await getRecord('books', book.id))?.current_page).toBe(120);
  });

  it('更新页码（新<=旧）：只改页码不生成记录；非法页码（负数/超总页数/相等无写）被拒绝或忽略', async () => {
    const book = await makeBook(120, 300);
    const negative = await library.updateBookPage(book.id, -1);
    expect(negative).toEqual({ ok: false, reason: '页码需为非负整数' });
    const overflow = await library.updateBookPage(book.id, 301);
    expect(overflow).toEqual({ ok: false, reason: '页码不能超过总页数' });
    expect(await listAlive('study_records')).toHaveLength(0);

    const back = await library.updateBookPage(book.id, 90);
    expect(back).toEqual({ ok: true, confirmDone: false });
    expect((await getRecord('books', book.id))?.current_page).toBe(90);
    expect(await listAlive('study_records')).toHaveLength(0);

    const same = await library.updateBookPage(book.id, 90);
    expect(same).toEqual({ ok: true, confirmDone: false });
    expect(await listAlive('study_records')).toHaveLength(0);
  });

  it('新页=总页数且未读完：confirmDone 提示；确认→done+finish_date，取消不变；已读完不再提示', async () => {
    const book = await makeBook(100, 300);
    const result = await library.updateBookPage(book.id, 300);
    expect(result).toEqual({ ok: true, confirmDone: true });
    // 未确认：页码已更新，状态仍为在读
    const before = await getRecord('books', book.id);
    expect(before?.current_page).toBe(300);
    expect(before?.status).toBe('reading');
    expect(before?.finish_date).toBeNull();

    await library.markBookDone(book.id);
    const after = await getRecord('books', book.id);
    expect(after?.status).toBe('done');
    expect(after?.finish_date).toBe('2026-06-01');

    const again = await library.updateBookPage(book.id, 300);
    expect(again).toEqual({ ok: true, confirmDone: false });
  });

  it('改状态：想读→在读补 start_date，读完写 finish_date，离开读完清空 finish_date', async () => {
    const book = await makeBook(10, 100, 'want');
    await library.setBookStatus(book.id, 'reading');
    const reading = await getRecord('books', book.id);
    expect(reading?.status).toBe('reading');
    expect(reading?.start_date).toBe('2026-06-01');

    await library.setBookStatus(book.id, 'done');
    const done = await getRecord('books', book.id);
    expect(done?.status).toBe('done');
    expect(done?.finish_date).toBe('2026-06-01');

    await library.setBookStatus(book.id, 'reading');
    expect((await getRecord('books', book.id))?.finish_date).toBeNull();
  });

  it('预计剩余时间：<2小时/当前页0/已读完均不显示；公式精确且除零安全', () => {
    const base = { total_pages: 400, current_page: 100, status: 'reading' as const };
    expect(expectedRemainingSeconds(base, 2 * 3600 - 1)).toBeNull();
    expect(expectedRemainingSeconds({ ...base, current_page: 0 }, 7200)).toBeNull();
    expect(expectedRemainingSeconds({ ...base, status: 'done' }, 7200)).toBeNull();
    expect(expectedRemainingSeconds(base, 3 * 3600)).toBe(32400); // (400-100)*(10800/100)
    expect(expectedRemainingSeconds({ total_pages: 300, current_page: 300, status: 'reading' }, 7200)).toBe(0);
  });

  it('bookTotalStudySeconds：只累计该书有效记录时长（多来源相加）', async () => {
    const book = await makeBook();
    const other = await makeBook(0, 300, 'reading', '另一本');
    await makeRecord('book', book.id, '2026-06-01', 3600);
    await makeRecord('book', book.id, '2026-06-02', 5400);
    await makeRecord('book', other.id, '2026-06-01', 9999);
    expect(await library.bookTotalStudySeconds(book.id)).toBe(9000);
  });

  it('摘录：页码/内容校验，增删改可用，列表按页码从小到大排序', async () => {
    const book = await makeBook();
    await library.createExcerpt({ bookId: book.id, page: 90, content: '第90页', thought: null });
    await library.createExcerpt({ bookId: book.id, page: 12, content: '第12页', thought: '想法A' });
    await library.createExcerpt({ bookId: book.id, page: 45, content: '第45页', thought: null });
    expect((await library.loadExcerpts(book.id)).map((row) => row.page)).toEqual([12, 45, 90]);

    expect(await library.createExcerpt({ bookId: book.id, page: 0, content: 'x', thought: null })).toBeNull();
    expect(await library.createExcerpt({ bookId: book.id, page: 1, content: '   ', thought: null })).toBeNull();

    const first = (await library.loadExcerpts(book.id))[0];
    const edited = await library.saveExcerpt(first?.id ?? '', { page: 20, content: '改', thought: '想' });
    expect(edited?.page).toBe(20);
    expect(edited?.content).toBe('改');
    expect((await library.loadExcerpts(book.id)).map((row) => row.page)).toEqual([20, 45, 90]);
  });

  it('删书：级联软删摘录、学习记录保留 target_title 快照不删、撤销恢复书与摘录', async () => {
    const book = await makeBook();
    const excerpt = await library.createExcerpt({ bookId: book.id, page: 1, content: '摘录', thought: null });
    await makeRecord('book', book.id, '2026-06-01', 600, book.title);

    expect(await library.deleteBook(book.id)).toBe(true);
    expect((await getRecord('books', book.id))?.deleted_at).not.toBeNull();
    expect((await getRecord('excerpts', excerpt?.id ?? ''))?.deleted_at).not.toBeNull();

    const records = await listAlive('study_records');
    expect(records).toHaveLength(1);
    expect(records[0]?.target_title).toBe('SICP');

    const undoItem = useToastStore().items.find((item) => item.undo !== null);
    expect(undoItem?.message).toContain('已删除书籍');
    await undoItem?.undo?.action();
    expect((await getRecord('books', book.id))?.deleted_at).toBeNull();
    expect((await getRecord('excerpts', excerpt?.id ?? ''))?.deleted_at).toBeNull();
  });

  it('计时中/待结算：删书被阻止并提示；结束计时后可删除', async () => {
    const book = await makeBook();
    const timerStore = useTimerStore();
    await timerStore.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    expect(timerStore.isTargetActive(book.id)).toBe(true);

    expect(await library.deleteBook(book.id)).toBe(false);
    expect((await getRecord('books', book.id))?.deleted_at).toBeNull();
    expect(useToastStore().items.some((item) => item.message === TIMING_GUARD_MESSAGE)).toBe(true);

    await timerStore.endTimer(); // 待结算同样受保护
    expect(await library.deleteBook(book.id)).toBe(false);
    expect(useToastStore().items.filter((item) => item.message === TIMING_GUARD_MESSAGE).length).toBe(2);

    await timerStore.discardTimer();
    expect(await library.deleteBook(book.id)).toBe(true);
  });

  it('科目：新增/编辑校验（名称必填、周目标正整数、截止日期可选且格式校验）', async () => {
    expect(await library.createSubject({ name: ' ', weeklyGoalMin: 360, deadline: null })).toBeNull();
    expect(await library.createSubject({ name: '数学', weeklyGoalMin: 0, deadline: null })).toBeNull();
    expect(await library.createSubject({ name: '数学', weeklyGoalMin: 360, deadline: '2026-13-01' })).toBeNull();
    expect(await listAlive('subjects')).toHaveLength(0);

    const subject = await library.createSubject({ name: ' 数学 ', weeklyGoalMin: 360, deadline: '2026-07-01' });
    expect(subject?.name).toBe('数学');
    expect(subject?.weekly_goal_min).toBe(360);
    expect(subject?.deadline).toBe('2026-07-01');
    expect(subject?.archived).toBe(false);

    const edited = await library.saveSubject(subject?.id ?? '', {
      name: '高等数学',
      weeklyGoalMin: 180,
      deadline: null,
    });
    expect(edited?.name).toBe('高等数学');
    expect(edited?.weekly_goal_min).toBe(180);
    expect(edited?.deadline).toBeNull();
  });

  it('科目本周聚合：周一边界、本周一到今天之和、周一~周日 7 柱数据', async () => {
    const subject = await library.createSubject({ name: '数学', weeklyGoalMin: 360, deadline: null });
    const subjectId = subject?.id ?? '';
    await makeRecord('subject', subjectId, '2026-05-31', 9999); // 上周日：不计入本周
    await makeRecord('subject', subjectId, '2026-06-01', 300); // 周一
    await makeRecord('subject', subjectId, '2026-06-03', 900); // 周三（参考日期）
    await makeRecord('subject', subjectId, '2026-06-07', 600); // 周日：计入柱、不计入“到参考日期”之和
    await makeRecord('subject', 'another-subject', '2026-06-03', 777); // 其他科目

    const records = await listAlive('study_records');
    const own = records.filter((record) => record.target_id === subjectId);
    expect(weeklyBarSeconds(own, '2026-06-03')).toEqual([300, 0, 900, 0, 0, 0, 600]);
    expect(weeklyStudySeconds(own, '2026-06-03')).toBe(1200);
  });

  it('loadSubjectsStats：为每个科目填充 weekSec 与 7 柱（含已归档）', async () => {
    const subject = await library.createSubject({ name: '数学', weeklyGoalMin: 360, deadline: null });
    const subjectId = subject?.id ?? '';
    await makeRecord('subject', subjectId, '2026-06-01', 300);
    await makeRecord('subject', subjectId, '2026-06-02', 600);
    await library.loadSubjects();
    await library.loadSubjectsStats('2026-06-02');
    expect(library.subjectStats[subjectId]?.weekSec).toBe(900);
    expect(library.subjectStats[subjectId]?.bars).toEqual([300, 600, 0, 0, 0, 0, 0]);
  });

  it('科目：计时中/待结算禁止归档与删除；结束后可归档、软删与撤销', async () => {
    const subject = await library.createSubject({ name: '数学', weeklyGoalMin: 360, deadline: null });
    const subjectId = subject?.id ?? '';
    const timerStore = useTimerStore();
    await timerStore.startTimer({ type: 'subject', targetId: subjectId, targetTitle: '数学', mode: 'stopwatch' });

    expect(await library.setSubjectArchived(subjectId, true)).toBe(false);
    expect((await getRecord('subjects', subjectId))?.archived).toBe(false);
    expect(await library.deleteSubject(subjectId)).toBe(false);
    expect((await getRecord('subjects', subjectId))?.deleted_at).toBeNull();
    expect(useToastStore().items.some((item) => item.message === TIMING_GUARD_MESSAGE)).toBe(true);

    await timerStore.endTimer(); // 待结算同样受保护
    expect(await library.setSubjectArchived(subjectId, true)).toBe(false);
    await timerStore.discardTimer();

    expect(await library.setSubjectArchived(subjectId, true)).toBe(true);
    expect((await getRecord('subjects', subjectId))?.archived).toBe(true);
    expect(await library.setSubjectArchived(subjectId, false)).toBe(true);
    expect((await getRecord('subjects', subjectId))?.archived).toBe(false);

    expect(await library.deleteSubject(subjectId)).toBe(true);
    expect((await getRecord('subjects', subjectId))?.deleted_at).not.toBeNull();
    const undoItem = useToastStore().items.find((item) => item.undo !== null);
    expect(undoItem?.message).toContain('已删除科目');
    await undoItem?.undo?.action();
    expect((await getRecord('subjects', subjectId))?.deleted_at).toBeNull();
  });

  it('手动补记（书）：source=manual、end_page=读到页码、start_page/pages_read=null、不改 current_page、逻辑日期生效', async () => {
    const book = await makeBook(50, 300);
    const record = await library.addManualStudyRecord({
      targetType: 'book',
      targetId: book.id,
      targetTitle: book.title,
      date: '2026-06-02',
      minutes: 45,
      note: '地铁上读',
      endPage: 80,
    });
    expect(record?.source).toBe('manual');
    expect(record?.duration_sec).toBe(2700);
    expect(record?.date).toBe('2026-06-02');
    expect(record?.note).toBe('地铁上读');
    expect(record?.start_page).toBeNull();
    expect(record?.end_page).toBe(80);
    expect(record?.pages_read).toBeNull();
    expect((await getRecord('books', book.id))?.current_page).toBe(50); // 按任务假设：不改页码

    expect(
      await library.addManualStudyRecord({
        targetType: 'book',
        targetId: book.id,
        targetTitle: book.title,
        date: '2026-06-02',
        minutes: 30,
        note: null,
        endPage: 0,
      }),
    ).toBeNull();
  });

  it('手动补记（科目）：无页码字段、时长正确、历史列表按日期倒序', async () => {
    const subject = await library.createSubject({ name: '数学', weeklyGoalMin: 360, deadline: null });
    const subjectId = subject?.id ?? '';
    const manual = await library.addManualStudyRecord({
      targetType: 'subject',
      targetId: subjectId,
      targetTitle: '数学',
      date: '2026-06-02',
      minutes: 60,
      note: '刷题',
    });
    expect(manual?.duration_sec).toBe(3600);
    expect(manual?.start_page).toBeNull();
    expect(manual?.end_page).toBeNull();
    expect(manual?.pages_read).toBeNull();

    await makeRecord('subject', subjectId, '2026-06-01', 600);
    const history = await library.listSubjectRecords(subjectId);
    expect(history.map((record) => record.date)).toEqual(['2026-06-02', '2026-06-01']);
    expect(history[0]?.source).toBe('manual');

    expect(
      await library.addManualStudyRecord({
        targetType: 'subject',
        targetId: subjectId,
        targetTitle: '数学',
        date: '2026-06-02',
        minutes: 0,
        note: null,
      }),
    ).toBeNull();
  });

  it('daysUntil：与参考日期的天数差，过期为负数，当天为 0', () => {
    expect(daysUntil('2026-06-11', '2026-06-01')).toBe(10);
    expect(daysUntil('2026-06-01', '2026-06-01')).toBe(0);
    expect(daysUntil('2026-05-30', '2026-06-01')).toBe(-2);
  });
});
