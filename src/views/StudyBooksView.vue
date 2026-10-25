<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BaseModal from '@/components/BaseModal.vue';
import BookCard from '@/components/BookCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useLibraryStore, type BookInput, type BookStatus } from '@/stores/library';
import { useToastStore } from '@/stores/toast';
import { sortColumn } from '@/utils/dragSort';
import type { Book } from '@/db';

const router = useRouter();
const library = useLibraryStore();
const toast = useToastStore();

const formOpen = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({ title: '', author: '', totalPages: 300, status: 'want' as BookStatus });

const wantBooks = computed(() => sortColumn(library.books.filter((book) => book.status === 'want')));
const readingBooks = computed(() => sortColumn(library.books.filter((book) => book.status === 'reading')));
const doneBooks = computed(() => sortColumn(library.books.filter((book) => book.status === 'done')));

const columns = computed(() => [
  { key: 'want' as const, label: '想读', books: wantBooks.value },
  { key: 'reading' as const, label: '在读', books: readingBooks.value },
  { key: 'done' as const, label: '读完', books: doneBooks.value },
]);

onMounted(() => {
  void library.loadBooks();
});

watch(
  () => library.revision,
  () => {
    void library.loadBooks();
  },
);

function openCreate(): void {
  editingId.value = null;
  form.title = '';
  form.author = '';
  form.totalPages = 300;
  form.status = 'want';
  formOpen.value = true;
}

function openEdit(book: Book): void {
  editingId.value = book.id;
  form.title = book.title;
  form.author = book.author ?? '';
  form.totalPages = book.total_pages;
  form.status = book.status;
  formOpen.value = true;
}

async function save(): Promise<void> {
  const input: BookInput = {
    title: form.title,
    author: form.author.trim() || null,
    totalPages: form.totalPages,
    status: form.status,
  };
  const saved =
    editingId.value === null ? await library.createBook(input) : await library.saveBook(editingId.value, input);
  if (saved !== null) formOpen.value = false;
}

function changeStatus(book: Book, status: BookStatus): void {
  void library.setBookStatus(book.id, status);
}

/**
 * 书架上直接改页码：复用 libraryStore.updateBookPage（内部会生成 source=page_update 的学习记录、
 * 到总页数时返回 confirmDone），不另写一套落库逻辑。
 */
async function changePage(book: Book, page: number): Promise<void> {
  const result = await library.updateBookPage(book.id, page);
  if (!result.ok) {
    toast.error(result.reason);
    await library.loadBooks();
    return;
  }
  if (result.confirmDone) toast.success('已经翻到最后一页了，要把状态改成「读完」吗？');
}

function openDetail(book: Book): void {
  void router.push(`/study/books/${book.id}`);
}

// ---------- 拖动排序（原生 HTML5 DnD，零依赖） ----------
const dragId = ref<string | null>(null);

function onCardDragStart(book: Book): void {
  dragId.value = book.id;
}

function onDragEnd(): void {
  dragId.value = null;
}

/**
 * 落到某栏：targetBookId 为落点卡片（插到它之前），null 表示落到栏尾/空白区（追加到列尾）。
 * 计算 toIndex 时先排除被拖动的书，得到「目标列移除被拖动书之后」的下标，交给 library.moveBook。
 */
function dropInto(targetStatus: BookStatus, targetBookId: string | null): void {
  const id = dragId.value;
  if (id === null || targetBookId === id) return;
  const column = columns.value.find((col) => col.key === targetStatus);
  if (!column) return;
  const without = column.books.filter((book) => book.id !== id);
  let index = without.length;
  if (targetBookId !== null) {
    const found = without.findIndex((book) => book.id === targetBookId);
    if (found >= 0) index = found;
  }
  dragId.value = null;
  void library.moveBook(id, targetStatus, index);
}
</script>

<template>
  <section class="page books-page" data-test="books-view">
    <header class="page-head">
      <h1 class="page-title">读书</h1>
      <button class="primary-btn" data-test="add-book-btn" @click="openCreate">添加书籍</button>
    </header>

    <div class="books-columns">
      <section
        v-for="col in columns"
        :key="col.key"
        class="book-column"
        :data-test="`column-${col.key}`"
        @dragover.prevent
        @drop.prevent="dropInto(col.key, null)"
      >
        <h2 class="column-title">{{ col.label }}（{{ col.books.length }}）</h2>
        <div v-if="col.books.length > 0" class="column-cards">
          <BookCard
            v-for="book in col.books"
            :key="book.id"
            :book="book"
            @open="openDetail(book)"
            @edit="openEdit(book)"
            @delete="library.deleteBook(book.id)"
            @status-change="changeStatus(book, $event)"
            @page-change="changePage(book, $event)"
            @drag-start="onCardDragStart(book)"
            @drag-end="onDragEnd"
            @dragover.prevent
            @drop.prevent.stop="dropInto(col.key, book.id)"
          />
        </div>
        <EmptyState
          v-else
          :title="`暂无${col.label}的书`"
          description="添加一本书开始你的阅读计划"
          action-label="添加书籍"
          @action="openCreate"
        />
      </section>
    </div>

    <BaseModal
      v-if="formOpen"
      id="book-form"
      :title="editingId === null ? '新增书籍' : '编辑书籍'"
      @close="formOpen = false"
    >
      <form data-test="book-form" @submit.prevent="save">
        <div class="field">
          <label for="book-title-input">书名（必填）</label>
          <input id="book-title-input" v-model="form.title" data-test="book-form-title" />
        </div>
        <div class="field">
          <label for="book-author-input">作者（可选）</label>
          <input id="book-author-input" v-model="form.author" data-test="book-form-author" />
        </div>
        <div class="field">
          <label for="book-total-input">总页数（必填，正整数）</label>
          <input
            id="book-total-input"
            v-model.number="form.totalPages"
            type="number"
            min="1"
            step="1"
            data-test="book-form-total"
          />
        </div>
        <div class="field">
          <label for="book-status-input">状态</label>
          <select id="book-status-input" v-model="form.status" data-test="book-form-status">
            <option value="want">想读</option>
            <option value="reading">在读</option>
            <option value="done">读完</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="ghost-btn" data-test="book-form-cancel" @click="formOpen = false">
            取消
          </button>
          <button type="submit" class="primary-btn" data-test="book-form-save">保存</button>
        </div>
      </form>
    </BaseModal>
  </section>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.page-head .page-title { margin-bottom: 0; }
.books-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
.book-column { min-width: 0; min-height: 120px; }
.column-title { margin: 0 0 10px; font-size: 15px; color: var(--muted); }
.column-cards { display: flex; flex-direction: column; gap: 10px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.field { margin-bottom: 12px; }
</style>
