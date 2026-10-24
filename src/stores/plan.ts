import { defineStore } from 'pinia';
import {
  createRecord,
  errorMessage,
  listAlive,
  listAliveByDate,
  softDelete,
  undoDelete,
  updateRecord,
  type Book,
  type Plan,
  type PlanCategory,
  type Review,
  type Subject,
  type WorkoutTemplate,
} from '@/db';
import {
  MINUTES_PER_DAY,
  addDays,
  logicalToday,
  parseDateKey,
  parseTime,
  timeToOffset,
} from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useSettingsStore } from './settings';
import { useToastStore } from './toast';

/** 安排时间的快捷时长按钮（分钟）。 */
export const QUICK_DURATIONS = [30, 45, 60, 90] as const;

export type TimeRangeCheck = { ok: true } | { ok: false; reason: string };

export type ResolveTimeRangeResult =
  | { ok: true; startMin: number; endMin: number }
  | { ok: false; reason: string };

/**
 * 偏移分钟范围校验：整数、0 <= 开始 < 结束 <= 1440。
 * 偏移以“距一天起点的分钟数”表示，因此该规则同时保证时间块不跨越一天起点边界。
 */
export function validateTimeRange(startMin: number, endMin: number): TimeRangeCheck {
  if (!Number.isInteger(startMin) || startMin < 0 || startMin > MINUTES_PER_DAY) {
    return { ok: false, reason: '开始时间必须在 0~1440 分钟之间' };
  }
  if (!Number.isInteger(endMin) || endMin < 0 || endMin > MINUTES_PER_DAY) {
    return { ok: false, reason: '结束时间必须在 0~1440 分钟之间' };
  }
  if (startMin >= endMin) {
    return { ok: false, reason: '结束时间必须晚于开始时间' };
  }
  return { ok: true };
}

/**
 * 表单 HH:mm 起止 → 距一天起点的偏移分钟。
 * 结束时刻不晚于开始时刻时视为次日同一时刻（偏移 +1440，如 23:00→01:00 = 1140→1260、
 * 03:00→04:00 = 1380→1440）；换算后结束超出 1440 即跨越一天起点边界，拒绝保存。
 */
export function resolveTimeRange(
  startHhmm: string,
  endHhmm: string,
  dayStartMin: number,
): ResolveTimeRangeResult {
  try {
    parseTime(startHhmm);
    parseTime(endHhmm);
  } catch {
    return { ok: false, reason: '请输入有效的开始与结束时间（HH:mm）' };
  }
  const startMin = timeToOffset(startHhmm, dayStartMin);
  let endMin = timeToOffset(endHhmm, dayStartMin);
  if (endMin <= startMin) endMin += MINUTES_PER_DAY;
  if (endMin > MINUTES_PER_DAY) {
    return { ok: false, reason: '时间块不得跨越一天起点边界' };
  }
  return { ok: true, startMin, endMin };
}

/** 时间块：起止时间都非空（有起止时间就是时间块，没有就是待办）。 */
export function isTimedPlan(plan: Plan): boolean {
  return plan.start_min !== null && plan.end_min !== null;
}

/** 时间块按开始偏移（同开始时按结束偏移）升序排序。 */
export function sortPlansByOffset(plans: readonly Plan[]): Plan[] {
  return [...plans]
    .filter(isTimedPlan)
    .sort(
      (a, b) =>
        (a.start_min ?? 0) - (b.start_min ?? 0) || (a.end_min ?? 0) - (b.end_min ?? 0),
    );
}

/** 两个时间范围是否重叠（半开区间，首尾相接不算重叠）。 */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface TimelineLaneItem {
  plan: Plan;
  startMin: number;
  endMin: number;
  /** 0 起泳道编号；同簇内重叠块并排分配。 */
  lane: number;
  /** 该块所在重叠簇的泳道总数（簇内所有块一致）。 */
  laneCount: number;
  hasOverlap: boolean;
}

/**
 * 时间轴泳道布局：按偏移排序后把“重叠链”聚成簇，
 * 簇内贪心分配泳道（新块放进最早空闲的泳道），重叠块并排显示。
 */
