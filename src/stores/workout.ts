import { defineStore } from 'pinia';
import {
  createRecord,
  errorMessage,
  getRecord,
  isAlive,
  listAlive,
  listAliveByDate,
  softDelete,
  undoDelete,
  updateRecord,
  type Exercise,
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

/**
 * 从历史训练记录里推导每个动作“最后一次被记录”的时间戳：
 * 取最近一条（日期倒序、同日 updated_at 倒序）包含该动作的记录的 updated_at。
 * 没有历史的动作不出现在结果里。
 */
export function lastUsedAtByName(
  history: readonly WorkoutHistoryEntry[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of sortRecordsDesc(history)) {
    for (const entry of record.exercises) {
      const name = entry.name.trim();
      if (name === '' || map.has(name)) continue;
      map.set(name, record.updated_at);
    }
  }
  return map;
}

/**
 * 项目库排序：最近使用过的动作排在前面（按历史推导的最后使用时间倒序），
 * 没有历史的排后面，最后按名字升序（码点序，稳定可断言）。同名去重、去空。
 */
export function recentOrder(
  names: readonly string[],
  history: readonly WorkoutHistoryEntry[],
): string[] {
  const used = lastUsedAtByName(history);
  const unique = dedupeNames(names);
  return unique.sort((a, b) => {
    const ua = used.get(a);
    const ub = used.get(b);
    if (ua !== undefined && ub !== undefined) {
      if (ua !== ub) return ub - ua;
    } else if (ua !== undefined) {
      return -1;
    } else if (ub !== undefined) {
      return 1;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
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
  return exercises.map((e) => ({
    name: e.name,
    sets: e.sets.map((s) => ({ ...s })),
    // 备注必须随克隆一起保留，否则改组数/勾选等操作会把已有备注抹掉
    note: e.note ?? null,
  }));
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
    /** 训练项目库（exercises 表有效行，原样保存，排序由 getter 计算）。 */
    exerciseLibrary: [] as Exercise[],
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

    /** 项目库动作名列表（旧接口，等价于 libraryItems 的名字）：最近使用优先，无历史按名字升序。 */
    libraryNames(state): string[] {
      const names = state.exerciseLibrary.map((e) => e.name.trim()).filter((n) => n !== '');
      return recentOrder(names, state.history);
    },

    /**
     * 项目库区块的条目：{ id, name }，排序同 libraryNames。
     * 带 id 是为了支持删除（软删除按 id 走），同名多条只取最前面一条。
     */
    libraryItems(state): { id: string; name: string }[] {
      const byName = new Map<string, { id: string; name: string }>();
      for (const row of state.exerciseLibrary) {
        const name = row.name.trim();
        if (name === '' || byName.has(name)) continue;
        byName.set(name, { id: row.id, name });
      }
      return recentOrder([...byName.keys()], state.history).map(
        (name) => byName.get(name) as { id: string; name: string },
      );
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
      const [week, workoutTypes, exerciseLibrary] = await Promise.all([
        listAlive('workout_templates'),
        listAlive('workout_types'),
        listAlive('exercises'),
      ]);
      this.week = week;
      this.workoutTypes = workoutTypes;
      this.exerciseLibrary = exerciseLibrary;
    },

    /** 重新载入训练项目库（exercises 表有效行）。 */
    async refreshLibrary(): Promise<void> {
      this.exerciseLibrary = await listAlive('exercises');
    },

    /**
     * 把动作名 upsert 进项目库：同名（trim 后完全相等）已有有效行则不新增；
     * 软删除行视为不存在，直接新建一条有效行（不复活旧行）。
     */
    async upsertLibraryExercise(name: string): Promise<void> {
      const trimmed = name.trim();
      if (trimmed === '') return;
      const rows = await listAlive('exercises');
      if (rows.some((row) => row.name.trim() === trimmed)) return;
      await createRecord('exercises', { name: trimmed });
      await this.refreshLibrary();
    },

    /**
     * 项目库新建动作：trim 后为空抛错；同名（trim 后相等）已有有效行则直接复用那一条，
     * 不产生第二条。返回库里的那一条（新建或复用的）。
     */
    async createLibraryExercise(name: string): Promise<Exercise> {
      const trimmed = name.trim();
      if (trimmed === '') throw new Error('动作名称不能为空');
      const rows = await listAlive('exercises');
      const existing = rows.find((row) => row.name.trim() === trimmed);
      if (existing) return existing;
      const created = await this.runWithSaveStatus(() =>
        createRecord('exercises', { name: trimmed }),
      );
      await this.refreshLibrary();
      return created;
    },

    /**
     * 项目库删除动作：软删除 + 5 秒撤销。
     * 当天/历史训练记录里已有的动作**不动**（记录存的是名字快照，与项目库解耦）。
     */
    async deleteLibraryExercise(id: string): Promise<boolean> {
      const row = await getRecord('exercises', id);
      if (!row || !isAlive(row)) return false;
      await this.runWithSaveStatus(() => softDelete('exercises', id));
      await this.refreshLibrary();
      useToastStore().undoable('已删除动作，可撤销', async () => {
        await this.runWithSaveStatus(() => undoDelete('exercises', id));
        await this.refreshLibrary();
      });
      return true;
    },

    /**
     * 项目库改名：撞同名（另一条有效行）时**合并** —— 被改的那条软删除，保留已有的同名条目；
     * 没有撞名则直接改名。返回合并/改名后仍然有效的那一条。
     */
    async renameLibraryExercise(id: string, name: string): Promise<Exercise | null> {
      const trimmed = name.trim();
      if (trimmed === '') throw new Error('动作名称不能为空');
      const rows = await listAlive('exercises');
      const target = rows.find((row) => row.id === id) ?? null;
      if (target === null) return null;
      if (target.name.trim() === trimmed) return target;

      const duplicate = rows.find((row) => row.id !== id && row.name.trim() === trimmed) ?? null;
      if (duplicate !== null) {
        await this.runWithSaveStatus(() => softDelete('exercises', id));
        await this.refreshLibrary();
        return duplicate;
      }
      await this.runWithSaveStatus(() => updateRecord('exercises', id, { name: trimmed }));
      await this.refreshLibrary();
      return (await getRecord('exercises', id)) ?? null;
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
      // 项目库自动维护：模板里的动作名一并 upsert（休息日 exerciseNames 已清空）
      for (const name of exerciseNames) {
        await this.upsertLibraryExercise(name);
      }
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

    /**
     * 一键把某个动作的所有组标记为完成（Q2：默认 3 组，逐组点太累）。
     * 已经全部完成时不做任何写入（幂等），组数据保持不变。
     */
    async completeExercise(date: string, exerciseIndex: number): Promise<void> {
      const record = await this.getEditableRecord(date);
      const exercises = cloneExercises(record.exercises);
      const exercise = exercises[exerciseIndex];
      if (!exercise) throw new Error('动作不存在');
      if (exercise.sets.every((set) => set.done)) return;
      for (const set of exercise.sets) set.done = true;
      await this.persistExercises(record, exercises);
      if (this.loadedDate === date && this.firstCheckAtMs === null) {
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
      // 先拿到"可编辑的当天记录"再写项目库：休息日里拿记录失败的场景不会留下
      // "库里有、今天没加上"的一半状态（P6-1）。
      const record = await this.getEditableRecord(date);
      if (!record.exercises.some((e) => e.name.trim() === trimmed)) {
        const exercises = [
          ...record.exercises,
          { name: trimmed, sets: defaultSetsForExercise(trimmed, this.history) },
        ];
        await this.persistExercises(record, exercises);
      }
      // 项目库自动维护：即使当天已有同名动作，也确保项目库里有这一条（幂等）
      await this.upsertLibraryExercise(trimmed);
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
      await this.upsertLibraryExercise(trimmed);
    },

    /** 设置动作备注（trim 后为空存 null，清空即置 null）；走 persistExercises 即时落库。 */
    async setExerciseNote(
      date: string,
      exerciseIndex: number,
      note: string | null,
    ): Promise<void> {
      const record = await this.getEditableRecord(date);
      if (exerciseIndex < 0 || exerciseIndex >= record.exercises.length) {
        throw new Error('动作不存在');
      }
      const trimmed = note === null ? '' : note.trim();
      const exercises = cloneExercises(record.exercises);
      const target = exercises[exerciseIndex];
      if (!target) throw new Error('动作不存在');
      target.note = trimmed === '' ? null : trimmed;
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
