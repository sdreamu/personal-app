<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ bars: number[] }>();

const LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

function minutesOf(sec: number): number {
  return Math.round(sec / 60);
}

function heightPct(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(5, Math.round((value / max) * 100));
}

const maxBar = computed(() => Math.max(0, ...props.bars));
</script>

<template>
  <div class="week-chart" data-test="subject-chart">
    <div v-for="(bar, i) in bars" :key="i" class="chart-col">
      <span class="chart-value">{{ minutesOf(bar) }}</span>
      <div class="chart-track">
        <div
          class="chart-bar"
          :style="{ height: heightPct(bar, maxBar) + '%' }"
          :data-test="`subject-bar-${i}`"
          :title="`周${LABELS[i]} ${minutesOf(bar)} 分钟`"
        />
      </div>
      <span class="chart-label">周{{ LABELS[i] }}</span>
    </div>
  </div>
</template>

<style scoped>
.week-chart { display: flex; gap: 6px; align-items: flex-end; margin-top: 10px; }
.chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.chart-value { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.chart-track {
  width: 100%;
  height: 64px;
  border-radius: var(--radius);
  background: var(--panel-2);
  display: flex;
  align-items: flex-end;
}
.chart-bar { width: 100%; border-radius: 0; background: var(--accent); }
.chart-label { font-size: 11px; color: var(--muted); }
</style>
