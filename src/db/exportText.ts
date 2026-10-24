/**
 * 纯函数导出层：把各表「有效记录」整理成一段 Markdown 文本，供用户直接贴给 AI 分析。
 *
 * 约定：
 * - 输入是内存里的记录（不碰数据库、不做 IO），输出稳定可测；同一输入永远得到同一段文本。
 * - 只输出区间 [start, end] 内的记录：区间外的东西一律不出现（错题/摘录按自身日期判定）。
 * - 图片不写 base64（会把文本撑爆），只写张数。
 */
import {
  DEFAULT_DAY_START_MIN,
  addDays,
  dateKeyOf,
  offsetToTime,
  pad2,
  parseDateKey,
  parseDayStart,
  weekdayCN,
} from '@/utils/date';
import type {
  Book,
  Excerpt,
  Exercise,
  ExerciseEntry,
  Meal,
  Mistake,
  Plan,
  PlayRecord,
  Review,
  SettingsRecord,
  StudyRecord,
  Water,
  WorkoutRecord,
} from './schema';

export interface ExportSource {
  /** 起始日期 'YYYY-MM-DD'（含）。 */
  start: string;
  /** 结束日期 'YYYY-MM-DD'（含）。 */
  end: string;
  settings?: SettingsRecord | null;
  exercises?: readonly Exercise[];
  plans: readonly Plan[];
  study_records: readonly StudyRecord[];
  books: readonly Book[];
  excerpts: readonly Excerpt[];
  meals: readonly Meal[];
  water: readonly Water[];
  workout_records: readonly WorkoutRecord[];
  play_records: readonly PlayRecord[];
  reviews: readonly Review[];
  mistakes: readonly Mistake[];
}

/** 拿到全部表的空输入（测试与 UI 组装用）。 */
export function emptyExportSource(start: string, end: string): ExportSource {
  return {
    start,
    end,
    settings: null,
    exercises: [],
    plans: [],
    study_records: [],
    books: [],
    excerpts: [],
    meals: [],
    water: [],
    workout_records: [],
    play_records: [],
    reviews: [],
    mistakes: [],
  };
}

/** 'YYYY-MM-DD' 是否落在区间内（含首尾；定长日期串可直接按字典序比较）。 */
export function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** 区间内每一天（含首尾；start > end 时返回空数组）。 */
export function eachDateInRange(start: string, end: string): string[] {
  if (parseDateKey(start) === null) throw new Error('非法日期：' + start);
  if (parseDateKey(end) === null) throw new Error('非法日期：' + end);
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    days.push(date);
    if (days.length > 3660) throw new Error('日期区间过大');
  }
  return days;
}

