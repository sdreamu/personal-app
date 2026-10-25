<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import BaseModal from '@/components/BaseModal.vue';
import ReviewHistory from '@/components/ReviewHistory.vue';
import ReviewMetrics from '@/components/ReviewMetrics.vue';
import ReviewMoodPicker from '@/components/ReviewMoodPicker.vue';
import { errorMessage } from '@/db';
import { setDateChangeGuard, useDateStore } from '@/stores/date';
import { DAY_SUMMARY_MAX_LENGTH, useReviewStore } from '@/stores/review';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import { logicalToday } from '@/utils/date';

/**
 * 复盘页 #/review（PRD §5.8 / AC-47~49）：
 * 上半部分 7 项自动汇总（只读，实时按 selectedDate 聚合）；
 * 下半部分自评：输入先留在本地草稿，点「确认」才一次性写入当天复盘
 * （未确认的修改不落库，也不会出现在历史复盘里）；
 * 有未确认草稿时切日期会被守卫拦下并弹确认，确认丢弃后才切；
 * 历史复盘按时间区间查看，看详情不改变全局日期，只有「编辑这一天」才切换日期。
 */
const dateStore = useDateStore();
const reviewStore = useReviewStore();
const settingsStore = useSettingsStore();
const toast = useToastStore();

const selectedDate = computed(() => dateStore.selectedDate);
const todayKey = computed(() => logicalToday(settingsStore.dayStartMin));

const rating = ref<number | null>(null);
const mood = ref<number | null>(null);
const energy = ref<number | null>(null);
const recordWorthyText = ref('');
const daySummaryText = ref('');
const goodText = ref('');
const improveText = ref('');
const mitText = ref('');

const daySummaryCount = computed(() => daySummaryText.value.length);
const saving = ref(false);
/** 被守卫拦下的目标日期：非 null 时显示「还有未确认的修改」确认弹窗。 */
const pendingSwitchDate = ref<string | null>(null);

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

function sameText(draft: string, saved: string | null | undefined): boolean {
  return draft.trim() === (saved ?? '').trim();
}

/** 草稿与已保存内容有差异时才允许点「确认」。 */
const dirty = computed(() => {
  const saved = reviewStore.review;
  if (saved === null) {
    return (
      rating.value !== null ||
      mood.value !== null ||
      energy.value !== null ||
      [recordWorthyText.value, daySummaryText.value, goodText.value, improveText.value, mitText.value].some(
        (text) => text.trim() !== '',
      )
    );
  }
  return (
    rating.value !== saved.rating ||
    mood.value !== saved.mood ||
    energy.value !== saved.energy ||
    !sameText(recordWorthyText.value, saved.record_worthy) ||
    !sameText(daySummaryText.value, saved.day_summary) ||
    !sameText(goodText.value, saved.good) ||
    !sameText(improveText.value, saved.improve) ||
    !sameText(mitText.value, saved.mit)
  );
});

async function load(): Promise<void> {
  try {
    await reviewStore.load(selectedDate.value);
    syncFromReview();
  } catch (err) {
    toast.error(`加载复盘数据失败：${errorMessage(err)}`);
  }
}

watch(
  () => dateStore.selectedDate,
  async () => {
    // 未确认的草稿按产品约定直接丢弃：切到新日期后以该日已保存的复盘为准。
    await load();
  },
);

/** 切日期前守卫：有未确认草稿就拦下并弹确认。 */
function guardDateChange(next: string): boolean {
  if (!dirty.value) return true;
  pendingSwitchDate.value = next;
  return false;
}

/** 确认丢弃草稿后强制切到目标日期；页面 watcher 会以该日已保存的复盘重载草稿。 */
function discardDraftAndSwitch(): void {
  const next = pendingSwitchDate.value;
  pendingSwitchDate.value = null;
  if (next !== null) dateStore.setSelected(next, { force: true });
}

function cancelSwitch(): void {
  pendingSwitchDate.value = null;
}

onMounted(() => {
  setDateChangeGuard(guardDateChange);
  void load();
});

onUnmounted(() => setDateChangeGuard(null));

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

/** 点「确认」才把当天自评一次性写入数据库（历史复盘随之出现/更新）。 */
async function confirmReview(): Promise<void> {
  if (!dirty.value || saving.value) return;
  saving.value = true;
  try {
    await reviewStore.upsertReview(selectedDate.value, {
      rating: rating.value,
      mood: mood.value,
      energy: energy.value,
      record_worthy: recordWorthyText.value,
      day_summary: daySummaryText.value,
      good: goodText.value,
      improve: improveText.value,
      mit: mitText.value,
    });
    syncFromReview();
    toast.success('今日复盘已保存');
  } catch {
    // 保存失败已由 store 置顶栏状态、toast 与红条；草稿保留可继续修改后重试。
  } finally {
    saving.value = false;
  }
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

      <div class="review-self" data-test="review-self">
        <div class="self-head">
          <h2>今日自评</h2>
          <span class="self-note">三段话随便写，写完点确认才落库</span>
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

        <div class="review-actions">
          <span class="review-actions-hint" data-test="review-confirm-hint">
            {{ dirty ? '有未确认的修改，点「确认」后才会保存并出现在历史复盘' : '修改后点「确认」才会保存' }}
          </span>
          <button
            type="button"
            class="primary-btn"
            data-test="review-confirm"
            :disabled="!dirty || saving"
            @click="confirmReview"
          >
            {{ saving ? '保存中…' : '确认' }}
          </button>
        </div>
      </div>

      <ReviewHistory
        :items="reviewStore.historyItems"
        :today="todayKey"
        @select-date="onSelectDate"
      />
    </template>

    <BaseModal
      v-if="pendingSwitchDate !== null"
      id="review-leave-guard"
      title="还有未确认的修改"
      @close="cancelSwitch"
    >
      <p data-test="review-leave-modal">自评区的内容还没点「确认」，切走会丢弃这些修改。</p>
      <template #footer>
        <button type="button" class="ghost-btn" data-test="review-leave-cancel" @click="cancelSwitch">
          继续编辑
        </button>
        <button type="button" class="primary-btn" data-test="review-leave-discard" @click="discardDraftAndSwitch">
          丢弃并切换
        </button>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.review-self {
  margin-bottom: 18px;
  padding: 16px 16px 12px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.self-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.self-head h2 {
  margin: 0;
  font-size: 15px;
}
.self-note {
  font-size: 11px;
  color: var(--muted);
}
.review-highlights {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.review-texts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 14px;
}
.review-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}
.review-field-label {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.02em;
}
.review-field textarea,
.review-field input {
  border: 1px solid var(--border);
  background: var(--panel-2);
  padding: 8px 10px;
  resize: vertical;
  color: var(--text);
  min-height: 64px;
  font: inherit;
}
.review-field input {
  min-height: 0;
}
.review-field textarea::placeholder,
.review-field input::placeholder {
  color: var(--muted);
}
.review-field textarea:focus,
.review-field input:focus {
  outline: 2px solid var(--border-ink);
  outline-offset: 1px;
  border-color: var(--border-ink);
  background: var(--panel);
}
.review-counter {
  position: absolute;
  right: 2px;
  bottom: -16px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.review-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 26px;
  padding-top: 12px;
  border-top: var(--line-w) solid var(--border-ink);
}
.review-actions-hint {
  color: var(--muted);
  font-size: 12px;
}
</style>
