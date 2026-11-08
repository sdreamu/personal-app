import { describe, expect, it } from 'vitest';
import {
  aggregateDay,
  bookActiveInRange,
  dayAggregates,
  eachDateInRange,
  emptyExportSource,
  excerptDateKey,
  exportText,
  inRange,
  summarizeSource,
  type ExportSource,
} from './exportText';
import type { Book, Mistake, Plan, Review, StudyRecord } from './schema';

const D1 = '2026-06-01';
const D2 = '2026-06-02';
const OUT = '2026-05-31';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

it('错题文本导出包含知识点分类，旧错题仍可导出', () => {
  const source = emptyExportSource(D1, D2);
  source.mistakes = [
    mistake({ id: 'classified', date: D1, subject_name: '数学', knowledge_point: '导数', question_text: '求导' }),
    mistake({ id: 'legacy', date: D1, question_text: '旧错题' }),
  ];
  const text = exportText(source);
  expect(text).toContain('[未掌握｜数学｜导数｜难度 3] 求导');
  expect(text).toContain('旧错题');
  expect(text).not.toContain('undefined');
});

/** 区间外记录用的时间戳：OUT（2026-05-31）当天 09:00。 */
const OUT_MS = new Date(2026, 4, 31, 9, 0, 0).getTime();

/** 2026 年 6 月的某个时刻（本地时区，保证 dateKeyOf 落到同一天）。 */
function ms(day: number, hour = 9): number {
  const date = new Date(2026, 5, day, hour, 0, 0);
  // 造数防溢出：6 月没有 31 号，写成 ms(31) 会静默滚到 7 月 1 日，区间内外的判定就假了。
  if (date.getMonth() !== 5) throw new Error('ms() 造数溢出：2026 年 6 月没有第 ' + day + ' 天');
  return date.getTime();
}

const base = { created_at: ms(1), updated_at: ms(1), deleted_at: null };

function plan(overrides: Partial<Plan> & { id: string; date: string }): Plan {
  return {
    ...base,
    title: '计划',
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
    ...overrides,
  };
}

function study(overrides: Partial<StudyRecord> & { id: string; date: string }): StudyRecord {
  return {
    ...base,
    target_type: 'subject',
    target_id: null,
    target_title: '数学',
    start_at: ms(1),
    end_at: ms(1, 10),
    duration_sec: 0,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'timer',
    ...overrides,
  };
}

function review(overrides: Partial<Review> & { id: string; date: string }): Review {
  return {
    ...base,
    rating: null,
    mood: null,
    energy: null,
    good: null,
    improve: null,
    mit: null,
    mit_added_to_plan: false,
    ...overrides,
  };
}

function mistake(overrides: Partial<Mistake> & { id: string; date: string }): Mistake {
  return {
    ...base,
    subject_name: null,
    question_text: null,
    question_images: [],
    correction_text: null,
    correction_images: [],
    reasons: [],
    note: null,
    difficulty: 3,
    mastered: false,
    ...overrides,
  };
}

const bookReading: Book = {
  ...base,
  id: 'book-1',
  title: 'SICP',
  author: null,
  total_pages: 300,
  current_page: 40,
  status: 'reading',
  color: '#4a6cf7',
  start_date: '2026-05-20',
  finish_date: null,
};

const bookDone: Book = {
  ...base,
  id: 'book-2',
  title: '人类简史',
  author: null,
  total_pages: 200,
  current_page: 200,
  status: 'done',
  color: '#2e9e5b',
  start_date: '2026-05-01',
  finish_date: D2,
};

const bookWant: Book = {
  ...base,
  id: 'book-3',
  title: '未开始的书',
  author: null,
  total_pages: 100,
  current_page: 0,
  status: 'want',
  color: '#d98b2b',
  start_date: null,
  finish_date: null,
};

