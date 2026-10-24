<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTimerStore } from '@/stores/timer';
import { formatDuration } from '@/utils/date';

const timerStore = useTimerStore();
const router = useRouter();

const label = computed(() => {
  if (timerStore.isSettling) return '⏱ 待结算（点击处理）';
  if (timerStore.isRunning) {
    return `${timerStore.targetTitle} ${formatDuration(Math.floor(timerStore.usedMs / 1000))}`;
  }
  return '';
});

/** 点击：学习计时（书/科目）→ #/study/timer；娱乐计时 → #/life/play。 */
function open(): void {
  if (label.value) void router.push(timerStore.targetRoute);
}
</script>

<template>
  <button
    v-if="label"
    class="timer-capsule"
    :class="{ settling: timerStore.isSettling }"
    data-test="timer-capsule"
    @click="open"
  >
    {{ label }}
  </button>
</template>
