import { defineStore } from 'pinia';
import {
  DEFAULT_SETTINGS_VALUES,
  getOldestDataCreatedAt,
  listAlive,
  listAliveByDate,
  type Book,
  type Plan,
  type PlayRecord,
  type Review,
  type StudyRecord,
  type Water,
  type WorkoutRecord,
  type WorkoutTemplate,
} from '@/db';
import { addDays, isBackupReminderDue, logicalToday, MINUTES_PER_DAY, minutesOfDay } from '@/utils/date';
import { computeWaterState, useDietStore } from '@/stores/diet';
import { addMitToPlan, sortPlansByOffset, usePlanStore } from '@/stores/plan';
import { hasReviewContent } from '@/stores/review';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import { REST_TYPE_NAME, weekdayOf } from '@/stores/workout';

/** 首页提示条种类（P1~P4）。 */
export type HomeHintKind = 'timer' | 'review' | 'rollover' | 'backup';

export interface HomeHint {
  kind: HomeHintKind;
  priority: 1 | 2 | 3 | 4;
  text: string;
  /** 点击跳转地址（action 为 rollover 时由组件执行动作，不走路由）。 */
  route: string | null;
  /** 需要执行的一键动作。 */
  action: 'rollover' | null;
}

export interface HomeHintInput {
  timerActive: boolean;
  timerTitle: string;
  timerRoute: string;
  yesterdayReviewed: boolean;
  rolloverCount: number;
  backupDue: boolean;
}

/** 按 PRD §3.1 生成候选提示（同一优先级最多一条，调用方用 pickHomeHints 取前 2）。 */
export function buildHomeHintCandidates(input: HomeHintInput): HomeHint[] {
  const candidates: HomeHint[] = [];
  if (input.timerActive) {
    candidates.push({
      kind: 'timer',
      priority: 1,
      text: input.timerTitle ? `有未结束或待结算的计时：${input.timerTitle}` : '有未结束或待结算的计时',
      route: input.timerRoute || '/study/timer',
      action: null,
    });
  }
  if (!input.yesterdayReviewed) {
    candidates.push({
      kind: 'review',
      priority: 2,
      text: '昨天还没复盘，点击去补写',
      route: '/review',
      action: null,
    });
  }
  if (input.rolloverCount > 0) {
    candidates.push({
      kind: 'rollover',
      priority: 3,
      text: `昨天有 ${input.rolloverCount} 项未完成，点击一键顺延`,
      route: null,
      action: 'rollover',
    });
  }
  if (input.backupDue) {
    candidates.push({
      kind: 'backup',
      priority: 4,
      text: '超过 7 天没有备份，点击去设置导出',
      route: '/settings',
      action: null,
    });
  }
  return candidates;
}

/** 优先级去重（同优先级只留第一条）→ 按优先级升序 → 最多取 2 条。 */
export function pickHomeHints(candidates: readonly HomeHint[]): HomeHint[] {
  const seen = new Set<number>();
  const deduped: HomeHint[] = [];
  for (const hint of candidates) {
    if (seen.has(hint.priority)) continue;
    seen.add(hint.priority);
    deduped.push(hint);
  }
  deduped.sort((a, b) => a.priority - b.priority);
  return deduped.slice(0, 2);
}

/** 未完成时间块里选“下一个”：开始偏移 >= 当前偏移的第一项；没有则取最近一个未完成时间块。 */
export function computeNextTimedPlan(plans: readonly Plan[], nowOffsetMin: number): Plan | null {
  const undone = sortPlansByOffset(plans).filter((plan) => !plan.done);
  if (undone.length === 0) return null;
  return undone.find((plan) => (plan.start_min ?? 0) >= nowOffsetMin) ?? undone[undone.length - 1] ?? null;
}

export interface TodayPlanSummary {
  done: number;
  total: number;
  next: Plan | null;
}

export function summarizeTodayPlans(plans: readonly Plan[], nowOffsetMin: number): TodayPlanSummary {
  return {
    done: plans.filter((plan) => plan.done).length,
    total: plans.length,
    next: computeNextTimedPlan(plans, nowOffsetMin),
  };
}

export interface StudyAggregate {
  totalSec: number;
  goalMin: number;
  /** 0~100 整数（超过目标封顶 100）。 */
  progressPercent: number;
}

