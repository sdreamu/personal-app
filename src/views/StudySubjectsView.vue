<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BaseModal from '@/components/BaseModal.vue';
import EmptyState from '@/components/EmptyState.vue';
import SubjectCard from '@/components/SubjectCard.vue';
import { useLibraryStore, type SubjectInput } from '@/stores/library';
import { useDateStore } from '@/stores/date';
import type { StudyRecord, Subject } from '@/db';

const router = useRouter();
const library = useLibraryStore();
const dateStore = useDateStore();

const formOpen = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({ name: '', weeklyGoalMin: 360, deadline: '' });

const manualOpen = ref(false);
const manualSubject = ref<Subject | null>(null);
const manualForm = reactive({ date: '', minutes: 30, note: '' });

const historyOpen = ref(false);
const historySubject = ref<Subject | null>(null);
const historyRecords = ref<StudyRecord[]>([]);

const activeSubjects = computed(() => library.subjects.filter((subject) => !subject.archived));
const archivedSubjects = computed(() => library.subjects.filter((subject) => subject.archived));

async function loadAll(): Promise<void> {
  await library.loadSubjects();
  await library.loadSubjectsStats(dateStore.selectedDate);
}

onMounted(() => {
  void loadAll();
});

watch(
  () => library.revision,
  () => {
    void loadAll();
  },
);

watch(
  () => dateStore.selectedDate,
  () => {
    void library.loadSubjectsStats(dateStore.selectedDate);
  },
);

function openCreate(): void {
  editingId.value = null;
  form.name = '';
  form.weeklyGoalMin = 360;
  form.deadline = '';
  formOpen.value = true;
}

function openEdit(subject: Subject): void {
  editingId.value = subject.id;
  form.name = subject.name;
  form.weeklyGoalMin = subject.weekly_goal_min;
  form.deadline = subject.deadline ?? '';
  formOpen.value = true;
}

async function save(): Promise<void> {
  const input: SubjectInput = {
    name: form.name,
    weeklyGoalMin: form.weeklyGoalMin,
    deadline: form.deadline.trim() || null,
  };
  const saved =
    editingId.value === null
      ? await library.createSubject(input)
      : await library.saveSubject(editingId.value, input);
  if (saved !== null) formOpen.value = false;
}

function startTimer(subject: Subject): void {
  void router.push({ path: '/study/timer', query: { type: 'subject', id: subject.id } });
}

function openManual(subject: Subject): void {
  manualSubject.value = subject;
  manualForm.date = dateStore.selectedDate;
  manualForm.minutes = 30;
  manualForm.note = '';
  manualOpen.value = true;
}

async function saveManual(): Promise<void> {
  if (manualSubject.value === null) return;
  const saved = await library.addManualStudyRecord({
    targetType: 'subject',
    targetId: manualSubject.value.id,
    targetTitle: manualSubject.value.name,
    date: manualForm.date,
    minutes: manualForm.minutes,
    note: manualForm.note.trim() || null,
  });
  if (saved !== null) manualOpen.value = false;
}

async function openHistory(subject: Subject): Promise<void> {
  historySubject.value = subject;
  historyRecords.value = await library.listSubjectRecords(subject.id);
  historyOpen.value = true;
}

function sourceLabel(source: StudyRecord['source']): string {
  return { timer: '计时', manual: '手动补记', page_update: '更新页码' }[source];
}

