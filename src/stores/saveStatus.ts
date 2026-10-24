import { defineStore } from 'pinia';

export type SaveStatus = 'idle' | 'saving' | 'error';

/** 顶栏保存状态：空闲“已自动保存 ✓” / 写入中 / 失败（红条 + 导出入口）。 */
export const useSaveStatusStore = defineStore('save-status', {
  state: () => ({ status: 'idle' as SaveStatus }),
  getters: {
    isSaving: (state) => state.status === 'saving',
    hasError: (state) => state.status === 'error',
  },
  actions: {
    begin() {
      this.status = 'saving';
    },
    idle() {
      this.status = 'idle';
    },
    fail() {
      this.status = 'error';
    },
  },
});
