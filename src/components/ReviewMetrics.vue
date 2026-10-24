<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMetrics } from '@/stores/review';

/**
 * 复盘页 7 项自动汇总（只读）。
 * 数值与文案由 useReviewStore.computeMetrics 计算，组件只负责渲染。
 */
const props = defineProps<{
  metrics: ReviewMetrics;
}>();

const items = computed(() => [
  { label: '计划完成数', value: props.metrics.planText, test: 'metric-plan' },
  { label: '学习时长及目标', value: props.metrics.studyText, test: 'metric-study' },
  { label: '阅读页数', value: props.metrics.pagesText, test: 'metric-pages' },
  { label: '喝水量及目标', value: props.metrics.waterText, test: 'metric-water' },
  { label: '是否运动', value: props.metrics.workoutText, test: 'metric-workout' },
  { label: '娱乐时长及额度', value: props.metrics.playText, test: 'metric-play' },
  { label: '计划学习时长与实际差值', value: props.metrics.diffText, test: 'metric-diff' },
]);
</script>

<template>
  <div class="review-metrics settings-card" data-test="review-metrics">
    <h2>今日自动汇总</h2>
    <div class="metrics-grid" data-test="metrics-grid">
      <div
        v-for="item in items"
        :key="item.label"
        class="metric-item"
        :data-test="item.test"
      >
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-value" :data-test="item.test + '-value'">{{ item.value }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.metric-item {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  min-height: 62px;
}
.metric-label {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 6px;
}
.metric-value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
</style>
