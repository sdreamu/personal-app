import { defineStore } from 'pinia';
import { errorMessage, getSettings, updateSettings, type SettingsRecord } from '@/db';
import { DEFAULT_DAY_START_MIN, parseDayStart } from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useToastStore } from './toast';

export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset['theme'] = theme;
}

/** 设置（目标/一天起点/主题/上次备份时间）；所有修改即时写入 settings 表。 */
export const useSettingsStore = defineStore('settings', {
  state: () => ({ loaded: false, data: null as SettingsRecord | null }),
  getters: {
    dayStartMin: (state) => (state.data ? parseDayStart(state.data.day_start) : DEFAULT_DAY_START_MIN),
    isDark: (state) => state.data?.theme === 'dark',
    theme: (state) => state.data?.theme ?? 'light',
    lastBackupAt: (state) => state.data?.last_backup_at ?? null,
  },
  actions: {
    async load() {
      const row = await getSettings();
      this.data = row;
      this.loaded = true;
      applyTheme(row.theme);
    },
    /** 即时自动保存：写库成功后才更新本地状态；失败进入红条状态并 toast。 */
    async update(patch: Partial<SettingsRecord>) {
      const saveStatus = useSaveStatusStore();
      saveStatus.begin();
      try {
        const next = await updateSettings(patch);
        this.data = next;
        if (patch.theme !== undefined) applyTheme(next.theme);
        saveStatus.idle();
      } catch (err) {
        saveStatus.fail();
        useToastStore().error(`保存失败：${errorMessage(err)}`);
        throw err;
      }
    },
    async setTheme(theme: 'light' | 'dark') {
      if (this.data?.theme !== theme) {
        await this.update({ theme });
      }
    },
  },
});
