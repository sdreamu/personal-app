<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMetrics } from '@/stores/review';

/**
 * 复盘页 7 项自动汇总（只读）。
 * 数值与文案由 useReviewStore.computeMetrics 计算，组件只负责渲染。
 * v5：一格一个读数，1px 细线分栏，数字走等宽；只有「没做到」的地方给朱砂。
 */
const props = defineProps<{
  metrics: ReviewMetrics;
}>();

const items = computed(() => [
  { label: '计划完成数', value: props.metrics.planText, test: 'metric-plan', miss: false },
  { label: '学习时长及目标', value: props.metrics.studyText, test: 'metric-study', miss: false },
  { label: '阅读页数', value: props.metrics.pagesText, test: 'metric-pages', miss: false },
  { label: '喝水量及目标', value: props.metrics.waterText, test: 'metric-water', miss: false },
  {
    label: '是否运动',
    value: props.metrics.workoutText,
    test: 'metric-workout',
    miss: props.metrics.workoutText === '未运动',
  },
  { label: '娱乐时长及额度', value: props.metrics.playText, test: 'metric-play', miss: false },
  {
    label: '计划学习时长与实际差值',
    value: props.metrics.diffText,
    test: 'metric-diff',
    miss: props.metrics.diffText.trim().startsWith('-'),
  },
]);
</script>

<template>
  <div class="review-metrics" data-test="review-metrics">
    <div class="metrics-head">
      <h2>今日自动汇总</h2>
      <span class="metrics-note">按当天记录实时算，不用手填</span>
    </div>
    <div class="metrics-grid" data-test="metrics-grid">
      <div
        v-for="item in items"
        :key="item.label"
        class="metric-item"
        :class="{ miss: item.miss }"
        :data-test="item.test"
      >
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-value num" :data-test="item.test + '-value'">{{ item.value }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-metrics {
  margin-bottom: 18px;
  padding: 16px 16px 14px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.metrics-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.metrics-head h2 {
  margin: 0;
  font-size: 15px;
}
.metrics-note {
  font-size: 11px;
  color: var(--muted);
}
/* 1px 细线分栏（表格画法：容器只画上/左，格子画右/下，最后一行不吃空槽） */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}
.metric-item {
  padding: 10px 12px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.metric-label {
  margin-bottom: 5px;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.metric-value {
  font-size: 15px;
  font-weight: 700;
  word-break: keep-all;
  overflow-wrap: break-word;
}
.metric-item.miss .metric-value {
  color: var(--danger);
}
</style>
