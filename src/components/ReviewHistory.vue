<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DAY_MS, addDays, formatDateCNWeekday, parseDateKey } from '@/utils/date';
import type { ReviewHistoryItem } from '@/stores/review';

/**
 * 复盘历史（区间查看）：
 * 顶部选区间（近 7 天 / 近 30 天 / 本月 / 全部 + 自定义起止），列表只列区间内**已写**的复盘（按日期倒序），
 * 未填写日期不占行，漏写量由顶部「已写 X / Y 天」体现；
 * 点开只读详情不改变全局日期，只有「编辑这一天」才发出 select-date。
 * 摘要只显示「一句话总结今天」，为空就留空，不回退其它字段。
 */
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

/** 区间总天数（含首尾），用于「已写 X / Y 天」。 */
const rangeDayCount = computed(() => {
  const start = parseDateKey(range.value.start);
  const end = parseDateKey(range.value.end);
  if (start === null || end === null || start > end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
});

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
      <span class="history-span num">{{ rangeDayCount }} 天</span>
    </div>

    <div class="history-range" data-test="history-range">
      <div class="preset-row">
        <button
          v-for="preset in PRESETS"
          :key="preset.key"
          type="button"
          class="preset-btn"
          :class="{ on: activePreset === preset.key }"
          :data-test="`history-preset-${preset.key}`"
          @click="setPreset(preset.key)"
        >
          {{ preset.label }}
        </button>
      </div>
      <label class="range-field">
        开始
        <input
          v-model="startDate"
          type="date"
          data-test="history-start"
          @change="onManualDateChange"
        />
      </label>
      <label class="range-field">
        结束
        <input
          v-model="endDate"
          type="date"
          data-test="history-end"
          @change="onManualDateChange"
        />
      </label>
      <span class="history-stats" data-test="history-range-stats">
        已写 {{ rows.length }} / {{ rangeDayCount }} 天
      </span>
    </div>

    <p v-if="rows.length === 0" class="hint" data-test="history-empty">
      该区间还没有复盘；用顶栏日期切到那天即可补写
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
        <button type="button" class="history-row" data-test="history-row" @click="toggleDetail(row.date)">
          <span class="history-date">{{ formatDateCNWeekday(row.date) }}</span>
          <span class="history-meta" data-test="history-meta">
            <span class="history-rating" data-test="history-rating">{{ ratingStars(row.rating) }}</span>
            <span class="history-mood" data-test="history-mood">{{ moodLabel(row.mood) }}</span>
            <span class="history-energy" data-test="history-energy">{{ energyBars(row.energy) }}</span>
          </span>
          <span class="history-summary" data-test="history-summary">{{ row.summary }}</span>
          <span class="history-chevron">{{ expandedDate === row.date ? '▾' : '▸' }}</span>
        </button>

        <div v-if="expandedDate === row.date" class="history-detail" data-test="history-detail">
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
.review-history {
  padding: 16px 16px 14px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.history-head h2 {
  margin: 0;
  font-size: 15px;
}
.history-range {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.preset-row {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}
.preset-btn {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}
.preset-btn:hover {
  border-color: var(--border-ink);
  color: var(--text);
}
.preset-btn.on {
  background: var(--text);
  border-color: var(--border-ink);
  color: var(--panel);
  font-weight: 700;
}
.range-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.range-field input {
  border: 1px solid var(--border);
  background: var(--panel-2);
  padding: 4px 8px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
}
.history-span {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}
.history-stats {
  color: var(--muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
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
  overflow: hidden;
}
.history-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.history-row:hover {
  background: var(--panel-2);
}
.history-date {
  font-family: var(--font-mono);
  font-weight: 700;
  min-width: 104px;
}
.history-meta {
  display: inline-flex;
  gap: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.history-rating {
  color: var(--text);
  letter-spacing: 1px;
}
.history-energy {
  letter-spacing: 1px;
}
.history-summary {
  color: var(--muted);
  flex: 1;
  min-width: 180px;
  white-space: pre-wrap;
}
.history-chevron {
  color: var(--muted);
}
.history-detail {
  border-top: 1px solid var(--border);
  background: var(--panel-2);
  padding: 12px;
  display: grid;
  gap: 10px;
}
.detail-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail-label {
  color: var(--muted);
  font-size: 12px;
}
.detail-text {
  margin: 0;
  white-space: pre-wrap;
}
.detail-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
