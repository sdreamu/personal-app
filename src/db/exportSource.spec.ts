import { beforeEach, describe, expect, it } from 'vitest';
import { createRecord, getDb, getSettings, resetDbForTests, softDelete, updateSettings } from '@/db';
import {
  ALL_RANGE_FALLBACK_DAYS,
  getEarliestRecordDate,
  loadExportSource,
  resolveAllRange,
  resolveTextRange,
  textExportFileName,
} from './exportSource';
import { exportText } from './exportText';
import type { Meal, Plan, Water } from './schema';

const TODAY = '2026-06-10';
const IN_RANGE = '2026-06-08';
const OUT_RANGE = '2026-05-01';

function planData(date: string, title: string): Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  return {
    title,
    date,
    start_min: null,
    end_min: null,
    category_key: 'study',
    category_name: '学习',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
  };
}

function mealData(date: string, text: string): Omit<Meal, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  return { date, meal_key: 'breakfast', meal_name: '早', text, feeling: 'full' };
}

function waterData(date: string, ml: number, at: number): Omit<Water, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  return { date, ml, at };
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('loadExportSource', () => {
  it('带上 settings 与 exercises，只取 deleted_at === null 的行', async () => {
    await createRecord('plans', planData(IN_RANGE, '区间内计划'));
    await createRecord('meals', mealData(IN_RANGE, '区间内早餐'));
    await createRecord('exercises', { name: '卧推' });
    const deleted = await createRecord('plans', planData(IN_RANGE, '已删除计划'));
    await softDelete('plans', deleted.id);

    const source = await loadExportSource('2026-06-07', TODAY);

    expect(source.start).toBe('2026-06-07');
    expect(source.end).toBe(TODAY);
    expect(source.settings?.key).toBe('app');
    expect(source.exercises?.map((row) => row.name)).toEqual(['卧推']);
    // 软删除的行不进来
    expect(source.plans.map((row) => row.title)).toEqual(['区间内计划']);
    expect(source.meals.map((row) => row.text)).toEqual(['区间内早餐']);
    expect(source.water).toEqual([]);
    expect(source.study_records).toEqual([]);
    expect(source.books).toEqual([]);
    expect(source.excerpts).toEqual([]);
    expect(source.workout_records).toEqual([]);
    expect(source.play_records).toEqual([]);
    expect(source.reviews).toEqual([]);
    expect(source.mistakes).toEqual([]);
  });

  it('不做区间裁剪：区间外记录也装进来，由 exportText() 的 inRange 过滤', async () => {
    await createRecord('plans', planData(IN_RANGE, '区间内计划'));
    await createRecord('plans', planData(OUT_RANGE, '区间外计划'));

    const source = await loadExportSource('2026-06-07', TODAY);
    expect(source.plans.map((row) => row.title).sort()).toEqual(['区间内计划', '区间外计划']);

    const text = exportText(source);
    expect(text).toContain('区间内计划');
    expect(text).not.toContain('区间外计划');
    expect(text).toContain('# 个人数据导出（2026-06-07 ~ 2026-06-10）');
  });

  it('文本导出链路：库里真实数据 → Markdown 含计划与饮食条目', async () => {
    await createRecord('plans', planData(IN_RANGE, '背单词'));
    await createRecord('meals', mealData(IN_RANGE, '包子'));
    await createRecord('water', waterData(IN_RANGE, 250, Date.now()));

    const text = exportText(await loadExportSource(IN_RANGE, IN_RANGE));
    expect(text).toContain('## ' + IN_RANGE);
    expect(text).toContain('### 计划');
    expect(text).toContain('背单词');
    expect(text).toContain('### 饮食');
    expect(text).toContain('- 早：包子（吃饱）');
    expect(text).toContain('- 喝水：1 次，合计 250 ml');
  });

  it('只读：导出不写 settings（last_backup_at 保持不变）', async () => {
    await updateSettings({ last_backup_at: 1_700_000_000_000 });
    await createRecord('plans', planData(IN_RANGE, '计划'));
    const before = (await getSettings()).last_backup_at;

    exportText(await loadExportSource(IN_RANGE, TODAY));

    expect((await getSettings()).last_backup_at).toBe(before);
    expect(before).toBe(1_700_000_000_000);
  });
});

describe('getEarliestRecordDate', () => {
  it('一条记录都没有时返回 null', async () => {
    expect(await getEarliestRecordDate()).toBeNull();
  });

  it('取所有带 date 表的最小日期，忽略软删除', async () => {
    await createRecord('plans', planData('2026-06-08', '计划'));
    await createRecord('meals', mealData('2026-06-03', '早餐'));
    await createRecord('water', waterData('2026-06-05', 250, Date.now()));
    const deleted = await createRecord('plans', planData('2026-01-01', '已删除的旧计划'));
    await softDelete('plans', deleted.id);

    expect(await getEarliestRecordDate()).toBe('2026-06-03');
  });

  it('摘录没有 date 字段：按 created_at 换算的本地日期参与比较', async () => {
    await createRecord('plans', planData('2026-06-08', '计划'));
    const db = await getDb();
    const createdAt = new Date(2025, 0, 2, 9, 0, 0).getTime();
    await db.excerpts.add({
      id: 'excerpt-old',
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
      book_id: 'book-1',
      page: 1,
      content: '好句子',
      thought: null,
    });

    expect(await getEarliestRecordDate()).toBe('2025-01-02');
  });
});

describe('区间预设', () => {
  it('resolveAllRange：有记录从最早那天到今天；没有记录退回最近 30 天', () => {
    expect(resolveAllRange(null, TODAY)).toEqual({ start: '2026-05-12', end: TODAY });
    expect(resolveAllRange('2026-05-20', TODAY)).toEqual({ start: '2026-05-20', end: TODAY });
    // 记录都在“未来”时不越过今天
    expect(resolveAllRange('2026-07-01', TODAY)).toEqual({ start: TODAY, end: TODAY });
    expect(ALL_RANGE_FALLBACK_DAYS).toBe(30);
  });

  it('resolveTextRange：最近 7 天 / 最近 30 天（含今天）', () => {
    expect(resolveTextRange('last7', TODAY, null)).toEqual({ start: '2026-06-04', end: TODAY });
    expect(resolveTextRange('last30', TODAY, null)).toEqual({ start: '2026-05-12', end: TODAY });
    expect(resolveTextRange('all', TODAY, '2026-06-01')).toEqual({ start: '2026-06-01', end: TODAY });
  });

  it('resolveTextRange：自定义起止日期，填反了自动对调，非法日期抛错', () => {
    expect(resolveTextRange('custom', TODAY, null, { start: '2026-06-01', end: '2026-06-05' })).toEqual({
      start: '2026-06-01',
      end: '2026-06-05',
    });
    expect(resolveTextRange('custom', TODAY, null, { start: '2026-06-05', end: '2026-06-01' })).toEqual({
      start: '2026-06-01',
      end: '2026-06-05',
    });
    expect(() => resolveTextRange('custom', TODAY, null, { start: '', end: '2026-06-01' })).toThrow('请选择有效的起止日期');
    expect(() => resolveTextRange('custom', TODAY, null, { start: '2026-02-30', end: '2026-06-01' })).toThrow(
      '请选择有效的起止日期',
    );
  });

  it('textExportFileName：evan-text-YYYYMMDD-YYYYMMDD.md', () => {
    expect(textExportFileName('2026-06-04', '2026-06-10')).toBe('evan-text-20260604-20260610.md');
  });
});