export function computeStudyAggregate(records: readonly StudyRecord[], goalMin: number): StudyAggregate {
  const safeGoal = Number.isFinite(goalMin) && goalMin > 0 ? goalMin : 0;
  const totalSec = records.reduce((sum, record) => sum + record.duration_sec, 0);
  const progressPercent =
    safeGoal > 0 ? Math.min(100, Math.round((totalSec / (safeGoal * 60)) * 100)) : 0;
  return { totalSec, goalMin: safeGoal, progressPercent };
}

/** 在读书籍中取最近更新的一本。 */
export function pickMainReadingBook(books: readonly Book[]): Book | null {
  const reading = books.filter((book) => book.status === 'reading');
  if (reading.length === 0) return null;
  return [...reading].sort((a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at)[0] ?? null;
}

export interface PlayAggregate {
  usedMin: number;
  limitMin: number;
  remainingMin: number;
  over: boolean;
}

export function computePlayAggregate(records: readonly PlayRecord[], limitMin: number): PlayAggregate {
  const safeLimit = Number.isFinite(limitMin) && limitMin > 0 ? limitMin : 0;
  const usedMin = records.reduce((sum, record) => sum + record.minutes, 0);
  return {
    usedMin,
    limitMin: safeLimit,
    remainingMin: Math.max(0, safeLimit - usedMin),
    over: usedMin > safeLimit,
  };
}

export interface WorkoutAggregate {
  isRest: boolean;
  typeName: string | null;
  done: boolean;
}

export function computeWorkoutAggregate(
  template: WorkoutTemplate | null,
  record: WorkoutRecord | null,
): WorkoutAggregate {
  if (template === null || template.type_name === REST_TYPE_NAME) {
    return { isRest: true, typeName: null, done: false };
  }
  return { isRest: false, typeName: template.type_name, done: record?.done ?? false };
}

/**
 * 首页聚合 store（4a）：只读汇总今天，自己不写任何业务数据；
 * 所有写操作复用既有 store 动作（addMitToPlan / addWater / rollOverYesterday / toggleDone）。
 */
export const useHomeStore = defineStore('home', {
  state: () => ({
    loading: false,
    loaded: false,
    today: logicalToday(useSettingsStore().dayStartMin),
    plans: [] as Plan[],
    studyRecords: [] as StudyRecord[],
    books: [] as Book[],
    waterRecords: [] as Water[],
    todayWorkoutTemplate: null as WorkoutTemplate | null,
    todayWorkoutRecord: null as WorkoutRecord | null,
    playRecords: [] as PlayRecord[],
    yesterdayReviewed: false,
    yesterdayReview: null as Review | null,
    rolloverCount: 0,
    earliestDataAt: null as number | null,
  }),
  getters: {
    dayStartMin(): number {
      return useSettingsStore().dayStartMin;
    },
    yesterday(): string {
      return addDays(this.today, -1);
    },
    /** 当前时刻距今天起点的偏移分钟（用于“下一个时间块”选择）。 */
    nowOffsetMin(): number {
      return (minutesOfDay(Date.now()) - this.dayStartMin + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    },
    planSummary(): TodayPlanSummary {
      return summarizeTodayPlans(this.plans, this.nowOffsetMin);
    },
    study(state): StudyAggregate {
      const goal = useSettingsStore().data?.daily_study_min ?? DEFAULT_SETTINGS_VALUES.daily_study_min;
      return computeStudyAggregate(state.studyRecords, goal);
    },
    mainBook(state): Book | null {
      return pickMainReadingBook(state.books);
    },
    water(state): { totalMl: number; goalMl: number } {
      const settings = useSettingsStore().data;
      const cupMl = settings?.cup_ml ?? DEFAULT_SETTINGS_VALUES.cup_ml;
      const goalMl = settings?.daily_water_ml ?? DEFAULT_SETTINGS_VALUES.daily_water_ml;
      return { totalMl: computeWaterState(state.waterRecords, cupMl).totalMl, goalMl };
    },
    workout(): WorkoutAggregate {
      return computeWorkoutAggregate(this.todayWorkoutTemplate, this.todayWorkoutRecord);
    },
    play(state): PlayAggregate {
      const limit = useSettingsStore().data?.daily_play_min ?? DEFAULT_SETTINGS_VALUES.daily_play_min;
      return computePlayAggregate(state.playRecords, limit);
    },
    /** 昨日复盘里写下的“明天最重要的一件事”（非空才显示）。 */
    mitText(): string | null {
      const mit = this.yesterdayReview?.mit ?? '';
      const trimmed = mit.trim();
      return trimmed === '' ? null : trimmed;
    },
    mitAdded(): boolean {
      return this.yesterdayReview?.mit_added_to_plan ?? false;
    },
    backupDue(): boolean {
      return isBackupReminderDue(useSettingsStore().lastBackupAt, this.earliestDataAt);
    },
    hints(): HomeHint[] {
      const timer = useTimerStore();
      return pickHomeHints(
        buildHomeHintCandidates({
          timerActive: timer.isRunning || timer.isSettling,
          timerTitle: timer.targetTitle,
          timerRoute: timer.targetRoute,
          yesterdayReviewed: this.yesterdayReviewed,
          rolloverCount: this.rolloverCount,
          backupDue: this.backupDue,
        }),
      );
    },
    /** 设置已载入且三项每日目标都存在（种子默认值存在，正常不显示引导）。 */
    hasGoals(): boolean {
      const settings = useSettingsStore();
      const data = settings.data;
      return (
        settings.loaded &&
        data !== null &&
        Number.isFinite(data.daily_study_min) &&
        data.daily_study_min > 0 &&
        Number.isFinite(data.daily_water_ml) &&
        data.daily_water_ml > 0 &&
        Number.isFinite(data.daily_play_min) &&
        data.daily_play_min > 0
      );
    },
  },
  actions: {
    async load(): Promise<void> {
      const settings = useSettingsStore();
      const today = logicalToday(settings.dayStartMin);
      const yesterday = addDays(today, -1);
      const todayWeekday = weekdayOf(today);
      this.loading = true;
      try {
        const [plans, studyRecords, books, waterRecords, workouts, workoutRecords, playRecords, reviews, yesterdayPlans] =
          await Promise.all([
            listAliveByDate('plans', today),
            listAliveByDate('study_records', today),
            listAlive('books'),
            listAliveByDate('water', today),
            listAlive('workout_templates'),
            listAliveByDate('workout_records', today),
            listAliveByDate('play_records', today),
            listAliveByDate('reviews', yesterday),
            listAliveByDate('plans', yesterday),
          ]);
        this.today = today;
        this.plans = plans;
        this.studyRecords = studyRecords;
        this.books = books;
        this.waterRecords = waterRecords;
        this.todayWorkoutTemplate = workouts.find((template) => template.weekday === todayWeekday) ?? null;
        this.todayWorkoutRecord = workoutRecords[0] ?? null;
        this.playRecords = playRecords;
        // 与复盘页历史列表/灰点同一口径：只有真正写了内容才算已复盘，
        // 空记录行（例如点了评分又取消留下的全 null 行）不算。
        this.yesterdayReviewed = reviews.some(hasReviewContent);
        this.yesterdayReview = reviews.find((review) => (review.mit ?? '').trim() !== '') ?? null;
        this.rolloverCount = yesterdayPlans.filter((plan) => !plan.done && !plan.is_rolled_over).length;
        this.earliestDataAt = settings.lastBackupAt === null ? await getOldestDataCreatedAt() : null;
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },

    async reload(): Promise<void> {
      await this.load();
    },

    /** 喝水 +1 杯：复用 diet store，写库后刷新首页聚合。 */
    async addWater(): Promise<Water | null> {
      const created = await useDietStore().addWater(this.today, 1);
      await this.reload();
      return created;
    },

    /** 把昨日 MIT 加入今日待办：复用 plan store 导出的 addMitToPlan。 */
    async addMit(): Promise<Plan | null> {
      const created = await addMitToPlan();
      await this.reload();
      return created;
    },

    /** 一键顺延昨日未完成：复用 plan store 动作。 */
    async rollover(): Promise<number> {
      const count = await usePlanStore().rollOverYesterday();
      await this.reload();
      return count;
    },

    /** 勾选“下一项”为完成：复用 plan store 的 toggleDone。 */
    async completeNext(): Promise<void> {
      const next = this.planSummary.next;
      if (next === null) return;
      await usePlanStore().toggleDone(next);
      await this.reload();
    },
  },
});
