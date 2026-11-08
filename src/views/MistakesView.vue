<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import BaseModal from '@/components/BaseModal.vue';
import EmptyState from '@/components/EmptyState.vue';
import ImageInput from '@/components/ImageInput.vue';
import { useLibraryStore } from '@/stores/library';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import { logicalToday } from '@/utils/date';
import { MISTAKE_IMAGE_LIMIT, MISTAKE_REASONS, useMistakesStore, type MistakeInput } from '@/stores/mistakes';
import type { Mistake } from '@/db';

/**
 * 错题本 #/mistakes：汇总全部日期，按科目和知识点分类。
 * 题目和订正支持文字、拍照、上传照片组合录入。
 */
const mistakes = useMistakesStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const toast = useToastStore();

const formOpen = ref(false);
const formSaving = ref(false);
const formError = ref('');
const photoBusy = reactive({ question: false, correction: false });
const addingFormSubject = ref(false);
const newFormSubject = ref('');
const formSubjectError = ref('');
const formSubjectSaving = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  date: '',
  subjectName: '',
  knowledgePoint: '',
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


const reasonOptions = computed(() => [...new Set([...MISTAKE_REASONS, ...form.reasons])]);
/** 科目候选：已保存的科目 + 全部错题里用过的科目。 */
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
  resetFormFeedback();
  editingId.value = null;
  form.date = logicalToday(settings.dayStartMin);
  form.subjectName = mistakes.subjectFilter ?? '';
  form.knowledgePoint = mistakes.knowledgeFilter ?? '';
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
  resetFormFeedback();
  editingId.value = item.id;
  form.date = item.date;
  form.subjectName = emptyToText(item.subject_name);
  form.knowledgePoint = emptyToText(item.knowledge_point);
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

function resetFormFeedback(): void {
  formError.value = '';
  photoBusy.question = false;
  photoBusy.correction = false;
  addingFormSubject.value = false;
  newFormSubject.value = '';
  formSubjectError.value = '';
}

function chooseSubject(name: string): void {
  if (form.subjectName !== name) form.knowledgePoint = '';
  form.subjectName = name;
}

async function addFormSubject(): Promise<void> {
  if (formSubjectSaving.value) return;
  const name = newFormSubject.value.trim();
  if (!name) { formSubjectError.value = '请填写科目名称'; return; }
  formSubjectSaving.value = true;
  formSubjectError.value = '';
  try {
    const subject = await library.createMistakeSubject(name);
    if (!subject) return;
    await library.loadSubjects();
    chooseSubject(subject.name);
    addingFormSubject.value = false;
    newFormSubject.value = '';
  } catch { formSubjectError.value = '科目未能添加，请重试'; }
  finally { formSubjectSaving.value = false; }
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
    knowledgePoint: form.knowledgePoint,
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
  if (formSaving.value || photoBusy.question || photoBusy.correction || formSubjectSaving.value) return;
  formError.value = '';
  const input = payload();
  if (!input.questionText.trim() && !input.correctionText.trim() && !input.questionImages?.length && !input.correctionImages?.length) {
    formError.value = '写一点题目或订正，或者添加一张照片再保存';
    return;
  }
  formSaving.value = true;
  try {
    const result = editingId.value === null
      ? await mistakes.create(input)
      : await mistakes.save(editingId.value, input);
    if (result) formOpen.value = false;
  } catch { formError.value = '保存失败，请重试'; }
  finally { formSaving.value = false; }
}

const loadError = ref('');
async function load(): Promise<void> {
  loadError.value = '';
  try { await Promise.all([library.loadSubjects(), mistakes.load()]); }
  catch { loadError.value = '错题未能加载，请重试'; }
}

onMounted(() => { void load(); });

watch(() => mistakes.subjectFilter, () => { mistakes.knowledgeFilter = null; });

function difficultyStars(level: number): string {
  return '★'.repeat(level) + '☆'.repeat(Math.max(0, 5 - level));
}

function subjectLabel(item: Mistake): string {
  return item.subject_name ?? '未分类';
}

