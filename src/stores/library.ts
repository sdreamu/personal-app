import { defineStore } from 'pinia';
import {
  createRecord,
  errorMessage,
  getDb,
  getRecord,
  isAlive,
  listAlive,
  nowMs,
  softDelete,
  undoDelete,
  updateRecord,
  type Book,
  type Excerpt,
  type StudyRecord,
  type Subject,
} from '@/db';
import { addDays, DAY_MS, logicalToday, parseDateKey, weekStart } from '@/utils/date';
import { assignSortIndexes, nextSortIndex, orderedIdsAfterMove, sortColumn } from '@/utils/dragSort';
import { useDateStore } from './date';
import { useSaveStatusStore } from './saveStatus';
import { useSettingsStore } from './settings';
import { useTimerStore } from './timer';
import { useToastStore } from './toast';

/** 计时中/待结算目标的删除/归档保护提示（PRD §5.10）。 */
export const TIMING_GUARD_MESSAGE = '该项正在计时中，请先结束计时';
/** 预计剩余时间的累计时长门槛：2 小时。 */
export const MIN_ESTIMATE_TOTAL_SEC = 2 * 60 * 60;
/** 色块封面候选底色（书名首字 + 随机底色，PRD §5.2）。 */
export const BOOK_COLORS: readonly string[] = [
  '#4a6cf7', '#2e9e5b', '#d98b2b', '#9a5bd9', '#d64545',
  '#2ba6a6', '#c65a8e', '#5b7bd9', '#b8872f', '#4f9e6e',
];

export type BookStatus = 'want' | 'reading' | 'done';

export interface BookInput {
  title: string;
  author: string | null;
  totalPages: number;
  status: BookStatus;
}

export interface SubjectInput {
  name: string;
  weeklyGoalMin: number;
  deadline: string | null;
}

export interface ExcerptInput {
  bookId: string;
  page: number;
  content: string;
  thought: string | null;
}

export interface ManualStudyInput {
  targetType: 'book' | 'subject';
  targetId: string;
  targetTitle: string;
  date: string;
  minutes: number;
  note: string | null;
  /** 仅书：读到页码（手动补记不修改 current_page）。 */
  endPage?: number | null;
}

export interface SubjectWeekStats {
  /** 本周一到参考日期（含）的有效学习秒数之和。 */
  weekSec: number;
  /** 周一~周日 7 根柱子的每日秒数。 */
  bars: number[];
}

export type UpdatePageResult = { ok: true; confirmDone: boolean } | { ok: false; reason: string };

export function randomBookColor(): string {
  const colors = BOOK_COLORS;
  return colors[Math.floor(Math.random() * colors.length)] ?? colors[0] ?? '#4a6cf7';
}

/**
 * 预计剩余时间（PRD §5.2 规则 5）：
 * 仅当累计阅读时长 ≥ 2 小时 且 当前页 > 0 且 状态 !== 读完 时返回
 * (总页数 - 当前页) × (累计时长 ÷ 当前页)（秒）；否则返回 null（含除零保护）。
 */
export function expectedRemainingSeconds(
  book: Pick<Book, 'total_pages' | 'current_page' | 'status'>,
  totalStudySec: number,
): number | null {
  if (totalStudySec < MIN_ESTIMATE_TOTAL_SEC) return null;
  if (book.current_page <= 0) return null;
  if (book.status === 'done') return null;
  return (book.total_pages - book.current_page) * (totalStudySec / book.current_page);
}

