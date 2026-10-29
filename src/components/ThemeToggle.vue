<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';

/**
 * 顶栏的「白天 / 夜间」一键切换（AC-82）。
 * 只做一件事：把设置里的 theme 在 light / dark 之间切一下，其余（写库、落 data-theme、
 * 系统偏好监听）全部复用 useSettingsStore，不在这里另开一套主题状态。
 * 当前是「跟随系统」时，按钮显示的是系统解析出来的实际明暗；点一下变成显式 light/dark。
 */
const settings = useSettingsStore();

const isDark = computed(() => settings.isDark);
const label = computed(() => (isDark.value ? '切换到白天模式' : '切换到夜间模式'));

async function toggle(): Promise<void> {
  try {
    await settings.setTheme(isDark.value ? 'light' : 'dark');
  } catch {
    // 写库失败已由 settings.update 置保存失败红条并 toast
  }
}
</script>

<template>
  <button
    type="button"
    class="icon-btn theme-toggle"
    data-test="theme-toggle"
    :title="label"
    :aria-label="label"
    :aria-pressed="isDark"
    @click="toggle"
  >
    <svg
      v-if="isDark"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="square"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
    <svg
      v-else
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="square"
      aria-hidden="true"
    >
      <path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  flex: none;
}
.theme-toggle svg {
  display: block;
}
</style>