/** 摘录没有 date 字段：按创建时间换算成本地日期归档。 */
export function excerptDateKey(excerpt: Excerpt): string {
  return dateKeyOf(excerpt.created_at);
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export interface DayAggregate {
  date: string;
  planCount: number;
  planDoneCount: number;
  studyCount: number;
  studySec: number;
  pagesRead: number;
  excerptCount: number;
  mealCount: number;
  waterCount: number;
  waterMl: number;
  workoutCount: number;
  workoutDoneCount: number;
  workoutMinutes: number;
  playCount: number;
  playMinutes: number;
  hasReview: boolean;
  mistakeCount: number;
  mistakeUnmastered: number;
}

/** 单日聚合（按天分段的 UI 直接用它）。 */
export function aggregateDay(source: ExportSource, date: string): DayAggregate {
  const plans = source.plans.filter((row) => row.date === date);
  const study = source.study_records.filter((row) => row.date === date);
  const excerpts = source.excerpts.filter((row) => excerptDateKey(row) === date);
  const meals = source.meals.filter((row) => row.date === date);
  const waters = source.water.filter((row) => row.date === date);
  const workouts = source.workout_records.filter((row) => row.date === date);
  const plays = source.play_records.filter((row) => row.date === date);
  const reviews = source.reviews.filter((row) => row.date === date);
  const mistakes = source.mistakes.filter((row) => row.date === date);
  return {
    date,
    planCount: plans.length,
    planDoneCount: plans.filter((row) => row.done).length,
    studyCount: study.length,
    studySec: sum(study.map((row) => row.duration_sec)),
    pagesRead: sum(study.map((row) => row.pages_read ?? 0)),
    excerptCount: excerpts.length,
    mealCount: meals.length,
    waterCount: waters.length,
    waterMl: sum(waters.map((row) => row.ml)),
    workoutCount: workouts.length,
    workoutDoneCount: workouts.filter((row) => row.done).length,
    workoutMinutes: sum(workouts.map((row) => row.duration_min ?? 0)),
    playCount: plays.length,
    playMinutes: sum(plays.map((row) => row.minutes)),
    hasReview: reviews.length > 0,
    mistakeCount: mistakes.length,
    mistakeUnmastered: mistakes.filter((row) => !row.mastered).length,
  };
}

/** 区间内每天的聚合（区间外的日期不返回）。 */
export function dayAggregates(source: ExportSource): DayAggregate[] {
  return eachDateInRange(source.start, source.end).map((date) => aggregateDay(source, date));
}

export interface ExportTotals {
  start: string;
  end: string;
  dayCount: number;
  activeDayCount: number;
  planCount: number;
  planDoneCount: number;
  studyCount: number;
  studySec: number;
  pagesRead: number;
  excerptCount: number;
  mealCount: number;
  waterCount: number;
  waterMl: number;
  workoutCount: number;
  workoutDoneCount: number;
  workoutMinutes: number;
  playCount: number;
  playMinutes: number;
  reviewCount: number;
  mistakeCount: number;
  mistakeUnmastered: number;
  bookCount: number;
  bookReadingCount: number;
  exerciseCount: number;
}

/** 书是否在区间内有活动（期间开始/读完，或仍在读且开始时间不晚于区间结束）。 */
export function bookActiveInRange(book: Book, start: string, end: string): boolean {
  const startedIn = book.start_date !== null && inRange(book.start_date, start, end);
  const finishedIn = book.finish_date !== null && inRange(book.finish_date, start, end);
  if (startedIn || finishedIn) return true;
  return book.status === 'reading' && (book.start_date === null || book.start_date <= end);
}

function isActiveDay(day: DayAggregate): boolean {
  return (
    day.planCount > 0 ||
    day.studyCount > 0 ||
    day.excerptCount > 0 ||
    day.mealCount > 0 ||
    day.waterCount > 0 ||
    day.workoutCount > 0 ||
    day.playCount > 0 ||
    day.hasReview ||
    day.mistakeCount > 0
  );
}

/** 汇总统计（标题区数字全部由这里算出）。 */
export function summarizeSource(source: ExportSource): ExportTotals {
  const days = dayAggregates(source);
  const books = source.books.filter((book) => bookActiveInRange(book, source.start, source.end));
  return {
    start: source.start,
    end: source.end,
    dayCount: days.length,
    activeDayCount: days.filter(isActiveDay).length,
    planCount: sum(days.map((day) => day.planCount)),
    planDoneCount: sum(days.map((day) => day.planDoneCount)),
    studyCount: sum(days.map((day) => day.studyCount)),
    studySec: sum(days.map((day) => day.studySec)),
    pagesRead: sum(days.map((day) => day.pagesRead)),
    excerptCount: sum(days.map((day) => day.excerptCount)),
    mealCount: sum(days.map((day) => day.mealCount)),
    waterCount: sum(days.map((day) => day.waterCount)),
    waterMl: sum(days.map((day) => day.waterMl)),
    workoutCount: sum(days.map((day) => day.workoutCount)),
    workoutDoneCount: sum(days.map((day) => day.workoutDoneCount)),
    workoutMinutes: sum(days.map((day) => day.workoutMinutes)),
    playCount: sum(days.map((day) => day.playCount)),
    playMinutes: sum(days.map((day) => day.playMinutes)),
    reviewCount: days.filter((day) => day.hasReview).length,
    mistakeCount: sum(days.map((day) => day.mistakeCount)),
    mistakeUnmastered: sum(days.map((day) => day.mistakeUnmastered)),
    bookCount: books.length,
    bookReadingCount: books.filter((book) => book.status === 'reading').length,
    exerciseCount: (source.exercises ?? []).length,
  };
}

const FEELING_TEXT: Record<NonNullable<Meal['feeling']>, string> = {
  full: '吃饱',
  not_full: '没吃饱',
  overeat: '吃撑',
};

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  if (minutes < 60) return minutes + ' 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? hours + ' 小时' : hours + ' 小时 ' + rest + ' 分钟';
}

