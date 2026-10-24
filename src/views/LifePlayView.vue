<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import PlayRecordList from '@/components/PlayRecordList.vue';
import PlayTimerPanel from '@/components/PlayTimerPanel.vue';
import { useDateStore } from '@/stores/date';
import { usePlayStore, type PlayRoundPrefill } from '@/stores/play';

/**
 * 娱乐页 #/life/play（PRD §5.7 / AC-46）：
 * 计时控制区 + 额度进度/本周累计 + 手动补记与记录列表。
 * 读/写跟随 dateStore.selectedDate。
 * 「再来一轮」的预填状态放在本页：记录列表 emit → 计时面板 props（不自动开始）。
 */
const dateStore = useDateStore();
const playStore = usePlayStore();

const prefill = ref<PlayRoundPrefill | null>(null);

function onPlayAgain(next: PlayRoundPrefill): void {
  prefill.value = next;
}

function onPrefillApplied(): void {
  prefill.value = null;
}

async function load(): Promise<void> {
  try {
    await playStore.loadPlayData(dateStore.selectedDate);
  } catch {
    // 数据库未就绪时保持空列表
  }
}

onMounted(load);
watch(() => dateStore.selectedDate, load);
</script>

<template>
  <section class="page" data-test="play-page">
    <h1 class="page-title">娱乐</h1>
    <PlayTimerPanel :prefill="prefill" @prefill-applied="onPrefillApplied" />
    <PlayRecordList @play-again="onPlayAgain" />
  </section>
</template>