/** 参考日期所在周（周一开始）的 7 个日期。 */
export function weekDateKeys(referenceDate: string): string[] {
  const monday = weekStart(referenceDate);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 周一~周日 7 根柱子的每日时长（秒）：只统计参考日期所在周的记录。 */
export function weeklyBarSeconds(records: StudyRecord[], referenceDate: string): number[] {
  const keys = weekDateKeys(referenceDate);
  const bars = keys.map(() => 0);
  for (const record of records) {
    const index = keys.indexOf(record.date);
    if (index >= 0) {
      bars[index] = (bars[index] ?? 0) + record.duration_sec;
    }
  }
  return bars;
}

/** 本周已学：周一到参考日期（含）的有效时长之和（周一为界）。 */
export function weeklyStudySeconds(records: StudyRecord[], referenceDate: string): number {
  const monday = weekStart(referenceDate);
  return records
    .filter((record) => record.date >= monday && record.date <= referenceDate)
    .reduce((sum, record) => sum + record.duration_sec, 0);
}

/** dateKey 与 referenceDate 的天数差（dateKey - referenceDate，可为负）。 */
export function daysUntil(dateKey: string, referenceDate: string): number {
  const target = parseDateKey(dateKey);
  const reference = parseDateKey(referenceDate);
  if (!target || !reference) throw new Error('非法日期');
  return Math.floor((target.getTime() - reference.getTime()) / DAY_MS);
}

function validateBook(titleRaw: string, totalPagesRaw: number): { title: string; totalPages: number } | null {
  const title = titleRaw.trim();
  if (title === '') {
    useToastStore().error('书名不能为空');
    return null;
  }
  const totalPages = Math.floor(totalPagesRaw);
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    useToastStore().error('总页数需为正整数');
    return null;
  }
  return { title, totalPages };
}

function validateSubject(nameRaw: string, weeklyGoalMinRaw: number): { name: string; weeklyGoalMin: number } | null {
  const name = nameRaw.trim();
  if (name === '') {
    useToastStore().error('科目名称不能为空');
    return null;
  }
  const weeklyGoalMin = Math.floor(weeklyGoalMinRaw);
  if (!Number.isInteger(weeklyGoalMin) || weeklyGoalMin <= 0) {
    useToastStore().error('周目标需为正整数（分钟）');
    return null;
  }
  return { name, weeklyGoalMin };
}

function normalizeDeadline(deadlineRaw: string | null): string | null | undefined {
  const deadline = deadlineRaw?.trim() ?? null;
  if (deadline === null || deadline === '') return null;
  if (parseDateKey(deadline) === null) {
    useToastStore().error('截止日期无效');
    return undefined;
  }
  return deadline;
}

