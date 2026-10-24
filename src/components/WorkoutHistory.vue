<script setup lang="ts">
import type { WorkoutRecord } from '@/db';
import { weekdayCN } from '@/utils/date';
import WorkoutDay from './WorkoutDay.vue';

withDefaults(
  defineProps<{
    records: WorkoutRecord[];
    suggestions?: string[];
  }>(),
  { suggestions: () => [] },
);

const emit = defineEmits<{
  (e: 'toggle-set', record: WorkoutRecord, exerciseIndex: number, setIndex: number): void;
  (
    e: 'update-set',
    record: WorkoutRecord,
    exerciseIndex: number,
    setIndex: number,
    patch: { weight_kg?: number | null; reps?: number | null },
  ): void;
  (e: 'add-exercise', record: WorkoutRecord, name: string): void;
  (e: 'remove-exercise', record: WorkoutRecord, exerciseIndex: number): void;
  (e: 'rename-exercise', record: WorkoutRecord, exerciseIndex: number, name: string): void;
  (e: 'set-duration', record: WorkoutRecord, minutes: number | null): void;
}>();

function onToggleSet(record: WorkoutRecord, exerciseIndex: number, setIndex: number): void {
  emit('toggle-set', record, exerciseIndex, setIndex);
}

function onUpdateSet(
  record: WorkoutRecord,
  exerciseIndex: number,
  setIndex: number,
  patch: { weight_kg?: number | null; reps?: number | null },
): void {
  emit('update-set', record, exerciseIndex, setIndex, patch);
}

function onAddExercise(record: WorkoutRecord, name: string): void {
  emit('add-exercise', record, name);
}

function onRemoveExercise(record: WorkoutRecord, exerciseIndex: number): void {
  emit('remove-exercise', record, exerciseIndex);
}

function onRenameExercise(record: WorkoutRecord, exerciseIndex: number, name: string): void {
  emit('rename-exercise', record, exerciseIndex, name);
}

function onSetDuration(record: WorkoutRecord, minutes: number | null): void {
  emit('set-duration', record, minutes);
}
</script>

<template>
  <div class="workout-history" data-test="workout-history">
    <p v-if="records.length === 0" class="hint" data-test="history-empty">还没有训练记录</p>
    <ul v-else class="history-list" data-test="history-list">
      <li v-for="record in records" :key="record.id" class="history-item" data-test="history-item">
        <details class="history-details" data-test="history-details">
          <summary class="history-summary">
            <span class="history-date" data-test="history-date">
              {{ record.date }} {{ weekdayCN(record.date) }}
            </span>
            <span class="badge" data-test="history-type">{{ record.type_name }}</span>
            <span v-if="record.done" class="badge success" data-test="history-done">已完成</span>
            <span v-else class="badge" data-test="history-progress">进行中</span>
            <span class="hint" data-test="history-duration">{{ record.duration_min ?? '—' }} 分钟</span>
          </summary>
          <WorkoutDay
            :record="record"
            :suggestions="suggestions"
            mode="history"
            @toggle-set="(exerciseIndex, setIndex) => onToggleSet(record, exerciseIndex, setIndex)"
            @update-set="(exerciseIndex, setIndex, patch) => onUpdateSet(record, exerciseIndex, setIndex, patch)"
            @add-exercise="(name) => onAddExercise(record, name)"
            @remove-exercise="(exerciseIndex) => onRemoveExercise(record, exerciseIndex)"
            @rename-exercise="(exerciseIndex, name) => onRenameExercise(record, exerciseIndex, name)"
            @set-duration="(minutes) => onSetDuration(record, minutes)"
          />
        </details>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.workout-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
.history-details > summary {
  list-style: none;
}
.history-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  cursor: pointer;
}
.history-date {
  font-weight: 600;
}
.badge.success {
  background: var(--success-soft);
  color: var(--success);
}
</style>