function clockOf(tsMs: number): string {
  const date = new Date(tsMs);
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function dayStartMinuteOf(source: ExportSource): number {
  const dayStart = source.settings?.day_start;
  if (typeof dayStart !== 'string') return DEFAULT_DAY_START_MIN;
  try {
    return parseDayStart(dayStart);
  } catch {
    return DEFAULT_DAY_START_MIN;
  }
}

function sortByCreated<T extends { created_at: number; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
}

function sortPlans(rows: readonly Plan[]): Plan[] {
  return [...rows].sort((a, b) => {
    const startA = a.start_min ?? Number.MAX_SAFE_INTEGER;
    const startB = b.start_min ?? Number.MAX_SAFE_INTEGER;
    return startA - startB || a.created_at - b.created_at || a.id.localeCompare(b.id);
  });
}

function formatPlan(plan: Plan, dayStartMin: number): string {
  const mark = plan.done ? '[x]' : '[ ]';
  const time =
    plan.start_min === null || plan.end_min === null
      ? ''
      : offsetToTime(plan.start_min, dayStartMin) + '~' + offsetToTime(plan.end_min, dayStartMin) + ' ';
  const target = plan.target_title === null ? '' : ' → ' + plan.target_title;
  return '- ' + mark + ' ' + time + plan.title + '（' + plan.category_name + '）' + target;
}

function formatStudy(record: StudyRecord): string {
  let line =
    '- ' +
    clockOf(record.start_at) +
    '~' +
    clockOf(record.end_at) +
    ' ' +
    record.target_title +
    ' ' +
    formatMinutes(record.duration_sec) +
    '（' +
    record.source +
    '）';
  if ((record.pages_read ?? 0) > 0) line += '，读了 ' + record.pages_read + ' 页';
  if (record.start_page !== null && record.end_page !== null) {
    line += '，第 ' + record.start_page + '→' + record.end_page + ' 页';
  }
  if (record.note !== null && record.note.trim() !== '') line += '，备注：' + record.note.trim();
  return line;
}

function formatSet(set: ExerciseEntry['sets'][number]): string {
  const weight = set.weight_kg === null || set.weight_kg === undefined ? '' : set.weight_kg + 'kg';
  const reps = set.reps === null || set.reps === undefined ? '' : '×' + set.reps;
  const base = weight + reps;
  const text = base === '' ? '空' : base;
  return set.done ? text + '✓' : text;
}

function formatExercises(exercises: readonly ExerciseEntry[]): string {
  return exercises
    .map((entry) => {
      const sets = entry.sets.map(formatSet).join(' / ');
      const note = entry.note !== null && entry.note !== undefined && entry.note.trim() !== ''
        ? '（备注：' + entry.note.trim() + '）'
        : '';
      return sets === '' ? entry.name + note : entry.name + ' ' + sets + note;
    })
    .join('；');
}

function formatWorkout(record: WorkoutRecord): string {
  const meta: string[] = [record.done ? '已完成' : '未完成'];
  if (record.duration_min !== null) meta.push(record.duration_min + ' 分钟');
  const exercises = formatExercises(record.exercises);
  return '- ' + record.type_name + '（' + meta.join('，') + '）' + (exercises === '' ? '' : '：' + exercises);
}

function formatExcerpt(excerpt: Excerpt, bookTitle: string): string {
  const thought =
    excerpt.thought !== null && excerpt.thought.trim() !== ''
      ? ' —— 感想：' + excerpt.thought.trim()
      : '';
  return '- 《' + bookTitle + '》第 ' + excerpt.page + ' 页：' + excerpt.content.trim() + thought;
}

function formatMistake(mistake: Mistake): string[] {
  const lines: string[] = [];
  const head: string[] = [mistake.mastered ? '已掌握' : '未掌握'];
  if (mistake.subject_name !== null && mistake.subject_name.trim() !== '') {
    head.push(mistake.subject_name.trim());
  }
  head.push('难度 ' + mistake.difficulty);
  const question = mistake.question_text?.trim() ?? '';
  lines.push('- [' + head.join('｜') + '] ' + (question === '' ? '（无题干文字）' : question));
  if (mistake.reasons.length > 0) lines.push('  - 错因：' + mistake.reasons.join('、'));
  const correction = mistake.correction_text?.trim() ?? '';
  if (correction !== '') lines.push('  - 订正：' + correction);
  const note = mistake.note?.trim() ?? '';
  if (note !== '') lines.push('  - 备注：' + note);
  const images: string[] = [];
  if (mistake.question_images.length > 0) images.push('题目 ' + mistake.question_images.length + ' 张');
  if (mistake.correction_images.length > 0) {
    images.push('订正 ' + mistake.correction_images.length + ' 张');
  }
  if (images.length > 0) lines.push('  - 图片：' + images.join('，'));
  return lines;
}

function formatReview(review: Review): string[] {
  const lines: string[] = [];
  const scores: string[] = [];
  if (review.rating !== null) scores.push('评分 ' + review.rating);
  if (review.mood !== null) scores.push('心情 ' + review.mood);
  if (review.energy !== null) scores.push('精力 ' + review.energy);
  if (scores.length > 0) lines.push('- ' + scores.join('，'));
  const textFields: [string, string | null | undefined][] = [
    ['做得好', review.good],
    ['待改进', review.improve],
    ['最重要的事', review.mit],
    ['值得记录', review.record_worthy],
    ['一天总结', review.day_summary],
  ];
  for (const [label, value] of textFields) {
    if (typeof value === 'string' && value.trim() !== '') {
      lines.push('- ' + label + '：' + value.trim());
    }
  }
  if (review.mit_added_to_plan) lines.push('- 最重要的事已加入今日待办');
  return lines;
}

/** 区间内的某一天 → Markdown 段落（没有记录时返回空数组）。 */
function renderDay(source: ExportSource, date: string, dayStartMin: number): string[] {
  const lines: string[] = [];
  const plans = sortPlans(source.plans.filter((row) => row.date === date));
  const study = source.study_records
    .filter((row) => row.date === date)
    .sort((a, b) => a.start_at - b.start_at || a.id.localeCompare(b.id));
  const excerpts = source.excerpts.filter((row) => excerptDateKey(row) === date);
  const meals = sortByCreated(source.meals.filter((row) => row.date === date));
  const waters = source.water
    .filter((row) => row.date === date)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const workouts = sortByCreated(source.workout_records.filter((row) => row.date === date));
  const plays = sortByCreated(source.play_records.filter((row) => row.date === date));
  const reviews = sortByCreated(source.reviews.filter((row) => row.date === date));
  const mistakes = sortByCreated(source.mistakes.filter((row) => row.date === date));

  if (plans.length > 0) {
    lines.push('### 计划');
    for (const plan of plans) lines.push(formatPlan(plan, dayStartMin));
    lines.push('');
  }
  if (study.length > 0) {
    lines.push('### 学习记录');
    for (const record of study) lines.push(formatStudy(record));
    lines.push('');
  }
  if (excerpts.length > 0) {
    lines.push('### 摘录');
    for (const excerpt of excerpts) {
      const book = source.books.find((row) => row.id === excerpt.book_id);
      lines.push(formatExcerpt(excerpt, book?.title ?? '已删除的书'));
    }
    lines.push('');
  }
  if (meals.length > 0) {
    lines.push('### 饮食');
    for (const meal of meals) {
      const feeling = meal.feeling === null ? '' : '（' + FEELING_TEXT[meal.feeling] + '）';
      lines.push('- ' + meal.meal_name + '：' + meal.text.trim() + feeling);
    }
    lines.push('');
  }
  if (waters.length > 0) {
    lines.push('### 喝水');
    const total = sum(waters.map((row) => row.ml));
    lines.push('- 共 ' + waters.length + ' 次，合计 ' + total + ' ml');
    lines.push('');
  }
  if (workouts.length > 0) {
    lines.push('### 训练');
    for (const record of workouts) lines.push(formatWorkout(record));
    lines.push('');
  }
  if (plays.length > 0) {
    lines.push('### 娱乐');
    for (const play of plays) lines.push('- ' + play.content.trim() + ' ' + play.minutes + ' 分钟');
    lines.push('');
  }
  if (reviews.length > 0) {
    lines.push('### 复盘');
    for (const review of reviews) lines.push(...formatReview(review));
    lines.push('');
  }
  if (mistakes.length > 0) {
    lines.push('### 错题');
    for (const mistake of mistakes) lines.push(...formatMistake(mistake));
    lines.push('');
  }
  if (lines.length === 0) return [];
  return ['## ' + date + ' ' + weekdayCN(date), '', ...lines];
}

/**
 * 主入口：区间内的记录 → Markdown 文本（首节汇总统计，按日期分段）。
 * 输出稳定：所有集合都显式排序，同一输入两次调用结果完全一致。
 */
export function exportText(source: ExportSource): string {
  const dayStartMin = dayStartMinuteOf(source);
  const totals = summarizeSource(source);
  const lines: string[] = [];
  lines.push('# 个人数据导出（' + source.start + ' ~ ' + source.end + '）');
  lines.push('');
  lines.push('## 汇总统计');
  lines.push('');
  lines.push('- 区间：' + source.start + ' ~ ' + source.end + '（共 ' + totals.dayCount + ' 天，有记录 ' + totals.activeDayCount + ' 天）');
  lines.push('- 计划：' + totals.planCount + ' 条（完成 ' + totals.planDoneCount + ' 条）');
  lines.push(
    '- 学习记录：' +
      totals.studyCount +
      ' 条，合计 ' +
      formatMinutes(totals.studySec) +
      '；阅读页数 ' +
      totals.pagesRead +
      ' 页',
  );
  lines.push('- 摘录：' + totals.excerptCount + ' 条');
  lines.push('- 读书：区间内有活动 ' + totals.bookCount + ' 本（在读 ' + totals.bookReadingCount + ' 本）');
  lines.push('- 饮食记录：' + totals.mealCount + ' 条');
  lines.push('- 喝水：' + totals.waterCount + ' 次，合计 ' + totals.waterMl + ' ml');
  lines.push(
    '- 训练：' +
      totals.workoutCount +
      ' 条（完成 ' +
      totals.workoutDoneCount +
      ' 条），合计 ' +
      totals.workoutMinutes +
      ' 分钟',
  );
  lines.push('- 娱乐：' + totals.playCount + ' 条，合计 ' + totals.playMinutes + ' 分钟');
  lines.push('- 复盘：' + totals.reviewCount + ' 天');
  lines.push(
    '- 错题：' + totals.mistakeCount + ' 条（未掌握 ' + totals.mistakeUnmastered + ' 条）',
  );
  if (totals.exerciseCount > 0) lines.push('- 训练项目库：' + totals.exerciseCount + ' 个动作');
  lines.push('');

  const books = source.books.filter((book) => bookActiveInRange(book, source.start, source.end));
  if (books.length > 0) {
    lines.push('## 读书进度');
    lines.push('');
    const statusText: Record<Book['status'], string> = { want: '想读', reading: '在读', done: '读完' };
    for (const book of books) {
      const startText = book.start_date === null ? '' : '，开始 ' + book.start_date;
      const finishText = book.finish_date === null ? '' : '，读完 ' + book.finish_date;
      lines.push(
        '- 《' +
          book.title +
          '》：' +
          book.current_page +
          '/' +
          book.total_pages +
          ' 页（' +
          statusText[book.status] +
          startText +
          finishText +
          '）',
      );
    }
    lines.push('');
  }

  const daySections: string[] = [];
  for (const date of eachDateInRange(source.start, source.end)) {
    daySections.push(...renderDay(source, date, dayStartMin));
  }
  if (daySections.length === 0) {
    lines.push('_区间内没有记录。_');
  } else {
    lines.push(...daySections);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
