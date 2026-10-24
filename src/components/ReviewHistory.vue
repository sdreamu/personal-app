<script setup lang="ts">
import { formatDateCNWeekday } from '@/utils/date';
import type { ReviewDateDot, ReviewHistoryItem } from '@/stores/review';

/**
 * 复盘历史与回看（4b）：
 * 历史复盘列表（日期倒序，显示星级/心情/精力/一句话摘要）；
 * 最近 14 天内未填写复盘的过去日期用灰点标记，点击灰点切换 selectedDate 补写。
 */
const props = defineProps<{
  items: ReviewHistoryItem[];
  dots: ReviewDateDot[];
}>();

const emit = defineEmits<{
  (e: 'select-date', date: string): void;
}>();

const MOOD_LABELS = ['😞', '😕', '😐', '🙂', '😄'] as const;

function ratingStars(rating: number | null): string {
  if (rating === null) return '—';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function moodLabel(mood: number | null): string {
  return mood === null ? '—' : MOOD_LABELS[mood - 1] ?? '—';
}

function energyBars(energy: number | null): string {
  if (energy === null) return '—';
  return '▮'.repeat(energy) + '▯'.repeat(5 - energy);
}

function dayOfMonth(date: string): string {
  const day = Number(date.slice(8, 10));
  return Number.isInteger(day) && day > 0 ? String(day) : '·';
}
</script>

<template>
  <div class="review-history settings-card" data-test="review-history">
    <h2>历史复盘</h2>

    <div class="dots-row" data-test="history-dots">
      <button
        v-for="dot in props.dots"
        :key="dot.date"
        type="button"
        class="history-dot"
        :class="dot.filled ? 'filled' : 'missing'"
        :data-date="dot.date"
        :data-filled="dot.filled ? 'yes' : 'no'"
        data-test="history-dot"
        :title="formatDateCNWeekday(dot.date)"
        @click="emit('select-date', dot.date)"
      >
        {{ dayOfMonth(dot.date) }}
      </button>
    </div>

    <p v-if="props.items.length === 0" class="hint" data-test="history-empty">
      还没有历史复盘
    </p>
    <ul v-else class="history-list" data-test="history-list">
      <li
        v-for="item in props.items"
        :key="item.date"
        class="history-item"
        :data-date="item.date"
        data-test="history-item"
      >
        <div class="history-date">{{ formatDateCNWeekday(item.date) }}</div>
        <div class="history-meta" data-test="history-meta">
          <span class="history-rating" data-test="history-rating">{{ ratingStars(item.rating) }}</span>
          <span class="history-mood" data-test="history-mood">{{ moodLabel(item.mood) }}</span>
          <span class="history-energy" data-test="history-energy">{{ energyBars(item.energy) }}</span>
        </div>
        <div class="history-summary" data-test="history-summary">{{ item.summary || '（无摘要）' }}</div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dots-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.history-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  line-height: 1;
}
.history-dot.missing {
  background: var(--panel-2);
  color: var(--muted);
  border-color: var(--border);
  cursor: pointer;
}
.history-dot.missing:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.history-dot.filled {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
  cursor: pointer;
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.history-date {
  font-weight: 600;
  min-width: 110px;
}
.history-meta {
  display: inline-flex;
  gap: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.history-rating {
  color: var(--warning);
  letter-spacing: 1px;
}
.history-energy {
  letter-spacing: 1px;
}
.history-summary {
  color: var(--muted);
  flex: 1;
  min-width: 180px;
}
</style>