export function layoutTimelineLanes(plans: readonly Plan[]): TimelineLaneItem[] {
  const sorted = sortPlansByOffset(plans);
  const clusters: Plan[][] = [];
  let current: Plan[] = [];
  let clusterEnd = -1;
  for (const plan of sorted) {
    const start = plan.start_min ?? 0;
    const end = plan.end_min ?? 0;
    if (current.length === 0 || start >= clusterEnd) {
      if (current.length > 0) clusters.push(current);
      current = [plan];
      clusterEnd = end;
    } else {
      current.push(plan);
      clusterEnd = Math.max(clusterEnd, end);
    }
  }
  if (current.length > 0) clusters.push(current);

  const items: TimelineLaneItem[] = [];
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const assigned: { plan: Plan; lane: number }[] = [];
    for (const plan of cluster) {
      const start = plan.start_min ?? 0;
      const end = plan.end_min ?? 0;
      let lane = laneEnds.findIndex((lastEnd) => lastEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      assigned.push({ plan, lane });
    }
    const laneCount = laneEnds.length;
    for (const entry of assigned) {
      items.push({
        plan: entry.plan,
        startMin: entry.plan.start_min ?? 0,
        endMin: entry.plan.end_min ?? 0,
        lane: entry.lane,
        laneCount,
        hasOverlap: laneCount > 1,
      });
    }
  }
  return items;
}

/** 'YYYY-MM-DD' → 星期编号（1=周一 ~ 7=周日，与 workout_templates.weekday 一致）。 */
export function weekdayOf(dateKey: string): number {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error(`非法日期：${dateKey}`);
  return (d.getDay() + 6) % 7 + 1;
}

/** 计划表单提交载荷（分类快照与关联快照由 store 按库内数据解析）。 */
export interface PlanFormPayload {
  title: string;
  categoryKey: string;
  startMin: number | null;
  endMin: number | null;
  targetType: 'book' | 'subject' | null;
  targetId: string | null;
  targetTitle: string | null;
}

interface ResolvedTarget {
  targetId: string;
  targetTitle: string;
}

function resolveCategory(categories: readonly PlanCategory[], key: string): PlanCategory | null {
  return categories.find((c) => (c.builtin_key !== null ? c.builtin_key === key : c.id === key)) ?? null;
}

function resolveTarget(
  books: readonly Book[],
  subjects: readonly Subject[],
  type: 'book' | 'subject' | null,
  id: string | null,
): ResolvedTarget | null {
  if (type === null || id === null) return null;
  if (type === 'book') {
    const book = books.find((b) => b.id === id);
    return book ? { targetId: book.id, targetTitle: book.title } : null;
  }
  const subject = subjects.find((s) => s.id === id);
  return subject ? { targetId: subject.id, targetTitle: subject.name } : null;
}

function validateFormPayload(
  input: PlanFormPayload,
  categories: readonly PlanCategory[],
  books: readonly Book[],
  subjects: readonly Subject[],
  current: Plan | null = null,
): { title: string; category: PlanCategory; target: ResolvedTarget | null } {
  const title = input.title.trim();
  if (title === '') throw new Error('标题不能为空');
  if (input.startMin === null && input.endMin === null) {
    // 无起止时间 = 普通待办，合法
  } else if (input.startMin === null || input.endMin === null) {
    throw new Error('请同时填写开始与结束时间');
  } else {
    const check = validateTimeRange(input.startMin, input.endMin);
    if (!check.ok) throw new Error(check.reason);
  }
  const category = resolveCategory(categories, input.categoryKey);
  if (!category) throw new Error('所选分类不存在，请重新选择');
  const isStudy = category.builtin_key === 'study';
  let target = isStudy ? resolveTarget(books, subjects, input.targetType, input.targetId) : null;
  // 编辑时关联对象已被删除（PRD §5.10）：保持原有快照继续显示，不阻止保存。
  const keepsSnapshot =
    current !== null &&
    input.targetType !== null &&
    input.targetId !== null &&
    current.target_type === input.targetType &&
    current.target_id === input.targetId;
  if (target === null && keepsSnapshot) {
    target = { targetId: input.targetId as string, targetTitle: current.target_title ?? '原名称' };
  } else if (isStudy && input.targetType !== null && target === null) {
    throw new Error('关联对象不存在，请重新选择');
  }
  return { title, category, target };
}

function planPatchFrom(
  validated: { title: string; category: PlanCategory; target: ResolvedTarget | null },
  input: PlanFormPayload,
  isStudy: boolean,
): {
  title: string;
  start_min: number | null;
  end_min: number | null;
  category_key: string;
  category_name: string;
  target_type: 'book' | 'subject' | null;
  target_id: string | null;
  target_title: string | null;
} {
  return {
    title: validated.title,
    start_min: input.startMin,
    end_min: input.endMin,
    category_key: validated.category.builtin_key ?? validated.category.id,
    category_name: validated.category.name,
    target_type: isStudy ? input.targetType : null,
    target_id: isStudy ? (validated.target?.targetId ?? null) : null,
    target_title: isStudy ? (validated.target?.targetTitle ?? null) : null,
  };
}

