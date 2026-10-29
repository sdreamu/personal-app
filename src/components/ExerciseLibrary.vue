<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * 训练项目库区块（M5 / N3 / AC-83）：用户自己的动作清单，可自己写、可删（5 秒撤销）。
 * 点条目 = 把该动作加入当天训练；排序由父组件（store getter）算好传进来。
 * AC-83：这块从「当天训练」卡片里搬出来，成为独立卡片 —— 项目库是跨天的资产，
 * 不该跟着每一天的记录一起滚，也不该在历史记录里重复出现。
 */
const props = withDefaults(defineProps<{ items?: { id: string; name: string }[] }>(), {
  items: () => [],
});

const emit = defineEmits<{
  (e: 'select', name: string): void;
  (e: 'add', name: string): void;
  (e: 'remove', id: string): void;
}>();

const items = computed(() => props.items.filter((item) => item.name.trim() !== ''));
const newName = ref('');

function submitAdd(): void {
  const name = newName.value.trim();
  if (name === '') return;
  emit('add', name);
  newName.value = '';
}
</script>

<template>
  <section class="exercise-library" data-test="exercise-library">
    <h3 class="library-title">
      项目库
      <span v-if="items.length > 0" class="library-count num" data-test="library-count">
        {{ items.length }}
      </span>
    </h3>
    <div class="library-add">
      <input
        v-model="newName"
        class="text-input"
        data-test="library-add-input"
        placeholder="写下一个动作（例如：深蹲）"
        @keyup.enter="submitAdd"
      />
      <button type="button" class="primary-btn" data-test="library-add-btn" @click="submitAdd">
        添加
      </button>
    </div>
    <p v-if="items.length === 0" class="hint" data-test="library-empty">
      这里是你自己的动作清单，先写下来，练的时候点一下
    </p>
    <p v-if="items.length > 0" class="hint" data-test="library-hint">
      点一下动作名，就加进当天训练
    </p>
    <ul v-if="items.length > 0" class="library-list" data-test="library-list">
      <li v-for="item in items" :key="item.id" class="library-row">
        <button
          type="button"
          class="library-item"
          data-test="library-item"
          @click="emit('select', item.name)"
        >
          {{ item.name }}
        </button>
        <button
          type="button"
          class="library-remove"
          data-test="library-remove"
          :aria-label="'删除 ' + item.name"
          :title="'删除 ' + item.name"
          @click="emit('remove', item.id)"
        >
          ✕
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.exercise-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.library-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.library-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0 6px;
}
.library-add {
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 420px;
}
.library-add .text-input {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: var(--radius);
  padding: 6px 10px;
  font-size: 14px;
}
.library-add .primary-btn {
  padding: 6px 14px;
  font-size: 14px;
}
.library-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.library-row {
  display: inline-flex;
  align-items: stretch;
}
.library-item {
  border: 1px solid var(--border);
  background: var(--panel);
  color: inherit;
  border-radius: var(--radius) 0 0 var(--radius);
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}
.library-item:hover {
  border-color: var(--accent);
}
.library-remove {
  border: 1px solid var(--border);
  border-left: none;
  background: var(--panel);
  color: var(--muted);
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 6px 9px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.library-remove:hover {
  color: var(--danger);
  border-color: var(--danger);
}
</style>
