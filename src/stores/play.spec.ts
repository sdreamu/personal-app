import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getActiveTimer, listAlive, resetDbForTests, type Book } from '@/db';
import { usePlayStore } from '@/stores/play';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';

const BASE = new Date('2026-06-01T10:00:00').getTime();

let pinia: Pinia;
let play: ReturnType<typeof usePlayStore>;
let timer: ReturnType<typeof useTimerStore>;

async function makeBook(): Promise<Book> {
  return createRecord('books', {
    title: 'SICP',
    author: null,
    total_pages: 300,
    current_page: 40,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function seedPlay(date: string, content: string, minutes: number, source: 'timer' | 'manual' = 'manual') {
  return createRecord('play_records', { date, content, minutes, source });
}

/** 只冻结 Date（不冻结 setTimeout/setInterval，避免影响 Dexie 的异步调度）。 */
function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  play = usePlayStore();
  timer = useTimerStore();
  await useSettingsStore().load();
});

afterEach(() => {
  timer.dispose();
  vi.useRealTimers();
});

describe('娱乐 store（play）', () => {
  it('额度计算与超额标志', async () => {
    await seedPlay('2026-06-03', '游戏A', 20);
    await seedPlay('2026-06-03', '游戏B', 25, 'timer');
    await play.loadPlayData('2026-06-03');
    expect(play.quotaState('2026-06-03')).toEqual({ used: 45, limit: 60, remaining: 15, over: false });

    await seedPlay('2026-06-03', '游戏C', 30);
    await play.loadPlayData('2026-06-03');
    expect(play.quotaState('2026-06-03')).toEqual({ used: 75, limit: 60, remaining: 0, over: true });
  });

  it('本周合计以周一为界', async () => {
    await seedPlay('2026-06-01', '周一', 30);
    await seedPlay('2026-06-07', '周日', 20);
    await seedPlay('2026-05-31', '上周日', 10);
    await seedPlay('2026-06-08', '下周一', 40);
    await play.loadPlayData('2026-06-03');
    expect(play.weekTotal('2026-06-03')).toBe(50);
    expect(play.weekTotal('2026-06-01')).toBe(50);
    expect(play.weekTotal('2026-06-07')).toBe(50);
    expect(play.quotaState('2026-06-03').used).toBe(0); // 额度只算当天
  });

  it('手动补记校验：名称必填、分钟正整数、日期有效，成功生成 source=manual', async () => {
    await play.loadPlayData('2026-06-03');
    await expect(play.manualAdd({ content: '  ', minutes: 10, date: '2026-06-03' })).rejects.toThrow('内容名称不能为空');
    await expect(play.manualAdd({ content: '游戏', minutes: 0, date: '2026-06-03' })).rejects.toThrow('分钟数必须为正整数');
    await expect(play.manualAdd({ content: '游戏', minutes: 1.5, date: '2026-06-03' })).rejects.toThrow('分钟数必须为正整数');
    await expect(play.manualAdd({ content: '游戏', minutes: 10, date: '2026-02-30' })).rejects.toThrow('日期无效');

    const created = await play.manualAdd({ content: ' 塞尔达 ', minutes: 45, date: '2026-06-03' });
    expect(created.content).toBe('塞尔达');
    expect(created.minutes).toBe(45);
    expect(created.source).toBe('manual');
    expect(created.date).toBe('2026-06-03');
    expect(play.records.some((r) => r.id === created.id)).toBe(true);
  });

  it('startEntertainment 在已有计时时被 store 拒绝', async () => {
    useFakeDate();
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });

    const result = await play.startEntertainment('塞尔达');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('已有计时时不应允许开始娱乐计时');
    expect(result.reason).toContain('已有计时');
    expect(timer.timer?.type).toBe('book');
    expect(timer.timer?.target_title).toBe('SICP');
    expect(useToastStore().items.some((i) => i.message === result.reason)).toBe(true);
  });

  it('settleEntertainment 生成记录并向上取整，可覆盖分钟数', async () => {
    useFakeDate();
    await timer.startTimer({ type: 'entertainment', targetId: '塞尔达', targetTitle: '塞尔达', mode: 'stopwatch' });
    vi.setSystemTime(BASE + 90_000);
    await timer.endTimer();
    const record = await timer.settleEntertainment({});
    expect(record.content).toBe('塞尔达');
    expect(record.minutes).toBe(2);
    expect(record.source).toBe('timer');
    expect(record.date).toBe('2026-06-01');
    expect(await getActiveTimer()).toBeNull();

    await timer.startTimer({ type: 'entertainment', targetId: '原神', targetTitle: '原神', mode: 'stopwatch' });
    vi.setSystemTime(BASE + 180_000);
    await timer.endTimer();
    const overridden = await timer.settleEntertainment({ minutes: 5 });
    expect(overridden.minutes).toBe(5);
  });

  it('softDeletePlay 软删除并支持撤销', async () => {
    const created = await seedPlay('2026-06-03', '游戏A', 30);
    await play.loadPlayData('2026-06-03');
    expect(play.records.some((r) => r.id === created.id)).toBe(true);

    await play.softDeletePlay(created);
    expect(play.records.some((r) => r.id === created.id)).toBe(false);

    const toast = useToastStore().items.find((i) => i.message.includes('已删除'));
    expect(toast?.undo).not.toBeNull();
    await toast!.undo!.action();
    expect(play.records.some((r) => r.id === created.id)).toBe(true);
  });

  it('editPlay 更新内容与分钟数且保留 source', async () => {
    const created = await seedPlay('2026-06-03', '旧名称', 20, 'timer');
    await play.loadPlayData('2026-06-03');
    await play.editPlay(created.id, { content: '新名称', minutes: 35, date: '2026-06-03' });

    const rows = await listAlive('play_records');
    const updated = rows.find((r) => r.id === created.id);
    expect(updated?.content).toBe('新名称');
    expect(updated?.minutes).toBe(35);
    expect(updated?.source).toBe('timer');
  });

  it('recentContents 按最近使用去重排序并限制数量', async () => {
    useFakeDate();
    await seedPlay('2026-06-01', 'A', 10);
    vi.setSystemTime(BASE + 1000);
    await seedPlay('2026-06-01', 'B', 10);
    vi.setSystemTime(BASE + 2000);
    await seedPlay('2026-06-01', 'A', 10);
    vi.setSystemTime(BASE + 3000);
    for (let i = 0; i < 8; i++) {
      vi.setSystemTime(BASE + 4000 + i * 1000);
      await seedPlay('2026-06-01', `游戏${i}`, 10);
    }

    const recent = await play.recentContents(8);
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe('游戏7');
    expect(recent[1]).toBe('游戏6');
    expect(recent).not.toContain('A'); // 最近 8 个已把最早的 A 挤出
  });
});
