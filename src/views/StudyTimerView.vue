<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { listAlive, type Book, type Subject } from '@/db';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import { formatDuration } from '@/utils/date';

/**
 * 计时器页 #/study/timer：选择在读的书或未归档的科目进行学习计时。
 * 状态机在全局 timer store（含娱乐计时），页面只负责选择、展示与控制。
 */
const route = useRoute();
const router = useRouter();
const timerStore = useTimerStore();
const toast = useToastStore();

const books = ref<Book[]>([]);
const subjects = ref<Subject[]>([]);
const targetType = ref<'book' | 'subject'>('book');
const selectedId = ref<string | null>(null);
const mode = ref<'stopwatch' | 'countdown'>('stopwatch');
const countdownMinutes = ref(25);
const starting = ref(false);
const loadingTargets = ref(true);

/** 空状态的主按钮：去对应页面添加学习对象（书 → 书架，科目 → 科目页）。 */
function goAddTarget(): void {
  void router.push(targetType.value === 'book' ? '/study/books' : '/study/subjects');
}

const readingBooks = computed(() => books.value.filter((b) => b.status === 'reading'));
const activeSubjects = computed(() => subjects.value.filter((s) => !s.archived));
const options = computed(() => (targetType.value === 'book' ? readingBooks.value : activeSubjects.value));
const selected = computed(() => options.value.find((o) => o.id === selectedId.value) ?? null);

const timerExists = computed(() => timerStore.timer !== null);
const isEntertainmentRunning = computed(
  () => timerStore.timer !== null && timerStore.timer.type === 'entertainment',
);
const showPause = computed(() => timerStore.isRunning && !timerStore.isPaused && !isEntertainmentRunning.value);
const showResume = computed(() => timerStore.isRunning && timerStore.isPaused && !isEntertainmentRunning.value);
const showEnd = computed(() => timerStore.isRunning && !isEntertainmentRunning.value);

const clockText = computed(() => {
  const t = timerStore.timer;
  if (!t) return formatDuration(0);
  if (t.mode === 'countdown' && t.ended_at === null) {
    return formatDuration(timerStore.remainingSec);
  }
  return formatDuration(Math.floor(timerStore.usedMs / 1000));
});

const statusText = computed(() => {
  if (timerStore.isSettling) return '待结算';
  if (!timerStore.isRunning) return '就绪';
  return timerStore.isPaused ? '已暂停' : '计时中';
});

const modeLabel = computed(() => {
  const t = timerStore.timer;
  if (!t) return '';
  if (t.type === 'entertainment') return '娱乐计时';
  return t.mode === 'countdown' ? '倒计时' : '正计时';
});

const typeLabel = computed(() => {
  const t = timerStore.timer;
  if (!t) return '';
  return t.type === 'book' ? '书籍' : t.type === 'subject' ? '科目' : '娱乐';
});

function selectType(next: 'book' | 'subject'): void {
  targetType.value = next;
  selectedId.value = null;
}

function selectMode(next: 'stopwatch' | 'countdown'): void {
  mode.value = next;
}

function selectTarget(id: string): void {
  selectedId.value = id;
}

function optionName(option: Book | Subject): string {
  return 'title' in option ? option.title : option.name;
}

function optionMeta(option: Book | Subject): string {
  if ('current_page' in option) {
    return `${option.current_page}/${option.total_pages} 页`;
  }
  return `周目标 ${option.weekly_goal_min} 分钟`;
}

async function loadTargets(): Promise<void> {
  try {
    const [bookRows, subjectRows] = await Promise.all([listAlive('books'), listAlive('subjects')]);
    books.value = bookRows;
    subjects.value = subjectRows;
    applyQueryPreselect();
  } catch {
    // 数据库未就绪时保持空列表，可重试
  } finally {
    loadingTargets.value = false;
  }
}

/** 支持从读书/科目/首页以 ?type=book&id=xxx（或 target_type / target_id）预选对象。 */
function applyQueryPreselect(): void {
  const query = route.query;
  const queryType =
    typeof query.type === 'string' ? query.type : typeof query.target_type === 'string' ? query.target_type : null;
  const queryId = typeof query.id === 'string' ? query.id : typeof query.target_id === 'string' ? query.target_id : null;
  if (queryType === 'book' || queryType === 'subject') {
    targetType.value = queryType;
    const list = queryType === 'book' ? readingBooks.value : activeSubjects.value;
    if (queryId !== null && list.some((o) => o.id === queryId)) {
      selectedId.value = queryId;
    }
  }
}

