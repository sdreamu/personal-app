<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { addDays, formatDateCNWeekday } from '@/utils/date';
import type { ReviewHistoryItem } from '@/stores/review';

/** 历史列表展开只读详情；补写或编辑才切换日期。 */
const props = defineProps<{
  items: ReviewHistoryItem[];
  /** 今天的逻辑日期（YYYY-MM-DD），用于默认区间与“不展示未来日期”。 */
  today: string;
}>();

const emit = defineEmits<{
  (e: 'select-date', date: string): void;
}>();

const MOOD_LABELS = ['😞', '😕', '😐', '🙂', '😄'] as const;

const PRESETS = [
  { key: '7', label: '近 7 天' },
  { key: '30', label: '近 30 天' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
] as const;
type PresetKey = (typeof PRESETS)[number]['key'];

const startDate = ref(addDays(props.today, -29));
const endDate = ref(props.today);
const activePreset = ref<PresetKey | null>('30');
const expandedDate = ref<string | null>(null);

function setPreset(key: PresetKey): void {
  activePreset.value = key;
  endDate.value = props.today;
  if (key === '7') {
    startDate.value = addDays(props.today, -6);
  } else if (key === '30') {
    startDate.value = addDays(props.today, -29);
  } else if (key === 'month') {
    startDate.value = `${props.today.slice(0, 7)}-01`;
  } else {
    const first = props.items
      .map((item) => item.date)
      .sort()
      .find((date) => date <= props.today);
    startDate.value = first ?? props.today;
  }
}

function onManualDateChange(): void {
  activePreset.value = null;
}

watch(
  () => props.today,
  (today) => {
    if (activePreset.value !== null) setPreset(activePreset.value);
    else endDate.value = today;
  },
);

/** 起止日期归一化（start > end 自动交换），且不展示未来日期。 */
const range = computed(() => {
  const start = startDate.value <= endDate.value ? startDate.value : endDate.value;
  const rawEnd = startDate.value <= endDate.value ? endDate.value : startDate.value;
  return { start, end: rawEnd > props.today ? props.today : rawEnd };
});

/** 区间内已写的复盘，按日期倒序。 */
const rows = computed<ReviewHistoryItem[]>(() =>
  props.items
    .filter((item) => item.date >= range.value.start && item.date <= range.value.end)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
);

function openDate(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.value) && input.value <= props.today) emit('select-date', input.value);
  input.value = '';
}

function toggleDetail(date: string): void {
  expandedDate.value = expandedDate.value === date ? null : date;
}

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
</script>

<template>
  <div class="review-history" data-test="review-history">
    <div class="history-head">
      <h2>历史复盘</h2>
      <label class="history-add">
        <span>＋ 补写复盘</span>
        <input type="date" :max="today" aria-label="选择补写日期" data-test="history-open-date" @change="openDate" />
      </label>
    </div>

    <div class="history-range" data-test="history-range">
      <div class="preset-row">
        <button
          v-for="preset in PRESETS"
          :key="preset.key"
          type="button"
          class="preset-btn"
          :class="{ on: activePreset === preset.key }"
          :aria-pressed="activePreset === preset.key"
          :data-test="`history-preset-${preset.key}`"
          @click="setPreset(preset.key)"
        >
          {{ preset.label }}
        </button>
      </div>
      <details class="custom-range">
        <summary>自选日期</summary>
        <div class="range-inputs">
          <label class="range-field">开始<input v-model="startDate" type="date" :max="today" data-test="history-start" @change="onManualDateChange" /></label>
          <span aria-hidden="true">—</span>
          <label class="range-field">结束<input v-model="endDate" type="date" :max="today" data-test="history-end" @change="onManualDateChange" /></label>
        </div>
      </details>
    </div>

    <p v-if="rows.length === 0" class="hint" data-test="history-empty">
      这段时间还没有复盘。点击“补写复盘”，记录想留下的那一天。
    </p>

    <ul class="history-list" data-test="history-list">
      <li
        v-for="row in rows"
        :key="row.date"
        class="history-item"
        :data-date="row.date"
        data-filled="yes"
        data-test="history-item"
      >
        <button type="button" class="history-row" :aria-expanded="expandedDate === row.date" :aria-controls="`review-detail-${row.date}`" data-test="history-row" @click="toggleDetail(row.date)">
          <span class="history-date">{{ formatDateCNWeekday(row.date) }}</span>
          <span class="history-meta" data-test="history-meta">
            <span class="history-rating" data-test="history-rating">{{ ratingStars(row.rating) }}</span>
            <span class="history-mood" data-test="history-mood">{{ moodLabel(row.mood) }}</span>
            <span class="history-energy" data-test="history-energy">{{ energyBars(row.energy) }}</span>
          </span>
          <span class="history-summary" data-test="history-summary">{{ row.summary }}</span>
          <span class="history-chevron">{{ expandedDate === row.date ? '▾' : '▸' }}</span>
        </button>

        <div v-if="expandedDate === row.date" :id="`review-detail-${row.date}`" class="history-detail" data-test="history-detail">
          <div class="detail-field">
            <span class="detail-label">今天一件值得记录的事</span>
            <p class="detail-text" data-test="history-detail-record-worthy">{{ row.record_worthy || '—' }}</p>
          </div>
          <div class="detail-field">
            <span class="detail-label">一句话总结今天</span>
            <p class="detail-text" data-test="history-detail-day-summary">{{ row.day_summary || '—' }}</p>
          </div>
          <div class="detail-field">
            <span class="detail-label">做得好的</span>
            <p class="detail-text" data-test="history-detail-good">{{ row.good || '—' }}</p>
          </div>
          <div class="detail-field">
            <span class="detail-label">要改进的</span>
            <p class="detail-text" data-test="history-detail-improve">{{ row.improve || '—' }}</p>
          </div>
          <div class="detail-field">
            <span class="detail-label">明天最重要的一件事</span>
            <p class="detail-text" data-test="history-detail-mit">{{ row.mit || '—' }}</p>
          </div>
          <div class="detail-actions">
            <button
              type="button"
              class="ghost-btn"
              data-test="history-edit-date"
              @click="emit('select-date', row.date)"
            >
              编辑这一天
            </button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.history-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