/** 一份覆盖全部板块的输入：区间内 2 天（D1/D2）+ 区间外 1 条/表（OUT）。 */
function makeSource(overrides: Partial<ExportSource> = {}): ExportSource {
  return {
    ...emptyExportSource(D1, D2),
    settings: {
      ...base,
      id: 'settings-1',
      key: 'app',
      daily_study_min: 120,
      daily_water_ml: 2000,
      cup_ml: 250,
      daily_play_min: 60,
      day_start: '04:00',
      theme: 'light',
      last_backup_at: null,
    },
    exercises: [{ ...base, id: 'ex-1', name: '卧推' }],
    plans: [
      plan({ id: 'p1', date: D1, title: '背单词', start_min: 240, end_min: 300, done: true }),
      plan({ id: 'p2', date: D2, title: '买牛奶', category_name: '生活', category_key: 'life' }),
      plan({ id: 'p-out', date: OUT, title: '区间外计划' }),
    ],
    study_records: [
      study({ id: 's1', date: D1, target_title: '数学', duration_sec: 3600, note: '错题复盘' }),
      study({
        id: 's2',
        date: D1,
        target_type: 'book',
        target_id: 'book-1',
        target_title: 'SICP',
        duration_sec: 1800,
        pages_read: 20,
        start_page: 20,
        end_page: 40,
      }),
      study({ id: 's-out', date: OUT, target_title: '区间外学习', duration_sec: 600 }),
    ],
    books: [bookReading, bookDone, bookWant],
    excerpts: [
      { ...base, id: 'e1', book_id: 'book-1', page: 12, content: '好句子', thought: '很妙' },
      { ...base, id: 'e-out', created_at: OUT_MS, book_id: 'book-1', page: 1, content: '区间外摘录', thought: null },
    ],
    meals: [
      { ...base, id: 'm1', date: D1, meal_key: 'breakfast', meal_name: '早', text: '包子', feeling: 'full' },
      { ...base, id: 'm-out', date: OUT, meal_key: 'lunch', meal_name: '午', text: '区间外饮食', feeling: null },
    ],
    water: [
      { ...base, id: 'w1', date: D1, ml: 250, at: ms(1, 8) },
      { ...base, id: 'w2', date: D1, ml: 300, at: ms(1, 11) },
      { ...base, id: 'w-out', date: OUT, ml: 500, at: OUT_MS },
    ],
    workout_records: [
      {
        ...base,
        id: 'wr1',
        date: D1,
        type_name: '胸',
        exercises: [
          { name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }, { weight_kg: 60, reps: 8, done: false }], note: '停顿 2 秒' },
        ],
        duration_min: 45,
        done: true,
      },
    ],
    play_records: [{ ...base, id: 'pl1', date: D1, content: '游戏', minutes: 30, source: 'manual' }],
    reviews: [
      review({
        id: 'r1',
        date: D1,
        rating: 4,
        mood: 3,
        energy: 5,
        good: '专注',
        mit: '晨跑',
        record_worthy: '第一次跑完 5 公里',
        day_summary: '状态不错',
        mit_added_to_plan: true,
      }),
      review({ id: 'r-out', date: OUT, good: '区间外复盘' }),
    ],
    mistakes: [
      mistake({
        id: 'mi1',
        date: D1,
        subject_name: '数学',
        question_text: '求导',
        question_images: [PNG],
        correction_text: '链式法则',
        correction_images: [PNG],
        reasons: ['计算错误'],
        note: '粗心',
        difficulty: 3,
        mastered: false,
      }),
      mistake({ id: 'mi-out', date: OUT, question_text: '区间外错题' }),
    ],
    ...overrides,
  };
}

describe('区间过滤：日期区间外的东西一律不出现', () => {
  it('区间外记录（计划/学习/摘录/饮食/喝水/复盘/错题）全部不出现', () => {
    const text = exportText(makeSource());
    for (const forbidden of ['区间外计划', '区间外学习', '区间外摘录', '区间外饮食', '区间外复盘', '区间外错题']) {
      expect(text).not.toContain(forbidden);
    }
    // 区间内对应记录都在
    for (const expected of ['背单词', '买牛奶', '数学', '好句子', '包子', '求导', '专注']) {
      expect(text).toContain(expected);
    }
  });

  it('区间外的日期不会单独成段，也不会进入按天聚合', () => {
    const source = makeSource();
    const text = exportText(source);
    expect(text).toContain('## ' + D1 + ' 周一');
    expect(text).toContain('## ' + D2 + ' 周二');
    expect(text).not.toContain('## ' + OUT);
    expect(dayAggregates(source).map((day) => day.date)).toEqual([D1, D2]);
    const outDay = aggregateDay(source, OUT);
    expect(outDay.planCount).toBe(1); // 单日聚合本身按日期取数（区间由 dayAggregates 负责）
  });

  it('inRange / eachDateInRange 边界（含首尾）', () => {
    expect(inRange(D1, D1, D2)).toBe(true);
    expect(inRange(D2, D1, D2)).toBe(true);
    expect(inRange(OUT, D1, D2)).toBe(false);
    expect(eachDateInRange(D1, D2)).toEqual([D1, D2]);
    expect(eachDateInRange(D2, D1)).toEqual([]);
    expect(eachDateInRange('2026-02-28', '2026-03-01')).toEqual(['2026-02-28', '2026-03-01']);
    expect(() => eachDateInRange('2026-13-01', D2)).toThrow('非法日期');
  });
});

