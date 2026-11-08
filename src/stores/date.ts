import { defineStore } from 'pinia';
import { addDays, DEFAULT_DAY_START_MIN, logicalToday, parseDateKey } from '@/utils/date';
import { useSettingsStore } from './settings';

const STORAGE_KEY = 'evan-app:selected-date';

function readPersistedDate(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value !== null && parseDateKey(value) !== null ? value : null;
  } catch {
    return null;
  }
}

function writePersistedDate(date: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, date);
  } catch {
    // 隐私模式等场景下忽略
  }
}

/** 切日期守卫：返回 false 表示拦截本次切换（复盘页保存进行中时用），完成保存后用 force 绕过。 */
let dateChangeGuard: ((next: string) => boolean) | null = null;

export function setDateChangeGuard(guard: ((next: string) => boolean) | null): void {
  dateChangeGuard = guard;
}

/**
 * 顶栏“当前选中的逻辑日期”：默认今天（按设置的一天起点计算），
 * 切换后写入 localStorage，刷新后停留在当前选中的逻辑日期。
 */
export const useDateStore = defineStore('date', {
  state: () => {
    const persisted = readPersistedDate();
    return {
      selectedDate: persisted ?? logicalToday(DEFAULT_DAY_START_MIN),
      persisted: persisted !== null,
    };
  },
  getters: {
    isToday: (state) => state.selectedDate === logicalToday(useSettingsStore().dayStartMin),
  },
  actions: {
    /** force=true 跳过守卫（完成保存后继续日期切换时使用）。 */
    setSelected(date: string, options: { force?: boolean } = {}) {
      if (
        options.force !== true &&
        date !== this.selectedDate &&
        dateChangeGuard !== null &&
        !dateChangeGuard(date)
      ) {
        return;
      }
      this.selectedDate = date;
      this.persisted = true;
      writePersistedDate(date);
    },
    prevDay() {
      this.setSelected(addDays(this.selectedDate, -1));
    },
    nextDay() {
      this.setSelected(addDays(this.selectedDate, 1));
    },
    goToday() {
      this.setSelected(logicalToday(useSettingsStore().dayStartMin));
    },
  },
});