function formatMinutes(sec: number): string {
  const min = Math.round(sec / 60);
  if (min <= 0) return '0 分钟';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${min} 分钟`;
}
</script>

<template>
  <section class="page subjects-page" data-test="subjects-view">
    <header class="page-head">
      <h1 class="page-title">科目</h1>
      <button class="primary-btn" data-test="add-subject-btn" @click="openCreate">添加科目</button>
    </header>

    <div class="settings-card">
      <h2>学习中</h2>
      <div v-if="activeSubjects.length > 0" data-test="active-list">
        <SubjectCard
          v-for="subject in activeSubjects"
          :key="subject.id"
          :subject="subject"
          :stats="library.subjectStats[subject.id]"
          @edit="openEdit(subject)"
          @delete="library.deleteSubject(subject.id)"
          @archive="library.setSubjectArchived(subject.id, true)"
          @restore="library.setSubjectArchived(subject.id, false)"
          @timer="startTimer(subject)"
          @manual="openManual(subject)"
          @history="openHistory(subject)"
        />
      </div>
      <EmptyState
        v-else
        title="还没有科目"
        description="添加一个科目，设置每周目标开始学习"
        action-label="添加科目"
        @action="openCreate"
      />
    </div>

    <div class="settings-card" data-test="archived-section">
      <h2>归档区</h2>
      <div v-if="archivedSubjects.length > 0" data-test="archived-list">
        <SubjectCard
          v-for="subject in archivedSubjects"
          :key="subject.id"
          :subject="subject"
          :stats="library.subjectStats[subject.id]"
          @edit="openEdit(subject)"
          @delete="library.deleteSubject(subject.id)"
          @archive="library.setSubjectArchived(subject.id, true)"
          @restore="library.setSubjectArchived(subject.id, false)"
          @timer="startTimer(subject)"
          @manual="openManual(subject)"
          @history="openHistory(subject)"
        />
      </div>
      <p v-else class="hint">没有已归档的科目。</p>
    </div>

    <BaseModal v-if="formOpen" id="subject-form" :title="editingId === null ? '新增科目' : '编辑科目'">
      <form data-test="subject-form" @submit.prevent="save">
        <div class="field">
          <label for="subject-name-input">名称（必填）</label>
          <input id="subject-name-input" v-model="form.name" data-test="subject-form-name" />
        </div>
        <div class="field">
          <label for="subject-goal-input">每周目标（分钟）</label>
          <input
            id="subject-goal-input"
            v-model.number="form.weeklyGoalMin"
            type="number"
            min="1"
            step="1"
            data-test="subject-form-goal"
          />
        </div>
        <div class="field">
          <label for="subject-deadline-input">截止日期（可选）</label>
          <input
            id="subject-deadline-input"
            v-model="form.deadline"
            type="date"
            data-test="subject-form-deadline"
          />
        </div>
        <div class="modal-actions">
          <button type="button" class="ghost-btn" data-test="subject-form-cancel" @click="formOpen = false">
            取消
          </button>
          <button type="submit" class="primary-btn" data-test="subject-form-save">保存</button>
        </div>
      </form>
    </BaseModal>

    <BaseModal v-if="manualOpen" id="subject-manual-form" title="手动补记学习记录">
      <form data-test="subject-manual-form" @submit.prevent="saveManual">
        <div class="field">
          <label for="subject-manual-date-input">逻辑日期</label>
          <input
            id="subject-manual-date-input"
            v-model="manualForm.date"
            type="date"
            data-test="subject-manual-form-date"
          />
        </div>
        <div class="field">
          <label for="subject-manual-minutes-input">时长（分钟）</label>
          <input
            id="subject-manual-minutes-input"
            v-model.number="manualForm.minutes"
            type="number"
            min="1"
            step="1"
            data-test="subject-manual-form-minutes"
          />
        </div>
        <div class="field">
          <label for="subject-manual-note-input">收获（可选）</label>
          <textarea
            id="subject-manual-note-input"
            v-model="manualForm.note"
            rows="2"
            data-test="subject-manual-form-note"
          />
        </div>
        <div class="modal-actions">
          <button
            type="button"
            class="ghost-btn"
            data-test="subject-manual-form-cancel"
            @click="manualOpen = false"
          >
            取消
          </button>
          <button type="submit" class="primary-btn" data-test="subject-manual-form-save">保存</button>
        </div>
      </form>
    </BaseModal>

    <BaseModal v-if="historyOpen" id="subject-history" title="历史学习记录">
      <p v-if="historySubject !== null" class="hint">
        {{ historySubject.name }} 的全部有效学习记录（{{ historyRecords.length }} 条）
      </p>
      <ul v-if="historyRecords.length > 0" class="record-list" data-test="history-list">
        <li v-for="record in historyRecords" :key="record.id" class="record-row" data-test="history-row">
          <span class="badge">{{ record.date }}</span>
          <strong>{{ formatMinutes(record.duration_sec) }}</strong>
          <span class="badge">{{ sourceLabel(record.source) }}</span>
          <span v-if="record.note" class="record-note" data-test="history-note">{{ record.note }}</span>
        </li>
      </ul>
      <p v-else class="hint" data-test="history-empty">该科目还没有学习记录。</p>
      <div class="modal-actions">
        <button class="ghost-btn" data-test="history-close" @click="historyOpen = false">关闭</button>
      </div>
    </BaseModal>
  </section>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.page-head .page-title { margin-bottom: 0; }
.field { margin-bottom: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.record-list { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.record-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}
.record-note { color: var(--muted); font-size: 13px; }
</style>