/**
 * 计划模块 store（2b）：
 * 计划项 CRUD / 安排时间 / 移到明天 / 一键顺延昨日未完成 /
 * 昨日“最重要的一件事”加入今日待办（addMitToPlan 导出函数供 4a 首页复用）。
 * 读/写跟随 dateStore.selectedDate（由页面调用 load(date)）；一键顺延与 MIT 始终作用于今天。
 */
export const usePlanStore = defineStore('plan', {
  state: () => ({
    loading: false,
    loadedDate: null as string | null,
    plans: [] as Plan[],
    categories: [] as PlanCategory[],
    readingBooks: [] as Book[],
    activeSubjects: [] as Subject[],
    todayWorkout: null as WorkoutTemplate | null,
    mitReview: null as Review | null,
    rolloverCount: 0,
  }),
  getters: {
    /** 时间块（按开始偏移升序）。 */
    timedPlans: (state) => sortPlansByOffset(state.plans),
    /** 无时间待办（未完成在前，完成在后）。 */
    todoPlans(state): Plan[] {
      const undone = state.plans.filter((p) => !isTimedPlan(p) && !p.done);
      const done = state.plans.filter((p) => !isTimedPlan(p) && p.done);
      return [...undone, ...done];
    },
    doneCount: (state) => state.plans.filter((p) => p.done).length,
    totalCount: (state) => state.plans.length,
    mitAdded: (state) => state.mitReview?.mit_added_to_plan ?? false,
  },
  actions: {
    /** 载入选中日期的计划 + 分类/关联对象 + 今日训练 / 昨日 MIT / 可顺延数量。 */
    async load(date: string): Promise<void> {
      const dayStartMin = useSettingsStore().dayStartMin;
      const today = logicalToday(dayStartMin);
      const yesterday = addDays(today, -1);
      const todayWeekday = weekdayOf(today);
      this.loading = true;
      try {
        const [plans, categories, books, subjects, workouts, yesterdayPlans, yesterdayReviews] =
          await Promise.all([
            listAliveByDate('plans', date),
            listAlive('plan_categories'),
            listAlive('books'),
            listAlive('subjects'),
            listAlive('workout_templates'),
            listAliveByDate('plans', yesterday),
            listAliveByDate('reviews', yesterday),
          ]);
        this.plans = plans;
        this.categories = categories;
        this.readingBooks = books.filter((b) => b.status === 'reading');
        this.activeSubjects = subjects.filter((s) => !s.archived);
        this.todayWorkout = workouts.find((w) => w.weekday === todayWeekday) ?? null;
        this.mitReview = yesterdayReviews.find((r) => (r.mit ?? '').trim() !== '') ?? null;
        this.rolloverCount = yesterdayPlans.filter((p) => !p.done && !p.is_rolled_over).length;
        this.loadedDate = date;
      } finally {
        this.loading = false;
      }
    },

    /** 重新载入当前选中日期（供变更后的动作刷新）。 */
    async reload(): Promise<void> {
      if (this.loadedDate !== null) await this.load(this.loadedDate);
    },

    /** 写库动作统一包保存状态；失败置红条并 toast 后继续抛出（弹窗表单用返回的异常展示行内错误）。 */
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

    /** 新增计划项（弹窗保存）。 */
    async createPlan(date: string, input: PlanFormPayload): Promise<Plan> {
      const validated = validateFormPayload(input, this.categories, this.readingBooks, this.activeSubjects);
      const isStudy = validated.category.builtin_key === 'study';
      const created = await this.runWithSaveStatus(() =>
        createRecord('plans', {
          ...planPatchFrom(validated, input, isStudy),
          date,
          done: false,
          done_at: null,
          rollover_from_date: null,
          is_rolled_over: false,
        }),
      );
      await this.reload();
      return created;
    },

    /** 编辑计划项（弹窗保存）；清空起止时间即变回普通待办。 */
    async updatePlan(id: string, input: PlanFormPayload): Promise<void> {
      const current = this.plans.find((p) => p.id === id) ?? null;
      const validated = validateFormPayload(
        input,
        this.categories,
        this.readingBooks,
        this.activeSubjects,
        current,
      );
      const isStudy = validated.category.builtin_key === 'study';
      await this.runWithSaveStatus(() =>
        updateRecord('plans', id, planPatchFrom(validated, input, isStudy)),
      );
      await this.reload();
    },

    /** 完成勾选为一键动作：done 与 done_at 同写同清。 */
    async toggleDone(plan: Plan): Promise<void> {
      const next = !plan.done;
      await this.runWithSaveStatus(() =>
        updateRecord('plans', plan.id, { done: next, done_at: next ? Date.now() : null }),
      );
      await this.reload();
    },

    /** 删除走软删除 + 5 秒撤销。 */
    async softDeletePlan(plan: Plan): Promise<void> {
      await this.runWithSaveStatus(() => softDelete('plans', plan.id));
      await this.reload();
      useToastStore().undoable(`已删除计划“${plan.title}”`, async () => {
        try {
          await undoDelete('plans', plan.id);
          await this.reload();
        } catch (err) {
          useToastStore().error(`撤销失败：${errorMessage(err)}`);
        }
      });
    },

    /** 移到明天：未完成项日期 +1 天（一键动作）。 */
    async moveToTomorrow(plan: Plan): Promise<void> {
      if (plan.done) return;
      await this.runWithSaveStatus(() => updateRecord('plans', plan.id, { date: addDays(plan.date, 1) }));
      await this.reload();
    },

    /**
     * 一键顺延昨日未完成：原记录留在昨天并置 is_rolled_over=true（保留昨日分母），
     * 同时在今天克隆新待办（清空起止时间、rollover_from_date=昨天、is_rolled_over=false，
     * 标题/分类/关联快照相同）。始终作用于“今天”。
     * 进行中的顺延复用同一 promise（防连点重复克隆）。
     */
    async rollOverYesterday(): Promise<number> {
      rolloverInFlight ??= this.doRollOver().finally(() => {
        rolloverInFlight = null;
      });
      return rolloverInFlight;
    },
    async doRollOver(): Promise<number> {
      const dayStartMin = useSettingsStore().dayStartMin;
      const today = logicalToday(dayStartMin);
      const yesterday = addDays(today, -1);
      const candidates = (await listAliveByDate('plans', yesterday)).filter(
        (p) => !p.done && !p.is_rolled_over,
      );
      if (candidates.length === 0) return 0;
      await this.runWithSaveStatus(async () => {
        for (const original of candidates) {
          await updateRecord('plans', original.id, { is_rolled_over: true });
          await createRecord('plans', {
            title: original.title,
            date: today,
            start_min: null,
            end_min: null,
            category_key: original.category_key,
            category_name: original.category_name,
            target_type: original.target_type,
            target_id: original.target_id,
            target_title: original.target_title,
            done: false,
            done_at: null,
            rollover_from_date: yesterday,
            is_rolled_over: false,
          });
        }
      });
      await this.reload();
      useToastStore().success(`已把 ${candidates.length} 项昨日未完成顺延到今天`);
      return candidates.length;
    },

    /** 页面按钮动作：调用导出的 addMitToPlan() 后刷新 MIT 状态。 */
    async addMit(): Promise<Plan | null> {
      const created = await addMitToPlan();
      await this.reload();
      return created;
    },
  },
});

