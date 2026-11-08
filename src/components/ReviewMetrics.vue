<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMetrics } from '@/stores/review';

/**
 * 复盘页 7 项自动汇总（只读）。
 * 数值与文案由 useReviewStore.computeMetrics 计算，组件只负责渲染。
 * 数字采用开放排版，不嵌套边框；未运动保持安静的辅助色。
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
      <span class="metrics-note">随当天记录更新</span>
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
.metrics-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:24px; }
.metrics-head h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
.metrics-note { font-size:12px; color:var(--muted); }
.metrics-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:28px 24px; }
.metric-item { min-width:0; }
.metric-label { margin-bottom:8px; font-size:12px; color:var(--muted); line-height:1.5; }
.metric-value { font-size:clamp(16px,2.5vw,22px); font-weight:600; line-height:1.6; letter-spacing:-.035em; overflow-wrap:anywhere; }
.metric-item.miss .metric-value { color:var(--muted); }
@media (max-width:768px) { .metrics-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px 20px; } }
</style>
