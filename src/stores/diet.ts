import { defineStore } from 'pinia';
import {
  DEFAULT_SETTINGS_VALUES,
  createRecord,
  errorMessage,
  listAlive,
  listAliveByDate,
  softDelete,
  undoDelete,
  updateRecord,
  type Meal,
  type MealBuiltinKey,
  type MealType,
  type Water,
} from '@/db';
import { addDays } from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useSettingsStore } from './settings';
import { useToastStore } from './toast';

export type MealFeeling = Meal['feeling'];

export interface MealSectionInfo {
  key: string;
  name: string;
}

export interface WaterState {
  totalMl: number;
  cups: number;
}

export const FEELING_LABELS: Record<NonNullable<MealFeeling>, string> = {
  full: '吃饱',
  not_full: '没吃饱',
  overeat: '吃多了',
};

export const QUICK_MEAL_LIMIT = 8;

/** 单条餐食最多几张照片（AC-86）：3 张够看清"吃了什么"，也不至于把备份撑大。 */
export const MEAL_PHOTO_LIMIT = 3;

const BUILTIN_MEAL_ORDER: readonly MealBuiltinKey[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * 常吃快捷项统计（纯函数）：按餐次独立统计全部有效历史记录中
 * 各内容出现频次，频次相同取最近录入（created_at 最大），取前 limit 项。
 */
export function computeTopFrequent(meals: readonly Meal[], mealKey: string, limit = QUICK_MEAL_LIMIT): string[] {
  const stats = new Map<string, { count: number; latest: number }>();
  for (const meal of meals) {
    if (meal.deleted_at !== null || meal.meal_key !== mealKey) continue;
    const text = meal.text.trim();
    if (text === '') continue;
    const entry = stats.get(text) ?? { count: 0, latest: 0 };
    entry.count += 1;
    entry.latest = Math.max(entry.latest, meal.created_at);
    stats.set(text, entry);
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([text]) => text);
}

/** 喝水汇总（纯函数）：总量保底 0，杯数 = 总量 / 杯量向下取整。 */
export function computeWaterState(records: readonly Water[], cupMl: number): WaterState {
  const cup = Number.isFinite(cupMl) && cupMl > 0 ? cupMl : DEFAULT_SETTINGS_VALUES.cup_ml;
  const totalMl = Math.max(
    0,
    records.filter((r) => r.deleted_at === null).reduce((sum, r) => sum + r.ml, 0),
  );
  return { totalMl, cups: Math.floor(totalMl / cup) };
}

/** 喝水写库按日期串行：-1 杯的 0 保底依赖“读总数→写负记录”的先后顺序。 */
let waterChain: Promise<unknown> = Promise.resolve();

/**
 * 饮食模块 store（3a）：
 * 读/写全部跟随 dateStore.selectedDate（页面调用 loadMealData(date)）；
 * 餐食记录带 meal_key（内置写 builtin_key、自定义写行 id）与 meal_name 快照；
 * 常吃快捷项按餐次隔离统计；喝水 +1/-1 杯（杯量来自设置，总量保底 0 ml）。
 */
export const useDietStore = defineStore('diet', {
  state: () => ({
    loading: false,
    loadedDate: null as string | null,
    meals: [] as Meal[],
    waterRecords: [] as Water[],
    mealTypes: [] as MealType[],
    /** 全部有效餐食记录（常吃快捷项统计用，跨全部日期）。 */
    allMeals: [] as Meal[],
  }),
  getters: {
    /** 有效餐次行（内置按 早/午/晚/加餐 顺序，自定义按创建时间）。 */
    mealSections(state): MealSectionInfo[] {
      const builtins = state.mealTypes
        .filter((m): m is MealType & { builtin_key: MealBuiltinKey } => m.builtin_key !== null)
        .sort((a, b) => BUILTIN_MEAL_ORDER.indexOf(a.builtin_key) - BUILTIN_MEAL_ORDER.indexOf(b.builtin_key));
      const customs = state.mealTypes
        .filter((m) => m.builtin_key === null)
        .sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name));
      return [...builtins, ...customs].map((m) => ({ key: m.builtin_key ?? m.id, name: m.name }));
    },
    /** 当前选中日期的餐食（按餐次过滤）。 */
    mealsFor(state): (mealKey: string) => Meal[] {
      return (mealKey: string) => state.meals.filter((m) => m.meal_key === mealKey);
    },
    /** 当前选中日期总水量（保底 0 ml）。 */
    waterTotalMl(state): number {
      return Math.max(0, state.waterRecords.reduce((sum, r) => sum + r.ml, 0));
    },
    /** 当前选中日期已喝杯数（每满一杯亮一个圆点）。 */
    waterCups(state): number {
      const cup = useSettingsStore().data?.cup_ml ?? DEFAULT_SETTINGS_VALUES.cup_ml;
      if (!Number.isFinite(cup) || cup <= 0) return 0;
      return Math.floor(
        Math.max(0, state.waterRecords.reduce((sum, r) => sum + r.ml, 0)) / cup,
      );
    },
  },
  actions: {
    /** 载入选中日期的餐食/喝水 + 全部有效餐次与历史餐食（快捷项统计用）。 */
    async loadMealData(date: string): Promise<void> {
      this.loading = true;
      try {
        const [meals, waterRecords, mealTypes, allMeals] = await Promise.all([
          listAliveByDate('meals', date),
          listAliveByDate('water', date),
          listAlive('meal_types'),
          listAlive('meals'),
        ]);
        this.meals = meals;
        this.waterRecords = waterRecords;
        this.mealTypes = mealTypes;
        this.allMeals = allMeals;
        this.loadedDate = date;
      } finally {
        this.loading = false;
      }
    },

    /** 重新载入当前选中日期（供变更后的动作刷新）。 */
    async reload(): Promise<void> {
      if (this.loadedDate !== null) await this.loadMealData(this.loadedDate);
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

    /** 添加一条餐食：meal_name 快照以库内当前餐次名为准；可带照片（AC-86）。 */
    async addMealItem(
      date: string,
      mealKey: string,
      mealName: string,
      text: string,
      feeling: MealFeeling = null,
      photos: string[] = [],
    ): Promise<Meal> {
      const trimmed = text.trim();
      if (trimmed === '') throw new Error('餐食内容不能为空');
      const section = this.mealTypes.find((m) => (m.builtin_key ?? m.id) === mealKey);
      const created = await this.runWithSaveStatus(() =>
        createRecord('meals', {
          date,
          meal_key: mealKey,
          meal_name: section?.name ?? mealName,
          text: trimmed,
          feeling,
          ...(photos.length > 0 ? { photos: photos.slice(0, MEAL_PHOTO_LIMIT) } : {}),
        }),
      );
      await this.reload();
      return created;
    },

    /** 编辑餐食文字、感受与照片（可选；文字不能为空）。 */
    async updateMealItem(
      id: string,
      patch: { text?: string; feeling?: MealFeeling; photos?: string[] },
    ): Promise<void> {
      const changes: Partial<Meal> = {};
      if (patch.text !== undefined) {
        const trimmed = patch.text.trim();
        if (trimmed === '') throw new Error('餐食内容不能为空');
        changes.text = trimmed;
      }
      if (patch.feeling !== undefined) changes.feeling = patch.feeling;
      if (patch.photos !== undefined) changes.photos = patch.photos.slice(0, MEAL_PHOTO_LIMIT);
      if (Object.keys(changes).length === 0) return;
      await this.runWithSaveStatus(() => updateRecord('meals', id, changes));
      await this.reload();
    },

    /** 删除走软删除 + 5 秒撤销。 */
    async softDeleteMeal(meal: Meal): Promise<void> {
      await this.runWithSaveStatus(() => softDelete('meals', meal.id));
      await this.reload();
      useToastStore().undoable(`已删除“${meal.text}”`, async () => {
        try {
          await undoDelete('meals', meal.id);
          await this.reload();
        } catch (err) {
          useToastStore().error(`撤销失败：${errorMessage(err)}`);
        }
      });
    },

    /**
     * 复制“当前查看日期的前一天”同一餐次的全部餐食项到当前查看日期。
     * 快照字段（meal_name/text/feeling）原样复制；无源记录返回 0 并提示。
     */
    async copyYesterdayMeal(mealKey: string): Promise<number> {
      const date = this.loadedDate;
      if (date === null) return 0;
      const yesterday = addDays(date, -1);
      const source = (await listAliveByDate('meals', yesterday)).filter((m) => m.meal_key === mealKey);
      if (source.length === 0) {
        useToastStore().info('昨天这一餐还没有记录');
        return 0;
      }
      const section = this.mealTypes.find((m) => (m.builtin_key ?? m.id) === mealKey);
      const mealName = section?.name ?? source[0]?.meal_name ?? '这一餐';
      await this.runWithSaveStatus(async () => {
        for (const meal of source) {
          await createRecord('meals', {
            date,
            meal_key: meal.meal_key,
            meal_name: mealName,
            text: meal.text,
            feeling: meal.feeling,
            // 照片也一起复制（AC-86）：常吃的东西照片往往就是同一张
            ...(meal.photos && meal.photos.length > 0 ? { photos: [...meal.photos] } : {}),
          });
        }
      });
      await this.reload();
      useToastStore().success(`已复制昨天的${mealName} ${source.length} 项`);
      return source.length;
    },

    /** 常吃快捷项：按餐次统计全部历史记录中的前 limit 项（同步，依赖已载入的 allMeals）。 */
    topFrequentItems(mealKey: string, limit = QUICK_MEAL_LIMIT): string[] {
      return computeTopFrequent(this.allMeals, mealKey, limit);
    },

    /** 指定日期的喝水汇总（供复盘等只读场景直接查询）。 */
    async waterState(date: string): Promise<WaterState> {
      const records = await listAliveByDate('water', date);
      const cup = useSettingsStore().data?.cup_ml ?? DEFAULT_SETTINGS_VALUES.cup_ml;
      return computeWaterState(records, cup);
    },

    /**
     * 喝水打卡：delta 为 +1/-1 杯。杯量读 settings.cup_ml；
     * -1 时先算当前日总量，最多扣到 0（不足一杯只扣剩余量，不写负到 0 以下）。
     */
    addWater(date: string, delta: number): Promise<Water | null> {
      const op = waterChain.then(() => this.doAddWater(date, delta));
      waterChain = op.then(
        () => undefined,
        () => undefined,
      );
      return op;
    },

    async doAddWater(date: string, delta: number): Promise<Water | null> {
      if (delta !== 1 && delta !== -1) throw new Error('喝水增量只能是 +1 杯或 -1 杯');
      const cup = useSettingsStore().data?.cup_ml ?? DEFAULT_SETTINGS_VALUES.cup_ml;
      if (!Number.isInteger(cup) || cup <= 0) throw new Error('杯量设置无效');
      if (delta === -1) {
        const records = await listAliveByDate('water', date);
        const total = records.reduce((sum, r) => sum + r.ml, 0);
        if (total <= 0) return null;
        const created = await this.runWithSaveStatus(() =>
          createRecord('water', { date, ml: -Math.min(cup, total), at: Date.now() }),
        );
        await this.reload();
        return created;
      }
      const created = await this.runWithSaveStatus(() =>
        createRecord('water', { date, ml: cup, at: Date.now() }),
      );
      await this.reload();
      return created;
    },
  },
});
