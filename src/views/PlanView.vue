<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { errorMessage, type Plan } from '@/db';
import EmptyState from '@/components/EmptyState.vue';
import PlanFormModal from '@/components/PlanFormModal.vue';
import PlanTimeline from '@/components/PlanTimeline.vue';
import { useDateStore } from '@/stores/date';
import { useModalStore } from '@/stores/modal';
import ScheduleWeek from '@/components/ScheduleWeek.vue';
import { usePlanStore, type PlanFormPayload } from '@/stores/plan';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';

/**
 * 计划页 #/plan（PRD §5.1）：
 * 顶部完成进度 / 今日训练 / 昨日“最重要的一件事”+ 一键顺延；
 * 左侧 24 小时时间轴（自一天起点），右侧无时间待办清单；
 * 新增/编辑/安排时间走弹窗表单，勾选/删除/移到明天/顺延为一键动作；
 * 读/写全部跟随 dateStore.selectedDate，一键顺延与 MIT 始终作用于今天。
 */
const router = useRouter();
const dateStore = useDateStore();
const settings = useSettingsStore();
const planStore = usePlanStore();
const modalStore = useModalStore();
const timerStore = useTimerStore();
const toast = useToastStore();

const formOpen = ref(false);
const editingPlan = ref<Plan | null>(null);
const formError = ref<string | null>(null);

const selectedDate = computed(() => dateStore.selectedDate);
const dayStartMin = computed(() => settings.dayStartMin);
const progressPercent = computed(() =>
  planStore.totalCount === 0 ? 0 : Math.round((planStore.doneCount / planStore.totalCount) * 100),
);

async function load(): Promise<void> {
  try {
    await planStore.load(selectedDate.value);
  } catch (err) {
    toast.error(`加载计划失败：${errorMessage(err)}`);
  }
}

watch(
  () => dateStore.selectedDate,
  () => {
    closeForm();
    void load();
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void load();
  // 顶栏「＋ 记一笔」带 ?new=1 过来：直接开新增弹窗，并把参数抹掉避免刷新反复弹
  if (router.currentRoute.value.query['new'] === '1') {
    openCreate();
    void router.replace({ path: '/plan' });
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});

/* ---------- 弹窗表单 ---------- */

function openCreate(): void {
  editingPlan.value = null;
  formError.value = null;
  formOpen.value = true;
}

function openEdit(plan: Plan): void {
  editingPlan.value = plan;
  formError.value = null;
  formOpen.value = true;
}

function closeForm(): void {
  formOpen.value = false;
  editingPlan.value = null;
  formError.value = null;
}

async function handleFormSave(payload: PlanFormPayload): Promise<void> {
  try {
    if (editingPlan.value) {
      await planStore.updatePlan(editingPlan.value.id, payload);
    } else {
      await planStore.createPlan(selectedDate.value, payload);
    }
    closeForm();
  } catch (err) {
    formError.value = errorMessage(err); // store 已同时 toast + 置保存失败红条
  }
}

/* ---------- 一键动作（失败提示已由 store 给出） ---------- */

function runOneClick(fn: () => Promise<unknown>): void {
  void fn().catch(() => undefined);
}

async function rollOver(): Promise<void> {
  try {
    await planStore.rollOverYesterday();
  } catch {
    // 已由 store 提示
  }
}

async function addMit(): Promise<void> {
  try {
    await planStore.addMit();
  } catch {
    // 已由 addMitToPlan 提示
  }
}

/* ---------- 关联对象与开始计时 ---------- */

function canStart(plan: Plan): boolean {
  return !plan.done && plan.target_type !== null && plan.target_id !== null;
}

/** 关联对象若已被删除，按 PRD §5.10 显示“原名称（已删除）”。 */
function targetLabel(plan: Plan): string {
  if (!plan.target_type || plan.target_id === null) return '';
  const exists =
    plan.target_type === 'book'
      ? planStore.readingBooks.some((b) => b.id === plan.target_id)
      : planStore.activeSubjects.some((s) => s.id === plan.target_id);
  return exists ? (plan.target_title ?? '') : `${plan.target_title ?? '原名称'}（已删除）`;
}

function startPlan(plan: Plan): void {
  if (!canStart(plan) || plan.target_type === null || plan.target_id === null) return;
  void router.push({
    path: '/study/timer',
    query: { type: plan.target_type, id: plan.target_id, plan: plan.id },
  });
}

/* ---------- N 快捷键（当前页新增） ---------- */

function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target.isContentEditable
  );
}

/** 任一普通弹窗或全局计时弹层打开时，N 不响应。 */
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
  if (event.key !== 'n' && event.key !== 'N') return;
  if (isInteractiveElement(event.target)) return;
  if (dialogOpen()) return;
  event.preventDefault();
  openCreate();
}
</script>

