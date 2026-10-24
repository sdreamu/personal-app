import { defineStore } from 'pinia';
import {
  DEFAULT_SETTINGS_VALUES,
  createRecord,
  errorMessage,
  listAlive,
  listAliveByDate,
  updateRecord,
  type Plan,
  type PlayRecord,
  type Review,
  type StudyRecord,
  type Water,
  type WorkoutRecord,
} from '@/db';
import { addDays, formatDuration, logicalToday } from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useSettingsStore } from './settings';
import { useToastStore } from './toast';

/** 复盘可写字段（不包含 BaseFields 与 date；date 由 upsert 参数定位）。 */
export type ReviewPatch = Partial<
  Pick<
    Review,
    | 'rating'
    | 'mood'
    | 'energy'
    | 'good'
    | 'improve'
    | 'mit'
    | 'record_worthy'
    | 'day_summary'
    | 'mit_added_to_plan'
  >
>;

/** 走 300ms 防抖自动保存的文字字段：三栏文字 + 新增两栏（值得记录 / 一句话总结）。 */
export const REVIEW_TEXT_FIELDS = ['good', 'improve', 'mit', 'record_worthy', 'day_summary'] as const;
export type ReviewTextField = (typeof REVIEW_TEXT_FIELDS)[number];
export type ReviewTextPatch = Partial<Pick<Review, ReviewTextField>>;

/** “一句话总结今天”的最大长度（输入框 maxlength 与字数计数共用同一常量）。 */
export const DAY_SUMMARY_MAX_LENGTH = 100;

export interface ReviewSettingsInput {
  daily_study_min: number;
  daily_water_ml: number;
  daily_play_min: number;
}

export interface ReviewMetricsInput {
  plans: readonly Plan[];
  studyRecords: readonly StudyRecord[];
  waterRecords: readonly Water[];
  workoutRecords: readonly WorkoutRecord[];
  playRecords: readonly PlayRecord[];
  settings: ReviewSettingsInput;
}

export interface ReviewMetrics {
  /** ① 计划完成数：完成数 / 总数。 */
  planDone: number;
  planTotal: number;
  planText: string;
  /** ② 学习时长及目标：当日学习记录秒数总和 / 设置目标（分钟）。 */
  studySeconds: number;
  studyGoalMin: number;
  studyText: string;
  /** ③ 阅读页数：当日 book 类 study_records 的 pages_read（非 null）之和。 */
  pagesRead: number;
  pagesText: string;
  /** ④ 喝水量及目标：当日 water ml 总和（保底 0）/ 设置目标。 */
  waterMl: number;
  waterGoalMl: number;
  waterText: string;
  /** ⑤ 是否运动：是否存在 done=true 的健身训练记录（含类型与用时）。 */
  workoutDone: boolean;
  workoutText: string;
  /** ⑥ 娱乐时长及额度：当日 play_records 分钟和 / 设置额度。 */
  playMinutes: number;
  playLimitMin: number;
  playText: string;
  /** ⑦ 计划学习时长与实际差值（分钟）。 */
  plannedStudyMinutes: number;
  actualStudyMinutes: number;
  diffMinutes: number;
  diffText: string;
}

export interface ReviewHistoryItem {
  date: string;
  rating: number | null;
  mood: number | null;
  energy: number | null;
  summary: string;
}

export interface ReviewDateDot {
  date: string;
  filled: boolean;
}

export const REVIEW_TEXT_DEBOUNCE_MS = 300;

/** 计划学习时长与实际差值文案（纯函数）。 */
export function formatDiffText(diffMinutes: number): string {
  const rounded = Math.round(diffMinutes);
  if (rounded === 0) return '±0 分钟';
  return rounded > 0
    ? `+${rounded} 分钟（超额完成）`
    : `-${Math.abs(rounded)} 分钟（未达计划）`;
}

function aliveRows<T extends { deleted_at: number | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.deleted_at === null);
}

