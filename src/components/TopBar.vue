<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { APP_NAME } from '@/config/app';
import { useDateStore } from '@/stores/date';
import { useModalStore } from '@/stores/modal';
import { useTimerStore } from '@/stores/timer';
import { isoWeekNumber, weekdayCN } from '@/utils/date';
import SaveStatus from './SaveStatus.vue';
import TimerCapsule from './TimerCapsule.vue';

const dateStore = useDateStore();
const modalStore = useModalStore();
const timerStore = useTimerStore();
const router = useRouter();

/** 顶栏右侧的「W43 · 周六」：这一周在整年里的坐标，比再写一遍日期更有信息。 */
const weekLabel = computed(() => `W${isoWeekNumber(dateStore.selectedDate)}`);
const weekdayLabel = computed(() => weekdayCN(dateStore.selectedDate));
/** 顶栏常驻的「记一笔」：跳到日程并直接打开新增弹窗（日程是唯一能落计划的地方）。 */
function quickAdd(): void {
  void router.push({ path: '/plan', query: { new: '1' } });
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
    <div class="brand">{{ APP_NAME }}</div>
    <div class="spacer"></div>
    <RouterLink to="/settings" class="icon-btn settings-link" data-test="settings-link" aria-label="设置" title="设置">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z" />
      </svg>
    </RouterLink>
    <TimerCapsule />
    <span class="topbar-meta num" data-test="topbar-meta">
      {{ weekLabel }}<span class="topbar-meta-sep"> · </span>{{ weekdayLabel }}
    </span>
    <SaveStatus />
    <button type="button" class="quick-add" data-test="quick-add" title="记一笔：去日程新增计划" @click="quickAdd">
      ＋ 记一笔
    </button>

  </div>
</template>

<style scoped>
.settings-link { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 44px; min-height: 44px; text-decoration: none; color: var(--text); }
@media (max-width: 768px) { .topbar-meta { display: none; } }
.quick-add {
  flex: none;
  padding: 5px 12px;
  background: var(--accent-soft);
  color: var(--accent);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: var(--shadow);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.quick-add:hover {
  background: var(--accent);
  color: var(--on-accent);
}
@media (max-width: 768px) {
  .quick-add {
    display: none;
  }
}
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
</style>