watch(() => route.query, () => applyQueryPreselect());

/** 计划页时间块“开始”带入 plan 查询参数（默认 null）。 */
function queryPlanId(): string | null {
  const plan = route.query.plan;
  return typeof plan === 'string' && plan !== '' ? plan : null;
}

async function start(): Promise<void> {
  if (timerStore.timer !== null) return; // 全局单计时守卫，冲突提示由 store 给出
  const target = selected.value;
  if (!target) {
    toast.error('请先选择对象');
    return;
  }
  starting.value = true;
  try {
    const minutes = Number.isFinite(countdownMinutes.value) ? countdownMinutes.value : 25;
    const clampedMinutes = Math.min(1440, Math.max(1, Math.floor(minutes)));
    await timerStore.startTimer({
      type: targetType.value,
      targetId: target.id,
      targetTitle: optionName(target),
      planId: queryPlanId(),
      mode: mode.value,
      countdownSec: mode.value === 'countdown' ? clampedMinutes * 60 : undefined,
    });
  } finally {
    starting.value = false;
  }
}

function toggle(): void {
  if (timerStore.isRunning) {
    if (timerStore.isPaused) {
      void timerStore.resumeTimer();
    } else {
      void timerStore.pauseTimer();
    }
  } else {
    void start();
  }
}

function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target.isContentEditable
  );
}

