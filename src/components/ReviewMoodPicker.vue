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
const ENERGY_LABELS = ['疲惫', '偏低', '一般', '良好', '充沛'] as const;

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
          :aria-pressed="props.rating === n"
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
          :aria-pressed="props.mood === index + 1"
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
          v-for="(label, index) in ENERGY_LABELS"
          :key="'energy-' + index"
          type="button"
          class="pick-btn energy"
          :class="{ on: props.energy === index + 1 }"
          :aria-pressed="props.energy === index + 1"
          data-test="energy-bar"
          :aria-label="(index + 1) + ' 级精力：' + label"
          @click="toggleEnergy(index + 1)"
        >
          {{ index + 1 }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-mood-picker { display:grid; gap:14px; }
.pick-row { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.pick-label { color:var(--muted); font-size:13px; min-width:64px; }
.pick-options { display:inline-flex; gap:8px; }
.pick-btn { border:none; background:transparent; color:var(--muted); width:44px; height:44px; padding:0; border-radius:50%; cursor:pointer; font:inherit; font-size:17px; }
.pick-btn:hover { background:var(--accent-soft); }
.pick-btn.on { color:var(--accent); background:var(--accent-soft); font-weight:600; }
.star { font-size:26px; }
.star.on { background:transparent; }
.face { font-size:25px; }
@media (max-width:420px) { .pick-label { flex-basis:100%; } .pick-row { gap:4px; } }
</style>
