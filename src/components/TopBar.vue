<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDateStore } from '@/stores/date';
import { useModalStore } from '@/stores/modal';
import { useTimerStore } from '@/stores/timer';
import { formatDateCNWeekday } from '@/utils/date';
import DateJumpPopover from './DateJumpPopover.vue';
import SaveStatus from './SaveStatus.vue';
import TimerCapsule from './TimerCapsule.vue';

const dateStore = useDateStore();
const modalStore = useModalStore();
const timerStore = useTimerStore();

const dateLabel = computed(() => formatDateCNWeekday(dateStore.selectedDate));
const jumpOpen = ref(false);

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
    <div class="date-switch">
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