let mitInFlight: Promise<Plan | null> | null = null;
let rolloverInFlight: Promise<number> | null = null;

/**
 * 把昨天复盘的“明天最重要的一件事”加入今日待办（防重复）：
 * 生成今日无起止时间待办（分类=内置“其他”、done=false），并把该 review 的
 * mit_added_to_plan 置 true。没有可加入的 MIT 或已加入过时返回 null。
 * 始终作用于“今天”；进行中的调用复用同一 promise（防连点重复添加）。（4a 首页复用此函数。）
 */
export function addMitToPlan(): Promise<Plan | null> {
  mitInFlight ??= runMitAdd().finally(() => {
    mitInFlight = null;
  });
  return mitInFlight;
}

async function runMitAdd(): Promise<Plan | null> {
  const dayStartMin = useSettingsStore().dayStartMin;
  const today = logicalToday(dayStartMin);
  const yesterday = addDays(today, -1);
  const reviews = await listAliveByDate('reviews', yesterday);
  const review = reviews.find((r) => (r.mit ?? '').trim() !== '') ?? null;
  if (!review || review.mit_added_to_plan) return null;
  const mit = (review.mit ?? '').trim();
  const saveStatus = useSaveStatusStore();
  saveStatus.begin();
  try {
    const created = await createRecord('plans', {
      title: mit,
      date: today,
      start_min: null,
      end_min: null,
      category_key: 'other',
      category_name: '其他',
      target_type: null,
      target_id: null,
      target_title: null,
      done: false,
      done_at: null,
      rollover_from_date: null,
      is_rolled_over: false,
    });
    await updateRecord('reviews', review.id, { mit_added_to_plan: true });
    saveStatus.idle();
    return created;
  } catch (err) {
    saveStatus.fail();
    useToastStore().error(`保存失败：${errorMessage(err)}`);
    throw err;
  }
}
