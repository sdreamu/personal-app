<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import BaseModal from '@/components/BaseModal.vue';
import EmptyState from '@/components/EmptyState.vue';
import ImageInput from '@/components/ImageInput.vue';
import { useLibraryStore } from '@/stores/library';
import { useDateStore } from '@/stores/date';
import { MISTAKE_IMAGE_LIMIT, MISTAKE_REASONS, useMistakesStore, type MistakeInput } from '@/stores/mistakes';
import type { Mistake } from '@/db';

/**
 * 错题本 #/mistakes（PRD M9，Q5 拍板：一题一卡 + 预设错误原因 + 进日期切换）。
 * 文字录入在这里；照片录入（M10）后续接在同一张卡片的图片区。
 */
const mistakes = useMistakesStore();
const library = useLibraryStore();
const dateStore = useDateStore();

const formOpen = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  date: '',
  subjectName: '',
  questionText: '',
  correctionText: '',
  reasons: [] as string[],
  customReason: '',
  note: '',
  difficulty: 3,
  mastered: false,
  questionImages: [] as string[],
  correctionImages: [] as string[],
});

const selectedDate = computed(() => dateStore.selectedDate);
const reasonOptions = computed(() => [...MISTAKE_REASONS]);
/** 科目候选：科目表里有名字的 + 本日期错题里用过的。 */
const subjectOptions = computed(() => {
  const names = new Set<string>();
  for (const subject of library.subjects) names.add(subject.name);
  for (const name of mistakes.usedSubjects) names.add(name);
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});

function emptyToText(value: string | null | undefined): string {
  return value ?? '';
}

function openCreate(): void {
  editingId.value = null;
  form.date = selectedDate.value;
  form.subjectName = '';
  form.questionText = '';
  form.correctionText = '';
  form.reasons = [];
  form.customReason = '';
  form.note = '';
  form.difficulty = 3;
  form.mastered = false;
  form.questionImages = [];
  form.correctionImages = [];
  formOpen.value = true;
}

function openEdit(item: Mistake): void {
  editingId.value = item.id;
  form.date = item.date;
  form.subjectName = emptyToText(item.subject_name);
  form.questionText = emptyToText(item.question_text);
  form.correctionText = emptyToText(item.correction_text);
  form.reasons = [...item.reasons];
  form.customReason = '';
  form.note = emptyToText(item.note);
  form.difficulty = item.difficulty;
  form.mastered = item.mastered;
  form.questionImages = [...item.question_images];
  form.correctionImages = [...item.correction_images];
  formOpen.value = true;
}

function toggleReason(reason: string): void {
  form.reasons = form.reasons.includes(reason)
    ? form.reasons.filter((item) => item !== reason)
    : [...form.reasons, reason];
}

/** 自定义错误原因：输入后点「加上」或回车，追加进标签。 */
function addCustomReason(): void {
  const reason = form.customReason.trim();
  if (reason === '') return;
  if (!form.reasons.includes(reason)) form.reasons = [...form.reasons, reason];
  form.customReason = '';
}

function payload(): MistakeInput {
  return {
    date: form.date,
    subjectName: form.subjectName.trim() === '' ? null : form.subjectName,
    questionText: form.questionText,
    correctionText: form.correctionText,
    reasons: form.reasons,
    note: form.note,
    difficulty: form.difficulty,
    mastered: form.mastered,
    questionImages: form.questionImages,
    correctionImages: form.correctionImages,
  };
}

async function save(): Promise<void> {
  const input = payload();
  if (editingId.value === null) {
    const created = await mistakes.create(input);
    if (created === null) return;
    // 日期和当前页不同（补记到别的日子）：跟着切过去，用户能马上看到
    if (created.date !== selectedDate.value) dateStore.setSelected(created.date);
  } else {
    const updated = await mistakes.save(editingId.value, input);
    if (updated === null) return;
    if (updated.date !== selectedDate.value) {
      dateStore.setSelected(updated.date);
      return;
    }
  }
  formOpen.value = false;
}

async function load(): Promise<void> {
  await mistakes.load(selectedDate.value);
}

onMounted(() => {
  void library.loadSubjects();
  void load();
});

watch(selectedDate, () => void load());

function difficultyStars(level: number): string {
  return '★'.repeat(level) + '☆'.repeat(Math.max(0, 5 - level));
}

function subjectLabel(item: Mistake): string {
  return item.subject_name ?? '未分类';
}
</script>

