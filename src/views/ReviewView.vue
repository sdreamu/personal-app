<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ReviewHistory from '@/components/ReviewHistory.vue';
import ReviewMetrics from '@/components/ReviewMetrics.vue';
import ReviewMoodPicker from '@/components/ReviewMoodPicker.vue';
import { errorMessage } from '@/db';
import { useDateStore } from '@/stores/date';
import { DAY_SUMMARY_MAX_LENGTH, useReviewStore, type ReviewTextPatch } from '@/stores/review';
import { useToastStore } from '@/stores/toast';

/**
 * 复盘页 #/review（PRD §5.8 / AC-47~49）：
 * 上半部分 7 项自动汇总（只读，实时按 selectedDate 聚合）；
 * 下半部分自评（评分/心情/精力点击选中、再点取消；三栏文字 + 值得记录 + 一句话总结
 * 都走 300ms 防抖自动保存，切日期/卸载前立即 flush）；历史复盘列表与最近 14 天未复盘灰点。
 * 读/写全部跟随 dateStore.selectedDate（可回看/补写任意日期）。
 */
const dateStore = useDateStore();
const reviewStore = useReviewStore();
const toast = useToastStore();

const selectedDate = computed(() => dateStore.selectedDate);
const rating = computed(() => reviewStore.review?.rating ?? null);
const mood = computed(() => reviewStore.review?.mood ?? null);
const energy = computed(() => reviewStore.review?.energy ?? null);

const recordWorthyText = ref('');
const daySummaryText = ref('');
const goodText = ref('');
const improveText = ref('');
const mitText = ref('');

const daySummaryCount = computed(() => daySummaryText.value.length);

function syncTextFromReview(): void {
  recordWorthyText.value = reviewStore.review?.record_worthy ?? '';
  daySummaryText.value = reviewStore.review?.day_summary ?? '';
  goodText.value = reviewStore.review?.good ?? '';
  improveText.value = reviewStore.review?.improve ?? '';
  mitText.value = reviewStore.review?.mit ?? '';
}

async function load(): Promise<void> {
  try {
    await reviewStore.load(selectedDate.value);
    syncTextFromReview();
  } catch (err) {
    toast.error(`加载复盘数据失败：${errorMessage(err)}`);
  }
}

watch(
  () => dateStore.selectedDate,
  async () => {
    try {
      await reviewStore.flush();
    } catch {
      // 保存失败已由 store 置红条并 toast，继续载入新日期
    }
    await load();
  },
);

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  void reviewStore.flush().catch(() => undefined);
});

function onRatingChange(value: number | null): void {
  void reviewStore.upsertReview(selectedDate.value, { rating: value }).catch(() => undefined);
}
function onMoodChange(value: number | null): void {
  void reviewStore.upsertReview(selectedDate.value, { mood: value }).catch(() => undefined);
}
function onEnergyChange(value: number | null): void {
  void reviewStore.upsertReview(selectedDate.value, { energy: value }).catch(() => undefined);
}

function saveText(patch: ReviewTextPatch): void {
  reviewStore.debouncedSaveText(selectedDate.value, patch);
}

function onRecordWorthyInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  recordWorthyText.value = value;
  saveText({ record_worthy: value });
}
function onDaySummaryInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value.slice(0, DAY_SUMMARY_MAX_LENGTH);
  daySummaryText.value = value;
  saveText({ day_summary: value });
}

function onGoodInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  goodText.value = value;
  saveText({ good: value });
}
function onImproveInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  improveText.value = value;
  saveText({ improve: value });
}
function onMitInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  mitText.value = value;
  saveText({ mit: value });
}

function onSelectDate(date: string): void {
  dateStore.setSelected(date);
}
</script>

<template>
  <section class="page review-page" data-test="review-view">
    <h1 class="page-title">复盘</h1>

    <div v-if="reviewStore.loading && reviewStore.metrics === null" class="hint" data-test="review-loading">
      正在加载复盘数据…
    </div>

    <template v-else>
      <ReviewMetrics v-if="reviewStore.metrics" :metrics="reviewStore.metrics" />

      <div class="settings-card review-self" data-test="review-self">
        <h2>今日自评</h2>
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
        :dots="reviewStore.last14Dots"
        @select-date="onSelectDate"
      />
    </template>
  </section>
</template>

<style scoped>
.review-self h2 {
  margin-bottom: 14px;
}
.review-texts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.review-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.review-field-label {
  color: var(--muted);
  font-size: 13px;
}
.review-highlights {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.review-field textarea,
.review-field input {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 8px;
  padding: 8px 10px;
  resize: vertical;
  color: var(--text);
  min-height: 64px;
  font: inherit;
}
.review-field input {
  min-height: 0;
}
.review-field textarea:focus,
.review-field input:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}
.review-counter {
  align-self: flex-end;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
