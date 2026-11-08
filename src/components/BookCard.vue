<script setup lang="ts">
import { computed } from 'vue';
import type { Book } from '@/db';
import type { BookStatus } from '@/stores/library';

const props = withDefaults(
  defineProps<{ book: Book; canMoveUp?: boolean; canMoveDown?: boolean; sorting?: boolean }>(),
  { canMoveUp: true, canMoveDown: true, sorting: false },
);
const touchDevice = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'sort-start', event: PointerEvent): void;
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'status-change', status: BookStatus): void;
  (e: 'page-change', page: number): void;
  (e: 'move', delta: number): void;
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

/** 书架上直接改当前页（PRD §5.2：书架「或」书详情页都能改）。 */
const pageInputId = computed(() => `book-page-${props.book.id}`);

function commitPage(event: Event): void {
  const input = event.target as HTMLInputElement;
  const value = input.valueAsNumber;
  if (!Number.isFinite(value) || value === props.book.current_page) {
    input.value = String(props.book.current_page);
    return;
  }
  emit('page-change', value);
}

const percent = computed(() => {
  if (props.book.total_pages <= 0) return 0;
  return Math.min(100, Math.round((props.book.current_page / props.book.total_pages) * 100));
});
</script>

<template>
  <article
    class="book-card"
    :class="{ sorting }"
    data-test="book-card"
    :draggable="!sorting && !touchDevice"
    @click="emit('open')"
    @dragstart="onDragStart"
    @dragend="emit('drag-end')"
  >
    <button v-if="sorting" class="sort-handle" data-test="sort-handle" type="button" aria-label="拖动排序" @pointerdown.stop="emit('sort-start', $event)" @click.stop @contextmenu.prevent>⠿</button>
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
      <div class="page-quick" data-test="book-page-quick">
        <!-- 只有真正可交互的控件吃掉点击，其它空白仍然点开详情（卡片中心的点击不能失灵） -->
        <label class="page-quick-label" :for="pageInputId" @click.stop>改到第</label>
        <input
          :id="pageInputId"
          class="page-quick-input num"
          type="number"
          inputmode="numeric"
          min="0"
          :max="book.total_pages"
          :value="book.current_page"
          data-test="book-page-input"
          @click.stop
          @keydown.enter.prevent="commitPage($event)"
          @change="commitPage($event)"
        />
        <span class="page-quick-total">页</span>
      </div>
      <div class="book-ops" @click.stop>
        <select
          class="book-status"
          :aria-label="`《${book.title}》的阅读状态`"
          :value="book.status"
          data-test="book-status"
          @change="emit('status-change', ($event.target as HTMLSelectElement).value as BookStatus)"
        >
          <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button
          type="button"
          class="ghost-btn book-move"
          data-test="book-move-up"
          :disabled="!props.canMoveUp"
          :aria-label="`把《${book.title}》上移一位`"
          title="上移一位"
          @click="emit('move', -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="ghost-btn book-move"
          data-test="book-move-down"
          :disabled="!props.canMoveDown"
          :aria-label="`把《${book.title}》下移一位`"
          title="下移一位"
          @click="emit('move', 1)"
        >
          ↓
        </button>
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
  border-radius: var(--radius-card);
  padding: 12px;
  cursor: pointer;
  position: relative;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.book-card:hover { border-color: var(--accent); }
.cover {
  flex: none;
  width: 78px;
  height: 108px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--hero-ink);
  font-size: 34px;
  font-weight: 700;
}
.book-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.book-title { margin: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: normal; overflow-wrap: anywhere; }
.book-author { margin: 0; color: var(--muted); font-size: 13px; }
.progress-track {
  height: 6px;
  border-radius: var(--radius);
  background: var(--panel-2);
  overflow: hidden;
}
.progress-fill { height: 100%; background: var(--accent); border-radius: var(--radius); }
.book-pages { margin: 0; color: var(--muted); font-size: 12px; }
.page-quick {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  /* 贴右边：卡片正中间保持"空白可点 = 开详情"，不会被输入框吃掉 */
  justify-content: flex-end;
}
.page-quick-input {
  width: 56px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  padding: 2px 6px;
  font-size: 12px;
  color: var(--text);
}
.page-quick-input:focus {
  outline: 2px solid var(--border-ink);
  outline-offset: 1px;
  background: var(--panel);
}
.book-ops { display: flex; align-items: center; gap: 6px; margin-top: auto; flex-wrap: wrap; }
/* 上移 / 下移做成紧凑按钮：一行放得下，不会把卡片撑高（撑高会挤掉"点卡片开详情"的可点区域） */
.book-move {
  padding: 3px 7px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.book-status {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 3px 6px;
  font-size: 13px;
}
.book-ops .ghost-btn, .book-ops .danger-btn { padding: 3px 8px; font-size: 12px; }
.book-author, .book-pages { overflow-wrap: anywhere; }
.sort-handle { position: absolute; top: 4px; left: 4px; width: 44px; height: 44px; z-index: 1; touch-action: none; cursor: grab; background: var(--panel); border: 1px solid var(--border); font-size: 24px; }
.page-quick-input { user-select: text; -webkit-user-select: text; }
@media (max-width: 768px) {
  .cover { width: 52px; height: 76px; font-size: 26px; }
  .book-card { padding: 12px; gap: 10px; }
  .book-main { gap: 8px; }
  .book-ops { gap: 8px; }
  .book-ops button, .book-status, .page-quick-input { min-height: 44px; }
  .book-move { min-width: 44px; }
  .book-card:not(.sorting) .book-move { display: none; }
  .page-quick { justify-content: flex-start; flex-wrap: wrap; }
  .book-ops .book-status { max-width: 100%; font-size: 16px; }
}
</style>
