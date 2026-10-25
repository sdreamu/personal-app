<script setup lang="ts">
/**
 * 复盘三项状态打分（4b）：
 * 今日评分 1~5 星、心情 1~5（😞😕😐🙂😄）、精力 1~5 能量格。
 * 受控组件：点击选中；再次点击已选中项取消（emit null）。
 */
const props = defineProps<{
  rating: number | null;
  mood: number | null;
  energy: number | null;
}>();

const emit = defineEmits<{
  (e: 'update:rating', value: number | null): void;
  (e: 'update:mood', value: number | null): void;
  (e: 'update:energy', value: number | null): void;
}>();

const MOODS = ['😞', '😕', '😐', '🙂', '😄'] as const;
const ENERGY_BARS = ['▯', '▯', '▯', '▯', '▯'] as const;

function toggleRating(value: number): void {
  emit('update:rating', props.rating === value ? null : value);
}
function toggleMood(value: number): void {
  emit('update:mood', props.mood === value ? null : value);
}
function toggleEnergy(value: number): void {
  emit('update:energy', props.energy === value ? null : value);
}
</script>

<template>
  <div class="review-mood-picker" data-test="mood-picker">
    <div class="pick-row" data-test="rating-row">
      <span class="pick-label">今日评分</span>
      <div class="pick-options">
        <button
          v-for="n in 5"
          :key="'star-' + n"
          type="button"
          class="pick-btn star"
          :class="{ on: props.rating !== null && n <= props.rating }"
          data-test="rating-star"
          :aria-label="n + ' 星'"
          @click="toggleRating(n)"
        >
          {{ props.rating !== null && n <= props.rating ? '★' : '☆' }}
        </button>
      </div>
    </div>

    <div class="pick-row" data-test="mood-row">
      <span class="pick-label">今日心情</span>
      <div class="pick-options">
        <button
          v-for="(face, index) in MOODS"
          :key="'mood-' + index"
          type="button"
          class="pick-btn face"
          :class="{ on: props.mood === index + 1 }"
          data-test="mood-btn"
          :aria-label="(index + 1) + ' 级心情'"
          @click="toggleMood(index + 1)"
        >
          {{ face }}
        </button>
      </div>
    </div>

    <div class="pick-row" data-test="energy-row">
      <span class="pick-label">今日精力</span>
      <div class="pick-options">
        <button
          v-for="(bar, index) in ENERGY_BARS"
          :key="'energy-' + index"
          type="button"
          class="pick-btn energy"
          :class="{ on: props.energy !== null && index + 1 <= props.energy }"
          data-test="energy-bar"
          :aria-label="(index + 1) + ' 格精力'"
          @click="toggleEnergy(index + 1)"
        >
          {{ props.energy !== null && index + 1 <= props.energy ? '▮' : bar }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-mood-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pick-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.pick-label {
  min-width: 64px;
  color: var(--muted);
  font-size: 12px;
}
.pick-options {
  display: inline-flex;
  gap: 4px;
}
.pick-btn {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  padding: 4px 10px;
  line-height: 1.3;
  cursor: pointer;
}
.pick-btn:hover {
  border-color: var(--border-ink);
  color: var(--text);
}
/* 选中 = 反相块（墨底反白），和侧栏当前项同一套语法 */
.pick-btn.on {
  background: var(--text);
  border-color: var(--border-ink);
  color: var(--panel);
  font-weight: 700;
}
.star {
  font-size: 17px;
  padding: 2px 7px;
}
.face {
  font-size: 18px;
  padding: 2px 9px;
}
.energy {
  font-size: 13px;
  letter-spacing: 1px;
}
</style>