/**
 * 复盘 7 项指标纯计算（只读，实时聚合）：
 * - 学习时长 = 当日所有 study_records（书 + 科目）的 duration_sec 总和；
 * - 阅读页数 = 当日 book 类且 pages_read 非 null 的记录之和（含计时结算与手动更新页码）；
 * - 计划学习时长 = 当日 category_key='study' 且起止时间非空的时间块
 *   (end_min - start_min) 直接相加（重叠不合并扣减、无起止时间待办不参与）；
 * - 差值 = 实际学习分钟 - 计划学习分钟。
 */
export function computeMetrics(input: ReviewMetricsInput): ReviewMetrics {
  const plans = aliveRows(input.plans);
  const studyRecords = aliveRows(input.studyRecords);
  const waterRecords = aliveRows(input.waterRecords);
  const workoutRecords = aliveRows(input.workoutRecords);
  const playRecords = aliveRows(input.playRecords);

  const planDone = plans.filter((plan) => plan.done).length;
  const planTotal = plans.length;

  const studySeconds = studyRecords.reduce((sum, record) => sum + record.duration_sec, 0);
  const studyGoalMin = input.settings.daily_study_min;

  const pagesRead = studyRecords.reduce(
    (sum, record) =>
      sum + (record.target_type === 'book' && record.pages_read !== null ? record.pages_read : 0),
    0,
  );

  const waterMl = Math.max(0, waterRecords.reduce((sum, record) => sum + record.ml, 0));
  const waterGoalMl = input.settings.daily_water_ml;

  const doneWorkouts = workoutRecords.filter((record) => record.done);
  const workoutDone = doneWorkouts.length > 0;
  const workoutText = workoutDone
    ? doneWorkouts
        .map((record) =>
          record.duration_min !== null
            ? `${record.type_name} ${record.duration_min} 分钟`
            : record.type_name,
        )
        .join('、')
    : '未运动';

  const playMinutes = playRecords.reduce((sum, record) => sum + record.minutes, 0);
  const playLimitMin = input.settings.daily_play_min;

  const plannedStudyMinutes = plans.reduce((sum, plan) => {
    if (plan.category_key === 'study' && plan.start_min !== null && plan.end_min !== null) {
      return sum + (plan.end_min - plan.start_min);
    }
    return sum;
  }, 0);
  const actualStudyMinutes = studySeconds / 60;
  const diffMinutes = actualStudyMinutes - plannedStudyMinutes;

  return {
    planDone,
    planTotal,
    planText: `${planDone}/${planTotal}`,
    studySeconds,
    studyGoalMin,
    studyText: `${formatDuration(studySeconds)} / ${formatDuration(studyGoalMin * 60)}`,
    pagesRead,
    pagesText: `${pagesRead} 页`,
    waterMl,
    waterGoalMl,
    waterText: `${waterMl} ml / ${waterGoalMl} ml`,
    workoutDone,
    workoutText,
    playMinutes,
    playLimitMin,
    playText: `${playMinutes} 分钟 / ${playLimitMin} 分钟`,
    plannedStudyMinutes,
    actualStudyMinutes,
    diffMinutes,
    diffText: formatDiffText(diffMinutes),
  };
}

/** 是否算“已填写复盘”（任一评分/心情/精力/文字栏非空即算，含新增的值得记录与一句话总结）。 */
export function hasReviewContent(review: Review): boolean {
  return (
    review.rating !== null ||
    review.mood !== null ||
    review.energy !== null ||
    (review.good ?? '').trim() !== '' ||
    (review.improve ?? '').trim() !== '' ||
    (review.mit ?? '').trim() !== '' ||
    (review.record_worthy ?? '').trim() !== '' ||
    (review.day_summary ?? '').trim() !== ''
  );
}

/** 一句话摘要：优先 day_summary；为空时回退“做得好的”首行前 30 字；都为空返回空串。 */
export function summarizeReview(review: Review): string {
  const summary = (review.day_summary ?? '').trim();
  if (summary !== '') return summary.split('\n')[0];
  const good = (review.good ?? '').trim();
  if (good !== '') return good.split('\n')[0].slice(0, 30);
  return '';
}

