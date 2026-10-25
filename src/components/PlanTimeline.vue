<script setup lang="ts">
import { computed } from 'vue';
import { layoutTimelineLanes, type TimelineLaneItem } from '@/stores/plan';
import { MINUTES_PER_DAY, offsetToTime } from '@/utils/date';
import type { Plan } from '@/db';

/**
 * 计划时间轴：从一天起点开始覆盖 24 小时（偏移 0~1440）。
 * 时间块按开始偏移排序渲染；同一重叠簇内并排分泳道显示并给出重叠提示图标。
 * 纯展示组件：排序/重叠/泳道全部来自 plan store 导出的纯函数。
 */
const props = defineProps<{
  /** 该日期的时间块（可含无时间待办，组件内部过滤）。 */
  plans: Plan[];
  dayStartMin: number;
}>();
const emit = defineEmits<{ (e: 'start', plan: Plan): void }>();

const hours = Array.from({ length: 24 }, (_, i) => i);

const layout = computed(() => layoutTimelineLanes(props.plans));

function timeLabel(offsetMin: number): string {
  return offsetToTime(offsetMin, props.dayStartMin);
}

function blockStyle(item: TimelineLaneItem): Record<string, string> {
  const top = (item.startMin / MINUTES_PER_DAY) * 100;
  const height = ((item.endMin - item.startMin) / MINUTES_PER_DAY) * 100;
  const width = 100 / item.laneCount;
  return {
    top: `${top}%`,
    height: `${height}%`,
    left: `${item.lane * width}%`,
    width: `${width}%`,
  };
}

function hourLineStyle(hour: number): Record<string, string> {
  return { top: `${(hour / 24) * 100}%` };
}

function canStart(plan: Plan): boolean {
  return !plan.done && plan.target_type !== null && plan.target_id !== null;
}
</script>

<template>
  <div class="plan-timeline" data-test="plan-timeline">
    <p v-if="layout.length === 0" class="hint" data-test="timeline-empty">
      暂无时间块，点右侧待办“安排时间”添加
    </p>
    <div v-else class="timeline-body">
      <div class="hour-labels" data-test="hour-labels">
        <div v-for="h in hours" :key="h" class="hour-label" :data-hour="h">
          {{ timeLabel(h * 60) }}
        </div>
      </div>
      <div class="timeline-track" data-test="timeline-track">
        <div v-for="h in hours" :key="h" class="hour-line" :data-hour="h" :style="hourLineStyle(h)" />
        <div
          v-for="item in layout"
          :key="item.plan.id"
          class="timeline-block"
          :class="{ done: item.plan.done }"
          :style="blockStyle(item)"
          :data-start="item.startMin"
          :data-end="item.endMin"
          :data-lane="item.lane"
          data-test="timeline-block"
        >
          <div class="block-inner">
            <span
              v-if="item.hasOverlap"
              class="overlap-icon"
              data-test="overlap-icon"
              title="与其他时间块重叠"
              >⚠</span
            >
            <span class="block-time">{{ timeLabel(item.startMin) }}-{{ timeLabel(item.endMin) }}</span>
            <span class="block-title">{{ item.plan.title }}</span>
            <button
              v-if="canStart(item.plan)"
              class="ghost-btn block-start"
              data-test="timeline-start"
              @click="emit('start', item.plan)"
            >
              开始
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-timeline {
  min-width: 0;
}
.timeline-body {
  display: flex;
  gap: 8px;
}
.hour-labels {
  flex: none;
  width: 52px;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.hour-label {
  height: 44px;
  line-height: 1;
  padding-top: 1px;
}
.timeline-track {
  position: relative;
  flex: 1;
  height: calc(24 * 44px);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.hour-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--border);
}
.timeline-block {
  position: absolute;
  padding: 1px;
  box-sizing: border-box;
}
.block-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  overflow: hidden;
  font-size: 12px;
}
.timeline-block.done .block-inner {
  background: var(--success-soft);
  border-color: var(--success);
  opacity: 0.7;
}
.block-time {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.block-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.done .block-title {
  text-decoration: line-through;
}
.overlap-icon {
  position: absolute;
  top: 3px;
  right: 4px;
  color: var(--warning);
  font-size: 12px;
}
.block-start {
  margin-top: auto;
  padding: 1px 8px;
  font-size: 12px;
  align-self: flex-start;
}
</style>
