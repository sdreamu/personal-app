import { defineStore } from 'pinia';
import {
  createRecord,
  errorMessage,
  listAlive,
  softDelete,
  undoDelete,
  updateRecord,
  type PlayRecord,
} from '@/db';
import { addDays, parseDateKey, weekStart } from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useSettingsStore } from './settings';
import { useTimerStore, type StartTimerResult } from './timer';
import { useToastStore } from './toast';

export const DEFAULT_RECENT_LIMIT = 8;

export interface PlayManualInput {
  content: string;
  minutes: number;
  date: string;
}

export interface PlayQuotaState {
  used: number;
  limit: number;
  remaining: number;
  over: boolean;
}

export function validatePlayInput(input: PlayManualInput): { content: string; minutes: number; date: string } {
  const content = input.content.trim();
  if (content === '') throw new Error('内容名称不能为空');
  if (!Number.isInteger(input.minutes) || input.minutes < 1) {
    throw new Error('分钟数必须为正整数');
  }
  if (parseDateKey(input.date) === null) throw new Error('日期无效');
  return { content, minutes: input.minutes, date: input.date };
}

/** 最近使用的内容名称：按 created_at 倒序、去重、取前 limit 个。 */
export function recentContentsFrom(rows: readonly PlayRecord[], limit = DEFAULT_RECENT_LIMIT): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const sorted = [...rows].sort((a, b) => b.created_at - a.created_at);
  for (const row of sorted) {
    const name = row.content.trim();
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * 娱乐模块 store（3c）：娱乐计时控制入口（转调全局 timer store）与 play_records 读写。
 * 读/写跟随 dateStore.selectedDate（由页面调用 loadPlayData(date)）；
 * quotaState / weekTotal 基于最近一次 loadPlayData 载入的那一周记录计算。
 */
export const usePlayStore = defineStore('play', {
  state: () => ({
    loading: false,
    loadedDate: null as string | null,
    records: [] as PlayRecord[],
    weekRecords: [] as PlayRecord[],
    recent: [] as string[],
  }),
  actions: {
    /** 载入选中日期所在周的娱乐记录，并拆分当天列表与最近使用标签。 */
    async loadPlayData(date: string): Promise<void> {
      const start = weekStart(date);
      const end = addDays(start, 6);
      this.loading = true;
      try {
        const rows = await listAlive('play_records');
        this.records = rows
          .filter((row) => row.date === date)
          .sort((a, b) => b.created_at - a.created_at);
        this.weekRecords = rows.filter((row) => row.date >= start && row.date <= end);
        this.recent = recentContentsFrom(rows);
        this.loadedDate = date;
      } finally {
        this.loading = false;
      }
    },

    /** 重新载入当前选中日期（供增删改后刷新）。 */
    async reload(): Promise<void> {
      if (this.loadedDate !== null) await this.loadPlayData(this.loadedDate);
    },

    /** 最近使用的内容名称（同时写入 state.recent 供标签选择）。 */
    async recentContents(limit = DEFAULT_RECENT_LIMIT): Promise<string[]> {
      const rows = await listAlive('play_records');
      const result = recentContentsFrom(rows, limit);
      this.recent = result;
      return result;
    },

    /** 开始娱乐计时（全局单实例，冲突由 timer store 拒绝并 toast）。 */
    async startEntertainment(name: string): Promise<StartTimerResult> {
      const trimmed = name.trim();
      return useTimerStore().startTimer({
        type: 'entertainment',
        targetId: trimmed,
        targetTitle: trimmed,
        mode: 'stopwatch',
      });
    },

    /** 手动补记一条娱乐记录（source='manual'）。 */
    async manualAdd(input: PlayManualInput): Promise<PlayRecord> {
      const v = validatePlayInput(input);
      const created = await this.runWithSaveStatus(() =>
        createRecord('play_records', { date: v.date, content: v.content, minutes: v.minutes, source: 'manual' }),
      );
      await this.reload();
      return created;
    },

    /** 编辑娱乐记录（保留 source 不变）。 */
    async editPlay(id: string, input: PlayManualInput): Promise<void> {
      const v = validatePlayInput(input);
      await this.runWithSaveStatus(() =>
        updateRecord('play_records', id, { date: v.date, content: v.content, minutes: v.minutes }),
      );
      await this.reload();
    },

    /** 删除走软删除 + 5 秒撤销。 */
    async softDeletePlay(record: PlayRecord): Promise<void> {
      await this.runWithSaveStatus(() => softDelete('play_records', record.id));
      await this.reload();
      useToastStore().undoable(`已删除娱乐记录“${record.content}”`, async () => {
        try {
          await undoDelete('play_records', record.id);
          await this.reload();
        } catch (err) {
          useToastStore().error(`撤销失败：${errorMessage(err)}`);
        }
      });
    },

    /** 某日娱乐额度（已用 = 当天全部有效记录分钟和）。 */
    quotaState(date: string): PlayQuotaState {
      const limit = useSettingsStore().data?.daily_play_min ?? 60;
      const used = this.weekRecords
        .filter((row) => row.date === date)
        .reduce((sum, row) => sum + row.minutes, 0);
      return { used, limit, remaining: Math.max(0, limit - used), over: used > limit };
    },

    /** 该日期所在周（周一~周日）累计娱乐分钟数。 */
    weekTotal(date: string): number {
      const start = weekStart(date);
      const end = addDays(start, 6);
      return this.weekRecords
        .filter((row) => row.date >= start && row.date <= end)
        .reduce((sum, row) => sum + row.minutes, 0);
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
  },
});
