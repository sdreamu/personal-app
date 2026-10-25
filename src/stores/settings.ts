import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  errorMessage,
  getSettings,
  updateSettings,
  type SettingsRecord,
  type ThemeMode,
} from '@/db';
import { DEFAULT_DAY_START_MIN, parseDayStart } from '@/utils/date';
import { writeBootTheme } from '@/utils/themeBoot';
import { useSaveStatusStore } from './saveStatus';
import { useToastStore } from './toast';

/**
 * 主题（第二轮 UI 改造·第 2 步）：三选一 浅色 / 深色 / 跟随系统。
 * 类型 ThemeMode 唯一定义在 `@/db`（schema.ts），store 与设置页共用，不重复声明。
 */

/** 主题模式取值域（顺序即设置页分段控件的顺序）。 */
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/** 系统深色偏好媒体查询（唯一来源；jsdom 里 matchMedia 可能不存在，调用前一律判空）。 */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** 实际生效的明暗（data-theme 的取值域**始终只有** light / dark）。 */
export type ResolvedTheme = 'light' | 'dark';

/**
 * 把任意值收窄成 ThemeMode：已知的 light/dark/system 原样返回，其余一律兜底 'light'。
 * 用途：读 DB / 导入备份时可能遇到未知值（例如手工改过的备份），不允许把未知值写进 data-theme。
 */
export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'dark' || value === 'system' ? value : 'light';
}

/** 纯函数：主题模式 + 系统是否偏好深色 → 实际生效的明暗。 */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** 取系统深色媒体查询对象；环境不支持（旧浏览器 / 未 mock 的 jsdom）时返回 null。 */
function systemMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_SCHEME_QUERY);
}

/** 系统当前是否偏好深色（无 matchMedia 的环境按浅色处理）。 */
export function prefersDarkScheme(): boolean {
  const mql = systemMediaQuery();
  return mql !== null && mql.matches === true;
}

/**
 * 系统深色偏好（响应式，供 store 的 resolvedTheme / isDark 派生）。
 * 系统偏好本身不是响应式数据，靠 refreshSystemPrefersDark() 在 load 与监听回调里刷新。
 */
export const systemPrefersDark = ref(false);

/** 重新读取系统偏好并写入响应式状态（返回最新值）。 */
export function refreshSystemPrefersDark(): boolean {
  systemPrefersDark.value = prefersDarkScheme();
  return systemPrefersDark.value;
}

/** 把解析后的主题写到 <html data-theme>：'system' 先按系统偏好解析，写入值永远是 light/dark。 */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(normalizeTheme(mode), prefersDarkScheme());
  document.documentElement.dataset['theme'] = resolved;
  // 记一笔给下次启动用，避免首屏先亮后暗（见 utils/themeBoot.ts）
  writeBootTheme(resolved);
  return resolved;
}

interface SystemThemeWatch {
  mql: MediaQueryList;
  handler: () => void;
}

let systemThemeWatch: SystemThemeWatch | null = null;
let themeModeSource: (() => ThemeMode) | null = null;

/**
 * 监听系统深浅色变化（'system' 模式下系统一改就立即生效）。
 * 幂等：重复调用**不会**叠加监听，始终复用第一次注册的那一个（重复 load 也只注册一次）。
 * 返回注销函数，与 stopSystemThemeWatch() 等价，供测试清理。
 */
export function startSystemThemeWatch(getMode: () => ThemeMode): () => void {
  themeModeSource = getMode; // 始终指向最新 store，避免闭包里拿到旧主题
  if (systemThemeWatch !== null) return stopSystemThemeWatch;
  const mql = systemMediaQuery();
  if (mql === null) return stopSystemThemeWatch; // 环境不支持：静默跳过，不抛错
  refreshSystemPrefersDark();
  const handler = (): void => {
    // 系统变化时先刷新响应式偏好（resolvedTheme/isDark 跟着变），再按当前模式重新应用；
    // 非 system 模式下解析结果不变，写回同值（无副作用）。
    refreshSystemPrefersDark();
    applyTheme(themeModeSource === null ? 'light' : themeModeSource());
  };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
  } else if (typeof mql.addListener === 'function') {
    // Safari < 14 的旧接口
    mql.addListener(handler);
  }
  systemThemeWatch = { mql, handler };
  return stopSystemThemeWatch;
}

/** 注销系统主题监听（可重复调用）。 */
export function stopSystemThemeWatch(): void {
  const watch = systemThemeWatch;
  systemThemeWatch = null;
  themeModeSource = null;
  if (watch === null) return;
  if (typeof watch.mql.removeEventListener === 'function') {
    watch.mql.removeEventListener('change', watch.handler);
  } else if (typeof watch.mql.removeListener === 'function') {
    watch.mql.removeListener(watch.handler);
  }
}

/** 设置（目标/一天起点/主题/上次备份时间）；所有修改即时写入 settings 表。 */
export const useSettingsStore = defineStore('settings', {
  state: () => ({ loaded: false, data: null as SettingsRecord | null }),
  getters: {
    dayStartMin: (state) => (state.data ? parseDayStart(state.data.day_start) : DEFAULT_DAY_START_MIN),
    /** 已归一化的主题模式：导入备份里的未知值在这里兜底成 'light'。 */
    theme: (state): ThemeMode => normalizeTheme(state.data?.theme),
    /** 实际生效的明暗（'system' 按当前系统偏好解析；偏好用响应式 ref，系统切换后即时更新）。 */
    resolvedTheme(): ResolvedTheme {
      return resolveTheme(this.theme, systemPrefersDark.value);
    },
    isDark(): boolean {
      return this.resolvedTheme === 'dark';
    },
    lastBackupAt: (state) => state.data?.last_backup_at ?? null,
  },
  actions: {
    async load() {
      const row = await getSettings();
      this.data = row;
      this.loaded = true;
      refreshSystemPrefersDark();
      applyTheme(this.theme);
      // 只注册一次：重复 load 复用同一个监听器（jsdom 没有 matchMedia 时静默跳过）。
      startSystemThemeWatch(() => this.theme);
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
    async setTheme(theme: ThemeMode) {
      if (this.data?.theme !== theme) {
        await this.update({ theme });
      }
    },
  },
});
