<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { WorkoutTemplate, WorkoutType } from '@/db';
import { REST_TYPE_NAME, type WorkoutTemplatePatch } from '@/stores/workout';

const props = defineProps<{
  templates: WorkoutTemplate[];
  workoutTypes: WorkoutType[];
}>();

const emit = defineEmits<{
  (e: 'save', weekday: number, patch: WorkoutTemplatePatch): void;
}>();

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

interface WeekRow {
  weekday: number;
  label: string;
  template: WorkoutTemplate | null;
}

const rows = computed<WeekRow[]>(() =>
  WEEKDAY_LABELS.map((label, index) => ({
    weekday: index + 1,
    label,
    template: props.templates.find((t) => t.weekday === index + 1) ?? null,
  })),
);

const addInputs = reactive<Record<number, string>>({});
const renamingIndex = reactive<Record<number, number | null>>({});
const renamingName = reactive<Record<number, string>>({});

function typeOptions(row: WeekRow): string[] {
  const options = [REST_TYPE_NAME, ...props.workoutTypes.map((t) => t.name)];
  const current = row.template?.type_name;
  if (current && current !== REST_TYPE_NAME && !options.includes(current)) {
    options.unshift(current);
  }
  return options;
}

function currentType(row: WeekRow): string {
  return row.template?.type_name ?? REST_TYPE_NAME;
}

function exerciseNames(row: WeekRow): string[] {
  return row.template?.exercise_names ?? [];
}

function onTypeChange(row: WeekRow, event: Event): void {
  emit('save', row.weekday, { type_name: (event.target as HTMLSelectElement).value });
}

function addExercises(row: WeekRow): void {
  const raw = addInputs[row.weekday] ?? '';
  const parts = raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (parts.length === 0) return;
  const merged = [...exerciseNames(row)];
  for (const part of parts) {
    if (!merged.includes(part)) merged.push(part);
  }
  addInputs[row.weekday] = '';
  emit('save', row.weekday, { exercise_names: merged });
}

function removeExercise(row: WeekRow, index: number): void {
  emit('save', row.weekday, {
    exercise_names: exerciseNames(row).filter((_, i) => i !== index),
  });
}

function startRename(row: WeekRow, index: number): void {
  renamingIndex[row.weekday] = index;
  renamingName[row.weekday] = exerciseNames(row)[index] ?? '';
}

function commitRename(row: WeekRow, index: number): void {
  if (renamingIndex[row.weekday] !== index) return;
  renamingIndex[row.weekday] = null;
  const name = (renamingName[row.weekday] ?? '').trim();
  if (name === '' || name === exerciseNames(row)[index]) return;
  const names = exerciseNames(row).map((n, i) => (i === index ? name : n));
  emit('save', row.weekday, { exercise_names: names });
}
</script>

<template>
  <div class="week-plan" data-test="week-plan">
    <div v-for="row in rows" :key="row.weekday" class="week-row" data-test="week-row" :data-weekday="row.weekday">
      <span class="weekday-label" data-test="weekday-label">{{ row.label }}</span>
      <select
        class="type-select"
        :value="currentType(row)"
        data-test="type-select"
        @change="onTypeChange(row, $event)"
      >
        <option v-for="typeName in typeOptions(row)" :key="typeName" :value="typeName">
          {{ typeName }}
        </option>
      </select>

      <div
        v-if="currentType(row) !== REST_TYPE_NAME"
        class="exercise-editor"
        data-test="exercise-editor"
      >
        <span
          v-for="(name, index) in exerciseNames(row)"
          :key="name + index"
          class="exercise-chip"
          data-test="exercise-chip"
        >
          <input
            v-if="renamingIndex[row.weekday] === index"
            v-model="renamingName[row.weekday]"
            class="chip-input"
            data-test="exercise-rename-input"
            @keyup.enter="commitRename(row, index)"
            @blur="commitRename(row, index)"
          />
          <template v-else>
            <span class="chip-name" data-test="exercise-name">{{ name }}</span>
            <button class="chip-btn" data-test="exercise-rename" @click="startRename(row, index)">
              改
            </button>
            <button
              class="chip-btn danger-text"
              data-test="exercise-remove"
              @click="removeExercise(row, index)"
            >
              ×
            </button>
          </template>
        </span>
        <div class="add-row">
          <input
            v-model="addInputs[row.weekday]"
            class="text-input"
            data-test="exercise-add-input"
            placeholder="添加动作，可用逗号分隔"
            @keyup.enter="addExercises(row)"
          />
          <button class="ghost-btn" data-test="exercise-add" @click="addExercises(row)">
            添加
          </button>
        </div>
      </div>
      <span v-else class="hint" data-test="rest-hint">休息</span>
    </div>
  </div>
</template>

<style scoped>
.week-plan {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.week-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
  padding: 8px 0;
}
.week-row:last-child {
  border-bottom: none;
}
.weekday-label {
  width: 44px;
  font-weight: 600;
  flex: none;
}
.type-select {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 6px 8px;
}
.exercise-editor {
  flex: 1;
  min-width: 240px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.exercise-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: var(--radius);
  padding: 2px 10px;
  font-size: 13px;
}
.chip-btn {
  border: none;
  background: transparent;
  color: inherit;
  padding: 0 2px;
  cursor: pointer;
}
.chip-btn:hover {
  opacity: 0.7;
}
.chip-input {
  width: 96px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2px 6px;
}
.add-row {
  display: flex;
  gap: 6px;
  width: 100%;
}
.add-row .text-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
}
.add-row .ghost-btn {
  padding: 5px 12px;
  font-size: 13px;
}
</style>
