<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, routerKey } from 'vue-router';
import { useReviewAutosave } from '@/composables/useReviewAutosave';
import ReviewHistory from '@/components/ReviewHistory.vue';
import TrendChart from '@/components/TrendChart.vue';
import { alignSeries, recentDates } from '@/utils/sparkline';
import ReviewMetrics from '@/components/ReviewMetrics.vue';
import ReviewMoodPicker from '@/components/ReviewMoodPicker.vue';
import { errorMessage } from '@/db';
import { setDateChangeGuard, useDateStore } from '@/stores/date';
import { DAY_SUMMARY_MAX_LENGTH, useReviewStore } from '@/stores/review';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import { logicalToday } from '@/utils/date';

/** 日记式复盘：自动保存；历史展开只读，编辑时先保存当前日期。 */
const dateStore = useDateStore();
const reviewStore = useReviewStore();
const settingsStore = useSettingsStore();
const toast = useToastStore();

const selectedDate = computed(() => dateStore.selectedDate);
const todayKey = computed(() => logicalToday(settingsStore.dayStartMin));

const rating = ref<number | null>(null);
/** P3 心情 / 精力曲线：最近 14 天（含今天），缺的日期断线。 */
const TREND_DAYS = 14;
const trendDates = computed(() => recentDates(todayKey.value, TREND_DAYS));
const trendSeries = computed(() => {
  return [
    {
      key: 'mood',
      label: '心情',
      values: alignSeries(trendDates.value, reviewStore.reviews.map((row) => ({ date: row.date, value: row.mood }))).map(
        (item) => item.value,
      ),
    },
    {
      key: 'energy',
      label: '精力',
      values: alignSeries(trendDates.value, reviewStore.reviews.map((row) => ({ date: row.date, value: row.energy }))).map(
        (item) => item.value,
      ),
    },
  ];
});

const mood = ref<number | null>(null);
const energy = ref<number | null>(null);
const recordWorthyText = ref('');
const daySummaryText = ref('');
const goodText = ref('');
const improveText = ref('');
const mitText = ref('');

const daySummaryCount = computed(() => daySummaryText.value.length);
const ready = ref(false);
const loadError = ref(false);
const autosave = useReviewAutosave((date, patch) => reviewStore.upsertReview(date, patch));
const saveLabel = computed(() => ({
  idle: '输入后自动保存', pending: '等待保存…', saving: '保存中…', saved: '已自动保存', error: '保存失败，内容已保留',
})[autosave.status.value]);

function syncFromReview(): void {
  const review = reviewStore.review;
  rating.value = review?.rating ?? null;
  mood.value = review?.mood ?? null;
  energy.value = review?.energy ?? null;
  recordWorthyText.value = review?.record_worthy ?? '';
  daySummaryText.value = review?.day_summary ?? '';
  goodText.value = review?.good ?? '';
  improveText.value = review?.improve ?? '';
  mitText.value = review?.mit ?? '';
}

function snapshot() {
  return { rating: rating.value, mood: mood.value, energy: energy.value,
    record_worthy: recordWorthyText.value, day_summary: daySummaryText.value,
    good: goodText.value, improve: improveText.value, mit: mitText.value };
}

watch([rating, mood, energy, recordWorthyText, daySummaryText, goodText, improveText, mitText], () => {
  if (ready.value) autosave.enqueue(selectedDate.value, snapshot());
}, { flush: 'sync' });

async function load(): Promise<void> {
  const date = selectedDate.value;
  ready.value = false;
  loadError.value = false;
  try {
    await reviewStore.load(date);
    if (selectedDate.value !== date || reviewStore.loadedDate !== date) return;
    syncFromReview();
    const draft = autosave.restore(date);
    if (draft) {
      rating.value = draft.rating ?? null; mood.value = draft.mood ?? null; energy.value = draft.energy ?? null;
      recordWorthyText.value = draft.record_worthy ?? ''; daySummaryText.value = draft.day_summary ?? '';
      goodText.value = draft.good ?? ''; improveText.value = draft.improve ?? ''; mitText.value = draft.mit ?? '';
    }
    ready.value = true;
    if (draft) autosave.enqueue(date, snapshot());
  } catch (err) {
    if (selectedDate.value !== date) return;
    loadError.value = true;
    toast.error(`加载复盘数据失败：${errorMessage(err)}`);
  }
}

watch(selectedDate, () => { void load(); });
let requestedDate: string | null = null;
function guardDateChange(next: string): boolean {
  if (['idle', 'saved'].includes(autosave.status.value)) return true;
  requestedDate = next;
  void autosave.flush().then((saved) => {
    if (saved && requestedDate === next) { requestedDate = null; dateStore.setSelected(next, { force: true }); }
  });
  return false;
}

function flushOnHide(): void { void autosave.flush(); }
onMounted(() => {
  setDateChangeGuard(guardDateChange);
  window.addEventListener('pagehide', flushOnHide);
  void load();
});
if (inject(routerKey, null)) onBeforeRouteLeave(async () => await autosave.flush());
onBeforeUnmount(() => {
  ready.value = false;
  requestedDate = null;
  setDateChangeGuard(null);
  window.removeEventListener('pagehide', flushOnHide);
  autosave.dispose();
});

function onRatingChange(value: number | null): void {
  rating.value = value;
}
function onMoodChange(value: number | null): void {
  mood.value = value;
}
function onEnergyChange(value: number | null): void {
  energy.value = value;
}

