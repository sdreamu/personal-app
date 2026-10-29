<script setup lang="ts">
import { ref } from 'vue';
import { useDoneFlash } from '@/composables/useDoneFlash';
import type { WorkoutDayView } from '@/stores/workout';

const props = withDefaults(
  defineProps<{
    record: WorkoutDayView | null;
    suggestions?: string[];
    mode?: 'day' | 'history';
  }>(),
  { suggestions: () => [], mode: 'day' },
);

const emit = defineEmits<{
  (e: 'start-temporary'): void;
  (e: 'toggle-set', exerciseIndex: number, setIndex: number): void;
  (
    e: 'update-set',
    exerciseIndex: number,
    setIndex: number,
    patch: { weight_kg?: number | null; reps?: number | null },
  ): void;
  (e: 'add-exercise', name: string): void;
  (e: 'remove-exercise', exerciseIndex: number): void;
  (e: 'rename-exercise', exerciseIndex: number, name: string): void;
  (e: 'set-note', exerciseIndex: number, note: string | null): void;
  (e: 'set-duration', minutes: number | null): void;
  (e: 'finish'): void;
  /** 一键把某个动作的所有组标记为完成。 */
  (e: 'complete-exercise', exerciseIndex: number): void;
}>();

const suggestionListId = 'workout-suggestions-' + Math.random().toString(36).slice(2, 10);
const newName = ref('');
const renamingIndex = ref<number | null>(null);
const renamingName = ref('');
const notingIndex = ref<number | null>(null);
const notingValue = ref('');
/** N4 完成反馈：勾选一组（变成完成）时该行闪一下。 */
const doneFlash = useDoneFlash();

function setKey(exerciseIndex: number, setIndex: number): string {
  return exerciseIndex + '-' + setIndex;
}

function toggleSet(exerciseIndex: number, setIndex: number, done: boolean): void {
  if (!done) doneFlash.flash(setKey(exerciseIndex, setIndex));
  emit('toggle-set', exerciseIndex, setIndex);
}

function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function submitAdd(): void {
  const name = newName.value.trim();
  if (name === '') return;
  emit('add-exercise', name);
  newName.value = '';
}

function startRename(index: number, name: string): void {
  renamingIndex.value = index;
  renamingName.value = name;
}

function commitRename(index: number): void {
  if (renamingIndex.value !== index) return;
  renamingIndex.value = null;
  const name = renamingName.value.trim();
  if (name !== '' && name !== props.record?.exercises[index]?.name) {
    emit('rename-exercise', index, name);
  }
}

function startNote(index: number, note: string | null | undefined): void {
  notingIndex.value = index;
  notingValue.value = note ?? '';
}

function commitNote(index: number): void {
  if (notingIndex.value !== index) return;
  notingIndex.value = null;
  const value = notingValue.value.trim();
  const current = (props.record?.exercises[index]?.note ?? '').trim();
  if (value !== current) {
    emit('set-note', index, value === '' ? null : value);
  }
}

function onWeightChange(exerciseIndex: number, setIndex: number, event: Event): void {
  emit('update-set', exerciseIndex, setIndex, {
    weight_kg: parseNullableNumber((event.target as HTMLInputElement).value),
  });
}

function onRepsChange(exerciseIndex: number, setIndex: number, event: Event): void {
  emit('update-set', exerciseIndex, setIndex, {
    reps: parseNullableNumber((event.target as HTMLInputElement).value),
  });
}

function onDurationChange(event: Event): void {
  emit('set-duration', parseNullableNumber((event.target as HTMLInputElement).value));
}
</script>