const categoryOpen = ref(false);
const categorySubject = ref('');
const categoryPoint = ref('');
const categoryError = ref('');
const categorySaving = ref(false);
function knowledgeOptions(subject: string): string[] {
  const points = new Set(library.subjects.find(row => row.name === subject)?.knowledge_points ?? []);
  for (const item of mistakes.items) if (item.subject_name === subject && item.knowledge_point) points.add(item.knowledge_point);
  return [...points].sort((a,b) => a.localeCompare(b,'zh-Hans-CN'));
}
function openCategory(point: boolean): void {
  categorySubject.value = point ? mistakes.subjectFilter ?? '' : '';
  categoryPoint.value = '';
  categoryError.value = '';
  categoryOpen.value = true;
}
async function saveCategory(): Promise<void> {
  if (categorySaving.value) return;
  const name = categorySubject.value.trim();
  if (!name) { categoryError.value = '请填写科目名称'; return; }
  categorySaving.value = true;
  categoryError.value = '';
  try {
    let subject = library.subjects.find(row => row.name === name);
    if (!subject) subject = await library.createMistakeSubject(name) ?? undefined;
    if (!subject) { categoryError.value = '请检查科目名称'; return; }
    if (categoryPoint.value.trim()) await library.addKnowledgePoint(subject.id, categoryPoint.value);
    await library.loadSubjects();
    mistakes.subjectFilter = name;
    categoryOpen.value = false;
    toast.success('分类已保存');
  } catch { categoryError.value = '保存分类失败，请重试'; }
  finally { categorySaving.value = false; }
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
          共 {{ mistakes.total }} 条 · 已掌握 {{ mistakes.masteredCount }} 条
        </span>
      </div>
      <div class="classification" aria-label="错题分类">
        <div class="filter-heading"><span>科目</span><button class="text-add" data-test="add-mistake-subject" @click="openCategory(false)">＋ 添加科目</button></div>
        <div class="filter-chips" data-test="mistakes-subject-filter">
          <button class="filter-chip" :aria-pressed="mistakes.subjectFilter === null" @click="mistakes.subjectFilter = null">全部科目</button>
          <button v-for="name in subjectOptions" :key="name" class="filter-chip" :aria-pressed="mistakes.subjectFilter === name" @click="mistakes.subjectFilter = name">{{ name }}</button>
        </div>
        <template v-if="mistakes.subjectFilter">
          <div class="filter-heading"><span>知识点</span><button class="text-add" data-test="add-knowledge-point" @click="openCategory(true)">＋ 添加知识点</button></div>
          <div class="filter-chips" data-test="mistakes-knowledge-filter">
            <button class="filter-chip" :aria-pressed="mistakes.knowledgeFilter === null" @click="mistakes.knowledgeFilter = null">全部知识点</button>
            <button v-for="point in knowledgeOptions(mistakes.subjectFilter)" :key="point" class="filter-chip" :aria-pressed="mistakes.knowledgeFilter === point" @click="mistakes.knowledgeFilter = point">{{ point }}</button>
          </div>
        </template>
      </div>
    </div>

    <p v-if="mistakes.loading" role="status" class="hint">正在加载错题…</p>
    <div v-else-if="loadError" role="alert"><p>{{ loadError }}</p><button class="ghost-btn" @click="load">重新加载</button></div>
    <EmptyState
      v-else-if="mistakes.visible.length === 0"
      data-test="mistakes-empty"
      icon="📕"
      :title="mistakes.total === 0 ? '还没有收录错题' : '当前分类下没有错题'"
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
          <span v-if="item.knowledge_point" class="badge" data-test="mistake-knowledge">{{ item.knowledge_point }}</span>
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
          {{ item.question_text ?? (item.question_images.length ? '题目见照片' : '未填写题目文字') }}
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

    <BaseModal v-if="categoryOpen" id="mistake-category" title="添加分类" @close="categoryOpen = false">
      <form id="mistake-category-form" class="category-form" @submit.prevent="saveCategory">
        <label class="field"><span>科目名称</span><input v-model="categorySubject" list="mistake-category-subjects" data-test="category-subject" placeholder="例如：数学" required /><datalist id="mistake-category-subjects"><option v-for="name in subjectOptions" :key="name" :value="name" /></datalist></label>
        <label class="field"><span>知识点（可选）</span><input v-model="categoryPoint" data-test="category-point" placeholder="例如：三角函数" /></label>
        <p v-if="categoryError" role="alert" class="danger-text">{{ categoryError }}</p>
      </form>
      <template #footer><button class="ghost-btn" @click="categoryOpen = false">取消</button><button class="primary-btn" type="submit" form="mistake-category-form" :disabled="categorySaving" data-test="category-save">{{ categorySaving ? '保存中…' : '保存' }}</button></template>
    </BaseModal>
    <BaseModal v-if="formOpen" id="mistake-form" title="记一道错题" @close="formOpen = false">
      <div class="mistake-form" data-test="mistake-form">

        <div class="field">
          <span id="mistake-subject-label">科目</span>
          <div class="filter-chips subject-choices" role="group" aria-labelledby="mistake-subject-label" data-test="mistake-form-subject">
            <button type="button" class="filter-chip" :aria-pressed="form.subjectName === ''" @click="chooseSubject('')">未分类</button>
            <button v-for="name in subjectOptions" :key="name" type="button" class="filter-chip" :aria-pressed="form.subjectName === name" @click="chooseSubject(name)">{{ name }}</button>
            <button type="button" class="text-add" :aria-expanded="addingFormSubject" data-test="mistake-form-add-subject" @click="addingFormSubject = !addingFormSubject">＋ 新建科目</button>
          </div>
          <div v-if="addingFormSubject" class="inline-subject">
            <input v-model="newFormSubject" aria-label="新科目名称" placeholder="科目名称" data-test="mistake-new-subject" @keyup.enter.prevent="addFormSubject" />
            <button type="button" class="ghost-btn" :disabled="formSubjectSaving" data-test="mistake-new-subject-save" @click="addFormSubject">{{ formSubjectSaving ? '添加中…' : '添加' }}</button>
          </div>
          <p v-if="formSubjectError" role="alert" class="danger-text">{{ formSubjectError }}</p>
        </div>

        <label class="field"><span>知识点</span><input v-model="form.knowledgePoint" list="mistake-knowledge-points" placeholder="例如：导数、三角函数" data-test="mistake-form-knowledge" /><datalist id="mistake-knowledge-points"><option v-for="point in knowledgeOptions(form.subjectName)" :key="point" :value="point" /></datalist></label>
        <ImageInput
          :model-value="form.questionImages"
          test-key="question"
          label="题目"
          camera embedded
          :max="MISTAKE_IMAGE_LIMIT"
          @update:model-value="form.questionImages = $event"
          @busy-change="photoBusy.question = $event"
        >
          <textarea
            v-model="form.questionText"
            aria-label="题目文字"
            rows="3"
            placeholder="写下题目，也可以直接拍照或上传"
            data-test="mistake-form-question"
          />
        </ImageInput>

        <ImageInput
          :model-value="form.correctionImages"
          test-key="correction"
          label="订正"
          camera embedded
          :max="MISTAKE_IMAGE_LIMIT"
          @update:model-value="form.correctionImages = $event"
          @busy-change="photoBusy.correction = $event"
        >
          <textarea
            v-model="form.correctionText"
            aria-label="订正文字"
            rows="3"
            placeholder="记录正确思路，或拍下订正过程"
            data-test="mistake-form-correction"
          />
        </ImageInput>

        <div class="field">
          <span id="mistake-reasons-label">错在哪 <span class="field-note">可多选</span></span>
          <div class="reason-options" role="group" aria-labelledby="mistake-reasons-label" data-test="mistake-form-reasons">
            <button
              v-for="reason in reasonOptions"
              :key="reason"
              type="button"
              class="reason-option"
              :aria-pressed="form.reasons.includes(reason)"
              :data-test="'mistake-reason-' + reason"
              @click="toggleReason(reason)"
            >
              <span class="reason-check" aria-hidden="true"><svg v-if="form.reasons.includes(reason)" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg></span>
              {{ reason }}
            </button>
          </div>
          <div class="chip-row">
            <input
              v-model="form.customReason"
              placeholder="补充一个原因"
              aria-label="自定义错误原因"
              data-test="mistake-form-custom-reason"
              @keyup.enter.prevent="addCustomReason"
            />
            <button type="button" class="ghost-btn" data-test="mistake-form-add-reason" @click="addCustomReason">
              加上
            </button>
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

        <button type="button" role="switch" aria-label="已经掌握" :aria-checked="form.mastered" class="mastery-toggle" data-test="mistake-form-mastered" @click="form.mastered = !form.mastered">
          <span class="mastery-copy"><strong>已经掌握</strong><span>{{ form.mastered ? '已掌握，之后可以筛选查看' : '未掌握，留待下次复习' }}</span></span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
        </button>
        <p v-if="formError" role="alert" class="danger-text">{{ formError }}</p>
      </div>

      <template #footer>
        <button type="button" class="ghost-btn" data-test="mistake-form-cancel" @click="formOpen = false">
          取消
        </button>
        <button type="button" class="primary-btn" :disabled="formSaving || photoBusy.question || photoBusy.correction || formSubjectSaving" data-test="mistake-form-save" @click="save">{{ photoBusy.question || photoBusy.correction ? '照片处理中…' : formSaving ? '保存中…' : '保存' }}</button>
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
.mistake-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.subject-choices .filter-chip { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.inline-subject { display: flex; gap: 8px; }
.inline-subject input { flex: 1; min-width: 0; }
.reason-options { display: flex; flex-wrap: wrap; gap: 10px; }
.reason-option { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--panel); color: var(--muted); font: inherit; cursor: pointer; overflow-wrap: anywhere; }
.reason-option[aria-pressed='true'] { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.reason-check { display: grid; place-items: center; width: 18px; height: 18px; flex: 0 0 18px; border: 1px solid var(--border); border-radius: 50%; }
.reason-option[aria-pressed='true'] .reason-check { border-color: var(--accent); }
.reason-check svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.field-note { margin-left: 6px; font-size: 12px; }
.mastery-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 76px; padding: 14px 0; border: none; border-top: 1px solid var(--border); border-radius: 0; background: transparent; color: var(--text); text-align: left; font: inherit; cursor: pointer; }
.mastery-copy { display: flex; flex-direction: column; gap: 6px; }
.mastery-copy strong { font-size: 14px; font-weight: 600; }
.mastery-copy > span { font-size: 12px; color: var(--muted); }
.switch-track { display: flex; align-items: center; width: 52px; height: 32px; flex: 0 0 52px; padding: 3px; box-sizing: border-box; border-radius: var(--radius-pill); background: var(--track); }
.switch-thumb { width: 26px; height: 26px; border-radius: 50%; background: var(--text); transition: transform 150ms ease-out; }
.mastery-toggle[aria-checked='true'] .switch-track { background: var(--accent-fill); }
.mastery-toggle[aria-checked='true'] .switch-thumb { transform: translateX(20px); background: var(--on-accent); }
.category-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
</style>
