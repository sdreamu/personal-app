<script setup lang="ts">
import { computed } from 'vue';
import type { Book } from '@/db';
import type { BookStatus } from '@/stores/library';

const props = defineProps<{ book: Book }>();
const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'status-change', status: BookStatus): void;
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
}>();

/** 原生 HTML5 拖拽开始：写入 book.id 作为传输数据（部分浏览器要求 setData 才允许拖放）。 */
function onDragStart(event: DragEvent): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', props.book.id);
  }
  emit('drag-start');
}

const STATUS_OPTIONS: ReadonlyArray<{ value: BookStatus; label: string }> = [
  { value: 'want', label: '想读' },
  { value: 'reading', label: '在读' },
  { value: 'done', label: '读完' },
];

const percent = computed(() => {
  if (props.book.total_pages <= 0) return 0;
  return Math.min(100, Math.round((props.book.current_page / props.book.total_pages) * 100));
});
</script>

<template>
  <article
    class="book-card"
    data-test="book-card"
    draggable="true"
    @click="emit('open')"
    @dragstart="onDragStart"
    @dragend="emit('drag-end')"
  >
    <div class="cover" :style="{ background: book.color }" data-test="book-cover">
      <span class="cover-char">{{ book.title.slice(0, 1) }}</span>
    </div>
    <div class="book-main">
      <h3 class="book-title" data-test="book-title">{{ book.title }}</h3>
      <p v-if="book.author" class="book-author" data-test="book-author">{{ book.author }}</p>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: percent + '%' }" data-test="book-progress" />
      </div>
      <p class="book-pages" data-test="book-pages">{{ book.current_page }}/{{ book.total_pages }} 页（{{ percent }}%）</p>
      <div class="book-ops" @click.stop>
        <select
          class="book-status"
          :value="book.status"
          data-test="book-status"
          @change="emit('status-change', ($event.target as HTMLSelectElement).value as BookStatus)"
        >
          <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button class="ghost-btn" data-test="book-edit" @click="emit('edit')">编辑</button>
        <button class="danger-btn" data-test="book-delete" @click="emit('delete')">删除</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.book-card {
  display: flex;
  gap: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  cursor: pointer;
}
.book-card:hover { border-color: var(--accent); }
.cover {
  flex: none;
  width: 78px;
  height: 108px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 34px;
  font-weight: 700;
}
.book-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.book-title { margin: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.book-author { margin: 0; color: var(--muted); font-size: 13px; }
.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--panel-2);
  overflow: hidden;
}
.progress-fill { height: 100%; background: var(--accent); border-radius: 999px; }
.book-pages { margin: 0; color: var(--muted); font-size: 12px; }
.book-ops { display: flex; align-items: center; gap: 6px; margin-top: auto; }
.book-status {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 13px;
}
.book-ops .ghost-btn, .book-ops .danger-btn { padding: 3px 8px; font-size: 12px; }
</style>
