import { defineStore } from 'pinia';
import {
  createRecord,
  errorMessage,
  listAlive,
  listAliveByDate,
  updateRecord,
  type ExerciseEntry,
  type ExerciseSet,
  type WorkoutRecord,
  type WorkoutTemplate,
  type WorkoutType,
} from '@/db';
import { parseDateKey } from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useToastStore } from './toast';

/** 周计划里的“休息”类型名（与 PRD §5.6 一致）。 */
export const REST_TYPE_NAME = '休息';
/** 休息日临时训练记录的类型快照。 */
export const TEMP_WORKOUT_TYPE_NAME = '临时训练';
/** 无历史记录时每个动作的默认组数。 */
export const DEFAULT_SET_COUNT = 3;

/** 'YYYY-MM-DD' → 星期编号（1=周一 ~ 7=周日，与 workout_templates.weekday 一致）。 */
export function weekdayOf(dateKey: string): number {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error('非法日期：' + dateKey);
  return (d.getDay() + 6) % 7 + 1;
}

/** 当天训练/历史列表共用的动作视图（WorkoutRecord 的结构子集）。 */
export interface WorkoutDayView {
  date: string;
  type_name: string;
  exercises: ExerciseEntry[];
  duration_min: number | null;
  done: boolean;
}

export interface WorkoutTemplatePatch {
  type_name?: string;
  exercise_names?: string[];
}

/** 参与“最近一次已完成训练”查找的历史记录结构子集（便于纯函数测试）。 */
export interface WorkoutHistoryEntry {
  date: string;
  updated_at: number;
  done: boolean;
  exercises: ExerciseEntry[];
}

export function emptySets(count: number = DEFAULT_SET_COUNT): ExerciseSet[] {
  return Array.from({ length: count }, () => ({ weight_kg: null, reps: null, done: false }));
}

export function sortRecordsDesc<T extends WorkoutHistoryEntry>(records: readonly T[]): T[] {
  return [...records].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.updated_at - a.updated_at,
  );
}

/** 动作名在最近一次已完成训练里的组数值（done 重置为 false）；无历史返回 null。 */
export function latestCompletedSets(
  name: string,
  history: readonly WorkoutHistoryEntry[],
): ExerciseSet[] | null {
  const target = name.trim();
  const record = sortRecordsDesc(history).find(
    (r) => r.done && r.exercises.some((e) => e.name.trim() === target),
  );
  const entry = record?.exercises.find((e) => e.name.trim() === target);
  if (!record || !entry) return null;
  return entry.sets.map((set) => ({ weight_kg: set.weight_kg, reps: set.reps, done: false }));
}

/** 动作默认组：最近一次已完成记录里的组数与重量/次数；无历史默认 3 组空值。 */
export function defaultSetsForExercise(
  name: string,
  history: readonly WorkoutHistoryEntry[],
): ExerciseSet[] {
  return latestCompletedSets(name, history) ?? emptySets(DEFAULT_SET_COUNT);
}

export function buildExercisesFromNames(
  names: readonly string[],
  history: readonly WorkoutHistoryEntry[],
): ExerciseEntry[] {
  const result: ExerciseEntry[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name === '' || result.some((e) => e.name === name)) continue;
    result.push({ name, sets: defaultSetsForExercise(name, history) });
  }
  return result;
}

export function buildDraftForDate(
  date: string,
  week: readonly { weekday: number; type_name: string; exercise_names: string[] }[],
  history: readonly WorkoutHistoryEntry[],
): WorkoutDayView | null {
  const template = week.find((t) => t.weekday === weekdayOf(date)) ?? null;
  if (!template || template.type_name === REST_TYPE_NAME) return null;
  return {
    date,
    type_name: template.type_name,
    exercises: buildExercisesFromNames(template.exercise_names, history),
    duration_min: null,
    done: false,
  };
}

export function normalizeDurationMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const minutes = Math.floor(value);
  return minutes > 0 ? minutes : null;
}

