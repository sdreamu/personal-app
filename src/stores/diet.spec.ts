import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  addCategory,
  createRecord,
  getRecord,
  getSettings,
  listAlive,
  listAliveByDate,
  resetDbForTests,
  type Meal,
  type Water,
} from '@/db';
import { computeTopFrequent, computeWaterState, useDietStore } from '@/stores/diet';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';

/** 2026-06-01 是周一（today=2026-06-01，yesterday=2026-05-31，前天=2026-05-30）。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';
const DAY_BEFORE = '2026-05-30';

let pinia: Pinia;
let store: ReturnType<typeof useDietStore>;

function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

type MealData = Omit<Meal, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

function makeMealData(
  date: string,
  mealKey: string,
  mealName: string,
  text: string,
  overrides: Partial<MealData> = {},
): MealData {
  return { date, meal_key: mealKey, meal_name: mealName, text, feeling: null, ...overrides };
}

function makeMeal(text: string, mealKey = 'breakfast', createdAt: number, id = 'id-' + text + '-' + createdAt): Meal {
  return {
    ...makeMealData('2026-06-01', mealKey, '早', text),
    id,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
  };
}

function makeWater(ml: number): Water {
  return {
    id: 'w-' + Math.random().toString(36).slice(2),
    date: '2026-06-01',
    ml,
    at: 1,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().load();
  store = useDietStore();
  useFakeDate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('常吃快捷项统计（纯函数）', () => {
  it('按频次降序；频次相同取最近录入；最多返回 limit 项', () => {
    const meals = [
      makeMeal('面包', 'breakfast', 300),
      makeMeal('牛奶', 'breakfast', 150),
      makeMeal('牛奶', 'breakfast', 180),
      makeMeal('鸡蛋', 'breakfast', 100),
      makeMeal('鸡蛋', 'breakfast', 200),
    ];
    expect(computeTopFrequent(meals, 'breakfast')).toEqual(['鸡蛋', '牛奶', '面包']);
    expect(computeTopFrequent(meals, 'breakfast', 2)).toEqual(['鸡蛋', '牛奶']);
  });

  it('按餐次隔离：早餐统计绝不混入午餐，反之亦然', () => {
    const meals = [
      makeMeal('鸡蛋', 'breakfast', 100),
      makeMeal('鸡蛋', 'breakfast', 200),
      makeMeal('鸡蛋', 'lunch', 300),
      makeMeal('牛奶', 'lunch', 400),
      makeMeal('牛奶', 'lunch', 500),
    ];
    expect(computeTopFrequent(meals, 'breakfast')).toEqual(['鸡蛋']);
    expect(computeTopFrequent(meals, 'lunch')).toEqual(['牛奶', '鸡蛋']);
    expect(computeTopFrequent(meals, 'snack')).toEqual([]);
  });

  it('软删除与空白内容不参与统计', () => {
    const softDeleted = makeMeal('鸡蛋', 'breakfast', 200);
    softDeleted.deleted_at = 300;
    const meals = [makeMeal('鸡蛋', 'breakfast', 100), softDeleted, makeMeal('   ', 'breakfast', 400)];
    expect(computeTopFrequent(meals, 'breakfast')).toEqual(['鸡蛋']);
  });
});

describe('喝水汇总（纯函数）', () => {
  it('总量 = 正负记录求和，杯数向下取整；总量保底 0', () => {
    expect(computeWaterState([makeWater(250), makeWater(250), makeWater(-100)], 250)).toEqual({
      totalMl: 400,
      cups: 1,
    });
    expect(computeWaterState([makeWater(250), makeWater(250)], 250)).toEqual({ totalMl: 500, cups: 2 });
    expect(computeWaterState([makeWater(-250)], 250)).toEqual({ totalMl: 0, cups: 0 });
    expect(computeWaterState([], 250)).toEqual({ totalMl: 0, cups: 0 });
  });

  it('杯量非法时回退默认 250 ml', () => {
    expect(computeWaterState([makeWater(500)], 0).cups).toBe(2);
    expect(computeWaterState([makeWater(500)], Number.NaN).cups).toBe(2);
  });
});

describe('loadMealData', () => {
  it('只载入选中日期的餐食与喝水，餐次列表全量、历史餐食全量供快捷项统计', async () => {
    await createRecord('meals', makeMealData(TODAY, 'breakfast', '早', '今天早餐'));
    await createRecord('meals', makeMealData(YESTERDAY, 'breakfast', '早', '昨天早餐'));
    await createRecord('water', { date: TODAY, ml: 250, at: BASE });
    await createRecord('water', { date: YESTERDAY, ml: 500, at: BASE });

    await store.loadMealData(TODAY);
    expect(store.loadedDate).toBe(TODAY);
    expect(store.meals.map((m) => m.text)).toEqual(['今天早餐']);
    expect(store.waterRecords.map((w) => w.ml)).toEqual([250]);
    expect(store.mealTypes.map((m) => m.builtin_key).sort()).toEqual(
      ['breakfast', 'lunch', 'dinner', 'snack'].sort(),
    );
    expect(store.allMeals.map((m) => m.text).sort()).toEqual(['今天早餐', '昨天早餐'].sort());
    expect(store.mealSections.map((s) => s.name)).toEqual(['早', '午', '晚', '加餐']);
  });
});

describe('餐食 CRUD（快照与餐次隔离）', () => {
  it('内置餐次写 builtin_key、自定义餐次写行 id，均带 meal_name 快照', async () => {
    await store.loadMealData(TODAY);
    const builtin = await store.addMealItem(TODAY, 'breakfast', '早', '鸡蛋');
    expect(builtin.meal_key).toBe('breakfast');
    expect(builtin.meal_name).toBe('早');

    const custom = await addCategory('meal_types', '夜宵');
    await store.loadMealData(TODAY);
    const customMeal = await store.addMealItem(TODAY, custom.id, '夜宵', '牛奶');
    expect(customMeal.meal_key).toBe(custom.id);
    expect(customMeal.meal_name).toBe('夜宵');
    expect(store.mealSections.map((s) => s.name)).toEqual(['早', '午', '晚', '加餐', '夜宵']);

    const rows = await listAliveByDate('meals', TODAY);
    expect(rows).toHaveLength(2);
    const builtinRow = rows.find((r) => r.meal_key === 'breakfast');
    const customRow = rows.find((r) => r.meal_key === custom.id);
    expect([builtinRow?.meal_name, builtinRow?.text]).toEqual(['早', '鸡蛋']);
    expect([customRow?.meal_name, customRow?.text]).toEqual(['夜宵', '牛奶']);
  });

  it('addMealItem：空白内容拒绝且不写入', async () => {
    await store.loadMealData(TODAY);
    await expect(store.addMealItem(TODAY, 'breakfast', '早', '   ')).rejects.toThrow('餐食内容不能为空');
    expect(await listAliveByDate('meals', TODAY)).toHaveLength(0);
  });

  it('updateMealItem：修改文字与感受；空白文字拒绝且原记录不变', async () => {
    await store.loadMealData(TODAY);
    const meal = await store.addMealItem(TODAY, 'breakfast', '早', '鸡蛋');
    await store.updateMealItem(meal.id, { text: '煎蛋', feeling: 'full' });
    let row = await getRecord('meals', meal.id);
    expect(row?.text).toBe('煎蛋');
    expect(row?.feeling).toBe('full');

    await expect(store.updateMealItem(meal.id, { text: '  ' })).rejects.toThrow('餐食内容不能为空');
    row = await getRecord('meals', meal.id);
    expect(row?.text).toBe('煎蛋');
  });

  it('softDeleteMeal：软删除 + 5 秒撤销恢复', async () => {
    await store.loadMealData(TODAY);
    const meal = await store.addMealItem(TODAY, 'breakfast', '早', '要删的');
    await store.softDeleteMeal(meal);
    expect((await getRecord('meals', meal.id))?.deleted_at).not.toBeNull();
    expect(await listAliveByDate('meals', TODAY)).toHaveLength(0);

    const undoToast = useToastStore().items.find((i) => i.undo !== null);
    expect(undoToast?.message).toContain('已删除');
    await undoToast?.undo?.action();
    expect((await getRecord('meals', meal.id))?.deleted_at).toBeNull();
    expect(await listAliveByDate('meals', TODAY)).toHaveLength(1);
  });
});

describe('复制昨天这一餐', () => {
  it('把当前查看日期的前一天同餐次全部项复制过来；跨餐次/跨日期不复制', async () => {
    await createRecord('meals', makeMealData(YESTERDAY, 'breakfast', '早', '鸡蛋'));
    await createRecord('meals', makeMealData(YESTERDAY, 'breakfast', '早', '牛奶'));
    await createRecord('meals', makeMealData(YESTERDAY, 'lunch', '午', '沙拉'));
    await createRecord('meals', makeMealData(DAY_BEFORE, 'breakfast', '早', '前天旧餐'));
    await store.loadMealData(TODAY);

    const count = await store.copyYesterdayMeal('breakfast');
    expect(count).toBe(2);
    const todayBreakfast = (await listAliveByDate('meals', TODAY)).map((m) => m.text).sort();
    expect(todayBreakfast).toEqual(['牛奶', '鸡蛋'].sort());
    const yesterdayRows = await listAliveByDate('meals', YESTERDAY);
    expect(yesterdayRows).toHaveLength(3); // 昨天的记录保持原样

    await expect(store.copyYesterdayMeal('snack')).resolves.toBe(0);
    expect(useToastStore().items.some((i) => i.message.includes('昨天这一餐还没有记录'))).toBe(true);
  });

  it('查看昨天时，复制前天同一餐次到昨天（跟随当前查看日期）', async () => {
    await createRecord('meals', makeMealData(DAY_BEFORE, 'breakfast', '早', '前天早餐'));
    await store.loadMealData(YESTERDAY);
    const count = await store.copyYesterdayMeal('breakfast');
    expect(count).toBe(1);
    expect((await listAliveByDate('meals', YESTERDAY)).map((m) => m.text)).toEqual(['前天早餐']);
  });
});

describe('喝水 +1/-1 与 0 保底', () => {
  it('+1 三次再 -1 显示 500 ml；连续 -1 扣到 0 后不再写负记录', async () => {
    await store.loadMealData(TODAY);
    const cup = (await getSettings()).cup_ml;
    expect(cup).toBe(250);

    await store.addWater(TODAY, 1);
    await store.addWater(TODAY, 1);
    await store.addWater(TODAY, 1);
    await store.addWater(TODAY, -1);
    expect(await store.waterState(TODAY)).toEqual({ totalMl: 500, cups: 2 });

    await store.addWater(TODAY, -1);
    await store.addWater(TODAY, -1);
    expect(await store.waterState(TODAY)).toEqual({ totalMl: 0, cups: 0 });
    expect(await store.addWater(TODAY, -1)).toBeNull();
    expect(await store.waterState(TODAY)).toEqual({ totalMl: 0, cups: 0 });

    const records = await listAliveByDate('water', TODAY);
    expect(records.map((r) => r.ml).sort((a, b) => a - b)).toEqual([-250, -250, -250, 250, 250, 250]);
    for (const record of records) {
      expect(record.at).toBeGreaterThanOrEqual(BASE);
      expect(record.at).toBeLessThan(BASE + 60_000);
      expect(record.date).toBe(TODAY);
    }
  });

  it('杯量读设置：改为 300 ml 后 +1 写入 300 ml', async () => {
    await useSettingsStore().update({ cup_ml: 300 });
    await store.loadMealData(TODAY);
    await store.addWater(TODAY, 1);
    expect(await store.waterState(TODAY)).toEqual({ totalMl: 300, cups: 1 });
  });

  it('非法增量拒绝', async () => {
    await store.loadMealData(TODAY);
    await expect(store.addWater(TODAY, 2)).rejects.toThrow('喝水增量只能是 +1 杯或 -1 杯');
    expect(await listAliveByDate('water', TODAY)).toHaveLength(0);
  });
});