.history-head h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
.history-add { position:relative; color:var(--accent); font-size:13px; display:inline-flex; align-items:center; min-height:44px; cursor:pointer; white-space:nowrap; }
.history-add input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
.history-add:focus-within { outline:2px solid var(--accent); outline-offset:3px; border-radius:10px; }
.history-add input::-webkit-calendar-picker-indicator { position:absolute; inset:0; width:100%; height:100%; cursor:pointer; }
.history-range { display:flex; flex-wrap:wrap; align-items:flex-start; gap:6px 16px; margin-bottom:16px; }
.preset-row { display:flex; gap:4px; flex-wrap:wrap; }
.preset-btn { border:none; background:transparent; color:var(--muted); min-height:44px; padding:0 14px; border-radius:var(--radius-pill); cursor:pointer; font:inherit; font-size:13px; }
.preset-btn.on { background:var(--accent-soft); color:var(--accent); font-weight:600; }
.custom-range { font-size:13px; color:var(--muted); }
.custom-range summary { min-height:44px; display:flex; align-items:center; cursor:pointer; gap:6px; }
.custom-range summary::after { content:'⌄'; }
.custom-range[open] summary::after { content:'⌃'; }
.range-inputs { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:8px 0 12px; }
.range-field { display:flex; flex-direction:column; gap:6px; font-size:12px; }
.range-field input { max-width:100%; min-width:0; min-height:44px; border:0; border-bottom:1px solid var(--border); background:transparent; padding:0 4px; color:var(--text); font:inherit; font-size:14px; }
.history-list { list-style:none; margin:0; padding:0; }
.history-item { border-bottom:1px solid var(--border); }
.history-row { display:grid; grid-template-columns:minmax(0,1fr) auto 16px; gap:6px 12px; align-items:center; width:100%; min-height:76px; padding:18px 0; border:none; background:transparent; color:var(--text); text-align:left; cursor:pointer; }
.history-date { font-size:14px; font-weight:600; }
.history-meta { display:flex; gap:8px; font-size:12px; color:var(--muted); align-items:center; }
.history-rating { color:var(--accent); letter-spacing:1px; }
.history-energy { font-size:10px; }
.history-summary { grid-row:2; grid-column:1 / 3; font-size:13px; color:var(--muted); overflow-wrap:anywhere; line-height:1.6; }
.history-chevron { grid-column:3; grid-row:1 / 3; color:var(--muted); }
.history-detail { display:grid; gap:20px; padding:8px 0 24px; }
.detail-label { color:var(--muted); font-size:12px; }
.detail-text { margin:6px 0 0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.7; font-size:14px; }
.detail-actions { display:flex; justify-content:flex-end; }
.hint { margin:0; padding:16px 0; font-size:13px; line-height:1.8; }
@media (max-width:360px) { .preset-btn { padding:0 11px; } .history-meta { gap:4px; font-size:11px; } }
</style>
