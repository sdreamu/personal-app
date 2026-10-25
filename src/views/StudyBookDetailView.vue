<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BaseModal from '@/components/BaseModal.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getRecord, isAlive, type Book, type Excerpt } from '@/db';
import { useDateStore } from '@/stores/date';
import { expectedRemainingSeconds, useLibraryStore } from '@/stores/library';
import { useToastStore } from '@/stores/toast';

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();
const dateStore = useDateStore();
const toast = useToastStore();

const bookId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));
const book = ref<Book | null>(null);
const loading = ref(true);
const pageInput = ref<number | null>(null);
const excerpts = ref<Excerpt[]>([]);
const remainingSec = ref<number | null>(null);

const confirmDoneOpen = ref(false);
const excerptOpen = ref(false);
const excerptEditingId = ref<string | null>(null);
const excerptForm = reactive({ page: 1, content: '', thought: '' });
const manualOpen = ref(false);
const manualForm = reactive({ date: '', minutes: 30, endPage: 1, note: '' });

const statusText = computed(() => {
  if (book.value === null) return '';
  return { want: '想读', reading: '在读', done: '读完' }[book.value.status];
});

const percent = computed(() => {
  if (book.value === null || book.value.total_pages <= 0) return 0;
  return Math.min(100, Math.round((book.value.current_page / book.value.total_pages) * 100));
});

function formatRemaining(sec: number): string {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `预计剩余 ${h} 小时 ${m} 分钟` : `预计剩余 ${m} 分钟`;
}

const remainingText = computed(() =>
  remainingSec.value === null ? '' : formatRemaining(remainingSec.value),
);

async function load(): Promise<void> {
  loading.value = true;
  const row = await getRecord('books', bookId.value);
  book.value = row !== undefined && isAlive(row) ? row : null;
  if (book.value !== null) {
    pageInput.value = book.value.current_page;
    const [excerptRows, totalSec] = await Promise.all([
      library.loadExcerpts(bookId.value),
      library.bookTotalStudySeconds(bookId.value),
    ]);
    excerpts.value = excerptRows;
    remainingSec.value = expectedRemainingSeconds(book.value, totalSec);
  } else {
    pageInput.value = null;
    excerpts.value = [];
    remainingSec.value = null;
  }
  loading.value = false;
}

onMounted(() => {
  void load();
});

watch(
  () => library.revision,
  () => {
    void load();
  },
);

async function savePage(): Promise<void> {
  if (book.value === null) return;
  const value = pageInput.value;
  if (value === null || !Number.isFinite(value)) {
    toast.error('请输入页码');
    return;
  }
  const result = await library.updateBookPage(book.value.id, value);
  if (!result.ok) {
    toast.error(result.reason);
    return;
  }
  if (result.confirmDone) confirmDoneOpen.value = true;
  void load();
}

function openExcerptCreate(): void {
  excerptEditingId.value = null;
  excerptForm.page = book.value?.current_page ?? 1;
  excerptForm.content = '';
  excerptForm.thought = '';
  excerptOpen.value = true;
}

function openExcerptEdit(excerpt: Excerpt): void {
  excerptEditingId.value = excerpt.id;
  excerptForm.page = excerpt.page;
  excerptForm.content = excerpt.content;
  excerptForm.thought = excerpt.thought ?? '';
  excerptOpen.value = true;
}

async function saveExcerpt(): Promise<void> {
  const payload = {
    page: excerptForm.page,
    content: excerptForm.content,
    thought: excerptForm.thought.trim() || null,
  };
  const saved =
    excerptEditingId.value === null
      ? await library.createExcerpt({ ...payload, bookId: bookId.value })
      : await library.saveExcerpt(excerptEditingId.value, payload);
  if (saved !== null) excerptOpen.value = false;
}

function openManual(): void {
  manualForm.date = dateStore.selectedDate;
  manualForm.minutes = 30;
  manualForm.endPage = book.value?.current_page ?? 1;
  manualForm.note = '';
  manualOpen.value = true;
}

