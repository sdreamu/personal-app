<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlayStore } from '@/stores/play';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import { formatDuration } from '@/utils/date';

/**
 * 娱乐计时控制区（3c）：输入/历史标签选择内容名称 → 开始 → 暂停/继续 → 结束。
 * 状态机在全局 timer store（全局单实例）；结束进入 App.vue 的待结算弹窗。
 */
const playStore = usePlayStore();
const timerStore = useTimerStore();
const toast = useToastStore();

const nameInput = ref('');
const starting = ref(false);

const timerExists = computed(() => timerStore.timer !== null);
const isEntertainmentTimer = computed(() => timerStore.timer?.type === 'entertainment');
const isSettling = computed(() => timerStore.isSettling);
const isRunning = computed(() => timerStore.isRunning);

const statusText = computed(() => {
  if (timerStore.isSettling) return '待结算';
  if (!timerStore.isRunning) return '就绪';
  return timerStore.isPaused ? '已暂停' : '计时中';
});

const clockText = computed(() => formatDuration(Math.floor(timerStore.elapsedMs / 1000)));

function pickTag(tag: string): void {
  nameInput.value = tag;
}

async function start(): Promise<void> {
  const trimmed = nameInput.value.trim();
  if (trimmed === '') {
    toast.error('请输入娱乐内容名称');
    return;
  }
  starting.value = true;
  try {
    await playStore.startEntertainment(trimmed);
  } finally {
    starting.value = false;
  }
}
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
      <div class="button-row">
        <button class="primary-btn" data-test="start-btn" :disabled="starting" @click="start">开始</button>
      </div>
    </template>

    <template v-else-if="isEntertainmentTimer">
      <div class="timer-target" data-test="timer-target">
        <span class="badge">娱乐</span>
        <strong>{{ timerStore.targetTitle }}</strong>
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
</style>