<template>
  <section class="page mistakes-page" data-test="mistakes-view">
    <div class="settings-card mistakes-header">
      <div class="header-row">
        <h1 class="page-title">错题本</h1>
        <div class="segmented" data-test="mistakes-filter">
          <button
            type="button"
            class="seg-btn"
            :class="{ on: !mistakes.onlyUnmastered }"
            data-test="mistakes-filter-all"
            @click="mistakes.onlyUnmastered = false"
          >
            全部
          </button>
          <button
            type="button"
            class="seg-btn"
            :class="{ on: mistakes.onlyUnmastered }"
            data-test="mistakes-filter-unmastered"
            @click="mistakes.onlyUnmastered = true"
          >
            未掌握
          </button>
        </div>
        <button class="primary-btn" data-test="add-mistake-btn" @click="openCreate">+ 记一道错题</button>
      </div>

      <div class="mistakes-meta">
        <span class="num" data-test="mistakes-progress">
          {{ selectedDate }} · 共 {{ mistakes.total }} 条 · 已掌握 {{ mistakes.masteredCount }} 条
        </span>
        <label class="mistakes-subject-filter">
          科目
          <select v-model="mistakes.subjectFilter" data-test="mistakes-subject-filter">
            <option :value="null">全部</option>
            <option v-for="name in mistakes.usedSubjects" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
      </div>
    </div>

    <EmptyState
      v-if="mistakes.visible.length === 0"
      data-test="mistakes-empty"
      icon="📕"
      title="这一天还没有错题"
      description="做错的题记下来，看清错在哪，比刷十道新题有用。"
      action-label="记一道错题"
      @action="openCreate"
    />

    <ul v-else class="mistake-list" data-test="mistake-list">
      <li
        v-for="item in mistakes.visible"
        :key="item.id"
        class="mistake-card"
        :class="{ mastered: item.mastered }"
        data-test="mistake-card"
      >
        <div class="mistake-head">
          <span class="badge" data-test="mistake-subject">{{ subjectLabel(item) }}</span>
          <span class="mistake-stars num" data-test="mistake-difficulty">{{ difficultyStars(item.difficulty) }}</span>
          <span v-if="item.mastered" class="badge badge-done" data-test="mistake-mastered-badge">已掌握</span>
          <span class="mistake-ops">
            <button
              type="button"
              class="ghost-btn"
              data-test="mistake-toggle-mastered"
              @click="mistakes.toggleMastered(item.id)"
            >
              {{ item.mastered ? '取消掌握' : '标记已掌握' }}
            </button>
            <button type="button" class="ghost-btn" data-test="mistake-edit" @click="openEdit(item)">编辑</button>
            <button type="button" class="danger-btn" data-test="mistake-delete" @click="mistakes.remove(item.id)">
              删除
            </button>
          </span>
        </div>

        <p class="mistake-question" data-test="mistake-question">
          {{ item.question_text ?? '（没写题目）' }}
        </p>
        <p v-if="item.correction_text" class="mistake-correction" data-test="mistake-correction">
          <span class="mistake-label">订正</span>{{ item.correction_text }}
        </p>
        <ul v-if="item.reasons.length > 0" class="mistake-reasons" data-test="mistake-reasons">
          <li v-for="reason in item.reasons" :key="reason" class="chip">{{ reason }}</li>
        </ul>
        <div v-if="item.question_images.length > 0 || item.correction_images.length > 0" class="mistake-photos">
          <figure
            v-for="(src, index) in item.question_images"
            :key="'q-' + index"
            class="mistake-photo"
            data-test="mistake-photo-question"
          >
            <img :src="src" :alt="'题目照片 ' + (index + 1)" />
          </figure>
          <figure
            v-for="(src, index) in item.correction_images"
            :key="'c-' + index"
            class="mistake-photo"
            data-test="mistake-photo-correction"
          >
            <img :src="src" :alt="'订正照片 ' + (index + 1)" />
          </figure>
        </div>
        <p v-if="item.note" class="mistake-note" data-test="mistake-note">备注：{{ item.note }}</p>
      </li>
    </ul>

    <BaseModal v-if="formOpen" id="mistake-form" title="记一道错题" @close="formOpen = false">
      <div class="mistake-form" data-test="mistake-form">
        <label class="field">
          <span>日期</span>
          <input v-model="form.date" type="date" data-test="mistake-form-date" />
        </label>

        <label class="field">
          <span>科目</span>
          <input
            v-model="form.subjectName"
            list="mistake-subjects"
            placeholder="比如 数学（可自由填写）"
            data-test="mistake-form-subject"
          />
          <datalist id="mistake-subjects">
            <option v-for="name in subjectOptions" :key="name" :value="name" />
          </datalist>
        </label>

        <label class="field">
          <span>题目</span>
          <textarea
            v-model="form.questionText"
            rows="3"
            placeholder="把题干或题干关键条件写下来"
            data-test="mistake-form-question"
          />
        </label>

        <label class="field">
          <span>订正</span>
          <textarea
            v-model="form.correctionText"
            rows="3"
            placeholder="正确思路 / 我在哪一步想错了"
            data-test="mistake-form-correction"
          />
        </label>

        <ImageInput
          :model-value="form.questionImages"
          test-key="question"
          label="题目照片"
          :max="MISTAKE_IMAGE_LIMIT"
          @update:model-value="form.questionImages = $event"
        />

        <div class="field">
          <span>错在哪</span>
          <div class="chip-row">
            <button
              v-for="reason in reasonOptions"
              :key="reason"
              type="button"
              class="chip chip-btn"
              :class="{ on: form.reasons.includes(reason) }"
              :aria-pressed="form.reasons.includes(reason)"
              :data-test="'mistake-reason-' + reason"
              @click="toggleReason(reason)"
            >
              {{ reason }}
            </button>
          </div>
          <div class="chip-row">
            <input
              v-model="form.customReason"
              placeholder="其它原因（回车加上）"
              data-test="mistake-form-custom-reason"
              @keyup.enter.prevent="addCustomReason"
            />
            <button type="button" class="ghost-btn" data-test="mistake-form-add-reason" @click="addCustomReason">
              加上
            </button>
          </div>
          <div v-if="form.reasons.length > 0" class="chip-row" data-test="mistake-form-reasons">
            <span v-for="reason in form.reasons" :key="reason" class="chip on">{{ reason }}</span>
          </div>
        </div>

        <div class="field">
          <span>难度</span>
          <div class="segmented" data-test="mistake-form-difficulty">
            <button
              v-for="level in [1, 2, 3, 4, 5]"
              :key="level"
              type="button"
              class="seg-btn"
              :class="{ on: form.difficulty === level }"
              :aria-pressed="form.difficulty === level"
              :data-test="'mistake-difficulty-' + level"
              @click="form.difficulty = level"
            >
              {{ level }}
            </button>
          </div>
        </div>

        <label class="field">
          <span>备注</span>
          <input v-model="form.note" placeholder="下次注意什么（可留空）" data-test="mistake-form-note" />
        </label>

        <ImageInput
          :model-value="form.correctionImages"
          test-key="correction"
          label="订正照片"
          :max="MISTAKE_IMAGE_LIMIT"
          @update:model-value="form.correctionImages = $event"
        />

        <label class="checkbox-field">
          <input v-model="form.mastered" type="checkbox" data-test="mistake-form-mastered" />
          <span>我已经会了（标记为已掌握）</span>
        </label>
      </div>

      <template #footer>
        <button type="button" class="ghost-btn" data-test="mistake-form-cancel" @click="formOpen = false">
          取消
        </button>
        <button type="button" class="primary-btn" data-test="mistake-form-save" @click="save">保存</button>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.mistakes-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.mistakes-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 13px;
}
.mistakes-subject-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mistake-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mistake-card {
  border: var(--line-w) solid var(--border-ink);
  border-radius: var(--radius);
  background: var(--panel);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mistake-card.mastered {
  opacity: 0.72;
}
.mistake-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mistake-stars {
  color: var(--accent);
  font-size: 14px;
}
.mistake-ops {
  display: inline-flex;
  gap: 8px;
  margin-left: auto;
}
.mistake-question {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.mistake-correction {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}
.mistake-label {
  display: inline-block;
  margin-right: 6px;
  color: var(--muted);
  font-size: 12px;
}
.mistake-reasons {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.mistake-photos {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mistake-photo {
  margin: 0;
  width: 72px;
  height: 72px;
  border: var(--line-w) solid var(--border-ink);
  background: var(--panel);
}
.mistake-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mistake-note {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.chip-btn.on {
  border-color: var(--accent);
  color: var(--accent);
}
.mistake-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.field input,
.field textarea {
  font: inherit;
  color: var(--text);
  padding: 8px 10px;
  border: var(--line-w) solid var(--border-ink);
  border-radius: var(--radius);
  background: var(--panel);
}
.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
</style>