/** 复盘历史按日期倒序（同日按创建时间倒序）。 */
export function sortReviewsDesc(reviews: readonly Review[]): Review[] {
  return [...reviews].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.created_at - a.created_at,
  );
}

/** 文字字段 trim：空白按 null 处理；评分/心情/精力仅接受 null 或 1~5 整数。 */
export function normalizeReviewPatch(patch: ReviewPatch): ReviewPatch {
  const next: ReviewPatch = { ...patch };
  for (const key of REVIEW_TEXT_FIELDS) {
    const value = patch[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      next[key] = trimmed === '' ? null : trimmed;
    }
  }
  if (typeof next.day_summary === 'string' && next.day_summary.length > DAY_SUMMARY_MAX_LENGTH) {
    next.day_summary = next.day_summary.slice(0, DAY_SUMMARY_MAX_LENGTH);
  }
  for (const key of ['rating', 'mood', 'energy'] as const) {
    const value = patch[key];
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 1 || value > 5)) {
      throw new Error(`${key} 必须是 1~5 的整数或 null`);
    }
  }
  return next;
}

function settingsInput(data: {
  daily_study_min?: number;
  daily_water_ml?: number;
  daily_play_min?: number;
} | null): ReviewSettingsInput {
  return {
    daily_study_min: data?.daily_study_min ?? DEFAULT_SETTINGS_VALUES.daily_study_min,
    daily_water_ml: data?.daily_water_ml ?? DEFAULT_SETTINGS_VALUES.daily_water_ml,
    daily_play_min: data?.daily_play_min ?? DEFAULT_SETTINGS_VALUES.daily_play_min,
  };
}

/** 同一日期的 upsert 串行队列（防连点并发创建出重复 review 行）。 */
const upsertChains = new Map<string, Promise<unknown>>();

/**
 * 复盘模块 store（4b）：
 * load(date) 载入选中日期复盘 + 各表当天数据并计算 7 项指标，同时载入全部复盘历史；
 * upsertReview(date, patch) 按 date 定位 reviews 行（存在则更新、不存在则新增）；
 * debouncedSaveText(date, patch) 对三栏文字 + 值得记录 + 一句话总结做 300ms 防抖自动保存；
 * flush() 立即保存尚未落库的文字（切日期/卸载前调用）。
 */
