import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRecord,
  resetDbForTests,
  softDelete,
  type Book,
  type Meal,
  type Plan,
  type PlayRecord,
  type Review,
  type StudyRecord,
  type Water,
  type WorkoutRecord,
} from '@/db';
import { DATE_STAT_TABLES, datesWithData } from './dateStats';

function makePlan(date: string): Promise<Plan> {
  return createRecord('plans', {
    title: '测试计划',
    date,
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
}

function makeStudy(date: string, durationSec = 60): Promise<StudyRecord> {
  return createRecord('study_records', {
    target_type: 'subject',
    target_id: null,
    target_title: '测试科目',
    start_at: 0,
    end_at: 0,
    duration_sec: durationSec,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date,
  });
}

function makeWorkout(date: string): Promise<WorkoutRecord> {
  return createRecord('workout_records', {
    date,
    type_name: '测试训练',
    exercises: [],
    duration_min: null,
    done: true,
  });
}

function makePlay(date: string): Promise<PlayRecord> {
  return createRecord('play_records', { date, content: '测试娱乐', minutes: 10, source: 'manual' });
}

function makeReview(date: string): Promise<Review> {
  return createRecord('reviews', {
    date,
    rating: null,
    mood: null,
    energy: null,
    good: null,
    improve: null,
    mit: null,
    mit_added_to_plan: false,
  });
}

function makeWater(date: string): Promise<Water> {
  return createRecord('water', { date, ml: 250, at: 0 });
}

function makeMeal(date: string): Promise<Meal> {
  return createRecord('meals', { date, meal_key: 'breakfast', meal_name: '早', text: '测试', feeling: null });
}

async function makeExcerpt(): Promise<void> {
  const book: Book = await createRecord('books', {
    title: '测试书',
    author: null,
    total_pages: 100,
    current_page: 10,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
  await createRecord('excerpts', { book_id: book.id, page: 1, content: '测试摘录', thought: null });
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('datesWithData：某月有主动记录的逻辑日期', () => {
  it('口径固定为五张主动记录表，不扩表', () => {
    expect(DATE_STAT_TABLES).toEqual([
      'plans',
      'study_records',
      'workout_records',
      'play_records',
      'reviews',
    ]);
  });

  it('五张表都算；同一天多次记录去重；结果升序', async () => {
    await makePlan('2026-01-05');
    await makeStudy('2026-01-05');
    await makeStudy('2026-01-20');
    await makeWorkout('2026-01-31');
    await makePlay('2026-01-01');
    await makeReview('2026-01-15');

    await expect(datesWithData(2026, 1)).resolves.toEqual([
      '2026-01-01',
      '2026-01-05',
      '2026-01-15',
      '2026-01-20',
      '2026-01-31',
    ]);
  });

  it('water / meals / excerpts 不参与小点口径', async () => {
    await makeWater('2026-01-06');
    await makeMeal('2026-01-07');
    await makeExcerpt();

    await expect(datesWithData(2026, 1)).resolves.toEqual([]);

    // 同一天有 plan 时仍只返回该天一次
    await makePlan('2026-01-06');
    await expect(datesWithData(2026, 1)).resolves.toEqual(['2026-01-06']);
  });

  it('deleted_at 非 null 的记录不产生日期', async () => {
    const plan = await makePlan('2026-01-05');
    const study = await makeStudy('2026-01-06');
    const workout = await makeWorkout('2026-01-07');
    const play = await makePlay('2026-01-08');
    const review = await makeReview('2026-01-09');
    await softDelete('plans', plan.id);
    await softDelete('study_records', study.id);
    await softDelete('workout_records', workout.id);
    await softDelete('play_records', play.id);
    await softDelete('reviews', review.id);

    await expect(datesWithData(2026, 1)).resolves.toEqual([]);

    // 另有有效记录时只返回有效那天
    await makePlan('2026-01-10');
    await expect(datesWithData(2026, 1)).resolves.toEqual(['2026-01-10']);
  });

  it('只返回指定月份：相邻月、同年其它月都不混入', async () => {
    await makePlan('2025-12-31');
    await makePlan('2026-01-01');
    await makePlan('2026-02-01');
    await makePlan('2026-10-05');
    await makePlan('2026-01-31');

    await expect(datesWithData(2026, 1)).resolves.toEqual(['2026-01-01', '2026-01-31']);
    await expect(datesWithData(2025, 12)).resolves.toEqual(['2025-12-31']);
    await expect(datesWithData(2026, 2)).resolves.toEqual(['2026-02-01']);
    await expect(datesWithData(2026, 10)).resolves.toEqual(['2026-10-05']);
  });

  it('空月份返回空数组；非法年月报错', async () => {
    await expect(datesWithData(2026, 4)).resolves.toEqual([]);
    await expect(datesWithData(2026, 0)).rejects.toThrow('非法月份');
    await expect(datesWithData(2026, 13)).rejects.toThrow('非法月份');
    await expect(datesWithData(2026, 1.5)).rejects.toThrow('非法月份');
    await expect(datesWithData(0, 1)).rejects.toThrow('非法年份');
  });
});