async function saveManual(): Promise<void> {
  if (book.value === null) return;
  const saved = await library.addManualStudyRecord({
    targetType: 'book',
    targetId: book.value.id,
    targetTitle: book.value.title,
    date: manualForm.date,
    minutes: manualForm.minutes,
    note: manualForm.note.trim() || null,
    endPage: manualForm.endPage,
  });
  if (saved !== null) manualOpen.value = false;
}

function startTimer(): void {
  if (book.value === null) return;
  void router.push({ path: '/study/timer', query: { type: 'book', id: book.value.id } });
}
</script>

<template>
  <section class="page book-detail-page" data-test="detail-view">
    <div v-if="loading" class="empty-hint" data-test="detail-loading">正在加载…</div>

    <EmptyState
      v-else-if="book === null"
      title="未找到这本书"
      description="它可能已被删除"
      action-label="返回书架"
      @action="router.push('/study/books')"
    />

    <template v-else-if="book !== null">
      <header class="detail-head">
        <button class="ghost-btn" data-test="back-btn" @click="router.push('/study/books')">← 返回书架</button>
        <span class="badge" data-test="detail-status">{{ statusText }}</span>
      </header>

      <div class="book-summary settings-card">
        <div class="cover" :style="{ background: book.color }">
          <span class="cover-char">{{ book.title.slice(0, 1) }}</span>
        </div>
        <div class="summary-main">
          <h1 class="detail-title" data-test="detail-title">{{ book.title }}</h1>
          <p v-if="book.author" class="detail-author" data-test="detail-author">{{ book.author }}</p>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: percent + '%' }" />
          </div>
          <p class="detail-pages" data-test="detail-pages">
            {{ book.current_page }}/{{ book.total_pages }} 页（{{ percent }}%）
          </p>
          <p v-if="remainingText" class="remaining" data-test="remaining">{{ remainingText }}</p>
          <div class="button-row">
            <button class="primary-btn" data-test="start-timer" @click="startTimer">开始阅读计时</button>
            <button class="ghost-btn" data-test="manual-open" @click="openManual">手动补记阅读记录</button>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h2>更新当前页</h2>
        <div class="inline-row">
          <input
            v-model.number="pageInput"
            type="number"
            min="0"
            step="1"
            class="page-input"
            data-test="page-input"
            @keydown.enter.prevent="savePage"
          />
          <button class="primary-btn" data-test="page-save" @click="savePage">✓ 保存</button>
        </div>
        <p class="hint">回车或点 ✓ 保存；页数增加时自动记录当日阅读页数，读到总页数时提示“标记为读完？”。</p>
      </div>

      <div class="settings-card">
        <div class="excerpts-head">
          <h2>摘录</h2>
          <button class="primary-btn" data-test="excerpt-add" @click="openExcerptCreate">新增摘录</button>
        </div>
        <p v-if="excerpts.length === 0" class="hint" data-test="excerpt-empty">还没有摘录，读到好句子就记下来吧。</p>
        <ul v-else class="excerpt-list" data-test="excerpt-list">
          <li v-for="excerpt in excerpts" :key="excerpt.id" class="excerpt-row" data-test="excerpt-row">
            <span class="badge" data-test="excerpt-page">第 {{ excerpt.page }} 页</span>
            <p class="excerpt-content" data-test="excerpt-content">{{ excerpt.content }}</p>
            <p v-if="excerpt.thought" class="excerpt-thought" data-test="excerpt-thought">
              想法：{{ excerpt.thought }}
            </p>
            <div class="excerpt-ops">
              <button class="ghost-btn" data-test="excerpt-edit" @click="openExcerptEdit(excerpt)">编辑</button>
              <button class="danger-btn" data-test="excerpt-delete" @click="library.deleteExcerpt(excerpt.id)">
                删除
              </button>
            </div>
          </li>
        </ul>
      </div>

      <BaseModal
        v-if="confirmDoneOpen"
        id="book-done-confirm"
        title="标记为读完？"
        @close="confirmDoneOpen = false"
      >
        <p>当前页已达到总页数，是否将这本书标记为读完？</p>
        <div class="modal-actions">
          <button class="ghost-btn" data-test="done-confirm-no" @click="confirmDoneOpen = false">取消</button>
          <button
            class="primary-btn"
            data-test="done-confirm-yes"
            @click="
              confirmDoneOpen = false;
              book !== null && library.markBookDone(book.id)
            "
          >
            标记为读完
          </button>
        </div>
      </BaseModal>

      <BaseModal
        v-if="excerptOpen"
        id="excerpt-form"
        :title="excerptEditingId === null ? '新增摘录' : '编辑摘录'"
        @close="excerptOpen = false"
      >
        <form data-test="excerpt-form" @submit.prevent="saveExcerpt">
          <div class="field">
            <label for="excerpt-page-input">页码（必填，正整数）</label>
            <input
              id="excerpt-page-input"
              v-model.number="excerptForm.page"
              type="number"
              min="1"
              step="1"
              data-test="excerpt-form-page"
            />
          </div>
          <div class="field">
            <label for="excerpt-content-input">摘录内容（必填）</label>
            <textarea
              id="excerpt-content-input"
              v-model="excerptForm.content"
              rows="3"
              data-test="excerpt-form-content"
            />
          </div>
          <div class="field">
            <label for="excerpt-thought-input">我的想法（可选）</label>
            <textarea
              id="excerpt-thought-input"
              v-model="excerptForm.thought"
              rows="2"
              data-test="excerpt-form-thought"
            />
          </div>
          <div class="modal-actions">
            <button type="button" class="ghost-btn" data-test="excerpt-form-cancel" @click="excerptOpen = false">
              取消
            </button>
            <button type="submit" class="primary-btn" data-test="excerpt-form-save">保存</button>
          </div>
        </form>
      </BaseModal>

      <BaseModal
        v-if="manualOpen"
        id="manual-record-form"
        title="手动补记阅读记录"
        @close="manualOpen = false"
      >
        <form data-test="manual-form" @submit.prevent="saveManual">
          <div class="field">
            <label for="manual-date-input">逻辑日期</label>
            <input id="manual-date-input" v-model="manualForm.date" type="date" data-test="manual-form-date" />
          </div>
          <div class="field">
            <label for="manual-minutes-input">时长（分钟）</label>
            <input
              id="manual-minutes-input"
              v-model.number="manualForm.minutes"
              type="number"
              min="1"
              step="1"
              data-test="manual-form-minutes"
            />
          </div>
          <div class="field">
            <label for="manual-endpage-input">读到页码</label>
            <input
              id="manual-endpage-input"
              v-model.number="manualForm.endPage"
              type="number"
              min="1"
              step="1"
              data-test="manual-form-endpage"
            />
          </div>
          <div class="field">
            <label for="manual-note-input">收获（可选）</label>
            <textarea id="manual-note-input" v-model="manualForm.note" rows="2" data-test="manual-form-note" />
          </div>
          <div class="modal-actions">
            <button type="button" class="ghost-btn" data-test="manual-form-cancel" @click="manualOpen = false">
              取消
            </button>
            <button type="submit" class="primary-btn" data-test="manual-form-save">保存</button>
          </div>
        </form>
      </BaseModal>
    </template>
  </section>
</template>

<style scoped>
.detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.book-summary { display: flex; gap: 16px; }
.cover {
  flex: none;
  width: 104px;
  height: 146px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--hero-ink);
  font-size: 44px;
  font-weight: 700;
}
.summary-main { flex: 1; min-width: 0; }
.detail-title { margin: 0 0 4px; font-size: 22px; }
.detail-author { margin: 0 0 10px; color: var(--muted); }
.progress-track { height: 8px; border-radius: var(--radius); background: var(--panel-2); overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); border-radius: var(--radius); }
.detail-pages { margin: 8px 0 4px; color: var(--muted); }
.remaining { margin: 4px 0; color: var(--accent); font-weight: 600; }
.page-input { width: 140px; }
.excerpts-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.excerpts-head h2 { margin-bottom: 0; }
.excerpt-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.excerpt-row {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.excerpt-content { margin: 0; }
.excerpt-thought { margin: 0; color: var(--muted); font-size: 13px; }
.excerpt-ops { display: flex; gap: 8px; }
.excerpt-ops button { padding: 3px 10px; font-size: 12px; }
.field { margin-bottom: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.empty-hint { color: var(--muted); margin-top: 12px; }
</style>