<template>
  <div v-if="record" class="workout-day" data-test="day-editor">
    <div class="day-header">
      <span class="day-type" data-test="day-type">{{ record.type_name }}</span>
      <span v-if="record.done" class="badge success" data-test="done-badge">已完成</span>
      <span v-else class="badge" data-test="in-progress-badge">进行中</span>
      <label class="duration-field">
        <span>用时（分钟）</span>
        <input
          type="number"
          min="1"
          step="1"
          :value="record.duration_min ?? ''"
          data-test="duration-input"
          @change="onDurationChange"
        />
      </label>
      <button
        v-if="mode === 'day' && !record.done"
        class="primary-btn"
        data-test="finish-workout"
        @click="emit('finish')"
      >
        完成训练
      </button>
      <button v-else-if="mode === 'day'" class="ghost-btn" disabled data-test="finished-btn">
        已完成 ✓
      </button>
    </div>

    <ul class="exercise-list" data-test="exercise-list">
      <li
        v-for="(exercise, exerciseIndex) in record.exercises"
        :key="exerciseIndex"
        class="exercise-item"
        data-test="exercise-item"
      >
        <details open class="exercise-details">
          <summary class="exercise-summary">
            <div class="exercise-main">
              <div class="exercise-title">
                <template v-if="renamingIndex === exerciseIndex">
                  <input
                    v-model="renamingName"
                    class="rename-input"
                    data-test="exercise-rename-input"
                    @keyup.enter="commitRename(exerciseIndex)"
                    @blur="commitRename(exerciseIndex)"
                    @click.stop
                  />
                </template>
                <template v-else>
                  <span class="exercise-name" data-test="exercise-name">{{ exercise.name }}</span>
                  <span class="badge" data-test="exercise-progress">
                    {{ exercise.sets.filter((set) => set.done).length }}/{{ exercise.sets.length }} 组
                  </span>
                </template>
              </div>
              <input
                v-if="notingIndex === exerciseIndex"
                v-model="notingValue"
                class="note-input"
                data-test="exercise-note-input"
                placeholder="备注（如：加到 60kg，8 次力竭）"
                @keyup.enter="commitNote(exerciseIndex)"
                @blur="commitNote(exerciseIndex)"
                @click.stop
              />
              <p
                v-else-if="exercise.note"
                class="exercise-note"
                data-test="exercise-note-text"
                @click.stop.prevent="mode === 'day' ? startNote(exerciseIndex, exercise.note) : undefined"
              >
                备注：{{ exercise.note }}
              </p>
              <p
                v-else-if="mode === 'day' && renamingIndex !== exerciseIndex && notingIndex !== exerciseIndex"
                class="exercise-note hint"
                data-test="exercise-note-hint"
              >
                备注：还没写（如「4 组 12 次」「跑步 30 分钟」）
              </p>
            </div>
            <span class="exercise-ops">
              <button
                v-if="mode === 'day' && renamingIndex !== exerciseIndex && notingIndex !== exerciseIndex"
                class="ghost-btn"
                data-test="exercise-note"
                @click.prevent="startNote(exerciseIndex, exercise.note)"
              >
                备注
              </button>
              <button
                v-if="renamingIndex !== exerciseIndex"
                class="ghost-btn"
                data-test="exercise-rename"
                @click.prevent="startRename(exerciseIndex, exercise.name)"
              >
                改名
              </button>
              <button
                class="ghost-btn danger-text"
                data-test="exercise-remove"
                @click.prevent="emit('remove-exercise', exerciseIndex)"
              >
                删除
              </button>
            </span>
          </summary>
          <div class="set-list">
            <div v-if="mode === 'day'" class="set-row set-head" data-test="set-head">
              <span class="set-index">完成</span>
              <span class="set-label">重量(kg)</span>
              <span class="set-label">次数</span>
              <button
                type="button"
                class="ghost-btn complete-all"
                data-test="exercise-complete-all"
                @click.prevent="emit('complete-exercise', exerciseIndex)"
              >
                一键完成全部组
              </button>
            </div>
            <div
              v-for="(set, setIndex) in exercise.sets"
              :key="setIndex"
              class="set-row"
              :class="{ 'set-row-done': set.done, 'done-flash': doneFlash.isFlashing(setKey(exerciseIndex, setIndex)) }"
              data-test="set-row"
            >
              <label class="set-check">
                <input
                  type="checkbox"
                  :checked="set.done"
                  data-test="set-done"
                  @change="toggleSet(exerciseIndex, setIndex, set.done)"
                />
              </label>
              <span class="set-index">第 {{ setIndex + 1 }} 组</span>
              <input
                type="number"
                min="0"
                step="0.5"
                :value="set.weight_kg ?? ''"
                placeholder="重量"
                class="set-input weight"
                data-test="set-weight"
                @change="onWeightChange(exerciseIndex, setIndex, $event)"
              />
              <span class="unit">kg</span>
              <input
                type="number"
                min="1"
                step="1"
                :value="set.reps ?? ''"
                placeholder="次数"
                class="set-input reps"
                data-test="set-reps"
                @change="onRepsChange(exerciseIndex, setIndex, $event)"
              />
              <span class="unit">次</span>
              <span v-if="set.done" class="set-done-mark" data-test="set-done-mark">✓</span>
            </div>
          </div>
        </details>
      </li>
    </ul>

    <p v-if="record.exercises.length === 0" class="hint" data-test="day-empty">
      还没有动作，先添加一个动作开始训练
    </p>

    <div class="add-exercise">
      <input
        v-model="newName"
        :list="suggestionListId"
        class="text-input"
        data-test="add-exercise-input"
        placeholder="添加临时动作"
        @keyup.enter="submitAdd"
      />
      <datalist :id="suggestionListId">
        <option v-for="name in suggestions" :key="name" :value="name" />
      </datalist>
      <button class="ghost-btn" data-test="add-exercise" @click="submitAdd">添加</button>
    </div>
  </div>

  <div v-else class="rest-day" data-test="rest-day">
    <p class="rest-text" data-test="rest-text">今天休息</p>
    <button class="primary-btn" data-test="start-temporary" @click="emit('start-temporary')">
      开始临时训练
    </button>
  </div>
