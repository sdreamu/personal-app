<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  DEFAULT_PLAY_COUNTDOWN_MINUTES,
  PLAY_QUICK_COUNTDOWN_MINUTES,
  QUOTA_EXHAUSTED_HINT,
  resolveCountdownMinutes,
  usePlayStore,
  type PlayRoundPrefill,
} from '@/stores/play';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import { formatDuration } from '@/utils/date';

/**
 * 娱乐计时控制区（3c）：内容名称 → 模式（正计时 / 倒计时）→ 开始 → 暂停/继续 → 结束。
 * 倒计时提供快捷 15/30/45/60 分钟、自定义分钟与「按剩余额度」（今日额度剩余分钟，额度为 0 时禁用）。
 * 「再来一轮」由历史列表把 prefill 传进来：只预填表单，不自动开始。
 * 状态机在全局 timer store（全局单实例）；结束进入 App.vue 的待结算弹窗。
 */
const props = withDefaults(defineProps<{ prefill?: PlayRoundPrefill | null }>(), { prefill: null });
const emit = defineEmits<{ 'prefill-applied': [] }>();

const playStore = usePlayStore();
const timerStore = useTimerStore();
const toast = useToastStore();

const nameInput = ref('');
const mode = ref<'stopwatch' | 'countdown'>('stopwatch');
const countdownInput = ref<string | number>(DEFAULT_PLAY_COUNTDOWN_MINUTES);
const starting = ref(false);

const timerExists = computed(() => timerStore.timer !== null);
const isEntertainmentTimer = computed(() => timerStore.timer?.type === 'entertainment');
const isSettling = computed(() => timerStore.isSettling);
const isRunning = computed(() => timerStore.isRunning);
const isCountdown = computed(() => timerStore.timer?.mode === 'countdown');
const modeLabel = computed(() => (isCountdown.value ? '倒计时' : '正计时'));

const quota = computed(() => playStore.todayQuota);
const quotaRemaining = computed(() => quota.value.remaining);
const quotaExhausted = computed(() => quotaRemaining.value <= 0);

const statusText = computed(() => {
  if (timerStore.isSettling) return '待结算';
  if (!timerStore.isRunning) return '就绪';
  return timerStore.isPaused ? '已暂停' : '计时中';
});

/** 倒计时进行中显示剩余时间，正计时/待结算显示已用时间（与学习计时页一致）。 */
const clockText = computed(() => {
  const t = timerStore.timer;
  if (t !== null && t.mode === 'countdown' && t.ended_at === null) return formatDuration(timerStore.remainingSec);
  return formatDuration(Math.floor(timerStore.elapsedMs / 1000));
});

function pickTag(tag: string): void {
  nameInput.value = tag;
}

function applyQuick(minutes: number): void {
  countdownInput.value = minutes;
}

/** 「按剩余额度」= 今日娱乐额度剩余分钟（上限 1 分钟，额度 0 时按钮已禁用）。 */
function applyQuota(): void {
  if (quotaExhausted.value) {
    toast.error(QUOTA_EXHAUSTED_HINT);
    return;
  }
  countdownInput.value = quotaRemaining.value;
}

async function start(): Promise<void> {
  const trimmed = nameInput.value.trim();
  if (trimmed === '') {
    toast.error('请输入娱乐内容名称');
    return;
  }
  let countdownMinutes: number | null = null;
  if (mode.value === 'countdown') {
    const resolved = resolveCountdownMinutes(countdownInput.value);
    if (!resolved.ok) {
      toast.error(resolved.reason);
      return;
    }
    countdownMinutes = resolved.minutes;
  }
  starting.value = true;
  try {
    await playStore.startEntertainment(trimmed, { mode: mode.value, countdownMinutes });
  } finally {
    starting.value = false;
  }
}

/** 「再来一轮」：预填内容名称 + 切到倒计时 + 预设分钟数；不自动开始，等用户点「开始」。 */
watch(
  () => props.prefill,
  (next) => {
    if (!next) return;
    nameInput.value = next.content;
    mode.value = 'countdown';
    countdownInput.value = next.minutes;
    emit('prefill-applied');
  },
  { immediate: true },
);

/** 娱乐计时结算/丢弃后刷新记录与今日额度（供「按剩余额度」取到最新值）。 */
watch(
  () => timerStore.timer,
  (next, prev) => {
    if (next === null && prev !== null && prev.type === 'entertainment') {
      void playStore.reload().catch(() => undefined);
    }
  },
);
</script>