/**
 * 读书/科目业务动作集中地（2c）。
 * 页面只做表单与渲染，所有写库、软删+撤销、防删守卫、统计口径都在这里；
 * revision 在每次成功写入后自增，页面 watch 它即可刷新（含撤销动作）。
 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    books: [] as Book[],
    subjects: [] as Subject[],
    subjectStats: {} as Record<string, SubjectWeekStats>,
    booksLoaded: false,
    subjectsLoaded: false,
    revision: 0,
  }),
  actions: {
    bumpRevision(): void {
      this.revision += 1;
    },
    async runWithSaveStatus<T>(fn: () => Promise<T>): Promise<T> {
      const saveStatus = useSaveStatusStore();
      saveStatus.begin();
      try {
        const result = await fn();
        saveStatus.idle();
        return result;
      } catch (err) {
        saveStatus.fail();
        useToastStore().error(`保存失败：${errorMessage(err)}`);
        throw err;
      }
    },

    // ---------- 书 ----------
    async loadBooks(): Promise<Book[]> {
      const rows = await listAlive('books');
      rows.sort((a, b) => b.created_at - a.created_at);
      this.books = rows;
      this.booksLoaded = true;
      return rows;
    },
    async createBook(input: BookInput): Promise<Book | null> {
      const fields = validateBook(input.title, input.totalPages);
      if (!fields) return null;
      // 新书的排序键 = 该状态列现有最大 sort_index + 10（空列 = 10），追加到列尾。
      const alive = await listAlive('books');
      const sort_index = nextSortIndex(
        alive.filter((row) => row.status === input.status).map((row) => row.sort_index),
      );
      const book = await this.runWithSaveStatus(() =>
        createRecord('books', {
          title: fields.title,
          author: input.author?.trim() || null,
          total_pages: fields.totalPages,
          current_page: 0,
          status: input.status,
          color: randomBookColor(),
          start_date: input.status === 'reading' ? useDateStore().selectedDate : null,
          finish_date: null,
          sort_index,
        }),
      );
      this.bumpRevision();
      return book;
    },
    async saveBook(id: string, input: BookInput): Promise<Book | null> {
      const fields = validateBook(input.title, input.totalPages);
      if (!fields) return null;
      const existing = await getRecord('books', id);
      if (!existing || !isAlive(existing)) {
        useToastStore().error('书籍不存在或已删除');
        return null;
      }
      const selectedDate = useDateStore().selectedDate;
      const patch: Partial<Book> = {
        title: fields.title,
        author: input.author?.trim() || null,
        total_pages: fields.totalPages,
        status: input.status,
      };
      if (input.status === 'reading' && existing.start_date === null) patch.start_date = selectedDate;
      if (input.status === 'done' && existing.status !== 'done') patch.finish_date = selectedDate;
      else if (input.status !== 'done' && existing.status === 'done') patch.finish_date = null;
      await this.runWithSaveStatus(() => updateRecord('books', id, patch));
      this.bumpRevision();
      const updated = await getRecord('books', id);
      return updated !== undefined && isAlive(updated) ? updated : null;
    },
    /** 改状态：在读补 start_date（缺省时）、读完写 finish_date、离开读完清空 finish_date。 */
    async setBookStatus(bookId: string, status: BookStatus): Promise<void> {
      const book = await getRecord('books', bookId);
      if (!book || !isAlive(book) || book.status === status) return;
      const selectedDate = useDateStore().selectedDate;
      const patch: Partial<Book> = { status };
      if (status === 'reading' && book.start_date === null) patch.start_date = selectedDate;
      if (status === 'done') patch.finish_date = selectedDate;
      else if (book.status === 'done') patch.finish_date = null;
      await this.runWithSaveStatus(() => updateRecord('books', bookId, patch));
      this.bumpRevision();
    },
    /** “标记为读完？”确认：status=done + finish_date=当前逻辑日期。 */
    async markBookDone(bookId: string): Promise<void> {
      const book = await getRecord('books', bookId);
      if (!book || !isAlive(book) || book.status === 'done') return;
      await this.runWithSaveStatus(() =>
        updateRecord('books', bookId, { status: 'done', finish_date: useDateStore().selectedDate }),
      );
      this.bumpRevision();
    },
    /**
     * 同栏上下拖动 = 调整顺序：整列按落点重排后，统一按 10、20、30… 重新分配 sort_index，一次性写回。
     * toIndex 是「该列移除被拖动书之后」的下标；反复拖动到相同位置结果一致（幂等）。
     */
    async reorder(bookId: string, toIndex: number): Promise<void> {
      const book = await getRecord('books', bookId);
      if (!book || !isAlive(book)) return;
      const allAlive = await listAlive('books');
      const ids = orderedIdsAfterMove(allAlive, bookId, book.status, toIndex);
      const indexes = assignSortIndexes(ids);
      await this.runWithSaveStatus(async () => {
        const db = await getDb();
        await db.transaction('rw', db.books, async () => {
          const stamp = nowMs();
          for (const [id, index] of Object.entries(indexes)) {
            await db.books.update(id, { sort_index: index, updated_at: stamp });
          }
        });
      });
      this.bumpRevision();
    },
    /**
     * 跨栏拖动 = 改状态（并落到目标列 toIndex 处）：
     * - 拖到「想读」→ status='want'
     * - 拖到「在读」→ status='reading'，start_date 为空时补逻辑今天（已有则不覆盖）
     * - 拖到「读完」→ status='done'，current_page 直接设为 total_pages、finish_date 写逻辑今天；
     *   绝不经「手动更新页码」逻辑、绝不生成 source='page_update' 的学习记录（否则复盘阅读页数被撑大）
     * - 从「读完」拖出 → finish_date 置 null，current_page 保持不动
     * 目标列与源列都按 10、20、30… 重排后一次性写回。
     */
    async moveBook(bookId: string, toStatus: BookStatus, toIndex: number): Promise<void> {
      const book = await getRecord('books', bookId);
      if (!book || !isAlive(book)) return;
      if (book.status === toStatus) {
        await this.reorder(bookId, toIndex);
        return;
      }
      const today = logicalToday(useSettingsStore().dayStartMin);
      const patch: Partial<Book> = { status: toStatus };
      if (toStatus === 'reading' && book.start_date === null) patch.start_date = today;
      if (toStatus === 'done') {
        patch.finish_date = today;
        patch.current_page = book.total_pages;
      } else if (book.status === 'done') {
        patch.finish_date = null;
      }
      const allAlive = await listAlive('books');
      const targetIndexes = assignSortIndexes(orderedIdsAfterMove(allAlive, bookId, toStatus, toIndex));
      const sourceIndexes = assignSortIndexes(
        sortColumn(allAlive.filter((row) => row.status === book.status && row.id !== bookId)).map(
          (row) => row.id,
        ),
      );
      await this.runWithSaveStatus(async () => {
        const db = await getDb();
        await db.transaction('rw', db.books, async () => {
          const stamp = nowMs();
          for (const [id, index] of Object.entries(targetIndexes)) {
            await db.books.update(id, { sort_index: index, updated_at: stamp });
          }
          for (const [id, index] of Object.entries(sourceIndexes)) {
            await db.books.update(id, { sort_index: index, updated_at: stamp });
          }
          await db.books.update(bookId, { ...patch, updated_at: stamp });
        });
      });
      this.bumpRevision();
    },
    /**
     * 更新当前页：新页 > 旧页时自动生成 source=page_update 的学习记录
     * （start_at=end_at=now、duration_sec=0、pages_read=新-旧、date=当前逻辑日期），
     * 并更新 book.current_page；新页 = 总页数且未读完时返回 confirmDone 提示。
     */
    async updateBookPage(bookId: string, rawPage: number): Promise<UpdatePageResult> {
      const book = await getRecord('books', bookId);
      if (!book || !isAlive(book)) return { ok: false, reason: '未找到该书' };
      const newPage = Math.floor(rawPage);
      if (!Number.isInteger(newPage) || newPage < 0) return { ok: false, reason: '页码需为非负整数' };
      if (newPage > book.total_pages) return { ok: false, reason: '页码不能超过总页数' };
      const oldPage = book.current_page;
      const selectedDate = useDateStore().selectedDate;
      await this.runWithSaveStatus(async () => {
        if (newPage > oldPage) {
          const now = Date.now();
          await createRecord('study_records', {
            target_type: 'book',
            target_id: book.id,
            target_title: book.title,
            start_at: now,
            end_at: now,
            duration_sec: 0,
            note: null,
            start_page: oldPage,
            end_page: newPage,
            pages_read: newPage - oldPage,
            source: 'page_update',
            date: selectedDate,
          });
        }
        if (newPage !== oldPage) {
          await updateRecord('books', bookId, { current_page: newPage });
        }
      });
      this.bumpRevision();
      return { ok: true, confirmDone: newPage === book.total_pages && book.status !== 'done' };
    },
    /**
     * 删除书：计时中/待结算阻止；软删书 + 级联软删该书摘录；
     * 学习记录与计划项保留 target_title 快照不删（PRD §5.10）。
     */
    async deleteBook(bookId: string): Promise<boolean> {
      const book = await getRecord('books', bookId);
      if (!book || !isAlive(book)) return false;
      if (useTimerStore().isTargetActive(bookId)) {
        useToastStore().error(TIMING_GUARD_MESSAGE);
        return false;
      }
      const db = await getDb();
      const excerpts = await db.excerpts
        .where('book_id')
        .equals(bookId)
        .filter((row) => row.deleted_at === null)
        .toArray();
      const excerptIds = excerpts.map((row) => row.id);
      await this.runWithSaveStatus(async () => {
        await softDelete('books', bookId);
        for (const id of excerptIds) {
          await softDelete('excerpts', id);
        }
      });
      this.bumpRevision();
      useToastStore().undoable('已删除书籍，可撤销', async () => {
        await this.runWithSaveStatus(async () => {
          await undoDelete('books', bookId);
          for (const id of excerptIds) {
            await undoDelete('excerpts', id);
          }
        });
        this.bumpRevision();
      });
      return true;
    },

    // ---------- 摘录 ----------
    /** 该书全部有效摘录，按页码从小到大排序（页码相同按创建时间）。 */
    async loadExcerpts(bookId: string): Promise<Excerpt[]> {
      const db = await getDb();
      const rows = await db.excerpts
        .where('book_id')
        .equals(bookId)
        .filter((row) => row.deleted_at === null)
        .toArray();
      rows.sort((a, b) => a.page - b.page || a.created_at - b.created_at);
      return rows;
    },
    async createExcerpt(input: ExcerptInput): Promise<Excerpt | null> {
      const page = Math.floor(input.page);
      if (!Number.isInteger(page) || page <= 0) {
        useToastStore().error('页码需为正整数');
        return null;
      }
      const content = input.content.trim();
      if (content === '') {
        useToastStore().error('摘录内容不能为空');
        return null;
      }
      const excerpt = await this.runWithSaveStatus(() =>
        createRecord('excerpts', {
          book_id: input.bookId,
          page,
          content,
          thought: input.thought?.trim() || null,
        }),
      );
      this.bumpRevision();
      return excerpt;
    },
    async saveExcerpt(
      id: string,
      input: Omit<ExcerptInput, 'bookId'>,
    ): Promise<Excerpt | null> {
      const page = Math.floor(input.page);
      if (!Number.isInteger(page) || page <= 0) {
        useToastStore().error('页码需为正整数');
        return null;
      }
      const content = input.content.trim();
      if (content === '') {
        useToastStore().error('摘录内容不能为空');
        return null;
      }
      await this.runWithSaveStatus(() =>
        updateRecord('excerpts', id, { page, content, thought: input.thought?.trim() || null }),
      );
      this.bumpRevision();
      const updated = await getRecord('excerpts', id);
      return updated !== undefined && isAlive(updated) ? updated : null;
    },
    async deleteExcerpt(id: string): Promise<void> {
      const row = await getRecord('excerpts', id);
      if (!row || !isAlive(row)) return;
      await this.runWithSaveStatus(() => softDelete('excerpts', id));
      this.bumpRevision();
      useToastStore().undoable('已删除摘录，可撤销', async () => {
        await this.runWithSaveStatus(() => undoDelete('excerpts', id));
        this.bumpRevision();
      });
    },

    // ---------- 科目 ----------
    async loadSubjects(): Promise<Subject[]> {
      const rows = await listAlive('subjects');
      rows.sort((a, b) => b.created_at - a.created_at);
      this.subjects = rows;
      this.subjectsLoaded = true;
      return rows;
    },
    async createSubject(input: SubjectInput): Promise<Subject | null> {
      const fields = validateSubject(input.name, input.weeklyGoalMin);
      if (!fields) return null;
      const deadline = normalizeDeadline(input.deadline);
      if (deadline === undefined) return null;
      const subject = await this.runWithSaveStatus(() =>
        createRecord('subjects', {
          name: fields.name,
          weekly_goal_min: fields.weeklyGoalMin,
          deadline,
          archived: false,
        }),
      );
      this.bumpRevision();
      return subject;
    },
    async saveSubject(id: string, input: SubjectInput): Promise<Subject | null> {
      const fields = validateSubject(input.name, input.weeklyGoalMin);
      if (!fields) return null;
      const deadline = normalizeDeadline(input.deadline);
      if (deadline === undefined) return null;
      await this.runWithSaveStatus(() =>
        updateRecord('subjects', id, {
          name: fields.name,
          weekly_goal_min: fields.weeklyGoalMin,
          deadline,
        }),
      );
      this.bumpRevision();
      const updated = await getRecord('subjects', id);
      return updated !== undefined && isAlive(updated) ? updated : null;
    },
    /** 归档/取消归档；计时中或待结算禁止归档（PRD §5.10）。 */
    async setSubjectArchived(subjectId: string, archived: boolean): Promise<boolean> {
      const subject = await getRecord('subjects', subjectId);
      if (!subject || !isAlive(subject) || subject.archived === archived) return true;
      if (archived && useTimerStore().isTargetActive(subjectId)) {
        useToastStore().error(TIMING_GUARD_MESSAGE);
        return false;
      }
      await this.runWithSaveStatus(() => updateRecord('subjects', subjectId, { archived }));
      this.bumpRevision();
      return true;
    },
    /** 删除科目：计时中/待结算阻止；软删除 + 5 秒撤销，学习记录保留快照。 */
    async deleteSubject(subjectId: string): Promise<boolean> {
      const subject = await getRecord('subjects', subjectId);
      if (!subject || !isAlive(subject)) return false;
      if (useTimerStore().isTargetActive(subjectId)) {
        useToastStore().error(TIMING_GUARD_MESSAGE);
        return false;
      }
      await this.runWithSaveStatus(() => softDelete('subjects', subjectId));
      this.bumpRevision();
      useToastStore().undoable('已删除科目，可撤销', async () => {
        await this.runWithSaveStatus(() => undoDelete('subjects', subjectId));
        this.bumpRevision();
      });
      return true;
    },
    /** 一次性读全部有效学习记录，按科目填充本周统计（周一~周日柱 + 周一到今天之和）。 */
    async loadSubjectsStats(referenceDate: string): Promise<void> {
      const records = await listAlive('study_records');
      const stats: Record<string, SubjectWeekStats> = {};
      for (const subject of this.subjects) {
        const own = records.filter(
          (record) => record.target_type === 'subject' && record.target_id === subject.id,
        );
        stats[subject.id] = {
          weekSec: weeklyStudySeconds(own, referenceDate),
          bars: weeklyBarSeconds(own, referenceDate),
        };
      }
      this.subjectStats = stats;
    },
    /** 某科目的全部有效历史学习记录（日期倒序，同日按结束时间倒序）。 */
    async listSubjectRecords(subjectId: string): Promise<StudyRecord[]> {
      const records = await listAlive('study_records');
      return records
        .filter((record) => record.target_type === 'subject' && record.target_id === subjectId)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return b.end_at - a.end_at;
        });
    },

    // ---------- 学习记录 ----------
    /**
     * 手动补记学习记录：source='manual'、duration_sec=分钟*60；
     * 书带 end_page（start_page/pages_read=null）且不修改 current_page（按任务假设）；
     * 逻辑日期取表单日期，start_at/end_at 记当前时间戳。
     */
    async addManualStudyRecord(input: ManualStudyInput): Promise<StudyRecord | null> {
      const minutes = Math.floor(input.minutes);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        useToastStore().error('时长需为正整数（分钟）');
        return null;
      }
      if (parseDateKey(input.date) === null) {
        useToastStore().error('逻辑日期无效');
        return null;
      }
      let targetTitle: string;
      let endPage: number | null = null;
      if (input.targetType === 'book') {
        const book = await getRecord('books', input.targetId);
        if (!book || !isAlive(book)) {
          useToastStore().error('书籍不存在或已删除');
          return null;
        }
        targetTitle = book.title;
        const page = Math.floor(input.endPage ?? NaN);
        if (!Number.isInteger(page) || page <= 0) {
          useToastStore().error('读到页码需为正整数');
          return null;
        }
        endPage = page;
      } else {
        const subject = await getRecord('subjects', input.targetId);
        if (!subject || !isAlive(subject)) {
          useToastStore().error('科目不存在或已删除');
          return null;
        }
        targetTitle = subject.name;
      }
      const now = Date.now();
      const record = await this.runWithSaveStatus(() =>
        createRecord('study_records', {
          target_type: input.targetType,
          target_id: input.targetId,
          target_title: targetTitle,
          start_at: now,
          end_at: now,
          duration_sec: minutes * 60,
          note: input.note?.trim() || null,
          start_page: null,
          end_page: endPage,
          pages_read: null,
          source: 'manual',
          date: input.date,
        }),
      );
      this.bumpRevision();
      return record;
    },
    /** 该书全部有效学习记录时长之和（预计剩余时间用，PRD §5.2 规则 5）。 */
    async bookTotalStudySeconds(bookId: string): Promise<number> {
      const records = await listAlive('study_records');
      return records
        .filter((record) => record.target_type === 'book' && record.target_id === bookId)
        .reduce((sum, record) => sum + record.duration_sec, 0);
    },
  },
});