describe('汇总统计', () => {
  const totals = summarizeSource(makeSource());

  it('各表条数与关键数值', () => {
    expect(totals.dayCount).toBe(2);
    expect(totals.activeDayCount).toBe(2);
    expect(totals.planCount).toBe(2);
    expect(totals.planDoneCount).toBe(1);
    expect(totals.studyCount).toBe(2);
    expect(totals.studySec).toBe(5400);
    expect(totals.pagesRead).toBe(20);
    expect(totals.excerptCount).toBe(1);
    expect(totals.mealCount).toBe(1);
    expect(totals.waterCount).toBe(2);
    expect(totals.waterMl).toBe(550);
    expect(totals.workoutCount).toBe(1);
    expect(totals.workoutDoneCount).toBe(1);
    expect(totals.workoutMinutes).toBe(45);
    expect(totals.playCount).toBe(1);
    expect(totals.playMinutes).toBe(30);
    expect(totals.reviewCount).toBe(1);
    expect(totals.mistakeCount).toBe(1);
    expect(totals.mistakeUnmastered).toBe(1);
    expect(totals.bookCount).toBe(2); // 在读的 SICP（开始于区间外）+ 区间内读完的人类简史
    expect(totals.bookReadingCount).toBe(1);
    expect(totals.exerciseCount).toBe(1);
  });

  it('summary 文本行正确（学习总时长/阅读页数/训练次数/喝水总量）', () => {
    const text = exportText(makeSource());
    expect(text).toContain('# 个人数据导出（2026-06-01 ~ 2026-06-02）');
    expect(text).toContain('- 区间：2026-06-01 ~ 2026-06-02（共 2 天，有记录 2 天）');
    expect(text).toContain('- 计划：2 条（完成 1 条）');
    expect(text).toContain('- 学习记录：2 条，合计 1 小时 30 分钟；阅读页数 20 页');
    expect(text).toContain('- 摘录：1 条');
    expect(text).toContain('- 读书：区间内有活动 2 本（在读 1 本）');
    expect(text).toContain('- 饮食记录：1 条');
    expect(text).toContain('- 喝水：2 次，合计 550 ml');
    expect(text).toContain('- 训练：1 条（完成 1 条），合计 45 分钟');
    expect(text).toContain('- 娱乐：1 条，合计 30 分钟');
    expect(text).toContain('- 复盘：1 天');
    expect(text).toContain('- 错题：1 条（未掌握 1 条）');
    expect(text).toContain('- 训练项目库：1 个动作');
  });
});