/** 任一全局计时弹窗打开时，Space 不响应。 */
function dialogOpen(): boolean {
  return (
    timerStore.isSettling ||
    timerStore.needsRecovery ||
    timerStore.showCountdownFinishedPrompt ||
    timerStore.pendingPlanQuestion !== null
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (event.code !== 'Space') return;
  if (isInteractiveElement(event.target)) return;
  if (dialogOpen()) return;
  event.preventDefault();
  toggle();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void loadTargets();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section class="page timer-page" data-test="study-timer-view">
    <h1 class="page-title">计时器</h1>

    <div class="timer-field">
      <div class="timer-target" data-test="timer-target">
        <template v-if="timerStore.timer">
          <span class="badge">{{ typeLabel }}</span>
          <strong>{{ timerStore.targetTitle }}</strong>
          <span class="badge">{{ modeLabel }}</span>
          <span class="badge">{{ statusText }}</span>
        </template>
        <template v-else>
          <span class="badge">未开始</span>
        </template>
      </div>
      <div class="clock-face" data-test="clock-face">{{ clockText }}</div>
      <p v-if="isEntertainmentRunning" class="field-note" data-test="entertainment-notice">
        当前为娱乐计时，请到「生活 → 娱乐」页处理；学习计时暂不可用。
      </p>
      <div class="button-row timer-buttons">
        <button
          v-if="!timerExists"
          class="primary-btn"
          data-test="start-btn"
          :disabled="starting"
          @click="start"
        >
          开始
        </button>
        <button v-if="showPause" class="ghost-btn" data-test="pause-btn" @click="timerStore.pauseTimer()">暂停</button>
        <button v-if="showResume" class="primary-btn" data-test="resume-btn" @click="timerStore.resumeTimer()">继续</button>
        <button v-if="showEnd" class="danger-btn" data-test="end-btn" @click="timerStore.endTimer()">结束</button>
      </div>
      <p class="field-hint">快捷键：Space 开始 / 暂停 / 继续（弹窗打开时不响应）</p>
    </div>

    <div v-if="!timerExists" class="timer-panel">
      <h2>选择对象</h2>
      <div class="segmented timer-type-switch">
        <button
          class="seg-btn"
          :class="{ on: targetType === 'book' }"
          data-test="type-book"
          @click="selectType('book')"
        >
          书籍
        </button>
        <button
          class="seg-btn"
          :class="{ on: targetType === 'subject' }"
          data-test="type-subject"
          @click="selectType('subject')"
        >
          科目
        </button>
      </div>
      <div v-if="loadingTargets" class="empty-hint" data-test="targets-loading">正在加载对象列表…</div>
      <div v-else-if="options.length === 0" class="empty-hint" data-test="target-empty">
        <p class="empty-text">
          暂无{{ targetType === 'book' ? '在读的书籍' : '未归档的科目' }}，先去添加一个再回来计时。
        </p>
        <button class="primary-btn" data-test="empty-add-target" @click="goAddTarget">
          去添加{{ targetType === 'book' ? '书籍' : '科目' }}
        </button>
      </div>
      <div v-else class="target-list" data-test="target-list">
        <label
          v-for="opt in options"
          :key="opt.id"
          class="target-option"
          :class="{ selected: selectedId === opt.id }"
        >
          <input
            type="radio"
            name="timer-target"
            :value="opt.id"
            :checked="selectedId === opt.id"
            data-test="target-option"
            @change="selectTarget(opt.id)"
          />
          <span class="target-name">{{ optionName(opt) }}</span>
          <span class="badge">{{ optionMeta(opt) }}</span>
        </label>
      </div>
    </div>

    <div v-if="!timerExists" class="timer-panel">
      <h2>模式</h2>
      <div class="segmented">
        <button
          class="seg-btn"
          :class="{ on: mode === 'stopwatch' }"
          data-test="mode-stopwatch"
          @click="selectMode('stopwatch')"
        >
          正计时
        </button>
        <button
          class="seg-btn"
          :class="{ on: mode === 'countdown' }"
          data-test="mode-countdown"
          @click="selectMode('countdown')"
        >
          倒计时
        </button>
      </div>
      <div v-if="mode === 'countdown'" class="field countdown-field">
        <label for="countdown-minutes">倒计时分钟数（默认 25）</label>
        <input
          id="countdown-minutes"
          v-model.number="countdownMinutes"
          type="number"
          min="1"
          max="1440"
          step="1"
          data-test="countdown-minutes"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 松绿场：一屏就看一个数字，所以时间占满整块，其余都退到边上 */
.timer-field {
  position: relative;
  margin-bottom: 22px;
  padding: 16px 18px 14px;
  background: var(--field);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 7px 7px 0 var(--slab), 14px 14px 0 var(--border-ink);
  text-align: center;
}
.timer-field::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid var(--field-tick);
  pointer-events: none;
}
.timer-target {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--field-sub);
}
.timer-target strong {
  color: var(--hero-ink);
  font-weight: 700;
}
.timer-target .badge {
  padding: 1px 7px;
  border: 1px solid var(--field-tick);
  color: var(--field-sub);
  background: transparent;
  font-size: 11px;
}
.clock-face {
  margin: 10px 0 4px;
  font-family: var(--font-mono);
  font-size: clamp(56px, 12vw, 116px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.02em;
  color: var(--hero-ink);
}
.timer-buttons {
  justify-content: center;
  gap: 10px;
  margin-top: 6px;
}
/* 场上的按钮：反白实块 / 反白描边 / 朱砂实块，别用墨底（墨底在松绿上糊成一团） */
.timer-field .primary-btn,
.timer-field .ghost-btn,
.timer-field .danger-btn {
  border: var(--line-w) solid var(--hero-ink);
  box-shadow: 3px 3px 0 var(--border-ink);
  font-weight: 700;
}
.timer-field .primary-btn {
  background: var(--hero-ink);
  color: var(--field);
}
.timer-field .ghost-btn {
  background: transparent;
  color: var(--hero-ink);
}
.timer-field .danger-btn {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--on-accent);
}
.timer-field .primary-btn:hover,
.timer-field .ghost-btn:hover {
  background: var(--field-2);
  color: var(--hero-ink);
}
.field-hint,
.field-note {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--field-sub);
}
.field-note {
  color: var(--hero-ink);
  font-size: 12px;
}
.timer-panel {
  margin-bottom: 18px;
  padding: 16px 16px 14px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: 5px 5px 0 var(--slab);
}
.timer-panel h2 {
  margin: 0 0 12px;
  font-size: 15px;
}
.timer-type-switch {
  margin-bottom: 10px;
}
.target-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  max-height: 280px;
  overflow-y: auto;
}
.target-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  cursor: pointer;
}
.target-option:hover {
  border-color: var(--border-ink);
}
.target-option.selected {
  background: var(--text);
  border-color: var(--border-ink);
  color: var(--panel);
}
.target-option .badge {
  padding: 1px 7px;
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}
.target-option.selected .badge {
  border-color: var(--field-tick);
  color: var(--hero-sub);
}
.target-name {
  flex: 1;
}
.countdown-field {
  max-width: 240px;
  margin-top: 12px;
}
.countdown-field input {
  font-family: var(--font-mono);
}
.empty-hint {
  margin-top: 10px;
}
.empty-hint .empty-text {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 13px;
}
</style>
