<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { errorMessage, type WorkoutRecord } from '@/db';
import WorkoutDay from '@/components/WorkoutDay.vue';
import WorkoutHistory from '@/components/WorkoutHistory.vue';
import WorkoutWeekPlanEditor from '@/components/WorkoutWeekPlanEditor.vue';
import { useDateStore } from '@/stores/date';
import { useToastStore } from '@/stores/toast';
import { useWorkoutStore, weekdayOf, type WorkoutTemplatePatch } from '@/stores/workout';
import { formatDateCN } from '@/utils/date';

/**
 * 健身页 #/life/workout（PRD §5.6，AC-43~45）：
 * 上半部分为周计划（即时保存）；下半部分按 dateStore.selectedDate
 * 展示当天训练（模板带入 + 历史默认组数 + 临时动作）与历史训练记录。
 */
const dateStore = useDateStore();
const store = useWorkoutStore();
const toast = useToastStore();

const selectedDate = computed(() => dateStore.selectedDate);
const suggestions = computed(() => store.exerciseNames);
const libraryNames = computed(() => store.libraryNames);

async function load(): Promise<void> {
  try {
    await store.load(selectedDate.value);
  } catch (err) {
    toast.error('加载健身数据失败：' + errorMessage(err));
  }
}

watch(
  () => dateStore.selectedDate,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});

function runAction(action: () => Promise<unknown>): void {
  void action().catch(() => undefined); // 失败已由 store 置保存失败红条并 toast
}

/* ---------- 周计划 ---------- */

async function handleTemplateSave(weekday: number, patch: WorkoutTemplatePatch): Promise<void> {
  try {
    await store.saveTemplate(weekday, patch);
    // 当天还没有已保存记录时，模板变更同步刷新当天草稿
    if (!store.dayPersisted && weekday === weekdayOf(selectedDate.value)) {
      await store.loadDay(selectedDate.value);
    }
  } catch {
    // 已由 store 提示
  }
}

/* ---------- 当天训练 ---------- */

function handleToggleSet(exerciseIndex: number, setIndex: number): void {
  runAction(() => store.toggleSet(selectedDate.value, exerciseIndex, setIndex));
}

function handleUpdateSet(
  exerciseIndex: number,
  setIndex: number,
  patch: { weight_kg?: number | null; reps?: number | null },
): void {
  runAction(() => store.updateSet(selectedDate.value, exerciseIndex, setIndex, patch));
}

function handleAddExercise(name: string): void {
  runAction(() => store.addExercise(selectedDate.value, name));
}

function handleRemoveExercise(exerciseIndex: number): void {
  runAction(() => store.removeExercise(selectedDate.value, exerciseIndex));
}

function handleRenameExercise(exerciseIndex: number, name: string): void {
  runAction(() => store.renameExercise(selectedDate.value, exerciseIndex, name));
}

function handleSetNote(exerciseIndex: number, note: string | null): void {
  runAction(() => store.setExerciseNote(selectedDate.value, exerciseIndex, note));
}

function handleSetDuration(minutes: number | null): void {
  runAction(() => store.setDuration(selectedDate.value, minutes));
}

function handleStartTemporary(): void {
  runAction(() => store.startTemporaryWorkout(selectedDate.value));
}

function handleFinish(): void {
  runAction(() => store.finishWorkout(selectedDate.value));
}

/* ---------- 历史记录 ---------- */

function handleHistoryToggleSet(record: WorkoutRecord, exerciseIndex: number, setIndex: number): void {
  runAction(() => store.toggleSet(record.date, exerciseIndex, setIndex));
}

function handleHistoryUpdateSet(
  record: WorkoutRecord,
  exerciseIndex: number,
  setIndex: number,
  patch: { weight_kg?: number | null; reps?: number | null },
): void {
  runAction(() => store.updateSet(record.date, exerciseIndex, setIndex, patch));
}

function handleHistoryAddExercise(record: WorkoutRecord, name: string): void {
  runAction(() => store.addExercise(record.date, name));
}

function handleHistoryRemoveExercise(record: WorkoutRecord, exerciseIndex: number): void {
  runAction(() => store.removeExercise(record.date, exerciseIndex));
}

function handleHistoryRenameExercise(record: WorkoutRecord, exerciseIndex: number, name: string): void {
  runAction(() => store.renameExercise(record.date, exerciseIndex, name));
}

function handleHistorySetDuration(record: WorkoutRecord, minutes: number | null): void {
  runAction(() => store.setDuration(record.date, minutes));
}
</script>

<template>
  <section class="page workout-page" data-test="workout-view">
    <h1 class="page-title">健身</h1>

    <div v-if="store.loading && store.loadedDate === null" class="hint" data-test="workout-loading">
      正在加载健身数据…
    </div>

    <div class="settings-card">
      <h2>每周计划</h2>
      <WorkoutWeekPlanEditor
        :templates="store.week"
        :workout-types="store.workoutTypes"
        @save="handleTemplateSave"
      />
    </div>

    <div class="settings-card" data-test="day-card">
      <h2>{{ formatDateCN(selectedDate) }} 训练</h2>
      <WorkoutDay
        :record="store.day"
        :suggestions="suggestions"
        :library="libraryNames"
        @start-temporary="handleStartTemporary"
        @toggle-set="handleToggleSet"
        @update-set="handleUpdateSet"
        @add-exercise="handleAddExercise"
        @remove-exercise="handleRemoveExercise"
        @rename-exercise="handleRenameExercise"
        @set-note="handleSetNote"
        @set-duration="handleSetDuration"
        @finish="handleFinish"
      />
    </div>

    <div class="settings-card">
      <h2>历史训练记录</h2>
      <WorkoutHistory
        :records="store.history"
        :suggestions="suggestions"
        @toggle-set="handleHistoryToggleSet"
        @update-set="handleHistoryUpdateSet"
        @add-exercise="handleHistoryAddExercise"
        @remove-exercise="handleHistoryRemoveExercise"
        @rename-exercise="handleHistoryRenameExercise"
        @set-duration="handleHistorySetDuration"
      />
    </div>
  </section>
</template>