describe('按日期分段的内容', () => {
  const text = exportText(makeSource());
  const daySection = (date: string): string => {
    const startIndex = text.indexOf('## ' + date);
    expect(startIndex, date + ' 段落缺失').toBeGreaterThanOrEqual(0);
    const rest = text.slice(startIndex + 3);
    const nextIndex = rest.search(/\n## \d{4}-\d{2}-\d{2}/);
    return nextIndex === -1 ? rest : rest.slice(0, nextIndex);
  };

  it('计划 / 学习 / 摘录 / 饮食 / 喝水 / 训练 / 娱乐 / 复盘 / 错题都在各自日期段落里', () => {
    const d1 = daySection(D1);
    expect(d1).toContain('### 计划');
    expect(d1).toContain('- [x] 08:00~09:00 背单词（学习）');
    expect(d1).toContain('### 学习记录');
    expect(d1).toContain('- 09:00~10:00 数学 1 小时（timer），备注：错题复盘');
    expect(d1).toContain('- 09:00~10:00 SICP 30 分钟（timer），读了 20 页，第 20→40 页');
    expect(d1).toContain('### 摘录');
    expect(d1).toContain('- 《SICP》第 12 页：好句子 —— 感想：很妙');
    expect(d1).toContain('### 饮食');
    expect(d1).toContain('- 早：包子（吃饱）');
    expect(d1).toContain('### 喝水');
    expect(d1).toContain('- 共 2 次，合计 550 ml');
    expect(d1).toContain('### 训练');
    expect(d1).toContain('- 胸（已完成，45 分钟）：卧推 60kg×8✓ / 60kg×8（备注：停顿 2 秒）');
    expect(d1).toContain('### 娱乐');
    expect(d1).toContain('- 游戏 30 分钟');
    expect(d1).toContain('### 复盘');
    expect(d1).toContain('- 评分 4，心情 3，精力 5');
    expect(d1).toContain('- 做得好：专注');
    expect(d1).toContain('- 最重要的事：晨跑');
    expect(d1).toContain('- 值得记录：第一次跑完 5 公里');
    expect(d1).toContain('- 一天总结：状态不错');
    expect(d1).toContain('- 最重要的事已加入今日待办');
    expect(d1).toContain('### 错题');
    expect(d1).toContain('- [未掌握｜数学｜难度 3] 求导');
    expect(d1).toContain('  - 错因：计算错误');
    expect(d1).toContain('  - 订正：链式法则');
    expect(d1).toContain('  - 备注：粗心');
    expect(d1).toContain('  - 图片：题目 1 张，订正 1 张');
  });

  it('第二天只有计划时只输出计划段（空板块不出现）', () => {
    const d2 = daySection(D2);
    expect(d2).toContain('### 计划');
    expect(d2).toContain('- [ ] 买牛奶（生活）');
    expect(d2).not.toContain('### 学习记录');
    expect(d2).not.toContain('### 错题');
  });

  it('读书进度单独一节，只含区间内有活动的书', () => {
    expect(text).toContain('## 读书进度');
    expect(text).toContain('- 《SICP》：40/300 页（在读，开始 2026-05-20）');
    expect(text).toContain('- 《人类简史》：200/200 页（读完，开始 2026-05-01，读完 2026-06-02）');
    expect(text).not.toContain('未开始的书');
    expect(bookActiveInRange(bookWant, D1, D2)).toBe(false);
  });

  it('错题图片只输出张数，绝不输出 base64 正文', () => {
    expect(text).not.toContain('base64');
    expect(text).not.toContain('data:image');
  });
});

describe('稳定性与空区间', () => {
  it('同一输入两次调用输出完全一致，且以换行结尾', () => {
    const first = exportText(makeSource());
    const second = exportText(makeSource());
    expect(second).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
    expect(first).not.toContain('\n\n\n');
  });

  it('区间内没有记录时输出汇总 + 空提示', () => {
    const text = exportText(emptyExportSource(D1, D2));
    expect(text).toContain('## 汇总统计');
    expect(text).toContain('- 计划：0 条（完成 0 条）');
    expect(text).toContain('_区间内没有记录。_');
    expect(text).not.toContain('## ' + D1);
  });

  it('摘录按 created_at 换算日期归档', () => {
    const excerpt = { ...base, id: 'e1', book_id: 'book-1', page: 1, content: 'x', thought: null };
    expect(excerptDateKey(excerpt)).toBe(D1);
    expect(excerptDateKey({ ...excerpt, created_at: OUT_MS })).toBe(OUT);
  });

  it('aggregateDay 单日数值与 dayAggregates 一致', () => {
    const source = makeSource();
    const days = dayAggregates(source);
    const d1 = days[0];
    expect(d1?.date).toBe(D1);
    expect(d1?.planCount).toBe(1);
    expect(d1?.planDoneCount).toBe(1);
    expect(d1?.studySec).toBe(5400);
    expect(d1?.pagesRead).toBe(20);
    expect(d1?.waterMl).toBe(550);
    expect(d1?.workoutCount).toBe(1);
    expect(d1?.playMinutes).toBe(30);
    expect(d1?.hasReview).toBe(true);
    expect(d1?.mistakeUnmastered).toBe(1);
    const d2 = days[1];
    expect(d2?.date).toBe(D2);
    expect(d2?.planCount).toBe(1);
    expect(d2?.planDoneCount).toBe(0);
    expect(d2?.studySec).toBe(0);
    expect(d2?.hasReview).toBe(false);
  });
});
