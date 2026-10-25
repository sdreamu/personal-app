<script setup lang="ts">
import { computed } from 'vue';

/**
 * 训练项目库区块（M5）：按钮列表来自 exercises 表，已由父组件按
 * “最近使用优先、无历史按名字升序”排好序。点一下即把该动作加入当天训练。
 */
const props = withDefaults(defineProps<{ names?: string[] }>(), { names: () => [] });

const emit = defineEmits<{
  (e: 'select', name: string): void;
}>();

const items = computed(() => props.names.filter((name) => name.trim() !== ''));
</script>

<template>
  <section class="exercise-library" data-test="exercise-library">
    <h3 class="library-title">项目库</h3>
    <p v-if="items.length === 0" class="hint" data-test="library-empty">
      还没有常用动作，添加动作后会自动收录到这里
    </p>
    <ul v-else class="library-list" data-test="library-list">
      <li v-for="name in items" :key="name">
        <button
          type="button"
          class="library-item"
          data-test="library-item"
          @click="emit('select', name)"
        >
          {{ name }}
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
  border-top: 1px dashed var(--border);
  padding-top: 12px;
}
.library-title {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
  font-weight: 600;
}
.library-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.library-item {
  border: 1px solid var(--border);
  background: var(--panel);
  color: inherit;
  border-radius: var(--radius);
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}
.library-item:hover {
  border-color: var(--accent);
}
</style>