<template>
  <section class="settings-card" data-test="play-timer-panel">
    <h2>娱乐计时</h2>

    <template v-if="!timerExists">
      <div class="field">
        <label for="play-name-input">内容名称</label>
        <input
          id="play-name-input"
          v-model="nameInput"
          placeholder="如：塞尔达传说"
          data-test="play-name-input"
          @keyup.enter="start"
        />
      </div>
      <div v-if="playStore.recent.length > 0" class="recent-row" data-test="recent-tags">
        <span class="hint">最近使用：</span>
        <button
          v-for="tag in playStore.recent"
          :key="tag"
          type="button"
          class="ghost-btn tag-btn"
          data-test="recent-tag"
          @click="pickTag(tag)"
        >
          {{ tag }}
        </button>
      </div>

      <div class="field">
        <span>模式</span>
        <div class="segmented" data-test="play-mode-switch">
          <button
            type="button"
            class="seg-btn"
            :class="{ on: mode === 'stopwatch' }"
            data-test="play-mode-stopwatch"
            @click="mode = 'stopwatch'"
          >
            正计时
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ on: mode === 'countdown' }"
            data-test="play-mode-countdown"
            @click="mode = 'countdown'"
          >
            倒计时
          </button>
        </div>
      </div>

      <div v-if="mode === 'countdown'" class="countdown-block" data-test="play-countdown-options">
        <div class="field">
          <span>快捷时长</span>
          <div class="quick-row">
            <button
              v-for="minutes in PLAY_QUICK_COUNTDOWN_MINUTES"
              :key="minutes"
              type="button"
              class="ghost-btn"
              :data-test="`play-quick-${minutes}`"
              @click="applyQuick(minutes)"
            >
              {{ minutes }}分钟
            </button>
          </div>
        </div>
        <div class="field">
          <label for="play-countdown-minutes">倒计时分钟数（1~1440）</label>
          <div class="countdown-row">
            <input
              id="play-countdown-minutes"
              v-model.number="countdownInput"
              type="number"
              min="1"
              max="1440"
              step="1"
              data-test="play-countdown-minutes"
            />
            <button
              type="button"
              class="ghost-btn"
              data-test="play-quota-btn"
              :disabled="quotaExhausted"
              @click="applyQuota"
            >
              按剩余额度（{{ quotaRemaining }} 分钟）
            </button>
          </div>
          <p v-if="quotaExhausted" class="danger-text" data-test="play-quota-empty-hint">
            {{ QUOTA_EXHAUSTED_HINT }}
          </p>
        </div>
      </div>

      <div class="button-row">
        <button class="primary-btn" data-test="start-btn" :disabled="starting" @click="start">开始</button>
      </div>
    </template>

    <template v-else-if="isEntertainmentTimer">
      <div class="timer-target" data-test="timer-target">
        <span class="badge">娱乐</span>
        <strong>{{ timerStore.targetTitle }}</strong>
        <span class="badge" data-test="play-timer-mode">{{ modeLabel }}</span>
        <span class="badge">{{ statusText }}</span>
      </div>
      <div class="clock-face" data-test="clock-face">{{ clockText }}</div>
      <div class="button-row timer-buttons">
        <button
          v-if="isRunning && !timerStore.isPaused"
          class="ghost-btn"
          data-test="pause-btn"
          @click="timerStore.pauseTimer()"
        >
          暂停
        </button>
        <button
          v-if="isRunning && timerStore.isPaused"
          class="primary-btn"
          data-test="resume-btn"
          @click="timerStore.resumeTimer()"
        >
          继续
        </button>
        <button v-if="isRunning" class="danger-btn" data-test="end-btn" @click="timerStore.endTimer()">结束</button>
      </div>
      <p v-if="isSettling" class="hint" data-test="settling-hint">
        待结算：请在上方弹窗中保存或丢弃本次计时。
      </p>
    </template>

    <template v-else>
      <p class="hint" data-test="other-timer-notice">当前有其他计时进行中，娱乐计时暂不可用。</p>
    </template>
  </section>
</template>

<style scoped>
.clock-face {
  font-size: 48px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  margin: 12px 0 6px;
}
.timer-target {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.timer-buttons {
  justify-content: center;
}
.recent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.tag-btn {
  padding: 4px 12px;
  font-size: 13px;
}
.countdown-block {
  margin-top: 4px;
}
.quick-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-row .ghost-btn {
  padding: 4px 12px;
  font-size: 13px;
}
.countdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.countdown-row input {
  max-width: 120px;
}
.countdown-row .ghost-btn {
  padding: 6px 12px;
  font-size: 13px;
}
.countdown-row .ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