<template>
  <section class="page plan-page" data-test="plan-view">
    <ScheduleWeek />
    <div class="settings-card plan-header" data-test="plan-header">
      <div class="header-row">
        <h1 class="page-title">日程</h1>
        <button class="primary-btn" data-test="add-plan-btn" @click="openCreate">+ 新增计划</button>
        <span class="hint">快捷键 N 新建</span>
      </div>

      <div class="progress-row" data-test="progress-row">
        <span>今日完成进度：{{ planStore.doneCount }} / {{ planStore.totalCount }}</span>
        <div class="progress-track" data-test="progress-track">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
        </div>
        <span class="hint">{{ progressPercent }}%</span>
      </div>

      <div v-if="planStore.todayWorkout" class="info-row" data-test="workout-row">
        <span>今日训练：{{ planStore.todayWorkout.type_name }}</span>
        <RouterLink class="ghost-btn link-btn" to="/life/workout" data-test="workout-link">
          去训练
        </RouterLink>
      </div>

      <div v-if="planStore.mitReview" class="info-row" data-test="mit-row">
        <span class="mit-text">昨天复盘 · 明天最重要的一件事：{{ planStore.mitReview.mit }}</span>
        <button
          v-if="!planStore.mitAdded"
          class="primary-btn"
          data-test="mit-add"
          @click="addMit"
        >
          加入今日待办
        </button>
        <button v-else class="ghost-btn" disabled data-test="mit-added">已加入今日待办 ✓</button>
      </div>

      <div class="info-row">
        <button
          class="primary-btn"
          data-test="rollover-btn"
          :disabled="planStore.rolloverCount === 0"
          @click="rollOver"
        >
          一键顺延昨日未完成（{{ planStore.rolloverCount }}）
        </button>
      </div>
    </div>

    <div v-if="planStore.loading && planStore.loadedDate === null" class="hint" data-test="plan-loading">
      正在加载计划…
    </div>

    <EmptyState
      v-else-if="planStore.totalCount === 0"
      title="这一天还没有计划"
      description="新增一条待办，或给待办安排时间让它出现在时间轴上"
      action-label="+ 新增计划"
      icon="🗓"
      data-test="plan-empty"
      @action="openCreate"
    />

    <div v-else class="plan-body">
      <div class="timeline-col">
        <h2 class="col-title">时间轴</h2>
        <PlanTimeline
          :plans="planStore.timedPlans"
          :day-start-min="dayStartMin"
          data-test="timeline"
          @start="startPlan"
        />
      </div>

      <div class="todo-col">
        <h2 class="col-title">待办清单</h2>
        <div v-if="planStore.todoPlans.length === 0" class="settings-card">
          <p class="hint" data-test="todo-empty">这一天的待办都已安排到时间轴上了</p>
        </div>
        <ul v-else class="todo-list" data-test="todo-list">
          <li
            v-for="plan in planStore.todoPlans"
            :key="plan.id"
            class="todo-item"
            :class="{ done: plan.done }"
            data-test="todo-item"
          >
            <label class="todo-check">
              <input
                type="checkbox"
                :checked="plan.done"
                data-test="todo-check"
                @change="runOneClick(() => planStore.toggleDone(plan))"
              />
            </label>
            <div class="todo-main">
              <span class="todo-title" data-test="todo-title">{{ plan.title }}</span>
              <div class="todo-badges">
                <span v-if="plan.rollover_from_date" class="badge" data-test="rollover-badge">昨日顺延</span>
                <span class="badge">{{ plan.category_name }}</span>
                <span v-if="targetLabel(plan)" class="badge" data-test="target-badge">{{ targetLabel(plan) }}</span>
              </div>
            </div>
            <div class="todo-ops">
              <button
                v-if="!plan.done"
                class="ghost-btn"
                data-test="todo-schedule"
                title="安排时间"
                @click="openEdit(plan)"
              >
                安排时间
              </button>
              <button class="ghost-btn" data-test="todo-edit" @click="openEdit(plan)">编辑</button>
              <button
                v-if="canStart(plan)"
                class="primary-btn"
                data-test="todo-start"
                @click="startPlan(plan)"
              >
                开始
              </button>
              <button
                v-if="!plan.done"
                class="ghost-btn"
                data-test="todo-tomorrow"
                @click="runOneClick(() => planStore.moveToTomorrow(plan))"
              >
                移到明天
              </button>
              <button
                class="danger-btn"
                data-test="todo-delete"
                @click="runOneClick(() => planStore.softDeletePlan(plan))"
              >
                删除
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <PlanFormModal
      v-if="formOpen"
      :day-start-min="dayStartMin"
      :categories="planStore.categories"
      :books="planStore.readingBooks"
      :subjects="planStore.activeSubjects"
      :initial="editingPlan"
      :external-error="formError"
      @save="handleFormSave"
      @close="closeForm"
    />
  </section>
</template>

<style scoped>
.plan-header .page-title {
  margin-bottom: 0;
}
.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.progress-track {
  flex: 1;
  max-width: 360px;
  height: 8px;
  border-radius: 999px;
  background: var(--panel-2);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
}
.info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.mit-text {
  flex: 1;
  min-width: 200px;
}
.link-btn {
  text-decoration: none;
  padding: 4px 12px;
}
.plan-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  gap: 18px;
  align-items: start;
}
.col-title {
  font-size: 16px;
  margin: 0 0 10px;
}
.timeline-col {
  min-width: 0;
}
.todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  box-shadow: var(--shadow);
}
.todo-item.done {
  opacity: 0.65;
}
.todo-check {
  padding-top: 2px;
}
.todo-main {
  flex: 1;
  min-width: 0;
}
.todo-title {
  display: block;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.todo-item.done .todo-title {
  text-decoration: line-through;
  color: var(--muted);
}
.todo-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.todo-ops {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 300px;
}
.todo-ops .ghost-btn,
.todo-ops .danger-btn {
  padding: 4px 10px;
  font-size: 13px;
}
@media (max-width: 860px) {
  .plan-body {
    grid-template-columns: 1fr;
  }
}
</style>