function onRecordWorthyInput(event: Event): void {
  recordWorthyText.value = (event.target as HTMLTextAreaElement).value;
}
function onDaySummaryInput(event: Event): void {
  daySummaryText.value = (event.target as HTMLInputElement).value.slice(0, DAY_SUMMARY_MAX_LENGTH);
}
function onGoodInput(event: Event): void {
  goodText.value = (event.target as HTMLTextAreaElement).value;
}
function onImproveInput(event: Event): void {
  improveText.value = (event.target as HTMLTextAreaElement).value;
}
function onMitInput(event: Event): void {
  mitText.value = (event.target as HTMLTextAreaElement).value;
}

function onSelectDate(date: string): void {
  dateStore.setSelected(date);
}
</script>

<template>
  <section class="page review-page" data-test="review-view">
    <div class="review-title-row">
      <div><h1 class="page-title">复盘</h1><p class="review-date" data-test="review-date">{{ selectedDate }}</p></div>
      <button v-if="selectedDate !== todayKey" class="ghost-btn" data-test="review-today" @click="onSelectDate(todayKey)">回到今天</button>
    </div>

    <div v-if="!ready && !loadError" class="hint" data-test="review-loading">
      正在加载复盘数据…
    </div>

    <div v-else-if="loadError" class="review-load-error" role="alert" data-test="review-load-error">
      复盘数据加载失败，请重试。<button class="ghost-btn" @click="load">重新加载</button>
    </div>
    <template v-else>
      <ReviewMetrics v-if="reviewStore.metrics" :metrics="reviewStore.metrics" />

      <div class="review-self" data-test="review-self">
        <div class="self-head">
          <h2>{{ selectedDate === todayKey ? '今日自评' : '这一天的自评' }}</h2>
          <div class="save-feedback" role="status" aria-live="polite">
            <span class="self-note" data-test="review-save-status">{{ saveLabel }}</span>
            <button v-if="autosave.status.value === 'error'" class="ghost-btn" data-test="review-save-retry" @click="autosave.flush()">重试保存</button>
          </div>
        </div>
        <ReviewMoodPicker
          :rating="rating"
          :mood="mood"
          :energy="energy"
          @update:rating="onRatingChange"
          @update:mood="onMoodChange"
          @update:energy="onEnergyChange"
        />
        <div class="review-highlights" data-test="review-highlights">
          <label class="review-field">
            <span class="review-field-label">今天一件值得记录的事</span>
            <textarea
              data-test="review-record-worthy"
              :value="recordWorthyText"
              rows="2"
              placeholder="今天有什么值得记住的瞬间？"
              @input="onRecordWorthyInput"
            />
          </label>
          <label class="review-field">
            <span class="review-field-label">一句话总结今天</span>
            <input
              data-test="review-day-summary"
              type="text"
              :value="daySummaryText"
              :maxlength="DAY_SUMMARY_MAX_LENGTH"
              placeholder="用一句话概括今天"
              @input="onDaySummaryInput"
            />
            <span class="review-counter" data-test="review-day-summary-counter">
              {{ daySummaryCount }}/{{ DAY_SUMMARY_MAX_LENGTH }}
            </span>
          </label>
        </div>

        <div class="review-texts" data-test="review-texts">
          <label class="review-field">
            <span class="review-field-label">做得好的</span>
            <textarea
              data-test="review-good"
              :value="goodText"
              rows="3"
              placeholder="今天哪些地方做得不错？"
              @input="onGoodInput"
            />
          </label>
          <label class="review-field">
            <span class="review-field-label">要改进的</span>
            <textarea
              data-test="review-improve"
              :value="improveText"
              rows="3"
              placeholder="明天可以怎么改进？"
              @input="onImproveInput"
            />
          </label>
          <label class="review-field">
            <span class="review-field-label">明天最重要的一件事</span>
            <textarea
              data-test="review-mit"
              :value="mitText"
              rows="2"
              placeholder="只写一件，明天会在首页提醒你"
              @input="onMitInput"
            />
          </label>
        </div>

      </div>

      <ReviewHistory
        :items="reviewStore.historyItems"
        :today="todayKey"
        @select-date="onSelectDate"
      />

      <div class="settings-card review-trend" data-test="review-trend">
        <div class="self-head">
          <h2>心情 / 精力</h2>
          <span class="self-note">最近 {{ TREND_DAYS }} 天，1~5 分</span>
        </div>
        <TrendChart :series="trendSeries" :dates="trendDates" />
      </div>
    </template>

  </section>
</template>

<style scoped>
.review-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; gap:12px; }
.review-title-row .page-title { margin-bottom:4px; }
.review-date { margin:0; font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
.self-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
.self-head h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
.self-note { font-size:12px; color:var(--muted); }
.save-feedback { display:flex; align-items:center; gap:8px; }
.review-highlights, .review-texts { display:grid; grid-template-columns:minmax(0,1fr); gap:24px; margin-top:28px; }
.review-field { display:flex; flex-direction:column; gap:6px; min-width:0; position:relative; }
.review-field-label { color:var(--muted); font-size:13px; }
.review-field textarea, .review-field input { width:100%; box-sizing:border-box; resize:vertical; color:var(--text); font:inherit; line-height:1.7; }
.review-field textarea::placeholder, .review-field input::placeholder { color:var(--muted); opacity:1; }
.review-counter { color:var(--muted); align-self:flex-end; font-size:11px; font-variant-numeric:tabular-nums; }
.review-load-error { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
</style>