</template>

<style scoped>
.workout-day {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.day-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.day-type {
  font-weight: 700;
  font-size: 16px;
}
.badge.success {
  background: var(--success-soft);
  color: var(--success);
}
.duration-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}
.duration-field input {
  width: 88px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 6px 8px;
}
.exercise-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.exercise-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
.exercise-details > summary {
  list-style: none;
}
.exercise-details[open] > .exercise-summary {
  border-bottom: 1px solid var(--border);
}
.exercise-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
}
.exercise-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.exercise-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.exercise-name {
  font-weight: 600;
}
.exercise-note {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}
.note-input {
  width: 100%;
  max-width: 320px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 6px 8px;
  font-size: 13px;
}
.exercise-ops {
  margin-left: auto;
  display: inline-flex;
  gap: 6px;
}
.exercise-ops .ghost-btn {
  padding: 3px 10px;
  font-size: 13px;
}
.rename-input {
  width: 160px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 8px;
}
.set-head {
  color: var(--muted);
  font-size: 12px;
}
.set-row-done .set-index {
  text-decoration: line-through;
}
.set-row-done .set-input {
  opacity: 0.6;
}
.set-done-mark {
  color: var(--accent);
  font-weight: 700;
}
.set-head .set-label {
  min-width: 88px;
}
.set-head .complete-all {
  margin-left: auto;
  padding: 3px 10px;
  font-size: 12px;
}
.set-list {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.set-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.set-check {
  display: inline-flex;
}
.set-index {
  width: 56px;
  color: var(--muted);
  font-size: 13px;
}
.set-input {
  width: 88px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 6px 8px;
}
.unit {
  color: var(--muted);
  font-size: 13px;
}
.add-exercise {
  display: flex;
  gap: 8px;
}
.add-exercise .text-input {
  flex: 1;
}
.rest-day {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
}
.rest-text {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
</style>
