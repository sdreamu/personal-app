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
      <div class="day-actions">
        <label class="duration-field">
          <span>用时</span>
          <input
            type="number"
            min="1"
            step="1"
            :value="record.duration_min ?? ''"
            data-test="duration-input"
            aria-label="训练用时（分钟）"
            @change="onDurationChange"
          />
          <span>分钟</span>
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
                  <button
                    v-if="mode === 'day'"
                    type="button"
                    class="ghost-btn complete-all"
                    data-test="exercise-complete-all"
                    @click.prevent="emit('complete-exercise', exerciseIndex)"
                  >
                    全部完成
                  </button>
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
            <div class="set-row set-head" data-test="set-head">
              <span></span>
              <span class="set-col-label">组</span>
              <span class="set-col-label">重量(kg)</span>
              <span class="set-col-label">次数</span>
              <span></span>
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
                  :aria-label="'第 ' + (setIndex + 1) + ' 组已完成'"
                  @change="toggleSet(exerciseIndex, setIndex, set.done)"
                />
              </label>
              <span class="set-index" data-test="set-index">第 {{ setIndex + 1 }} 组</span>
              <input
                type="number"
                min="0"
                step="0.5"
                :value="set.weight_kg ?? ''"
                placeholder="重量"
                class="set-input"
                data-test="set-weight"
                :aria-label="'第 ' + (setIndex + 1) + ' 组重量（kg）'"
                @change="onWeightChange(exerciseIndex, setIndex, $event)"
              />
              <input
                type="number"
                min="1"
                step="1"
                :value="set.reps ?? ''"
                placeholder="次数"
                class="set-input"
                data-test="set-reps"
                :aria-label="'第 ' + (setIndex + 1) + ' 组次数'"
                @change="onRepsChange(exerciseIndex, setIndex, $event)"
              />
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
        placeholder="添加一个动作，回车即可"
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
    <div class="rest-actions">
      <button class="primary-btn" data-test="start-temporary" @click="emit('start-temporary')">
        开始临时训练
      </button>
      <span class="hint">或者直接在下面的项目库里点一个动作</span>
    </div>
  </div>
</template>

<style scoped>
.workout-day {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* 头部一行搞定：左边动作类型 + 完成标记，右边用时与主按钮 */
.day-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.day-type {
  font-weight: 700;
  font-size: 16px;
}
.badge.success {
  background: var(--success-soft);
  color: var(--success);
}
.day-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.duration-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}
.duration-field input {
  width: 64px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 4px 6px;
  text-align: right;
  font-variant-numeric: tabular-nums;
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
  overflow: hidden;
}
.exercise-details > summary {
  list-style: none;
}
.exercise-details > summary::-webkit-details-marker {
  display: none;
}
.exercise-details[open] > .exercise-summary {
  border-bottom: 1px solid var(--border);
}
.exercise-summary {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
}
.exercise-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.exercise-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.exercise-name {
  font-weight: 700;
  font-size: 15px;
}
.complete-all {
  padding: 2px 8px;
  font-size: 12px;
  color: var(--accent);
  border-color: var(--accent);
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
  padding: 4px 8px;
  font-size: 13px;
}
.exercise-ops {
  display: inline-flex;
  gap: 6px;
  flex: none;
}
.exercise-ops .ghost-btn {
  padding: 2px 8px;
  font-size: 12px;
}
.rename-input {
  width: 160px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 8px;
}
/* 组表格：勾选 / 第 N 组 / 重量 / 次数 / 对勾 五列对齐，表头与数据同一套栅格 */
.set-list {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.set-row {
  display: grid;
  grid-template-columns: 22px 56px 112px 112px 18px;
  align-items: center;
  gap: 8px;
  justify-content: start;
}
.set-head {
  padding-bottom: 2px;
}
.set-col-label {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.02em;
}
.set-check {
  display: inline-flex;
  justify-content: center;
}
.set-index {
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.set-input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 4px 8px;
  font-variant-numeric: tabular-nums;
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
  font-variant-numeric: tabular-nums;
}
.add-exercise {
  display: flex;
  gap: 8px;
  align-items: center;
  border-top: 1px dashed var(--border);
  padding-top: 12px;
}
.add-exercise .text-input {
  flex: 1;
  min-width: 0;
}
.rest-day {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 0;
}
.rest-text {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.rest-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 768px) {
  /* 窄屏：操作按钮收到动作名下面一行靠右，别把备注挤成一条窄缝 */
  .exercise-summary {
    flex-wrap: wrap;
  }
  .exercise-ops {
    width: 100%;
    justify-content: flex-end;
  }
  .set-row {
    grid-template-columns: 22px 50px minmax(56px, 1fr) minmax(56px, 1fr) 16px;
    gap: 6px;
  }
  .day-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