export function normalizeWeight(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function normalizeReps(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/** 默认用时：首组勾选到完成的时间差（分钟）；不足 1 分钟或无有效时间差默认 30。 */
export function computeDefaultDuration(firstCheckAtMs: number | null, finishAtMs: number): number {
  if (firstCheckAtMs === null) return 30;
  const diffMin = Math.floor((finishAtMs - firstCheckAtMs) / 60_000);
  return diffMin < 1 ? 30 : diffMin;
}

function cloneExercises(exercises: readonly ExerciseEntry[]): ExerciseEntry[] {
  return exercises.map((e) => ({ name: e.name, sets: e.sets.map((s) => ({ ...s })) }));
}

function dedupeNames(names: readonly string[]): string[] {
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name !== '' && !result.includes(name)) result.push(name);
  }
  return result;
}

/**
 * 健身模块 store（3b）：
 * 周计划模板即时保存；当天训练按 dateStore.selectedDate 的星期几带入模板，
 * 组数值默认取最近一次已完成记录（无历史 3 组）；完成训练自动计算用时；
 * 历史记录列表可展开编辑（类型删除后靠 type_name 快照显示）。
 */
export const useWorkoutStore = defineStore('workout', {
  state: () => ({
    loading: false,
    loadedDate: null as string | null,
    week: [] as WorkoutTemplate[],
    workoutTypes: [] as WorkoutType[],
    day: null as WorkoutDayView | null,
    dayPersisted: false,
    firstCheckAtMs: null as number | null,
    history: [] as WorkoutRecord[],
  }),
  getters: {
    /** 历史动作名自动补全候选（最近记录优先）。 */
    exerciseNames(state): string[] {
      const seen = new Set<string>();
      const names: string[] = [];
      for (const record of state.history) {
        for (const exercise of record.exercises) {
          const name = exercise.name.trim();
          if (name !== '' && !seen.has(name)) {
            seen.add(name);
            names.push(name);
          }
        }
      }
      return names;
    },
  },
  actions: {
    async runWithSaveStatus<T>(fn: () => Promise<T>): Promise<T> {
      const saveStatus = useSaveStatusStore();
      saveStatus.begin();
      try {
        const result = await fn();
        saveStatus.idle();
        return result;
      } catch (err) {
        saveStatus.fail();
        useToastStore().error('保存失败：' + errorMessage(err));
        throw err;
      }
    },

    async refreshWeek(): Promise<void> {
      const [week, workoutTypes] = await Promise.all([
        listAlive('workout_templates'),
        listAlive('workout_types'),
      ]);
      this.week = week;
      this.workoutTypes = workoutTypes;
    },

    /** 载入周计划（模板按星期几全局复用，date 只做合法性校验）。 */
    async loadWeek(date: string): Promise<void> {
      if (!parseDateKey(date)) throw new Error('非法日期：' + date);
      await this.refreshWeek();
    },

    async loadDay(date: string): Promise<void> {
      if (!parseDateKey(date)) throw new Error('非法日期：' + date);
      const [rows, history] = await Promise.all([
        listAliveByDate('workout_records', date),
        listAlive('workout_records'),
      ]);
      this.history = sortRecordsDesc(history);
      const persisted = rows[0] ?? null;
      const sameDay = this.loadedDate === date;
      this.loadedDate = date;
      this.dayPersisted = persisted !== null;
      this.day = persisted ?? buildDraftForDate(date, this.week, this.history);
      // 同一日期重载（典型场景：每次保存后刷新当天记录）不能忘掉"首组勾选时刻"，
      // 否则默认用时会退回 30 分钟。只有真正换到另一天才重置。
      if (!sameDay) this.firstCheckAtMs = null;
    },

    /** 载入选中日期需要的全部数据（周计划 + 当天训练 + 历史列表）。 */
    async load(date: string): Promise<void> {
      this.loading = true;
      try {
        await this.loadWeek(date);
        await this.loadDay(date);
      } finally {
        this.loading = false;
      }
    },

    /** 历史训练记录：日期倒序（同日按更新时间倒序）。 */
    async listHistory(): Promise<WorkoutRecord[]> {
      const history = await listAlive('workout_records');
      this.history = sortRecordsDesc(history);
      return this.history;
    },

    setDay(date: string, record: WorkoutDayView | null, persisted: boolean): void {
      this.loadedDate = date;
      this.day = record;
      this.dayPersisted = persisted;
    },

    /** 周计划即时保存：按 weekday 更新或新建；类型为“休息”时清空动作列表。 */
    async saveTemplate(weekday: number, patch: WorkoutTemplatePatch): Promise<void> {
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
        throw new Error('星期编号必须是 1~7');
      }
      const existing = this.week.find((t) => t.weekday === weekday) ?? null;
      const typeName = patch.type_name ?? existing?.type_name ?? REST_TYPE_NAME;
      if (patch.type_name !== undefined && typeName !== REST_TYPE_NAME) {
        if (!this.workoutTypes.some((t) => t.name === typeName)) {
          throw new Error('训练类型不存在：' + typeName);
        }
      }
      let exerciseNames =
        patch.exercise_names !== undefined
          ? dedupeNames(patch.exercise_names)
          : [...(existing?.exercise_names ?? [])];
      if (typeName === REST_TYPE_NAME) exerciseNames = [];
      await this.runWithSaveStatus(async () => {
        if (existing) {
          await updateRecord('workout_templates', existing.id, {
            type_name: typeName,
            exercise_names: exerciseNames,
          });
        } else {
          await createRecord('workout_templates', {
            weekday,
            type_name: typeName,
            exercise_names: exerciseNames,
          });
        }
      });
      await this.refreshWeek();
    },

    /** 休息日“开始临时训练”：无记录则新建空记录（type_name=临时训练）。 */
    async startTemporaryWorkout(date: string): Promise<WorkoutRecord> {
      if (!parseDateKey(date)) throw new Error('非法日期：' + date);
      const rows = await listAliveByDate('workout_records', date);
      const existing = rows[0] ?? null;
      if (existing) {
        this.setDay(date, existing, true);
        return existing;
      }
      const created = await this.runWithSaveStatus(() =>
        createRecord('workout_records', {
          date,
          type_name: TEMP_WORKOUT_TYPE_NAME,
          exercises: [],
          duration_min: null,
          done: false,
        }),
      );
      this.setDay(date, created, true);
      await this.listHistory();
      return created;
    },

    /** 确保当天存在可编辑记录：内存草稿先落库，无记录则新建临时训练记录。 */
    async ensureDay(date: string): Promise<WorkoutRecord> {
      if (this.loadedDate === date && this.day !== null) {
        if (this.dayPersisted) {
          const day = this.day;
          return { ...day, exercises: cloneExercises(day.exercises) } as WorkoutRecord;
        }
        const draft = this.day;
        const created = await this.runWithSaveStatus(() =>
          createRecord('workout_records', {
            date: draft.date,
            type_name: draft.type_name,
            exercises: cloneExercises(draft.exercises),
            duration_min: draft.duration_min,
            done: draft.done,
          }),
        );
        this.setDay(date, created, true);
        await this.listHistory();
        return created;
      }
      const rows = await listAliveByDate('workout_records', date);
      const existing = rows[0] ?? null;
      if (existing) return existing;
      const created = await this.runWithSaveStatus(() =>
        createRecord('workout_records', {
          date,
          type_name: TEMP_WORKOUT_TYPE_NAME,
          exercises: [],
          duration_min: null,
          done: false,
        }),
      );
      if (this.loadedDate === date) this.setDay(date, created, true);
      await this.listHistory();
      return created;
    },

    async getEditableRecord(date: string): Promise<WorkoutRecord> {
      if (this.loadedDate === date && this.day !== null && !this.dayPersisted) {
        return this.ensureDay(date);
      }
      const rows = await listAliveByDate('workout_records', date);
      const record = rows[0] ?? null;
      if (!record) throw new Error('该日期还没有训练记录');
      return record;
    },

    async persistExercises(record: WorkoutRecord, exercises: ExerciseEntry[]): Promise<void> {
      await this.runWithSaveStatus(() => updateRecord('workout_records', record.id, { exercises }));
      if (this.loadedDate === record.date && this.day !== null) {
        this.day = { ...record, exercises };
      }
      await this.listHistory();
    },

    async toggleSet(date: string, exerciseIndex: number, setIndex: number): Promise<void> {
      const record = await this.getEditableRecord(date);
      const exercises = cloneExercises(record.exercises);
      const set = exercises[exerciseIndex]?.sets[setIndex];
      if (!set) throw new Error('动作或组不存在');
      set.done = !set.done;
      await this.persistExercises(record, exercises);
      if (this.loadedDate === date && this.firstCheckAtMs === null && set.done) {
        this.firstCheckAtMs = Date.now();
      }
    },

    async updateSet(
      date: string,
      exerciseIndex: number,
      setIndex: number,
      patch: { weight_kg?: number | null; reps?: number | null },
    ): Promise<void> {
      const record = await this.getEditableRecord(date);
      const exercises = cloneExercises(record.exercises);
      const set = exercises[exerciseIndex]?.sets[setIndex];
      if (!set) throw new Error('动作或组不存在');
      if (patch.weight_kg !== undefined) set.weight_kg = normalizeWeight(patch.weight_kg);
      if (patch.reps !== undefined) set.reps = normalizeReps(patch.reps);
      await this.persistExercises(record, exercises);
    },

    async addExercise(date: string, name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('动作名称不能为空');
      const record = await this.getEditableRecord(date);
      if (record.exercises.some((e) => e.name.trim() === trimmed)) return;
      const exercises = [
        ...record.exercises,
        { name: trimmed, sets: defaultSetsForExercise(trimmed, this.history) },
      ];
      await this.persistExercises(record, exercises);
    },

    async removeExercise(date: string, exerciseIndex: number): Promise<void> {
      const record = await this.getEditableRecord(date);
      if (exerciseIndex < 0 || exerciseIndex >= record.exercises.length) throw new Error('动作不存在');
      await this.persistExercises(
        record,
        record.exercises.filter((_, i) => i !== exerciseIndex),
      );
    },

    async renameExercise(date: string, exerciseIndex: number, name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('动作名称不能为空');
      const record = await this.getEditableRecord(date);
      if (exerciseIndex < 0 || exerciseIndex >= record.exercises.length) throw new Error('动作不存在');
      if (record.exercises.some((e, i) => i !== exerciseIndex && e.name.trim() === trimmed)) {
        throw new Error('已存在同名动作');
      }
      const exercises = record.exercises.map((e, i) =>
        i === exerciseIndex ? { ...e, name: trimmed } : e,
      );
      await this.persistExercises(record, exercises);
    },

    async setDuration(date: string, minutes: number | null): Promise<void> {
      const record = await this.getEditableRecord(date);
      const duration_min = normalizeDurationMinutes(minutes);
      await this.runWithSaveStatus(() =>
        updateRecord('workout_records', record.id, { duration_min }),
      );
      if (this.loadedDate === date && this.day !== null) {
        this.day = { ...this.day, duration_min };
      }
      await this.listHistory();
    },

    /** 完成训练：done=true；未手填用时则按首组勾选到完成的时间差计算（不足 1 分钟默认 30）。 */
    async finishWorkout(date?: string): Promise<WorkoutRecord> {
      const targetDate = date ?? this.loadedDate ?? '';
      if (!parseDateKey(targetDate)) throw new Error('未指定训练日期');
      const record = await this.ensureDay(targetDate);
      const firstCheck = this.loadedDate === targetDate ? this.firstCheckAtMs : null;
      const duration_min = record.duration_min ?? computeDefaultDuration(firstCheck, Date.now());
      const updated = await this.runWithSaveStatus(async () => {
        await updateRecord('workout_records', record.id, { done: true, duration_min });
        return { ...record, done: true, duration_min } as WorkoutRecord;
      });
      if (this.loadedDate === targetDate) {
        this.day = updated;
        this.dayPersisted = true;
        this.firstCheckAtMs = null;
      }
      await this.listHistory();
      return updated;
    },
  },
});