export const useReviewStore = defineStore('review', {
  state: () => ({
    loading: false,
    loadedDate: null as string | null,
    review: null as Review | null,
    reviews: [] as Review[],
    plans: [] as Plan[],
    studyRecords: [] as StudyRecord[],
    waterRecords: [] as Water[],
    workoutRecords: [] as WorkoutRecord[],
    playRecords: [] as PlayRecord[],
    metrics: null as ReviewMetrics | null,
    pendingTextDate: null as string | null,
    pendingTextPatch: null as ReviewTextPatch | null,
    textTimer: null as ReturnType<typeof setTimeout> | null,
  }),
  getters: {
    /** 历史复盘列表（日期倒序，只含有内容的复盘）。 */
    historyItems(state): ReviewHistoryItem[] {
      return sortReviewsDesc(state.reviews)
        .filter(hasReviewContent)
        .map((review) => ({
          date: review.date,
          rating: review.rating,
          mood: review.mood,
          energy: review.energy,
          summary: summarizeReview(review),
        }));
    },
    /** 最近 14 天的过去日期（昨天起向前 14 天，升序），未填写复盘为灰点。 */
    last14Dots(state): ReviewDateDot[] {
      const today = logicalToday(useSettingsStore().dayStartMin);
      const filled = new Set(state.reviews.filter(hasReviewContent).map((review) => review.date));
      const dots: ReviewDateDot[] = [];
      for (let offset = 1; offset <= 14; offset++) {
        const date = addDays(today, -offset);
        dots.push({ date, filled: filled.has(date) });
      }
      return dots;
    },
  },
  actions: {
    /** 载入选中日期全部复盘所需数据（指标只读聚合 + 历史列表）。 */
    async load(date: string): Promise<void> {
      this.loading = true;
      try {
        await this.flushPending({ silent: true });
        const [reviews, plans, studyRecords, waterRecords, workoutRecords, playRecords] =
          await Promise.all([
            listAlive('reviews'),
            listAliveByDate('plans', date),
            listAliveByDate('study_records', date),
            listAliveByDate('water', date),
            listAliveByDate('workout_records', date),
            listAliveByDate('play_records', date),
          ]);
        this.reviews = sortReviewsDesc(reviews);
        this.review = this.reviews.find((row) => row.date === date) ?? null;
        this.plans = plans;
        this.studyRecords = studyRecords;
        this.waterRecords = waterRecords;
        this.workoutRecords = workoutRecords;
        this.playRecords = playRecords;
        this.metrics = computeMetrics({
          plans,
          studyRecords,
          waterRecords,
          workoutRecords,
          playRecords,
          settings: settingsInput(useSettingsStore().data),
        });
        this.loadedDate = date;
      } finally {
        this.loading = false;
      }
    },

    /** 重新载入当前选中日期。 */
    async reload(): Promise<void> {
      await this.flush();
      if (this.loadedDate !== null) await this.load(this.loadedDate);
    },

    /** 按 date 定位 reviews 行：存在则更新、不存在则新增（串行防重复）。 */
    async upsertReview(date: string, patch: ReviewPatch): Promise<Review> {
      const previous = upsertChains.get(date) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(() => this.doUpsert(date, patch));
      upsertChains.set(
        date,
        next.then(
          () => undefined,
          () => undefined,
        ),
      );
      return next;
    },

    async doUpsert(date: string, patch: ReviewPatch): Promise<Review> {
      const normalized = normalizeReviewPatch(patch);
      const rows = await listAliveByDate('reviews', date);
      return this.runWithSaveStatus(async () => {
        if (rows.length > 0) {
          const existing = rows[0];
          await updateRecord('reviews', existing.id, normalized);
          const updated: Review = { ...existing, ...normalized, updated_at: Date.now() };
          this.replaceReview(updated);
          return updated;
        }
        const created = await createRecord('reviews', {
          date,
          rating: null,
          mood: null,
          energy: null,
          good: null,
          improve: null,
          mit: null,
          record_worthy: null,
          day_summary: null,
          mit_added_to_plan: false,
          ...normalized,
        });
        this.reviews = sortReviewsDesc([...this.reviews, created]);
        if (this.loadedDate === date) this.review = created;
        return created;
      });
    },

    replaceReview(updated: Review): void {
      this.reviews = this.reviews.map((row) => (row.id === updated.id ? updated : row));
      if (this.loadedDate === updated.date) this.review = updated;
    },

    /** 文字栏 300ms 防抖自动保存（重复调用重置计时，合并 patch，含新增两栏）。 */
    debouncedSaveText(date: string, patch: ReviewTextPatch): void {
      if (this.textTimer !== null) clearTimeout(this.textTimer);
      this.pendingTextDate = date;
      this.pendingTextPatch = { ...this.pendingTextPatch, ...patch };
      this.textTimer = setTimeout(() => {
        this.textTimer = null;
        void this.flush().catch(() => undefined);
      }, REVIEW_TEXT_DEBOUNCE_MS);
    },

    /** 立即保存尚未落库的文字（切日期/卸载前调用）。 */
    async flush(): Promise<void> {
      await this.flushPending({ silent: false });
    },

    async flushPending(options: { silent?: boolean } = {}): Promise<void> {
      if (this.textTimer !== null) {
        clearTimeout(this.textTimer);
        this.textTimer = null;
      }
      const date = this.pendingTextDate;
      const patch = this.pendingTextPatch;
      if (date === null || patch === null) return;
      this.pendingTextDate = null;
      this.pendingTextPatch = null;
      try {
        await this.upsertReview(date, patch);
      } catch (err) {
        if (!options.silent) throw err;
      }
    },

    /** 写库动作统一包保存状态；失败置红条并 toast 后继续抛出。 */
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
  },
});
