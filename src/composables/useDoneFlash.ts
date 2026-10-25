import { ref } from 'vue';

/** 完成反馈闪一下的时长（N4：只表达状态变化，不超过 300ms）。 */
export const DONE_FLASH_MS = 180;

/**
 * 「刚变成完成」的一次性高亮（N4 第 2 条）。
 * 只有组件主动调用 flash(id) 才会播 —— 打开页面时已完成的条目不会自己动。
 */
export function useDoneFlash(durationMs: number = DONE_FLASH_MS) {
  const flashing = ref<string[]>([]);

  function flash(id: string): void {
    flashing.value = [...flashing.value.filter((item) => item !== id), id];
    window.setTimeout(() => {
      flashing.value = flashing.value.filter((item) => item !== id);
    }, durationMs);
  }

  function isFlashing(id: string): boolean {
    return flashing.value.includes(id);
  }

  return { flash, isFlashing };
}
