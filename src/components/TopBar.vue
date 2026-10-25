<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { showsDateSwitch } from '@/config/nav';
import { useDateStore } from '@/stores/date';
import { useModalStore } from '@/stores/modal';
import { useTimerStore } from '@/stores/timer';
import { formatDateCNWeekday, isoWeekNumber, weekdayCN } from '@/utils/date';
import DateJumpPopover from './DateJumpPopover.vue';
import SaveStatus from './SaveStatus.vue';
import TimerCapsule from './TimerCapsule.vue';

const dateStore = useDateStore();
const modalStore = useModalStore();
const timerStore = useTimerStore();
const route = useRoute();

const dateLabel = computed(() => formatDateCNWeekday(dateStore.selectedDate));
/** 顶栏右侧的「W43 · 周六」：这一周在整年里的坐标，比再写一遍日期更有信息。 */
const weekLabel = computed(() => `W${isoWeekNumber(dateStore.selectedDate)}`);
const weekdayLabel = computed(() => weekdayCN(dateStore.selectedDate));
const jumpOpen = ref(false);

/** 日期控件（前一天/日期标签/后一天/回到今天）只在日期相关页面显示，唯一来源见 config/nav.ts。 */
const showDateControls = computed(() => showsDateSwitch(route.path));

// 离开日期相关页面时关掉还开着的日期弹窗，避免快捷键/弹窗残留在无关页面上。
watch(showDateControls, (visible) => {
  if (!visible) jumpOpen.value = false;
});

function onJumpSelect(date: string): void {
  dateStore.setSelected(date);
  jumpOpen.value = false;
}

/* ---------- 全局快捷键：← / → 切换日期，T / Home 回到今天 ---------- */

/** 焦点在可输入元素里（正在打字）时不劫持按键；contenteditable 需向上查找祖先。 */
function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"], [contenteditable=""]') !== null
  );
}

/** 任一普通弹窗（含日期跳转弹窗）或全局计时弹层打开时，快捷键不响应。 */
function dialogOpen(): boolean {
  return (
    modalStore.top !== null ||
    timerStore.isSettling ||
    timerStore.needsRecovery ||
    timerStore.showCountdownFinishedPrompt ||
    timerStore.pendingPlanQuestion !== null
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isEditableElement(event.target) || isEditableElement(document.activeElement)) return;
  if (dialogOpen()) return;

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault();
      dateStore.prevDay();
      break;
    case 'ArrowRight':
      event.preventDefault();
      dateStore.nextDay();
      break;
    case 't':
    case 'T':
    case 'Home':
      event.preventDefault();
      dateStore.goToday();
      break;
    default:
      break;
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="topbar">
    <div class="brand">Evan的专属APP</div>
    <div v-if="showDateControls" class="date-switch" data-test="date-switch">
      <button class="icon-btn" data-test="prev-day" title="前一天（←）" @click="dateStore.prevDay()">◀</button>
      <button
        type="button"
        class="date-label"
        data-test="date-label"
        title="点击跳转到指定日期（← / → 切换，T 回到今天）"
        aria-haspopup="dialog"
        :aria-expanded="jumpOpen"
        @click="jumpOpen = true"
      >
        {{ dateLabel }}
      </button>
      <button class="icon-btn" data-test="next-day" title="后一天（→）" @click="dateStore.nextDay()">▶</button>
      <button v-if="!dateStore.isToday" class="today-btn" data-test="go-today" title="回到今天（T）" @click="dateStore.goToday()">
        回到今天
      </button>
    </div>
    <div class="spacer"></div>
    <TimerCapsule />
    <span class="topbar-meta num" data-test="topbar-meta">
      {{ weekLabel }}<span class="topbar-meta-sep"> · </span>{{ weekdayLabel }}
    </span>
    <SaveStatus />
    <DateJumpPopover
      v-if="jumpOpen"
      :selected-date="dateStore.selectedDate"
      @select="onJumpSelect"
      @close="jumpOpen = false"
    />
  </div>
</template>

<style scoped>
.topbar-meta {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  padding: 2px 10px;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
.topbar-meta-sep {
  color: var(--border);
}
.date-label {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 2px 10px;
  cursor: pointer;
}
.date-label:hover { border-color: var(--border); background: var(--panel-2); }
.date-label:focus-visible { border-color: var(--accent); outline: none; }
</style>
