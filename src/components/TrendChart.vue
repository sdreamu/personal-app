<script setup lang="ts">
import { computed } from 'vue';
import { buildSparkline, summarize, SPARKLINE_DEFAULT_HEIGHT, SPARKLINE_DEFAULT_WIDTH } from '@/utils/sparkline';

/**
 * 心情 / 精力曲线（P3）：纯 SVG 折线，不引任何图表库。
 * 只画最近 N 天，缺的日期断线；每条线的颜色都来自 CSS 变量。
 */
const props = withDefaults(
  defineProps<{
    series: { key: string; label: string; values: (number | null)[] }[];
    dates: string[];
    min?: number;
    max?: number;
  }>(),
  { min: 1, max: 5 },
);

const width = SPARKLINE_DEFAULT_WIDTH;
const height = SPARKLINE_DEFAULT_HEIGHT;

interface SeriesGeometry {
  key: string;
  label: string;
  values: (number | null)[];
  segments: string[];
  count: number;
  average: number | null;
}

const geometries = computed<SeriesGeometry[]>(() =>
  props.series.map((item) => {
    const geo = buildSparkline(item.values, { width, height, min: props.min, max: props.max, limit: item.values.length });
    const stats = summarize(item.values);
    return { ...item, segments: geo.segments, count: stats.count, average: stats.average };
  }),
);

/** 全都还没记录：显示空态而不是一条空坐标轴。 */
const isEmpty = computed(() => geometries.value.every((item) => item.count === 0));

/** 1~5 五条横线的位置（等分），给"读数"用。 */
const gridLines = computed(() => {
  const range = Math.max(1, props.max - props.min);
  return [props.max, props.min + (props.max - props.min) / 2, props.min].map((value) => ({
    value,
    y: 6 + ((props.max - value) / range) * (height - 12),
  }));
});

const firstDate = computed(() => props.dates[0] ?? '');
const lastDate = computed(() => props.dates[props.dates.length - 1] ?? '');
</script>

<template>
  <div class="trend" data-test="trend-chart">
    <ul class="trend-legend">
      <li v-for="item in geometries" :key="item.key" :data-test="'trend-legend-' + item.key">
        <span class="trend-swatch" :class="'swatch-' + item.key" aria-hidden="true" />
        <span class="trend-label">{{ item.label }}</span>
        <span class="trend-stat num" :data-test="'trend-stat-' + item.key">
          {{ item.count === 0 ? '还没记录' : item.count + ' 天 · 平均 ' + item.average }}
        </span>
      </li>
    </ul>

    <p v-if="isEmpty" class="hint" data-test="trend-empty">
      还没有心情 / 精力记录。每天在下面选一次，这里就会长出曲线。
    </p>

    <template v-else>
      <svg
        class="trend-svg"
        :viewBox="'0 0 ' + width + ' ' + height"
        role="img"
        :aria-label="'最近 ' + dates.length + ' 天的心情与精力曲线'"
        data-test="trend-svg"
      >
        <line
          v-for="line in gridLines"
          :key="'grid-' + line.value"
          class="trend-grid"
          x1="0"
          :y1="line.y.toFixed(2)"
          :x2="width"
          :y2="line.y.toFixed(2)"
        />
        <template v-for="item in geometries" :key="item.key">
          <polyline
            v-for="(segment, index) in item.segments"
            :key="item.key + '-seg-' + index"
            class="trend-line"
            :class="'series-' + item.key"
            :points="segment"
            fill="none"
            :data-test="'trend-line-' + item.key"
          />
        </template>
      </svg>
      <div class="trend-axis num">
        <span>{{ firstDate.slice(5) }}</span>
        <span>{{ lastDate.slice(5) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trend-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted);
}
.trend-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.trend-swatch {
  width: 12px;
  height: 3px;
  display: inline-block;
}
.swatch-mood {
  background: var(--accent);
}
.swatch-energy {
  background: var(--text);
}
.trend-label {
  color: var(--text);
}
.trend-svg {
  width: 100%;
  height: auto;
  border: var(--line-w) solid var(--border-ink);
  background: var(--panel);
}
.trend-grid {
  stroke: var(--line);
  stroke-width: 1;
}
.trend-line {
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.series-mood {
  stroke: var(--accent);
}
.series-energy {
  stroke: var(--text);
}
.trend-axis {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 12px;
}
</style>
